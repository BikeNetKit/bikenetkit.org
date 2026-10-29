#!/usr/bin/env node
/**
 * Dataset content audit: is anything the manifest lists actually empty?
 *
 * The failure this exists to catch: a GeoJSON file that is present, well-formed, listed in
 * `data-files.json` — and holds `"features": []`. `datasets.ts` enumerates datasets by *parsing
 * filenames*; it never opens them. So `toolCoversCity()` returns true, the coverage table stars and
 * links the cell, the tool page skips `UnavailableNotice`, the fetch succeeds — and the map renders
 * nothing, with no explanation. To a reader that is indistinguishable from "this tool is broken
 * here", which is exactly how it gets reported.
 *
 *   pnpm check:datasets                      # exits non-zero on a new empty dataset
 *   pnpm check:datasets -- --accept          # record the current empties as known
 *   pnpm check:datasets -- --city lida_by    # per-layer report for one city
 *   pnpm check:datasets -- --exact           # parse every file, not just the small ones
 *   pnpm check:datasets -- --quiet           # findings only, no summary table
 *
 * An empty result is often *correct*. The cities this currently finds are almost all Ukrainian and
 * Belarusian, where OSM has essentially no existing bike network — so LinkBikeNet has nothing to
 * link and legitimately returns an empty set. The tools ran fine. The site just cannot tell an
 * empty result from a populated one, so the known list below is the record of which is which.
 *
 * Deliberately a script rather than the build preflight in `src/hooks.server.ts`: the
 * build never reads `www/data/` (see DEPLOY_DATA.md), so it *cannot* check this. Needs the data on
 * disk, same as `check:hulls`, and so cannot run in a clean clone either.
 *
 * Runs through `--experimental-strip-types` with the `$lib` alias hook so it resolves every path
 * through the app's own helpers rather than restating the filename conventions — a second
 * implementation of "which file does this dataset live in" would be the thing that drifts.
 */
import {
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	readSync,
	statSync,
	writeFileSync
} from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW_ROOT = path.resolve(HERE, '..');
const DATA_DIR = path.join(WWW_ROOT, 'data');
const KNOWN_PATH = path.join(HERE, 'check-datasets.known.json');

module.register(pathToFileURL(path.join(HERE, 'lib-alias-hook.mjs')));

const { datasets } = await import('../src/lib/data/datasets.ts');
const { cities, cityBySlug } = await import('../src/lib/data/cities.ts');
const { COVERAGE_COLUMNS } = await import('../src/lib/data/coverage.ts');
const { pickDataset } = await import('../src/lib/data/city-tools.ts');
const { wantsExistingNetwork } = await import('../src/lib/data/dataset-layers.ts');
const { dataUrl } = await import('../src/lib/data/data-base.ts');
const { geojsonPathFor, existingNetworkPathFor, growBikeNetSeedPathFor, superblockBlocksPathFor } =
	await import('../src/lib/data/tool-paths.ts');
const { boundaryPathFor } = await import('../src/lib/data/boundaries.ts');

// Those helpers wrap `dataUrl`, which rewrites `/data/...` to an absolute URL as soon as
// PUBLIC_DATA_URL is set. This script reads from disk, so that would silently produce paths that
// resolve nowhere and a run where nothing is ever found to be empty. Fail loudly instead.
const probe = dataUrl('/data/probe');
if (!probe.startsWith('/data/')) {
	console.error(
		`[datasets] check:datasets reads www/data/ from disk and needs PUBLIC_DATA_URL empty in\n` +
			`           www/.env — it currently resolves /data/probe to ${probe}.\n` +
			`           Unset it and re-run.\n`
	);
	process.exit(1);
}

/** `/data/<tool>/<file>.geojson` — as `dataUrl` leaves it — to an absolute path under www/. */
const toLocal = (url) => path.join(WWW_ROOT, url);

const argv = process.argv.slice(2);
const accept = argv.includes('--accept');
const exact = argv.includes('--exact');
const quiet = argv.includes('--quiet');
const onlyCities = argv.flatMap((arg, i) => (arg === '--city' && argv[i + 1] ? [argv[i + 1]] : []));

