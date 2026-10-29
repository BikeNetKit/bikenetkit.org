// Coverage of screenshots/ against the datasets the data-files.json manifest lists.
//
// Mirrors the capture matrix in tests/export-matrix.ts (activeInteractiveTools / combosFor /
// outName / dataFile): generate-screenshots.ts skips any combo whose GeoJSON is missing, so the
// expected set is "every city × combo that has a .geojson". That set is read from the committed
// manifest rather than from data/, which update-data writes it from: a fresh checkout has no data/
// (it is off-repo), and pull-screenshots, which exists for that checkout, would otherwise report
// 0 / 0. Duplicated rather than imported because the deploy scripts are plain Node ESM and cannot
// load the Playwright-side TS — the same reason export-matrix.ts duplicates variantSuffix from
// $lib/data/tools.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { WWW_ROOT, SCREENSHOTS_DIR } from './server-config.mjs';

const readJson = (rel) => JSON.parse(readFileSync(path.join(WWW_ROOT, rel), 'utf-8'));
const variantSuffix = (variant) => (variant === 'from_bikenw' ? '-from_bikenw' : '');

// SortBikeNet's as-built ordering ships once, under `from_2021`, and is a view under `from_scratch`
// too — see `geojsonPathFor`. Under `from_2026` there is nothing left to build.
function dataStem(toolSlug, base, metric, type) {
	if (toolSlug !== 'sortbikenet' || metric !== 'real') return base;
	return type === 'from_2026' ? '' : base.replace(/-network-[a-z0-9_]+$/, '-network-from_2021');
}

// One readdir per tool beats ~10k existsSync calls; a missing dir reads as empty.
function listing(dir) {
	try {
		return new Set(readdirSync(dir));
	} catch {
		return new Set();
	}
}

export function screenshotCoverage() {
	// `&& t.config` narrows past what export-matrix.ts's activeInteractiveTools covers: that file
	// falls back to a single plain-city combo (`[{}]`) for a config-less tool via combosFor(), which
	// this loop does not replicate (it destructures tool.config directly). No active interactive
	// tool lacks `config` today — if one is added, its screenshots would need this loop extended
	// with the same fallback, or they won't count toward coverage.
	const tools = readJson('src/lib/data/tools.json').filter(
		(t) => t.status === 'active' && t.category === 'interactive' && t.config
	);
	const cities = readJson('src/lib/data/cities.json');
	const manifest = readJson('src/lib/data/data-files.json');

	const perTool = tools.map((tool) => {
		const { metrics, types } = tool.config;
		const variants = tool.config.variants ?? [undefined];
		const data = new Set(manifest[tool.slug] ?? []);
		const shots = listing(path.join(SCREENSHOTS_DIR, tool.slug));

		let expected = 0;
		let present = 0;
		for (const city of cities) {
			for (const metric of metrics) {
				for (const type of types) {
					for (const variant of variants) {
						const base =
							tool.slug === 'sortbikenet'
								? `${city.slug}-${metric}-network-${type}`
								: `${city.slug}-${metric}-${type}${variant ? variantSuffix(variant) : ''}`;
						if (!data.has(`${dataStem(tool.slug, base, metric, type)}.geojson`)) continue;
						expected++;
						if (shots.has(`${base}.webp`)) present++;
					}
				}
			}
		}
		return { slug: tool.slug, expected, present };
	});

	const expected = perTool.reduce((n, t) => n + t.expected, 0);
	const present = perTool.reduce((n, t) => n + t.present, 0);
	return { perTool, expected, present, ratio: expected ? present / expected : 1 };
}

// Human-readable coverage block, one line per tool.
export function formatCoverage({ perTool, expected, present, ratio }) {
	const pct = (n) => (expected ? `${Math.round(n * 100)}%` : 'n/a');
	const width = Math.max(...perTool.map((t) => t.slug.length));
	const rows = perTool.map(
		(t) =>
			`         ${t.slug.padEnd(width)}  ${String(t.present).padStart(5)} / ${String(t.expected).padStart(5)}` +
			(t.expected && !t.present ? '  (none)' : '')
	);
	return [`[data] screenshots: ${present} / ${expected} (${pct(ratio)})`, ...rows].join('\n');
}
