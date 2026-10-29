// Publish the BikeNetKit basemap style as a single self-contained MapLibre style JSON that any
// origin can consume — the docs site (docs.bikenetkit.org) above all. See DOCS_MAP_INTEGRATION.md.
//
// The live app builds its style in src/lib/map-style/style.js, but that module imports
// `$env/static/public` (SvelteKit build-time only) and registers the browser-only `pmtiles://`
// protocol as a side effect — neither runs in plain Node. So we rebuild the *same* object here from
// the pure modules (`makeLayers`, `theme`, `fonts`) and write absolute URLs into `sources`/`glyphs`.
//
// Keep this in sync with style.js: same SOURCE name, same attribution, same layer builder.
//
// Usage:
//   node scripts/build-map-style.mjs [--basemap-url URL] [--glyph-base ORIGIN] [--out PATH]
//   pnpm build:mapstyle
//
//   --basemap-url      the PMTiles archive URL (default: PUBLIC_BASEMAP_URL from www/.env)
//   --glyph-base       origin prefix for glyph .pbf requests. Default: the origin of the basemap
//                      URL (e.g. https://tiles.bikenetkit.org) — so the published style is
//                      self-contained on the CORS tiles host, alongside the PMTiles archive that
//                      is already a hard runtime dependency. Override to point elsewhere.
//   --relative-glyphs  emit a root-relative glyph path (`/fonts/maplibre/…`) instead — correct when
//                      the consumer vendors the glyphs next to the page. See DOCS_MAP_INTEGRATION.md.
//   --out              output path (default: static/bikenetkit-map-style.json)
import { register } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, WWW_ROOT } from './server-config.mjs';

// Register the $lib alias hook, then dynamic-import the map-style modules (static imports are
// resolved before register() runs, so these must be dynamic).
register('./lib-alias-hook.mjs', import.meta.url);
const { makeLayers } = await import('../src/lib/map-style/layers.js');
const { theme, fonts } = await import('../src/lib/map-style/theme.js');

loadEnv();

function argVal(name, fallback) {
	const i = process.argv.indexOf(name);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const basemapUrl = argVal('--basemap-url', process.env.PUBLIC_BASEMAP_URL?.trim());
if (!basemapUrl) {
	console.error(
		'[build-map-style] No basemap URL.\n' +
			'         Pass --basemap-url or set PUBLIC_BASEMAP_URL in www/.env (see .env.example).'
	);
	process.exit(1);
}

// Glyphs default to the basemap's own origin (the CORS tiles host), so the published style is
// self-contained cross-origin. `--relative-glyphs` forces a root-relative path for vendoring.
// tiles.bikenetkit.org is live independently of the website deploy, which only serves the full site
// at launch — so a docs consumer must not lean on bikenetkit.org for glyphs before then.
const relativeGlyphs = process.argv.includes('--relative-glyphs');
const glyphBase = relativeGlyphs
	? ''
	: argVal('--glyph-base', new URL(basemapUrl).origin).replace(/\/$/, '');
const outPath = path.resolve(WWW_ROOT, argVal('--out', 'static/bikenetkit-map-style.json'));

const SOURCE = 'protomaps';
const ATTRIBUTION =
	'<a href="https://protomaps.com">Protomaps</a> | <a href="https://openstreetmap.org">OpenStreetMap</a>';

const style = {
	version: 8,
	// {fontstack}/{range} are MapLibre placeholders — leave them literal.
	glyphs: `${glyphBase}/fonts/maplibre/{fontstack}/{range}.pbf`,
	sources: {
		[SOURCE]: {
			type: 'vector',
			// pmtiles:// tells MapLibre to read the archive over HTTP range requests via the pmtiles
			// protocol. The consuming page must register it once: `addProtocol('pmtiles', …)`.
			url: `pmtiles://${basemapUrl}`,
			attribution: ATTRIBUTION
		}
	},
	layers: makeLayers(SOURCE, theme, fonts)
};

// Lightweight structural validation — enough to fail fast on a broken export without pulling the
// full @maplibre/maplibre-gl-style-spec dependency into this repo. Consumers can run the official
// validator on the published file if they want a spec-complete check.
function validate(s) {
	const errs = [];
	if (s.version !== 8) errs.push('version must be 8');
	if (!s.sources?.[SOURCE]?.url?.startsWith('pmtiles://')) {
		errs.push(`sources.${SOURCE}.url must be a pmtiles:// URL`);
	}
	if (!/\{fontstack\}/.test(s.glyphs) || !/\{range\}/.test(s.glyphs)) {
		errs.push('glyphs must contain {fontstack} and {range}');
	}
	if (!Array.isArray(s.layers) || s.layers.length === 0) {
		errs.push('layers must be a non-empty array');
	}
	const ids = new Set();
	for (const [i, l] of (s.layers ?? []).entries()) {
		if (!l.id) errs.push(`layer[${i}] missing id`);
		else if (ids.has(l.id)) errs.push(`duplicate layer id "${l.id}"`);
		else ids.add(l.id);
		if (!l.type) errs.push(`layer "${l.id ?? i}" missing type`);
		// Every layer except `background` must draw from the one vector source.
		if (l.type !== 'background' && l.source !== SOURCE) {
			errs.push(`layer "${l.id}" must reference the "${SOURCE}" source`);
		}
	}
	if (errs.length) {
		console.error('[build-map-style] invalid style:\n - ' + errs.join('\n - '));
		process.exit(1);
	}
}

validate(style);

await writeFile(outPath, JSON.stringify(style, null, '\t') + '\n');
console.log(
	`[build-map-style] wrote ${path.relative(WWW_ROOT, outPath)}\n` +
		`         ${style.layers.length} layers · basemap ${basemapUrl}\n` +
		`         glyphs ${style.glyphs}`
);