const unknownCities = onlyCities.filter((slug) => !cityBySlug[slug]);
if (unknownCities.length > 0) {
	console.error(`[datasets] --city: not in cities.json: ${unknownCities.join(', ')}`);
	process.exit(1);
}

if (!existsSync(DATA_DIR)) {
	console.log(
		`[datasets] www/data/ is not on disk — nothing to audit. It is off-repo and gitignored;\n` +
			`           see www/DEPLOY_DATA.md, or symlink it from the main checkout in a worktree.`
	);
	process.exit(0);
}

// Every file the app would fetch for a dataset, keyed by path so the baselines — one per city,
// shared by dozens of datasets — are counted once rather than reported dozens of times.
const entries = new Map();

function add(tool, city, kind, url) {
	const file = toLocal(url);
	if (entries.has(file)) return;
	entries.set(file, { tool, city, kind, stem: path.basename(file, '.geojson'), file });
}

for (const [tool, list] of Object.entries(datasets)) {
	for (const { city, metric, type, variant } of list) {
		if (onlyCities.length > 0 && !onlyCities.includes(city)) continue;
		add(tool, city, 'dataset', geojsonPathFor(tool, { city, metric, type, variant }));
		// Mirrors `fetchDatasetLayers`'s own gating, so the audit covers exactly the set of files a
		// map page requests — no more, and nothing it would miss.
		if (tool === 'growbikenet') {
			add(tool, city, 'seed', growBikeNetSeedPathFor(city, type, variant));
		}
		if (tool === 'superblockify') {
			add(tool, city, 'blocks', superblockBlocksPathFor(city, metric));
		}
		if (wantsExistingNetwork(tool, variant)) {
			add(tool, city, 'baseline', existingNetworkPathFor(tool, city, type));
		}
	}
}

/**
 * Feature count, `null` when the file is large enough to certainly have content, `-1` when absent.
 *
 * Parsing all ~12,500 files (~4.3 GB) takes minutes, which is too slow for a check meant to run
 * after every import, so anything above the gate is taken on trust. A FeatureCollection holding
 * three minimal features is well under 1 KB, so the margin is generous. The blind spot is a single
 * feature carrying thousands of coordinates — a real network, not a degenerate one — which is
 * precisely the case worth skipping. `--exact` parses everything anyway.
 */
const PARSE_BELOW_BYTES = 4096;

function featureCount(file) {
	if (!existsSync(file)) return -1;
	if (!exact && statSync(file).size > PARSE_BELOW_BYTES) return null;
	const parsed = JSON.parse(readFileSync(file, 'utf8'));
	return Array.isArray(parsed.features) ? parsed.features.length : 0;
}

const SAMPLE_BYTES = 16_384;
const COORD_PATTERN = /\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/g;

/**
 * Bbox of the first coordinates in a file, without parsing it. Where the geometry *is* is a
 * property every dataset file has to be asked about, including the 17 MB ones — but the first few
 * hundred coordinates pin a network to within a city block. Reading 16 KB of each file takes a few
 * seconds across the whole manifest; parsing them all takes minutes.
 */
function sampleBbox(file) {
	if (!existsSync(file)) return null;
	const fd = openSync(file, 'r');
	try {
		const buf = Buffer.alloc(SAMPLE_BYTES);
		const bytesRead = readSync(fd, buf, 0, SAMPLE_BYTES, 0);
		const head = buf.toString('utf8', 0, bytesRead);
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const m of head.matchAll(COORD_PATTERN)) {
			const x = Number(m[1]);
			const y = Number(m[2]);
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
		return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
	} finally {
		closeSync(fd);
	}
}

/**
 * A city's own boundary bbox — the placement reference, not `cityBySlug[...].bounds`. The latter
 * is derived from tool data across the whole manifest, which is precisely what a misplacement
 * poisons; the boundary comes from the export's own `city_boundary` file and is unaffected by it.
 * The simplified boundary is 2–9 KB (see `BOUNDARY_TOLERANCE_DEG` in update-data.mjs), so a full
 * parse per city is cheap — cached, since dozens of datasets share one city.
 */
