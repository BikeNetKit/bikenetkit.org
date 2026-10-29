#!/usr/bin/env node
/**
 * Map tables check: the "View as table" dialog, run over real data without a browser.
 *
 * `buildMapTables` turns each map into a summary and a few tables. It is pure, so this script loads
 * the same layers a map page fetches — through `fetchDatasetLayers`, with `fetch` pointed at
 * www/data/ — and asserts on what comes out:
 *
 *   - every cell and the summary are free of NaN, Infinity, undefined and null;
 *   - a progress table runs from "Start" to the last frame, and "Newly built" never shrinks;
 *   - ranked tables hold at most ten rows (FixBikeNet: every gap, at most 50), in rank order;
 *   - an empty result says so instead of producing tables.
 *
 *   pnpm check:map-tables                  # the sample below
 *   pnpm check:map-tables -- --all         # every dataset in the manifest (a few minutes)
 *   pnpm check:map-tables -- --print       # also print each sample's summary and tables
 *
 * Needs www/data/ on disk; skips with a notice when it is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', 'data');

module.register(pathToFileURL(path.join(HERE, 'lib-alias-hook.mjs')));

const { buildMapTables } = await import('../src/lib/data/map-table/index.ts');
const { fetchDatasetLayers } = await import('../src/lib/data/dataset-layers.ts');
const { datasets } = await import('../src/lib/data/datasets.ts');
const { cityBySlug } = await import('../src/lib/data/cities.ts');
const { cityCenter } = await import('../src/lib/data/city-tools.ts');
const { toolBySlug } = await import('../src/lib/data/tools.ts');

const argv = process.argv.slice(2);
const all = argv.includes('--all');
const print = argv.includes('--print');

if (!existsSync(DATA_DIR)) {
	console.log('[map-tables] www/data/ is not on disk — nothing to check. See www/DEPLOY_DATA.md.');
	process.exit(0);
}

/** Each tool's sample cities, plus the edge cases: an empty result, few gaps, one gap. */
const SAMPLE = [
	['growbikenet', 'copenhagen_dk', 'betweenness', 'grid', 'from_bikenw'],
	['growbikenet', 'london_gb', 'betweenness', 'grid', 'from_scratch'],
	['growbikenet', 'soligorsk_by', 'betweenness', 'rail', 'from_bikenw'],
	['linkbikenet', 'copenhagen_dk', 'largest_closest', 'default', 'default'],
	['linkbikenet', 'budapest_hu', 'largest', 'default', 'default'],
	['sortbikenet', 'paris_fr', 'coverage', 'from_2021', 'default'],
	['sortbikenet', 'paris_fr', 'real', 'from_2021', 'default'],
	['sortbikenet', 'paris_fr', 'real', 'from_scratch', 'default'],
	['fixbikenet', 'copenhagen_dk', 'default', 'default', 'default'],
	['fixbikenet', 'kramatorsk_ua', 'default', 'default', 'default'],
	['fixbikenet', 'rijeka_hr', 'default', 'default', 'default'],
	['superblockify', 'london_gb', 'residential', 'edges', 'default'],
	['superblockify', 'paris_fr', 'betweenness', 'edges', 'default']
];

/** The manifest's own entries for a tool and city, so the sample uses real metric/type names. */
function resolveSample([tool, city, metric, type, variant]) {
	const list = (datasets[tool] ?? []).filter((d) => d.city === city);
	return (
		list.find((d) => d.metric === metric && d.type === type && d.variant === variant) ??
		list.find((d) => d.metric === metric) ??
		list[0] ?? { city, metric, type, variant }
	);
}

/** `fetch` against www/data/: the layer URLs end in `<tool>/<file>.geojson`. */
async function diskFetch(url) {
	const parts = new URL(url, 'http://local').pathname.split('/');
	const file = path.join(DATA_DIR, parts.at(-2), parts.at(-1));
	if (!existsSync(file)) return new Response(null, { status: 404 });
	return new Response(readFileSync(file), { headers: { 'content-type': 'application/json' } });
}

