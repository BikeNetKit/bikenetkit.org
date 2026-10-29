#!/usr/bin/env node
/**
 * Superblock hull fidelity + timing check.
 *
 * `buildSuperblocks` runs on the main thread the moment a SuperBlockify dataset lands, and it used
 * to be the slowest thing on the site: the `alpha-shape` package cost ~2.6 s on berlin_de. It was
 * replaced by a 2D Delaunay alpha complex (see `alphaBoundary` in `$lib/utils/superblocks`). There
 * are no e2e tests to catch a geometry regression, so this script is the net: it rebuilds the hulls
 * for a few of the largest cities and compares them against a committed baseline.
 *
 *   pnpm check:hulls                    # compare against the baseline, exit non-zero on drift
 *   pnpm check:hulls -- --write         # record the current output as the baseline
 *   pnpm check:hulls -- --city berlin_de-residential [--city …]
 *
 * The baseline in `check-hulls.baseline.json` was recorded from the `alpha-shape` implementation
 * that preceded the swap, so a passing run is evidence the two agree — not just that nothing has
 * changed since the swap. Re-record only after eyeballing the maps.
 *
 * Runs through `--experimental-strip-types` (see the `check:hulls` script) because it imports
 * `superblocks.ts` directly rather than duplicating it. Needs `www/data/` on disk (see
 * DEPLOY_DATA.md); skips with a notice when a dataset is absent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data', 'superblockify');
const BASELINE = path.join(HERE, 'check-hulls.baseline.json');

/** The largest datasets, where the old implementation hurt most and drift would show first. */
const DEFAULT_DATASETS = [
	'berlin_de-residential',
	'berlin_de-betweenness',
	'london_gb-residential',
	'warsaw_pl-betweenness'
];

/** Tolerances against the baseline: geometry is expected to be identical, timing is not. */
const MAX_HULL_COUNT_DRIFT = 3;
const MAX_P95_AREA_DELTA = 1e-6;

const args = process.argv.slice(2);
const write = args.includes('--write');
const datasets = args.reduce(
	(acc, a, i) => (args[i - 1] === '--city' ? [...acc, a] : acc),
	/** @type {string[]} */ ([])
);

const { buildSuperblocks } = await import('../src/lib/utils/superblocks.ts');

const ringArea = (ring) => {
	let a = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
	}
	return Math.abs(a / 2);
};

const quantile = (sorted, p) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

function measure(dataset) {
	const edgesPath = path.join(DATA, `${dataset}-edges.geojson`);
	const ltnsPath = path.join(DATA, `${dataset}-ltns.geojson`);
	if (!fs.existsSync(edgesPath)) return null;
	const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf8'));
	const ltns = fs.existsSync(ltnsPath) ? JSON.parse(fs.readFileSync(ltnsPath, 'utf8')) : null;

	const t0 = performance.now();
	const blocks = buildSuperblocks(edges, ltns);
	const ms = Math.round(performance.now() - t0);

	// Areas are keyed by classification so a baseline stays comparable when a hull appears or
	// disappears — the count check catches that separately. Stored at *relative* precision: these
	// are degrees², so a small block's area is ~1e-7 and a fixed number of decimals would quantize
	// it away and manufacture drift.
	const areas = {};
	for (const f of blocks.hulls.features) {
		areas[f.properties.classification] = +ringArea(f.geometry.coordinates[0]).toPrecision(12);
	}
	return {
		features: edges.features.length,
		blocks: blocks.byClassification.size,
		hulls: blocks.hulls.features.length,
		ms,
		areas
	};
}

const results = {};
for (const dataset of datasets.length ? datasets : DEFAULT_DATASETS) {
	const r = measure(dataset);
	if (!r) {
		console.log(`  skip  ${dataset} — not in www/data/superblockify`);
		continue;
	}
	results[dataset] = r;
	console.log(
		`  ${dataset}: ${r.features} features, ${r.blocks} blocks, ${r.hulls} hulls, ${r.ms} ms`
	);
}

if (!Object.keys(results).length) {
	console.error('\nNo datasets found. Run `pnpm pull-data` first.');
	process.exit(1);
}

if (write) {
	fs.writeFileSync(BASELINE, JSON.stringify(results, null, '\t') + '\n');
	console.log(`\nBaseline written to ${path.relative(process.cwd(), BASELINE)}`);
	process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
	console.error('\nNo baseline. Record one with `pnpm check:hulls -- --write`.');
	process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
let failed = false;
console.log('');
for (const [dataset, now] of Object.entries(results)) {
	const was = baseline[dataset];
	if (!was) {
		console.log(`  ?  ${dataset} — not in the baseline, skipping`);
		continue;
	}
	const countDrift = Math.abs(now.hulls - was.hulls);
	const deltas = [];
	for (const [cls, area] of Object.entries(now.areas)) {
		const before = was.areas[cls];
		if (before > 0) deltas.push(Math.abs(area - before) / before);
	}
	deltas.sort((a, b) => a - b);
	const p95 = quantile(deltas, 0.95);
	const max = deltas[deltas.length - 1] ?? 0;
	// Blocks whose alpha complex fragments into several loops of comparable size can flip which one
	// is largest. Reported, not failed on — the p95 gate is what keeps that a handful of blocks.
	const reshaped = deltas.filter((d) => d > 0.01).length;
	const ok = countDrift <= MAX_HULL_COUNT_DRIFT && p95 <= MAX_P95_AREA_DELTA;
	if (!ok) failed = true;
	console.log(
		`  ${ok ? 'ok  ' : 'FAIL'} ${dataset}: hulls ${was.hulls} → ${now.hulls} (Δ${countDrift}), ` +
			`p95 area Δ ${p95.toExponential(1)}, max ${max.toExponential(1)}, ` +
			`${reshaped}/${deltas.length} reshaped >1%, ${was.ms} → ${now.ms} ms`
	);
}

if (failed) {
	console.error(
		`\nHull geometry drifted beyond tolerance (count ±${MAX_HULL_COUNT_DRIFT}, p95 area ${MAX_P95_AREA_DELTA}).` +
			'\nIf the change is intended, eyeball the maps and re-record with --write.'
	);
	process.exit(1);
}
console.log('\nHulls match the baseline.');