const boundaryBboxCache = new Map();
function boundaryBbox(slug) {
	if (boundaryBboxCache.has(slug)) return boundaryBboxCache.get(slug);
	const file = toLocal(boundaryPathFor(slug));
	let bbox = null;
	if (existsSync(file)) {
		const fc = JSON.parse(readFileSync(file, 'utf8'));
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		const visit = (ring) => {
			for (const [x, y] of ring) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		};
		for (const f of fc.features ?? []) {
			const g = f.geometry;
			if (!g) continue;
			const polygons =
				g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
			for (const rings of polygons) rings.forEach(visit);
		}
		if (Number.isFinite(minX)) bbox = [minX, minY, maxX, maxY];
	}
	boundaryBboxCache.set(slug, bbox);
	return bbox;
}

/**
 * Whether bbox `a` falls within `padWidths` of `ref`'s own width/height, floored at `padMinDeg` —
 * mirrors `intersectsPadded` in update-data.mjs (duplicated rather than imported — this script and
 * that one already duplicate the filename conventions they both need, for the same reason:
 * one is a plain Node script, the other trims `$lib` imports through the alias hook).
 */
function intersectsPadded(a, ref, padWidths, padMinDeg) {
	const w = Math.max(ref[2] - ref[0], 1e-9);
	const h = Math.max(ref[3] - ref[1], 1e-9);
	const padX = Math.max(w * padWidths, padMinDeg);
	const padY = Math.max(h * padWidths, padMinDeg);
	return !(
		a[2] < ref[0] - padX ||
		a[0] > ref[2] + padX ||
		a[3] < ref[1] - padY ||
		a[1] > ref[3] + padY
	);
}

/** Advisory: reported but never fails the run — a near-miss is worth a look, not a blocked import. */
const PLACEMENT_ADVISORY_PAD_WIDTHS = 1;
/** Failing: the same gate `assertPlacement` uses in update-data.mjs, so both agree on "wrong city". */
const PLACEMENT_FAIL_PAD_WIDTHS = 3;
const PLACEMENT_PAD_MIN_DEG = 0.05;

const fmtBounds = ([x0, y0, x1, y1]) => {
	const r = (n) => Math.round(n * 1000) / 1000;
	return `(${r(x0)},${r(y0)})-(${r(x1)},${r(y1)})`;
};

const empty = [];
const invalid = [];
const counts = new Map();

for (const entry of entries.values()) {
	let count;
	try {
		count = featureCount(entry.file);
	} catch (err) {
		// A truncated or half-uploaded file should surface as a finding, not take the audit with it.
		invalid.push({ ...entry, reason: err.message });
		continue;
	}
	counts.set(entry.file, count);
	if (count === 0) empty.push({ ...entry, count });
	// `count === -1` (absent) is deliberately ignored: `check:coverage` already owns the
	// absent-vs-recommended question, and reporting it here would double-count the same gap.
}

const keyOf = ({ tool, stem }) => `${tool}/${stem}`;
const byKey = (a, b) => keyOf(a).localeCompare(keyOf(b));

// Placement axis: is this file's geometry actually where the city it is named for is? Runs after
// the feature-count loop so an absent file (count === -1) is skipped the same way — that question
// belongs to check:coverage, not here.
const nearMiss = [];
const misplaced = [];

for (const entry of entries.values()) {
	if (counts.get(entry.file) === -1) continue;
	const ref = boundaryBbox(entry.city);
	const sample = sampleBbox(entry.file);
	if (!ref || !sample) continue;
	if (intersectsPadded(sample, ref, PLACEMENT_ADVISORY_PAD_WIDTHS, PLACEMENT_PAD_MIN_DEG)) continue;
	const severe = !intersectsPadded(sample, ref, PLACEMENT_FAIL_PAD_WIDTHS, PLACEMENT_PAD_MIN_DEG);
	(severe ? misplaced : nearMiss).push({ ...entry, sample, ref });
}

const known = existsSync(KNOWN_PATH)
	? JSON.parse(readFileSync(KNOWN_PATH, 'utf8'))
	: { note: '', empty: [], misplaced: [] };