const BAD_CELL = /NaN|Infinity|undefined|null/;
const MAX_RANKED = { fixbikenet: 50 };

function check(tool, key, result) {
	const problems = [];
	if (!result) return ['no builder for this tool'];
	if (!result.summary || BAD_CELL.test(result.summary)) {
		problems.push(`summary: ${JSON.stringify(result.summary)}`);
	}
	if (result.kind === 'empty') return problems;
	if (!result.tables.length) problems.push('no tables');
	for (const t of result.tables) {
		if (!t.rows.length) problems.push(`${t.id}: no rows`);
		for (const row of t.rows) {
			if (row.cells.length !== t.columns.length - 1) {
				problems.push(`${t.id}: row "${row.header}" has ${row.cells.length + 1} cells`);
			}
			for (const cell of [row.header, ...row.cells]) {
				if (typeof cell !== 'string' || !cell || BAD_CELL.test(cell)) {
					problems.push(`${t.id}: bad cell ${JSON.stringify(cell)} in "${row.header}"`);
				}
			}
		}
		if (t.id === 'progress' || t.id === 'waves') {
			if (t.rows[0]?.header !== 'Start') problems.push(`${t.id}: first row is not Start`);
			const shares = t.rows.map((r) => parseFloat(r.cells[1]));
			if (shares.at(-1) !== 100) problems.push(`${t.id}: last row is at ${shares.at(-1)}%`);
			if (shares.some((v, i) => i > 0 && v < shares[i - 1])) {
				problems.push(`${t.id}: newly built shrinks`);
			}
		}
		if (t.id === 'ranked' || t.id === 'gaps') {
			const max = MAX_RANKED[tool] ?? 10;
			if (t.rows.length > max) problems.push(`${t.id}: ${t.rows.length} rows, max ${max}`);
		}
	}
	return problems;
}

const entries = all
	? Object.entries(datasets).flatMap(([tool, list]) => list.map((d) => [tool, d]))
	: SAMPLE.map((s) => [s[0], resolveSample(s)]);

let failures = 0;
let empties = 0;
for (const [tool, d] of entries) {
	const key = { tool, city: d.city, metric: d.metric, type: d.type, variant: d.variant };
	const label = `${tool}/${d.city}/${d.metric}/${d.type}${tool === 'growbikenet' ? `/${d.variant}` : ''}`;
	const layers = await fetchDatasetLayers(diskFetch, key, { includeContext: false });
	if (!layers.geojson) {
		console.log(`  skip  ${label} (not on disk)`);
		continue;
	}
	const city = cityBySlug[d.city];
	const result = buildMapTables({
		key,
		toolName: toolBySlug[tool].name,
		cityName: city?.name ?? d.city,
		center: city ? cityCenter(city) : null,
		geojson: layers.geojson,
		existingNetwork: layers.existingNetwork,
		blocks: layers.blocks
	});
	const problems = check(tool, key, result);
	if (result?.kind === 'empty') empties++;
	if (problems.length) {
		failures++;
		console.log(`  FAIL  ${label}\n        ${problems.slice(0, 5).join('\n        ')}`);
	} else if (!all) {
		console.log(`  ok    ${label}${result?.kind === 'empty' ? ' (empty)' : ''}`);
	}
	if (print && result) {
		console.log(`\n${result.summary}`);
		for (const t of result.kind === 'tables' ? result.tables : []) {
			console.log(`\n## ${t.title}${t.note ? `\n${t.note}` : ''}`);
			console.log(t.columns.map((c) => c.label).join(' | '));
			for (const r of t.rows) console.log([r.header, ...r.cells].join(' | '));
		}
		console.log('');
	}
}

console.log(
	`\n[map-tables] ${entries.length} datasets, ${empties} empty, ${failures} with problems.`
);
process.exit(failures ? 1 : 0);
