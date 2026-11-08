#!/usr/bin/env node
// Upload the published map style + glyphs to the CORS tiles host, so any origin (docs.bikenetkit.org
// above all) can consume the BikeNetKit basemap. See www/DOCS_MAP_INTEGRATION.md and DEPLOY_TILES.md.
//
//   pnpm build:mapstyle            # regenerate static/bikenetkit-map-style.json first
//   pnpm deploy:mapstyle           # upload the style + fonts/maplibre/ to tiles.bikenetkit.org
//   pnpm deploy:mapstyle -- --dry-run
//
// Target is DEPLOY_TILES_PATH (`~/bikenetkit/tiles/`) — the same dir as the PMTiles archive, which
// is already a hard runtime dependency for every consumer. Deliberately NOT the website dir:
// `deploy:site` syncs that with --delete.
//
// NO --delete: the target dir holds the ~46 GB basemap-*.pmtiles archive. We rsync the style file and
// the fonts/ subtree into place without pruning anything alongside them.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WWW_ROOT, getDeployConfig, run, withTrailingSlash } from './server-config.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');

const styleFile = path.join(WWW_ROOT, 'static', 'bikenetkit-map-style.json');
// Only the MapLibre glyph pbfs — not the sibling webfont dirs under static/fonts/ that the style
// never references (Public_Sans woff2, …). The style's glyphs URL is /fonts/maplibre/….
const glyphDir = path.join(WWW_ROOT, 'static', 'fonts', 'maplibre');
if (!existsSync(styleFile)) {
	console.error(`[mapstyle] ${styleFile} missing — run \`pnpm build:mapstyle\` first.`);
	process.exit(1);
}
if (!existsSync(glyphDir)) {
	console.error(`[mapstyle] ${glyphDir} missing — run \`pnpm build:glyphs\` first.`);
	process.exit(1);
}

const { host, tilesPath } = getDeployConfig();
const target = `${host}:${withTrailingSlash(tilesPath)}`;

const common = ['-e', 'ssh'];
if (dryRun) common.push('--dry-run');

console.log(`[mapstyle] uploading style + glyphs to ${host}:${tilesPath}`);

// The style JSON at the tiles root: https://tiles.bikenetkit.org/bikenetkit-map-style.json
await run('rsync', ['-a', ...common, styleFile, target]);
// rsync (openrsync on macOS has no --mkpath) won't create the intermediate fonts/ dir, so make the
// glyph path first. The remote shell expands `~`. Skipped on a dry run.
if (!dryRun) await run('ssh', [host, `mkdir -p ${tilesPath}fonts/maplibre`]);
// Glyphs under /fonts/maplibre/…: rsync just that subtree (no --delete; see header).
await run('rsync', ['-a', ...common, withTrailingSlash(glyphDir), `${target}fonts/maplibre/`]);

console.log(
	`\n[mapstyle] done.\n` +
		`          style:  https://tiles.bikenetkit.org/bikenetkit-map-style.json\n` +
		`          glyphs: https://tiles.bikenetkit.org/fonts/maplibre/{fontstack}/{range}.pbf\n` +
		`          Add the /fonts/ and .json nginx locations from DEPLOY_TILES.md if not present.`
);