const knownKeys = new Set((known.empty ?? []).map((e) => `${e.tool}/${e.file}`));
const knownMisplacedKeys = new Set((known.misplaced ?? []).map((e) => `${e.tool}/${e.file}`));

if (accept) {
	if (onlyCities.length > 0) {
		console.error('[datasets] --accept rewrites the whole known list, so it cannot be scoped');
		console.error('           with --city. Re-run without it.');
		process.exit(1);
	}
	const payload = {
		note:
			'Datasets the frozen export ships with zero features, or with geometry confirmed as ' +
			'genuinely belonging to the named city despite sitting more than 3 boundary-widths from ' +
			'it. Legitimate upstream results — not corruption. Reported every run, but they do not ' +
			'fail it. Re-record with `pnpm check:datasets -- --accept`.',
		empty: [...empty].sort(byKey).map(({ tool, stem, kind }) => ({ tool, file: stem, kind })),
		misplaced: [...misplaced]
			.sort(byKey)
			.map(({ tool, stem, kind }) => ({ tool, file: stem, kind }))
	};
	writeFileSync(KNOWN_PATH, `${JSON.stringify(payload, null, '\t')}\n`);
	console.log(
		`[datasets] recorded ${empty.length} known empty and ${misplaced.length} known misplaced ` +
			`dataset(s) in ${path.basename(KNOWN_PATH)}`
	);
	process.exit(0);
}

const unexpected = empty.filter((e) => !knownKeys.has(keyOf(e)));
// Only meaningful on a full run: under `--city` the scan covers one city, so every known empty
// belonging to another would look as though it had been fixed.
const fixed =
	onlyCities.length > 0 ? [] : [...knownKeys].filter((k) => !empty.some((e) => keyOf(e) === k));

const unexpectedMisplaced = misplaced.filter((e) => !knownMisplacedKeys.has(keyOf(e)));
const fixedMisplaced =
	onlyCities.length > 0
		? []
		: [...knownMisplacedKeys].filter((k) => !misplaced.some((e) => keyOf(e) === k));

const KIND_LABEL = {
	dataset: 'map layer',
	baseline: 'existing-network baseline',
	seed: 'seed nodes',
	blocks: 'block attributes'
};

if (onlyCities.length > 0) {
	for (const slug of onlyCities) {
		console.log(`\n[datasets] ${cityBySlug[slug].name} (${slug})\n`);
		const mine = [...entries.values()]
			.filter((e) => e.city === slug)
			.sort((a, b) => a.tool.localeCompare(b.tool) || a.stem.localeCompare(b.stem));
		for (const entry of mine) {
			const count = counts.get(entry.file);
			const shown = count === null ? 'many' : count === -1 ? 'absent' : String(count);
			const isMisplaced = misplaced.some((e) => e.file === entry.file);
			const isNearMiss = nearMiss.some((e) => e.file === entry.file);
			const verdict =
				count === 0
					? knownKeys.has(keyOf(entry))
						? 'EMPTY (known)'
						: 'EMPTY'
					: isMisplaced
						? knownMisplacedKeys.has(keyOf(entry))
							? 'MISPLACED (known)'
							: 'MISPLACED'
						: isNearMiss
							? 'near-miss'
							: '';
			console.log(
				`  ${entry.tool.padEnd(15)} ${entry.stem.padEnd(46)} ` +
					`${shown.padStart(6)}  ${KIND_LABEL[entry.kind].padEnd(26)} ${verdict}`
			);
		}
	}
	console.log();
}

if (!quiet && onlyCities.length === 0) {
	console.log(
		`[datasets] ${entries.size} files behind ${Object.values(datasets).reduce((n, l) => n + l.length, 0)} datasets\n`
	);
}

if (empty.length > 0) {
	const tracked = empty.length - unexpected.length;
	console.log(
		`[datasets] ${empty.length} file(s) have zero features` +
			`${tracked ? ` (${tracked} known and tracked)` : ''}.`
	);
	for (const entry of [...empty].sort(byKey).slice(0, 40)) {
		const mark = knownKeys.has(keyOf(entry)) ? ' ' : '!';
		console.log(`  ${mark} ${entry.tool.padEnd(15)} ${entry.stem.padEnd(46)} ${entry.kind}`);
	}
	if (empty.length > 40) console.log(`  … and ${empty.length - 40} more`);
	console.log();
}

if (fixed.length > 0) {
	console.log(
		`[datasets] ${fixed.length} previously-empty dataset(s) now have features — re-record with ` +
			`\`pnpm check:datasets -- --accept\`:`
	);
	for (const k of fixed.slice(0, 20)) console.log(`  ${k}`);
	console.log();
}

if (misplaced.length > 0) {
	const tracked = misplaced.length - unexpectedMisplaced.length;
	console.log(
		`[datasets] ${misplaced.length} file(s) sample more than ${PLACEMENT_FAIL_PAD_WIDTHS} ` +
			`boundary-widths from the city's own boundary` +
			`${tracked ? ` (${tracked} known and tracked)` : ''}.`
	);
	for (const entry of [...misplaced].sort(byKey).slice(0, 40)) {
		const mark = knownMisplacedKeys.has(keyOf(entry)) ? ' ' : '!';
		console.log(
			`  ${mark} ${entry.tool.padEnd(15)} ${entry.stem.padEnd(46)} ` +
				`data ${fmtBounds(entry.sample)} vs boundary ${fmtBounds(entry.ref)}`
		);
	}
	if (misplaced.length > 40) console.log(`  … and ${misplaced.length - 40} more`);
	console.log();
}

if (fixedMisplaced.length > 0) {
	console.log(
		`[datasets] ${fixedMisplaced.length} previously-misplaced dataset(s) now sample near the ` +
			`right city — re-record with \`pnpm check:datasets -- --accept\`:`
	);
	for (const k of fixedMisplaced.slice(0, 20)) console.log(`  ${k}`);
	console.log();
}

if (nearMiss.length > 0 && !quiet) {
	console.log(
		`[datasets] ${nearMiss.length} file(s) sample ${PLACEMENT_ADVISORY_PAD_WIDTHS}-` +
			`${PLACEMENT_FAIL_PAD_WIDTHS} boundary-widths from the city's own boundary. Not a\n` +
			`           failure — a network legitimately reaching past the municipal line looks like ` +
			`this too — but worth a glance.`
	);
	for (const entry of [...nearMiss].sort(byKey).slice(0, 40)) {
		console.log(
			`    ${entry.tool.padEnd(15)} ${entry.stem.padEnd(46)} ` +
				`data ${fmtBounds(entry.sample)} vs boundary ${fmtBounds(entry.ref)}`
		);
	}
	if (nearMiss.length > 40) console.log(`    … and ${nearMiss.length - 40} more`);
	console.log();
}

/**
 * Per-city count of tools that would actually show something, by the same columns the coverage
 * table uses. This is the view that answers "which cities look broken" — the question this script
 * gets run for — rather than "which files are empty".
 */
function reportUsableTools() {
	const usableCount = (city) => COVERAGE_COLUMNS.filter((col) => columnUsable(col, city)).length;

	const rows = cities
		.filter((city) => onlyCities.length === 0 || onlyCities.includes(city.slug))
		.map((city) => ({ city, usable: usableCount(city) }))
		.sort((a, b) => a.usable - b.usable || a.city.slug.localeCompare(b.city.slug));

	const distribution = rows.reduce((acc, r) => {
		acc[r.usable] = (acc[r.usable] ?? 0) + 1;
		return acc;
	}, {});
	console.log(
		`[datasets] usable tools per city: ` +
			Object.entries(distribution)
				.map(([n, c]) => `${c} cit${c === 1 ? 'y' : 'ies'} with ${n}`)
				.join(', ')
	);

	const worst = rows.filter((r) => r.usable <= 2);
	if (worst.length === 0) return;
	console.log(
		`\n           ${worst.length} cit${worst.length === 1 ? 'y has' : 'ies have'} 2 or fewer:`
	);
	for (const { city, usable } of worst) {
		const detail = COVERAGE_COLUMNS.map(
			(col) => `${col.id.split(':').pop()}:${columnState(col, city)}`
		);
		console.log(`    ${city.slug.padEnd(22)} ${usable}   ${detail.join('  ')}`);
	}
	console.log();
}

/** Feature count for the dataset a column would open on, or `-1` when it has none. */
function columnCount(col, city) {
	const dataset = pickDataset(col.tool, city, datasets, col.variant);
	if (!dataset) return -1;
	const file = toLocal(geojsonPathFor(col.tool, { city: city.slug, ...dataset }));
	return counts.has(file) ? counts.get(file) : featureCountSafe(file);
}

function featureCountSafe(file) {
	try {
		return featureCount(file);
	} catch {
		return 0;
	}
}

const hasContent = (count) => count === null || count > 0;

/**
 * Whether a column would render anything at all. `from_bikenw` additionally needs its baseline:
 * the whole scenario is "grow from the existing network", so an empty baseline leaves it nothing
 * to grow from even when the result layer itself is populated.
 */
function columnUsable(col, city) {
	if (!hasContent(columnCount(col, city))) return false;
	if (col.variant !== 'from_bikenw') return true;
	return hasContent(featureCountSafe(toLocal(existingNetworkPathFor(col.tool, city.slug))));
}

// Which of `columnUsable`'s two conditions failed, not just that one did: a `from_bikenw` column
// can be unusable because of its own layer *or* because of a thin baseline, and the two want
// different fixes. Testing the layer first means a real count is only ever shown when the layer is
// genuinely the problem — under `--exact` that count is a number rather than `null`, so the older
// "null means baseline" shorthand would have labelled a 33-feature layer as its own cause.
function columnState(col, city) {
	const count = columnCount(col, city);
	if (count === -1) return '—';
	if (!hasContent(count)) return String(count);
	if (!columnUsable(col, city)) return 'nobase';
	return 'ok';
}

if (!quiet) reportUsableTools();

if (invalid.length > 0) {
	console.error(`[datasets] ${invalid.length} file(s) could not be read as GeoJSON:`);
	for (const entry of invalid.slice(0, 20)) {
		console.error(`  ${entry.tool.padEnd(15)} ${entry.stem.padEnd(46)} ${entry.reason}`);
	}
	console.error();
}

if (unexpected.length > 0) {
	console.error(
		`[datasets] ${unexpected.length} NEW empty dataset(s).\n` +
			`           The manifest lists them, so the coverage table links them and the tool page\n` +
			`           renders a blank map with no explanation. Confirm with the tool team whether the\n` +
			`           empty result is real, then accept it with --accept once it is understood.\n`
	);
	for (const entry of [...unexpected].sort(byKey)) {
		console.error(`  ${entry.tool.padEnd(15)} ${entry.stem.padEnd(46)} ${entry.kind}`);
	}
	console.error();
}

if (unexpectedMisplaced.length > 0) {
	console.error(
		`[datasets] ${unexpectedMisplaced.length} NEW misplaced dataset(s) — geometry far outside\n` +
			`           the city's own boundary. This usually means the export mislabeled a different\n` +
			`           place's network as this city's — compare the export's own\n` +
			`           <cityid>-<tool>-city_boundary.geojson (normally correct) against the data file.\n` +
			`           Quarantine the pair in src/lib/data/excluded-datasets.json and re-run\n` +
			`           pnpm update-data, or accept it with --accept if it is genuinely this city's.\n`
	);
	for (const entry of [...unexpectedMisplaced].sort(byKey)) {
		console.error(
			`  ${entry.tool.padEnd(15)} ${entry.stem.padEnd(46)} ` +
				`data ${fmtBounds(entry.sample)} vs boundary ${fmtBounds(entry.ref)}`
		);
	}
	console.error();
}

if (unexpected.length === 0 && invalid.length === 0 && unexpectedMisplaced.length === 0) {
	console.log(
		empty.length === 0 && misplaced.length === 0
			? '[datasets] OK — every dataset the manifest lists has features behind it, in the right place.'
			: '[datasets] OK — no new empty or misplaced datasets; the ones above are tracked.'
	);
	process.exit(0);
}
process.exit(1);
