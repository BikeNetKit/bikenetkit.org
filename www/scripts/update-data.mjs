#!/usr/bin/env node
import { readFile, writeFile, readdir, stat, mkdir, cp, rm, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WWW_ROOT = path.resolve(__dirname, '..');
// Off-repo trees, outside static/ so Vite never copies them into build/ (see vite.config.js).
const DATA_DIR = path.join(WWW_ROOT, 'data');
// Where `pnpm pull-data` rsyncs the server export to, and what a bare `pnpm update-data` reads.
// It used to default to the retired `05_dev_data` repo next door, which is still on disk and still
// holds its last (2026-05) export: a bare run silently regressed www/data/ to that export and
// deleted ~9000 files. Keep this pointed at the pull root — see PRUNE_GUARD_RATIO for the second
// line of defence, which catches the same mistake via an explicit --data-root.
const DEFAULT_DATA_ROOT = path.resolve(WWW_ROOT, '..', '..', '05_dev_data_pull');

// `(tool, city)` pairs the export ships with geometry belonging to a different place — see
// excluded-datasets.json. Every mirror skips these on the way in, so quarantining a pair also
// deletes it from www/data/ on the next run (the mirrors already prune anything not replanned).
const EXCLUDED_DATASETS = JSON.parse(
	await readFile(path.resolve(WWW_ROOT, 'src/lib/data/excluded-datasets.json'), 'utf8')
).excluded;
const EXCLUDED_KEYS = new Set(EXCLUDED_DATASETS.map((e) => `${e.tool}:${e.city}`));
const isExcluded = (tool, slug) => EXCLUDED_KEYS.has(`${tool}:${slug}`);

const TOOL_RULES = {
	growbikenet: { format: 'geojson', requireBoundary: true },
	fixbikenet: { format: 'fixbikenet-geojson', requireBoundary: true },
	linkbikenet: { format: 'linkbikenet-geojson', requireBoundary: true },
	// The sortbikenet export ships no city boundary — Paris already has one from growbikenet and
	// fixbikenet, which is what writeSimplifiedBoundaries and loadCityBoundary read.
	sortbikenet: { format: 'sortbikenet-geojson', requireBoundary: false },
	superblockify: { format: 'superblockify-geojson', requireBoundary: false }
};

// The superblockify export ships columns nothing reads — several betweenness variants where one is
// styled, plus the block bookkeeping fields under their raw names. Trim to the app's allow-list on
// import to keep the payload small.
function superblockifyKeepProps(layer, analysis) {
	if (layer === 'ltns') {
		// Block attributes read by superblocks.ts, in place of aggregating them over edges.
		// `population_density` is the export's own figure — see `renameSuperblockBlockProps` for
		// the unit conversion. Do not derive it from population/area here: where the export
		// computes a value, that value is what ships.
		return ['classification', 'population', 'area', 'length_total', 'm', 'population_density'];
	}
	return [
		'classification',
		'length',
		// Per-cell values driving the per-edge density coloring (and the edge-aggregation fallback).
		'population',
		'area',
		analysis === 'betweenness' ? 'edge_betweenness_linear' : 'edge_betweenness_linear_restricted'
	];
}

// Growth strategies shipped by the linkbikenet export, longest name first so that
// suffix matching never resolves `-largest_closest` as `-largest`.
const LINKBIKENET_STRATEGIES = ['largest_closest', 'largest', 'closest'];

// The Sep 2026 linkbikenet export spells the same three strategies out more explicitly and puts
// them behind a `-linkbikenet-` infix. Map them back onto the app's existing tokens rather than
// renaming the axis: the strategies are unchanged, and the tokens are baked into route URLs,
// tools.json and the strategy labels.
const LINKBIKENET_STRATEGY_BY_EXPORT_NAME = {
	largest_to_closest: 'largest_closest',
	largest_to_second: 'largest',
	closest_components: 'closest'
};

function parseArgs(argv) {
	const args = {
		dataRoot: DEFAULT_DATA_ROOT,
		date: null,
		dryRun: false,
		tools: null,
		boundariesOnly: false,
		force: false
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--dry-run') args.dryRun = true;
		else if (a === '--force') args.force = true;
		else if (a === '--boundaries-only') args.boundariesOnly = true;
		else if (a === '--date') args.date = argv[++i];
		else if (a === '--data-root') args.dataRoot = path.resolve(argv[++i]);
		else if (a === '--tool') {
			const names = argv[++i]
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			args.tools = new Set([...(args.tools ?? []), ...names]);
		} else if (a === '--help' || a === '-h') {
			console.log(
				`Usage: pnpm run update-data [-- --date YYYYMMDD] [--data-root PATH] [--tool NAME]\n` +
					`                           [--dry-run] [--force]\n\n` +
					`Reads ${DEFAULT_DATA_ROOT} unless --data-root says otherwise.\n` +
					`Uses the complete dataexports/latest/ export when present; otherwise merges the\n` +
					`most recent YYYYMMDD export per tool. --date pins a specific dated export.\n\n` +
					`A run that would prune most of www/data/ aborts as a likely-stale export root;\n` +
					`--force says the shrunken export is intentional and runs it anyway.\n\n` +
					`--tool limits the run to the named tools (repeatable, or comma-separated).\n` +
					`A filtered run leaves cities.json and the city CSVs alone, and updates only its\n` +
					`own tools' entries in site-stats.json.\n\n` +
					`--boundaries-only regenerates just the simplified city boundaries the basemap\n` +
					`clips its labels to. That step reads www/data/ rather than the export root,\n` +
					`so it needs no export present and can be re-run on its own after retuning.`
			);
			process.exit(0);
		} else {
			throw new Error(`Unknown argument: ${a}`);
		}
	}
	return args;
}

function slugify(s) {
	return s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// Bare, hyphen-free form of a city name, matching the export's cityid convention
// (e.g. "Andorra la Vella" -> "andorralavella", "Saint-Étienne" -> "saintetienne").
function cityIdBase(s) {
	return s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

// The stable per-city key used throughout: `<base>_<cc>` (e.g. `amsterdam_nl`). It matches the
// export's GeoJSON filename prefixes and the `cityid` column in rec_table.csv / network_metrics.csv.
// Prefer an explicit `cityid` column when the CSV carries one; otherwise derive it from
// name_en + country_code.
function cityIdFromRow(row) {
	const explicit = (row['cityid'] ?? '').trim().toLowerCase();
	if (explicit) return explicit;
	const base = cityIdBase(row['name_en'] ?? '');
	const cc = (row['country_code'] ?? '').trim().toLowerCase();
	if (!base || !cc) return null;
	return `${base}_${cc}`;
}

// Resolver from a bare display name to a cityid, built from cities.csv. The tools not re-exported
// with country-suffixed slugs (fixbikenet, linkbikenet, superblockify) carry plain names like
// "Paris"; mapping them here keeps every tool on one `<base>_<cc>` slug scheme.
let NAME_TO_CITYID = new Map();
let KNOWN_CITYIDS = new Set();
const UNRESOLVED_CITY_NAMES = new Set();

function buildNameToCityId(rows) {
	const map = new Map();
	const cityIds = new Set();
	const ambiguous = new Set();
	for (const row of rows) {
		const cid = cityIdFromRow(row);
		if (!cid) continue;
		cityIds.add(cid);
		const base = cityIdBase(row['name_en']);
		if (map.has(base) && map.get(base) !== cid) ambiguous.add(base);
		map.set(base, cid);
	}
	// A bare name for a base shared across countries (e.g. Brest FR/BY) cannot be disambiguated.
	for (const base of ambiguous) map.delete(base);
	return { map, cityIds };
}

// Map a tool's raw city name to its cityid. A file already named with a cityid (e.g. a
// superblockify boundary copied from growbikenet) passes through verbatim; a bare display name
// ("Paris") is resolved via cities.csv; anything else falls back to a bare slug (and is recorded)
// so the run still completes and reports it.
function toCityId(rawName) {
	const lowered = rawName.trim().toLowerCase();
	if (KNOWN_CITYIDS.has(lowered)) return lowered;
	const cid = NAME_TO_CITYID.get(cityIdBase(rawName));
	if (cid) return cid;
	UNRESOLVED_CITY_NAMES.add(rawName);
	return slugify(rawName);
}

function parseCsv(text, delim) {
	const lines = text
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((l) => l.length > 0);
	if (lines.length === 0) return { headers: [], rows: [] };
	const headers = lines[0].split(delim).map((h) => h.trim());
	const rows = lines.slice(1).map((line) => {
		const cells = line.split(delim).map((c) => c.trim());
		const row = {};
		for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i] ?? '';
		return row;
	});
	return { headers, rows };
}

async function listToolDirs(parentDir, date) {
	const byTool = new Map();
	for (const name of await readdir(parentDir)) {
		if (name === 'meta') continue; // sibling of the tool dirs — holds the city metadata CSVs
		const dir = path.join(parentDir, name);
		const st = await stat(dir);
		if (st.isDirectory()) byTool.set(name, { date, dir });
	}
	return byTool;
}

async function pickExportsByTool(dataRoot, pinnedDate) {
	const exportsRoot = path.join(dataRoot, 'dataexports');
	const entries = await readdir(exportsRoot);

	// Prefer a complete `latest/` export when present and no specific date is pinned. It is
	// authoritative for every tool it ships; tools it does *not* cover still fall
	// back to their most recent dated export, so a single-tool drop (e.g. a new
	// linkbikenet export landing before `latest/` is regenerated) is not silently ignored.
	let fromLatest = new Map();
	if (!pinnedDate && entries.includes('latest')) {
		const latestDir = path.join(exportsRoot, 'latest');
		if ((await stat(latestDir)).isDirectory()) {
			fromLatest = await listToolDirs(latestDir, 'latest');
		}
	}

	const dated = entries.filter((e) => /^\d{8}$/.test(e)).sort();
	if (dated.length === 0 && fromLatest.size === 0 && !pinnedDate) {
		// Either layout is enough on its own — `latest/` is what the server ships today.
		throw new Error(
			`No export under ${exportsRoot}: expected latest/<tool>/ or YYYYMMDD/<tool>/ dirs ` +
				`(found: ${entries.length ? entries.join(', ') : 'nothing'}).` +
				(entries.length === 0
					? `\n  An empty pull dir usually means rsync has not run yet — \`pnpm pull-data\` without --dry-run.`
					: '')
		);
	}
	if (pinnedDate && !dated.includes(pinnedDate)) {
		throw new Error(
			`Requested date ${pinnedDate} not found. Available: ${dated.join(', ') || 'none'} ` +
				`(latest/ is used by omitting --date, it cannot be pinned).`
		);
	}
	const considered = pinnedDate ? [pinnedDate] : dated;
	const byTool = new Map();
	for (const date of considered) {
		const dateDir = path.join(exportsRoot, date);
		for (const [name, info] of await listToolDirs(dateDir, date)) {
			byTool.set(name, info);
		}
	}
	for (const [name, info] of fromLatest) {
		byTool.set(name, info);
	}
	return byTool;
}

async function listFiles(dir) {
	const entries = await readdir(dir);
	const files = [];
	for (const name of entries) {
		const full = path.join(dir, name);
		const st = await stat(full);
		if (st.isFile()) files.push({ name, full, size: st.size });
	}
	return files;
}

function parseFilename(name) {
	// Cityids carry a country suffix and contain underscores (`amsterdam_nl`) but no internal
	// hyphen, so the first hyphen splits the slug from the rest cleanly.
	const m = name.match(/^([a-z0-9_]+)-(.+)\.geojson$/);
	if (!m) return null;
	return { slug: m[1], rest: m[2] };
}

async function verifyGeojsonExport(files, { requireBoundary }) {
	const errors = [];
	const warnings = [];

	for (const f of files) {
		if (f.size === 0) errors.push(`Zero-byte file: ${f.name}`);
		if (!f.name.endsWith('.geojson')) {
			warnings.push(`Non-geojson file present: ${f.name}`);
		}
	}

	const parsed = files
		.filter((f) => f.name.endsWith('.geojson'))
		.map((f) => ({ ...f, parts: parseFilename(f.name) }))
		.filter((f) => f.parts !== null);

	const slugs = new Set();
	const boundaryBySlug = new Map();
	for (const f of parsed) {
		slugs.add(f.parts.slug);
		// The 2026-09-09 export put the layer name behind a tool infix
		// (`aachen_de-growbikenet-city_boundary`); older drops shipped it bare. `parseFilename`
		// splits on the first hyphen, so the infix lands in `rest` — accept either spelling.
		if (f.parts.rest === 'city_boundary' || f.parts.rest.endsWith('-city_boundary')) {
			boundaryBySlug.set(f.parts.slug, f.full);
		}
	}

	if (requireBoundary) {
		for (const slug of slugs) {
			if (!boundaryBySlug.has(slug)) {
				errors.push(`Missing city_boundary geojson for slug "${slug}"`);
			}
		}
	}

	if (errors.length > 0) {
		throw new Error(`Dataexport verification failed:\n  - ${errors.join('\n  - ')}`);
	}
	return { slugs: [...slugs].sort(), warnings };
}

const MERCATOR_R = 20037508.342789244;

const COORD_DECIMALS = 5;
const COORD_FACTOR = 10 ** COORD_DECIMALS;
const DROP_PROPS = new Set([
	'source',
	'target',
	'nodelist',
	'edge_list',
	'osmid',
	'cell_id',
	'fid',
	'representative_node_name',
	'x',
	'y'
]);
const LCC_STEP_PROPS = LINKBIKENET_STRATEGIES.map((s) => `lcc_step_${s}`);

// `<slug>:<strategy>` pairs allowed past the 99% `lcc_step` coverage guard with a warning instead
// of an error — shipped knowingly, not silently. LBN 0.8.4 (2026-10-11) passes in 407 of 408
// cities; bergamo_it's closest_components baseline carries a null `lcc_step` on 7997 of 18153
// edges, which render as fragmented throughout. Shipped as-is by maintainer decision; drop the
// entry once a corrected export lands.
const LCC_STEP_GUARD_EXEMPT = new Set(['bergamo_it:closest']);

const NUMERIC_PROPS = [
	'betweenness',
	'closeness',
	// sortbikenet's running quality series, carried per ordered step.
	'total_length',
	'total_coverage',
	'total_directness',
	'betweenness_centrality',
	'closeness_centrality',
	'length',
	'length_cumulative',
	'ordering',
	'lcc_share',
	'lcc_gain',
	...LCC_STEP_PROPS,
	'ordering_betweenness',
	'ordering_closeness',
	'ordering_betweenness_centrality',
	'ordering_closeness_centrality',
	'B',
	'benefit',
	'bearing',
	'speed_kph',
	'travel_time',
	'travel_time_restricted',
	'population',
	'area',
	'street_count',
	'edge_betweenness_normal',
	'edge_betweenness_length',
	'edge_betweenness_linear',
	'edge_betweenness_normal_restricted',
	'edge_betweenness_length_restricted',
	'edge_betweenness_linear_restricted',
	'betweenness_percentile',
	'rel_increase',
	'rel_increase_comp',
	'node_betweenness_normal',
	'node_betweenness_length',
	'node_betweenness_linear',
	'node_betweenness_normal_restricted',
	'node_betweenness_length_restricted',
	'node_betweenness_linear_restricted'
];
const SIGFIG_PROPS = new Set([
	'betweenness',
	'closeness',
	'total_length',
	'total_coverage',
	'total_directness',
	'betweenness_centrality',
	'closeness_centrality',
	'lcc_share',
	'lcc_gain',
	'B',
	'benefit',
	'edge_betweenness_normal',
	'edge_betweenness_length',
	'edge_betweenness_linear',
	'edge_betweenness_normal_restricted',
	'edge_betweenness_length_restricted',
	'edge_betweenness_linear_restricted',
	'rel_increase',
	'rel_increase_comp',
	'node_betweenness_normal',
	'node_betweenness_length',
	'node_betweenness_linear',
	'node_betweenness_normal_restricted',
	'node_betweenness_length_restricted',
	'node_betweenness_linear_restricted'
]);

function mercatorToLngLat(x, y) {
	const lng = (x / MERCATOR_R) * 180;
	const lat = (Math.atan(Math.sinh((y / MERCATOR_R) * Math.PI)) * 180) / Math.PI;
	return [lng, lat];
}

function walkCoords(geom, visit) {
	if (!geom) return;
	const t = geom.type;
	if (t === 'Point') visit(geom.coordinates);
	else if (t === 'MultiPoint' || t === 'LineString') geom.coordinates.forEach(visit);
	else if (t === 'MultiLineString' || t === 'Polygon')
		geom.coordinates.forEach((r) => r.forEach(visit));
	else if (t === 'MultiPolygon')
		geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(visit)));
	else if (t === 'GeometryCollection') geom.geometries.forEach((g) => walkCoords(g, visit));
}

function looksProjected(geom) {
	let projected = false;
	walkCoords(geom, ([x, y]) => {
		if (Math.abs(x) > 360 || Math.abs(y) > 90) projected = true;
	});
	return projected;
}

function reprojectInPlace(geom) {
	if (!geom) return;
	const t = geom.type;
	const mapPoint = (c) => {
		const [lng, lat] = mercatorToLngLat(c[0], c[1]);
		c[0] = lng;
		c[1] = lat;
	};
	if (t === 'Point') mapPoint(geom.coordinates);
	else if (t === 'MultiPoint' || t === 'LineString') geom.coordinates.forEach(mapPoint);
	else if (t === 'MultiLineString' || t === 'Polygon')
		geom.coordinates.forEach((r) => r.forEach(mapPoint));
	else if (t === 'MultiPolygon')
		geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(mapPoint)));
	else if (t === 'GeometryCollection') geom.geometries.forEach(reprojectInPlace);
}

// Great-circle distance in meters. Lengths must be measured on lng/lat rather than
// on the raw EPSG:3857 export, whose distances are inflated by 1/cos(latitude).
function haversineM(a, b) {
	const p = Math.PI / 180;
	const h =
		0.5 -
		Math.cos((b[1] - a[1]) * p) / 2 +
		(Math.cos(a[1] * p) * Math.cos(b[1] * p) * (1 - Math.cos((b[0] - a[0]) * p))) / 2;
	return 12742000 * Math.asin(Math.sqrt(h));
}

function geodesicLength(geom) {
	if (!geom) return 0;
	const parts =
		geom.type === 'LineString'
			? [geom.coordinates]
			: geom.type === 'MultiLineString'
				? geom.coordinates
				: [];
	let total = 0;
	for (const part of parts) {
		for (let i = 1; i < part.length; i++) total += haversineM(part[i - 1], part[i]);
	}
	return total;
}

function expandBounds(b, x, y) {
	if (x < b[0]) b[0] = x;
	if (y < b[1]) b[1] = y;
	if (x > b[2]) b[2] = x;
	if (y > b[3]) b[3] = y;
}

const SAMPLE_COORD_PATTERN = /\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/g;

/**
 * Bbox of the first coordinates in a file, without parsing it — cheap enough to run once per
 * quarantined city on every import. Used only to notice a quarantine has become stale (the export
 * now places the city correctly); the real placement guard in `assertPlacement` uses the precise
 * bounds `transformGeojson` already accumulates for every file it actually mirrors.
 */
async function sampleBbox(filePath, bytes = 16384) {
	const fh = await open(filePath, 'r');
	try {
		const buf = Buffer.alloc(bytes);
		const { bytesRead } = await fh.read(buf, 0, bytes, 0);
		const head = buf.toString('utf8', 0, bytesRead);
		const acc = [Infinity, Infinity, -Infinity, -Infinity];
		for (const m of head.matchAll(SAMPLE_COORD_PATTERN)) {
			expandBounds(acc, Number(m[1]), Number(m[2]));
		}
		return Number.isFinite(acc[0]) ? acc : null;
	} finally {
		await fh.close();
	}
}

/** `[minX, minY, maxX, maxY]` → `"(minX,minY)-(maxX,maxY)"`, rounded for a readable log line. */
function fmtBounds([x0, y0, x1, y1]) {
	const r = (n) => Math.round(n * 1000) / 1000;
	return `(${r(x0)},${r(y0)})-(${r(x1)},${r(y1)})`;
}

/**
 * Whether bbox `a` falls within `padWidths` of `ref`'s own width/height, floored at `padMinDeg` —
 * i.e. whether `a` could plausibly be describing the same place as `ref`. Padded rather than exact:
 * a tool's network legitimately extends past the municipal boundary (`zagreb_hr`'s widest
 * legitimate overshoot, measured across the frozen export, is 0.65 boundary-widths).
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

function roundCoordsInPlace(geom) {
	walkCoords(geom, (c) => {
		c[0] = Math.round(c[0] * COORD_FACTOR) / COORD_FACTOR;
		c[1] = Math.round(c[1] * COORD_FACTOR) / COORD_FACTOR;
	});
}

function normalizeProps(props) {
	let changed = false;
	for (const key of [...Object.keys(props)]) {
		if (DROP_PROPS.has(key)) {
			delete props[key];
			changed = true;
		}
	}
	for (const key of NUMERIC_PROPS) {
		const v = props[key];
		if (v === undefined || v === null || v === '') continue;
		if (typeof v === 'string') {
			const n = Number(v);
			if (!Number.isNaN(n)) {
				props[key] = SIGFIG_PROPS.has(key) ? Number(n.toPrecision(5)) : n;
				changed = true;
			}
		} else if (typeof v === 'number' && SIGFIG_PROPS.has(key)) {
			const rounded = Number(v.toPrecision(5));
			if (rounded !== v) {
				props[key] = rounded;
				changed = true;
			}
		}
	}
	return changed;
}

// Rewrite `length_cumulative` as a running sum over the ordered features. The exported value is
// unusable on two counts: it is derived from the inflated projected lengths, and in `_with-bikenw`
// files the baseline row seeds the total (copenhagen's first built segment reports 878 256 m when
// 475 m have been built). Written under X5's definition — newly built only, inclusive of the
// current segment — so the first ordered feature's `length_cumulative` equals its own `length`,
// matching what we already synthesise for linkbikenet. Output feature order is left untouched.
function recomputeCumulative(features) {
	const ordered = features
		.filter((f) => typeof f.properties?.ordering === 'number')
		.sort((a, b) => a.properties.ordering - b.properties.ordering);
	let running = 0;
	for (const f of ordered) {
		running += f.properties.length ?? 0;
		f.properties.length_cumulative = running;
	}
	// The unordered baseline row keeps its own re-measured `length` but no longer claims a place
	// in the newly-built series.
	for (const f of features) {
		if (f.properties && typeof f.properties.ordering !== 'number') {
			delete f.properties.length_cumulative;
		}
	}
}

// sortbikenet's `real` layer records when each segment was actually built (`built_in`) instead of
// a model ordering. Rank the distinct dates so every segment built on the same date shares one
// step and the playhead advances a construction wave at a time — Paris built its 611 segments in
// 10 waves, which is the honest reading of the as-built sequence.
function applyDateOrdering(fc, prop) {
	const dates = [
		...new Set((fc.features ?? []).map((f) => f.properties?.[prop]).filter(Boolean))
	].sort();
	const rank = new Map(dates.map((d, i) => [d, i + 1]));
	for (const f of fc.features ?? []) {
		const step = rank.get(f.properties?.[prop]);
		if (step !== undefined) f.properties.ordering = step;
	}
}

function transformGeojson(
	text,
	boundsAcc,
	lengthAcc,
	keepProps = null,
	{ remeasureLength = false, baselineMetrics = null, orderingFromDate = null } = {}
) {
	// A GeoPackage or shapefile renamed to `.geojson` would otherwise die with an opaque
	// `SyntaxError: Unexpected token`. Fail with a message that names the real cause instead.
	if (text.startsWith('SQLite format 3')) {
		throw new Error('input is a binary GeoPackage/SQLite file, not text GeoJSON');
	}
	const fc = JSON.parse(text);
	// Before the loop, so `recomputeCumulative` (run at the end under `remeasureLength`) sees it.
	if (orderingFromDate) applyDateOrdering(fc, orderingFromDate);
	for (const f of fc.features ?? []) {
		// Pre-2026-09 growbikenet `from_bikenw` files carried the existing network as the baseline:
		// by convention the first row (`ordering: 0`), with a null centrality. The 2026-09 export
		// ships it as its own `existing_bike_network.geojson` instead and starts these files at
		// `ordering: 1`, so this fires only for an older drop (a lone surviving 2026-08 file, or a
		// pinned `--date` run) — it is kept for those, not because the current export needs it. The app
		// identifies the baseline by the *absence* of a numeric `ordering` (it draws it as flat
		// context, excludes it from the metric ramp and the cumulative), so strip that ordering
		// here — otherwise the baseline renders on the metric layer (a null value → off-ramp
		// colour) and only appears once the playhead passes step 0. Match either signal so we do
		// not depend on the null value staying present. `baselineMetrics` is passed only for the
		// `from_bikenw` variant, so `from_scratch`'s legitimate `ordering: 0` first step is untouched.
		const isBaseline =
			baselineMetrics &&
			f.properties &&
			(baselineMetrics.some((m) => f.properties[m] === null) || f.properties.ordering === 0);
		if (isBaseline) {
			delete f.properties.ordering;
		}
		if (f.geometry && looksProjected(f.geometry)) {
			reprojectInPlace(f.geometry);
		}
		if (remeasureLength && f.properties) {
			// Only where the export ships no `length`: superblockify's edge layer, and linkbikenet's
			// links. Everywhere else the exported figure is what ships — it is geodesic since the
			// 2026-09 run (Aachen agrees with our own measurement to 0.15% in aggregate, the
			// outliers being 6-metre segments), and re-deriving a value the export already computes
			// only invites the two to drift apart. Measured after reprojection but before the
			// coordinates are rounded for the payload, or the 5-decimal rounding leaks into the
			// figures. Points and polygons measure 0 and are left alone.
			const reported = Number(f.properties.length);
			if (!Number.isFinite(reported) || reported <= 0) {
				const meters = geodesicLength(f.geometry);
				if (meters > 0) f.properties.length = Math.round(meters);
			}
		}
		if (f.geometry) {
			roundCoordsInPlace(f.geometry);
		}
		if (keepProps) {
			// Baseline layers only need a small allow-list of properties (e.g. the
			// tooltip's `length`) — drop everything else to keep the payload small.
			const src = f.properties ?? {};
			const kept = {};
			for (const k of keepProps) {
				if (src[k] !== undefined && src[k] !== null) kept[k] = src[k];
			}
			normalizeProps(kept);
			f.properties = kept;
		} else if (f.properties) {
			// Skip for the baseline: it must keep no numeric `ordering`, or the rename below would
			// resurrect it from `ordering_<metric>` and drop the existing network back onto the ramp.
			const orderingKey = Object.keys(f.properties).find(
				(k) => k.startsWith('ordering_') && k !== 'ordering'
			);
			if (!isBaseline && orderingKey && !('ordering' in f.properties)) {
				f.properties.ordering = f.properties[orderingKey];
			}
			normalizeProps(f.properties);
		}
		// Governed by `lengthAcc` alone, not by whether an allow-list was passed — layers that
		// should not count towards the total are the ones called with `lengthAcc: null`.
		if (lengthAcc && typeof f.properties?.length === 'number') {
			lengthAcc.meters += f.properties.length;
		}
		if (boundsAcc) {
			walkCoords(f.geometry, ([x, y]) => expandBounds(boundsAcc, x, y));
		}
	}
	// After the loop, so `ordering` has been renamed off `ordering_<metric>` and coerced to a
	// number by `normalizeProps`.
	if (remeasureLength) recomputeCumulative(fc.features ?? []);
	if (fc.crs) delete fc.crs;
	return JSON.stringify(fc);
}

function writeIfChanged(payload, dstPath, dryRun) {
	return (async () => {
		if (!existsSync(dstPath)) {
			if (!dryRun) await writeFile(dstPath, payload);
			return 'added';
		}
		const existing = await readFile(dstPath, 'utf8');
		if (existing !== payload) {
			if (!dryRun) await writeFile(dstPath, payload);
			return 'updated';
		}
		return 'same';
	})();
}

// The export encodes far more than the app's axes, so growbikenet files are renamed to a canonical
// on-disk form on import. Sources:
//   {cid}-city_boundary.geojson
//   {cid}-growbikenet-{metric}-{grid_*|rail|school}-{variant}-no_overlaps.geojson
//   {cid}-growbikenet-seed_points-{grid_*|rail|school}-{variant}.geojson
// (and the pre-2026-09-09 order, with {variant} and the layer swapped — see the patterns below)
// Canonical output (what geojsonPathFor / parseGrowBikeNetFilename expect):
//   {cid}-city_boundary.geojson                          (unchanged)
//   {cid}-{metric}-{type}{variantSuffix}.geojson         (result)
//   {cid}-{type}{variantSuffix}.geojson                  (seed)
// `grid_triangle`/`grid_square` collapse to `grid` (each city ships exactly one — the pipeline
// decides per street network), the `-growbikenet-` infix and `-no_overlaps` suffix drop, and
// `from_scratch` is the suffix-less base while `from_bikenw` carries `-from_bikenw`. The `random`
// control condition from the paper never matches these patterns, so it is dropped as unrecognized.
//
// `-no_overlaps` is a *generation* marker, not a variant. Overlap removal is unconditional now, so
// the suffix was dropped: every suffixed file in `latest/growbikenet/` is dated 2026-08-26 and every
// plain one 2026-09-06 — two export runs sitting in one directory, not two flavours of one run
// (Aachen from_bikenw: 340 features plain against 706 suffixed, different MD5). The suffix is
// therefore matched as optional, and a clash resolved in favour of the **plain** file, which is the
// newer run. A lone suffixed file has no 2026-09 counterpart and is still ingested rather than
// dropped, so a partially re-run export never leaves the site short a dataset.
// Revisit once the superseded 2026-08 files are pruned server-side (BikeNetKit/dataexport#36),
// after which the clash cannot occur and this preference becomes inert.
// BikeNetKit/dataexport#31 swapped the last two segments on 2026-09-09:
//   was  {cid}-growbikenet-{metric}-{variant}-{layer}
//   now  {cid}-growbikenet-{metric}-{layer}-{variant}
// Both orders are matched. `latest/` uses the new one, but the dated exports still on the server —
// which `--date` can pin — use the old one, so a pinned re-import must keep working. The two token
// sets are disjoint (`grid_*|rail|school` against `from_scratch|from_bikenw`), so a name can never
// satisfy both patterns and the order they are tried in carries no meaning. Named groups keep the
// call sites below independent of which order matched.
const GBN_RESULT_PATTERNS = [
	/^(?<cid>.+)-growbikenet-(?<metric>betweenness|closeness)-(?<type>grid_\w+|rail|school)-(?<variant>from_scratch|from_bikenw)(?<noOverlaps>-no_overlaps)?$/,
	/^(?<cid>.+)-growbikenet-(?<metric>betweenness|closeness)-(?<variant>from_scratch|from_bikenw)-(?<type>grid_\w+|rail|school)(?<noOverlaps>-no_overlaps)?$/
];
const GBN_SEED_PATTERNS = [
	/^(?<cid>.+)-growbikenet-seed_points-(?<type>grid_\w+|rail|school)-(?<variant>from_scratch|from_bikenw)$/,
	/^(?<cid>.+)-growbikenet-seed_points-(?<variant>from_scratch|from_bikenw)-(?<type>grid_\w+|rail|school)$/
];

const matchGbn = (stem, patterns) => {
	for (const re of patterns) {
		const m = stem.match(re);
		if (m) return m.groups;
	}
	return null;
};

const gbnType = (t) => (t.startsWith('grid') ? 'grid' : t);
const gbnVariantSuffix = (variant) => (variant === 'from_bikenw' ? '-from_bikenw' : '');

function canonicalGrowbikenetName(name) {
	if (!name.endsWith('.geojson')) return null;
	const stem = name.slice(0, -'.geojson'.length);
	// The same export added the tool infix here (`{cid}-growbikenet-city_boundary`). Normalise it
	// away rather than mirroring the name verbatim: `writeSimplifiedBoundaries` derives the city
	// slug by stripping exactly `-city_boundary.geojson`, so an infix left in place would file all
	// 403 boundaries under invented slugs like `aachen_de-growbikenet` — and every basemap label
	// clip would then silently lose its polygon.
	for (const suffix of ['-growbikenet-city_boundary', '-city_boundary']) {
		if (stem.endsWith(suffix)) {
			return {
				dstName: `${stem.slice(0, -suffix.length)}-city_boundary.geojson`,
				isCityFile: false
			};
		}
	}
	// The 2026-09 export stopped embedding the existing network as a null-metric first row inside
	// each `from_bikenw` result and ships it per city instead. It is the same network — Aachen's
	// 196 147 m match the 196 148 m that `from_bikenw`'s first step counts as pre-existing — so it
	// is imported as the contextual baseline the map draws under the build-up.
	for (const suffix of ['-growbikenet-existing_bike_network', '-existing_bike_network']) {
		if (stem.endsWith(suffix)) {
			const cid = stem.slice(0, -suffix.length);
			return { dstName: `${cid}-existing-network.geojson`, isCityFile: true, isExisting: true };
		}
	}
	const result = matchGbn(stem, GBN_RESULT_PATTERNS);
	if (result) {
		const { cid, metric, variant, type, noOverlaps } = result;
		return {
			dstName: `${cid}-${metric}-${gbnType(type)}${gbnVariantSuffix(variant)}.geojson`,
			isCityFile: true,
			// The suffix marks the superseded 2026-08 run — see the note above the patterns.
			fromSupersededRun: Boolean(noOverlaps)
		};
	}
	const seed = matchGbn(stem, GBN_SEED_PATTERNS);
	if (seed) {
		const { cid, variant, type } = seed;
		return {
			dstName: `${cid}-${gbnType(type)}${gbnVariantSuffix(variant)}.geojson`,
			isCityFile: true,
			seedKey: `${cid}|${variant}`,
			seedType: type
		};
	}
	return null;
}

async function mirrorGrowbikenetDir(srcDir, dstDir, dryRun, lengthAcc) {
	await mkdir(dstDir, { recursive: true });
	const dstFiles = existsSync(dstDir) ? await listFiles(dstDir) : [];
	const dstNames = new Set(dstFiles.map((f) => f.name));

	// Resolve every source to its canonical name up front, so the grid collapse can be checked for
	// collisions and the prune loop below can compare against the canonical set.
	const srcFiles = await listFiles(srcDir);

	// `grid_square` and `grid_triangle` both collapse to the app's single `grid` type. Results pick
	// one per city and variant, but the Sep 2026 export ships seed points for *both* tessellations
	// in one case (ulm_de, from_bikenw), which would collide on `-grid-from_bikenw`. Resolve a grid
	// seed against the tessellation that city+variant's results actually use, so the seed layer
	// always matches the network drawn on top of it.
	// Mirrors the run preference below: ulm_de's two runs name *different* tessellations
	// (2026-08 `grid_square-no_overlaps` against 2026-09 `grid_triangle`), so reading the grid type
	// off whichever file happens to come last would point the seed at the run that loses the clash.
	const resultGridByCityVariant = new Map();
	for (const f of srcFiles) {
		if (!f.name.endsWith('.geojson')) continue;
		const g = matchGbn(f.name.slice(0, -'.geojson'.length), GBN_RESULT_PATTERNS);
		if (!g || !g.type.startsWith('grid')) continue;
		const key = `${g.cid}|${g.variant}`;
		const existing = resultGridByCityVariant.get(key);
		const fromSupersededRun = Boolean(g.noOverlaps);
		if (!existing || (existing.fromSupersededRun && !fromSupersededRun)) {
			resultGridByCityVariant.set(key, { type: g.type, fromSupersededRun });
		}
	}

	const planned = new Map(); // dstName -> { src, isCityFile }
	const unrecognized = [];
	let supersededResults = 0;
	let unusedGridSeeds = 0;
	for (const f of srcFiles) {
		const canon = canonicalGrowbikenetName(f.name);
		if (!canon) {
			if (!f.name.includes('-random-')) unrecognized.push(f.name);
			continue;
		}
		if (canon.seedType?.startsWith('grid')) {
			const resultGrid = resultGridByCityVariant.get(canon.seedKey);
			if (resultGrid && resultGrid.type !== canon.seedType) {
				unusedGridSeeds++;
				continue;
			}
		}
		const clash = planned.get(canon.dstName);
		if (clash) {
			// The same result from both export runs: keep the newer, suffix-less one. Any other
			// clash is a genuine ambiguity and still aborts the import.
			if (clash.fromSupersededRun !== canon.fromSupersededRun) {
				supersededResults++;
				if (!canon.fromSupersededRun) {
					planned.set(canon.dstName, {
						src: f,
						isCityFile: canon.isCityFile,
						fromSupersededRun: false
					});
				}
				continue;
			}
			throw new Error(
				`growbikenet: "${f.name}" and "${clash.src.name}" both map to "${canon.dstName}"`
			);
		}
		planned.set(canon.dstName, {
			src: f,
			isCityFile: canon.isCityFile,
			isExisting: canon.isExisting,
			fromSupersededRun: canon.fromSupersededRun
		});
	}
	if (supersededResults > 0) {
		console.log(
			`[update-data] growbikenet: ${supersededResults} superseded 2026-08 result(s) skipped in favour of the newer run`
		);
	}
	const supersededOnly = [...planned.values()].filter((p) => p.fromSupersededRun).length;
	if (supersededOnly > 0) {
		console.warn(
			`[warn] growbikenet: ${supersededOnly} result(s) exist only as -no_overlaps (no newer run) — ingested from the 2026-08 export`
		);
	}
	if (unusedGridSeeds > 0) {
		console.log(
			`[update-data] growbikenet: ${unusedGridSeeds} grid seed(s) skipped (tessellation unused by that city's results)`
		);
	}
	if (unrecognized.length > 0) {
		console.warn(
			`[warn] growbikenet: ${unrecognized.length} unrecognized file(s) skipped, e.g. ${unrecognized[0]}`
		);
	}

	let added = 0;
	let updated = 0;
	let removed = 0;
	const malformed = [];
	const boundsBySlug = new Map();

	for (const [dstName, { src, isCityFile, isExisting }] of planned) {
		const dstPath = path.join(dstDir, dstName);
		let acc = null;
		if (isCityFile) {
			const slug = parseFilename(src.name).slug;
			if (isExcluded('growbikenet', slug)) {
				planned.delete(dstName);
				continue;
			}
			acc = boundsBySlug.get(slug);
			if (!acc) {
				acc = [Infinity, Infinity, -Infinity, -Infinity];
				boundsBySlug.set(slug, acc);
			}
		}
		// The export's coordinates are already WGS84 (so reprojection no-ops — `looksProjected` is
		// false) and its `length` is geodesic too since the 2026-09 run. Re-measuring is kept for
		// the cumulative it rebuilds: `from_bikenw`'s own `length_cumulative` counts the existing
		// network as its starting total (Aachen step 1: 199 158 m for a 3 010 m segment), where the
		// app's readout is newly-built only. Skip (rather than abort the whole import over) a file
		// the export shipped as non-JSON — e.g. a boundary emitted as a binary GeoPackage.
		let payload;
		try {
			payload = isExisting
				? // Contextual baseline: reduced to the property its tooltip needs, and excluded from
					// the network-length total (the build-up it underlies is what counts), like
					// fixbikenet's and linkbikenet's.
					transformGeojson(await readFile(src.full, 'utf8'), acc, null, ['length'], {
						remeasureLength: true
					})
				: transformGeojson(await readFile(src.full, 'utf8'), acc, lengthAcc, null, {
						remeasureLength: true,
						// Only `from_bikenw` ever carried an embedded baseline row. Passing this for
						// `from_scratch` too made the `ordering === 0` signal strip that variant's
						// legitimate first build step, dropping it out of the sequence into flat context.
						baselineMetrics: src.name.includes('-from_bikenw-')
							? ['betweenness', 'closeness']
							: null
					});
		} catch {
			malformed.push(src.name);
			planned.delete(dstName);
			continue;
		}

		if (!dstNames.has(dstName)) {
			added++;
			if (!dryRun) await writeFile(dstPath, payload);
			continue;
		}
		const existing = await readFile(dstPath, 'utf8');
		if (existing !== payload) {
			updated++;
			if (!dryRun) await writeFile(dstPath, payload);
		}
	}

	for (const f of dstFiles) {
		if (!planned.has(f.name)) {
			removed++;
			if (!dryRun) await rm(f.full);
		}
	}

	if (malformed.length > 0) {
		console.warn(
			`[warn] growbikenet: ${malformed.length} non-JSON file(s) skipped (bad export): ${malformed.join(', ')}`
		);
	}

	return { added, updated, removed, boundsBySlug };
}

// Classify a fixbikenet export file by its name. The export ships three layers
// per city: the city boundary, the existing bike network (contextual baseline),
// and the gap network (the tool's proposed missing links). The gap-network
// file may arrive with a doubled `.geojson` extension (e.g. `Brussels.geojson.geojson`),
// which we tolerate here so the city slug resolves correctly.
//
// The Sep 2026 export moved the layer name behind a `-fixbikenet-` infix
// (`aachen_de-fixbikenet-existing_bike_network`); older drops shipped it bare, and Paris still
// does. `cityFor` matches either, so a mixed export imports cleanly — without it the infix stays
// on the city and 384 baselines land under invented slugs like `aachen-de-fixbikenet`.
function classifyFixbikenetFile(name) {
	const stem = name.replace(/\.geojson$/, '');
	const cityFor = (layer) => {
		for (const suffix of [`-fixbikenet-${layer}`, `-${layer}`]) {
			if (stem.endsWith(suffix)) return toCityId(stem.slice(0, -suffix.length));
		}
		return null;
	};

	let slug = cityFor('city_boundary');
	if (slug) return { kind: 'boundary', slug };
	slug = cityFor('existing_bike_network');
	if (slug) return { kind: 'existing', slug };
	// Four cities additionally ship the full street network alongside their bike network. The app
	// has no layer for it, and the fall-through below would otherwise misfile it as that city's
	// gap network, so drop it explicitly.
	slug = cityFor('existing_street_network');
	if (slug) return { kind: 'skip', slug };
	// The gap network: current exports name it `<cityid>-fixbikenet-gaps.geojson`; older ones
	// shipped it as a bare `<name>.geojson` (sometimes doubled to `.geojson.geojson`), which the
	// final fall-through still tolerates.
	slug = cityFor('gaps');
	if (slug) return { kind: 'gap', slug };
	// `stem` has had one `.geojson` removed; strip a second so a doubled extension still resolves.
	return { kind: 'gap', slug: toCityId(stem.replace(/\.geojson$/, '')) };
}

async function mirrorFixbikenetDir(srcDir, dstDir, dryRun, lengthAcc) {
	await mkdir(dstDir, { recursive: true });
	const srcFiles = await listFiles(srcDir);
	const dstFilesBefore = existsSync(dstDir) ? await listFiles(dstDir) : [];

	const boundsBySlug = new Map();
	const planned = new Map();
	const skippedStreetNetworks = [];

	for (const f of srcFiles) {
		if (!f.name.endsWith('.geojson')) continue;
		const { kind, slug } = classifyFixbikenetFile(f.name);
		if (kind === 'skip') {
			skippedStreetNetworks.push(slug);
			continue;
		}
		// The boundary is kept even for an excluded city: it comes from this tool's own export and
		// is normally correct, and other tools' boundaries fall back to it via writeSimplifiedBoundaries.
		if (kind !== 'boundary' && isExcluded('fixbikenet', slug)) continue;
		if (kind === 'boundary') {
			const outName = `${slug}-city_boundary.geojson`;
			planned.set(outName, transformGeojson(await readFile(f.full, 'utf8'), null, lengthAcc));
		} else if (kind === 'existing') {
			// Contextual baseline layer — excluded from network-length stats, and reduced
			// to just `length` (the only property its hover tooltip needs) to stay small.
			const outName = `${slug}-existing-network.geojson`;
			planned.set(
				outName,
				transformGeojson(await readFile(f.full, 'utf8'), null, null, ['length'])
			);
		} else {
			const outName = `${slug}-gap-network.geojson`;
			let acc = boundsBySlug.get(slug);
			if (!acc) {
				acc = [Infinity, Infinity, -Infinity, -Infinity];
				boundsBySlug.set(slug, acc);
			}
			planned.set(outName, transformGeojson(await readFile(f.full, 'utf8'), acc, lengthAcc));
		}
	}

	let added = 0;
	let updated = 0;
	let removed = 0;
	const plannedNames = new Set(planned.keys());

	for (const [name, payload] of planned) {
		const dstPath = path.join(dstDir, name);
		const result = await writeIfChanged(payload, dstPath, dryRun);
		if (result === 'added') added++;
		else if (result === 'updated') updated++;
	}

	for (const f of dstFilesBefore) {
		if (!plannedNames.has(f.name)) {
			removed++;
			if (!dryRun) await rm(f.full);
		}
	}

	if (skippedStreetNetworks.length > 0) {
		console.warn(
			`[warn] fixbikenet: ${skippedStreetNetworks.length} street-network file(s) skipped ` +
				`(no layer reads them): ${skippedStreetNetworks.sort().join(', ')}`
		);
	}

	return { added, updated, removed, boundsBySlug };
}

// The sortbikenet export is one city x three build scenarios x eleven orderings:
//   {cid}-sortbikenet-{from_scratch|from_2021|from_2026}-{ordering}.geojson
//   {cid}-sortbikenet-{scenario}-existing_bike_network.geojson
// The `-sortbikenet-` infix arrived on 2026-09-09; the first drop shipped the same files without
// it, so it is optional here and both forms import.
// Canonical output follows dataFilenameFor's `{city}-{metric}-{type}[-{variant}]`, with
// metric = ordering, type = `network`, variant = scenario. Unlike growbikenet, no scenario is a
// natural suffix-less base, so every file names its scenario explicitly.
const SORTBIKENET_FILE = /^([a-z0-9_]+)-(?:sortbikenet-)?(from_scratch|from_\d{4})-(.+)$/;
const SORTBIKENET_EXISTING_KEEP_PROPS = ['length', 'bikenet_hierarchy', 'road_hierarchy'];

function classifySortbikenetFile(name) {
	if (!name.endsWith('.geojson')) return null;
	const m = name.slice(0, -'.geojson'.length).match(SORTBIKENET_FILE);
	if (!m) return null;
	const [, rawSlug, scenario, layer] = m;
	const slug = toCityId(rawSlug);
	if (layer === 'existing_bike_network') {
		return { kind: 'existing', slug, dstName: `${slug}-existing-network-${scenario}.geojson` };
	}
	return {
		kind: 'result',
		slug,
		ordering: layer,
		dstName: `${slug}-${layer}-network-${scenario}.geojson`
	};
}

async function mirrorSortbikenetDir(srcDir, dstDir, dryRun, lengthAcc) {
	await mkdir(dstDir, { recursive: true });
	const dstFilesBefore = existsSync(dstDir) ? await listFiles(dstDir) : [];

	const boundsBySlug = new Map();
	const planned = new Map();
	const unrecognized = [];

	for (const f of await listFiles(srcDir)) {
		const info = classifySortbikenetFile(f.name);
		if (!info) {
			if (f.name.endsWith('.geojson')) unrecognized.push(f.name);
			continue;
		}
		if (isExcluded('sortbikenet', info.slug)) continue;
		const text = await readFile(f.full, 'utf8');
		if (info.kind === 'existing') {
			// Contextual baseline — reduced to the properties its tooltip needs and kept out of the
			// network-length total, like fixbikenet's.
			planned.set(
				info.dstName,
				transformGeojson(text, null, null, SORTBIKENET_EXISTING_KEEP_PROPS)
			);
			continue;
		}
		let acc = boundsBySlug.get(info.slug);
		if (!acc) {
			acc = [Infinity, Infinity, -Infinity, -Infinity];
			boundsBySlug.set(info.slug, acc);
		}
		planned.set(
			info.dstName,
			transformGeojson(text, acc, lengthAcc, null, {
				remeasureLength: true,
				orderingFromDate: info.ordering === 'real' ? 'built_in' : null
			})
		);
	}

	let added = 0;
	let updated = 0;
	let removed = 0;

	for (const [name, payload] of planned) {
		const result = await writeIfChanged(payload, path.join(dstDir, name), dryRun);
		if (result === 'added') added++;
		else if (result === 'updated') updated++;
	}

	for (const f of dstFilesBefore) {
		if (!planned.has(f.name)) {
			removed++;
			if (!dryRun) await rm(f.full);
		}
	}

	if (unrecognized.length > 0) {
		console.warn(
			`[warn] sortbikenet: ${unrecognized.length} unrecognized file(s) skipped, e.g. ${unrecognized[0]}`
		);
	}

	return { added, updated, removed, boundsBySlug };
}

// Union-find over OSM node ids that also tracks the total edge length held by each
// component, plus the running largest component. Lengths only ever grow, and a root
// stops being a root only when it is absorbed as `rb`, so the maximum can be
// maintained in O(1) per operation instead of rescanning every component per step.
class ComponentIndex {
	constructor() {
		this.parent = new Map();
		this.length = new Map();
		this.largestRoot = null;
		this.largestLength = 0;
	}

	find(x) {
		if (!this.parent.has(x)) {
			this.parent.set(x, x);
			this.length.set(x, 0);
			return x;
		}
		let root = x;
		while (this.parent.get(root) !== root) root = this.parent.get(root);
		while (this.parent.get(x) !== root) {
			const next = this.parent.get(x);
			this.parent.set(x, root);
			x = next;
		}
		return root;
	}

	#promote(root) {
		const len = this.length.get(root);
		if (len >= this.largestLength) {
			this.largestRoot = root;
			this.largestLength = len;
		}
	}

	union(a, b) {
		const ra = this.find(a);
		const rb = this.find(b);
		if (ra === rb) return ra;
		this.parent.set(rb, ra);
		this.length.set(ra, this.length.get(ra) + this.length.get(rb));
		this.length.set(rb, 0);
		if (this.largestRoot === rb) this.largestRoot = ra;
		this.#promote(ra);
		return ra;
	}

	addLength(x, meters) {
		const root = this.find(x);
		this.length.set(root, this.length.get(root) + meters);
		this.#promote(root);
	}
}

const EDGE_TUPLE_RE = /\((\d+),\s*(\d+)\)/g;

// `edge_list` arrives as a Python repr string, e.g. "[(4553150955, 10906435005), ...]".
// OSM node ids peak around 1.4e10, well inside Number.MAX_SAFE_INTEGER.
function parseEdgeList(raw) {
	const out = [];
	if (typeof raw !== 'string') return out;
	for (const m of raw.matchAll(EDGE_TUPLE_RE)) out.push([Number(m[1]), Number(m[2])]);
	return out;
}

// Replays one growth strategy over the existing bike network, annotating the link
// features in place with `ordering`, `length`, `length_cumulative`, `lcc_share` and
// `lcc_gain`, and stamping `lcc_step_<strategy>` onto the existing-network features.
//
// Note that the *identity* of the largest connected component can change mid-run: two
// mid-size components merging can overtake the incumbent, so membership is not strictly
// monotone. `lcc_step_<strategy>` therefore records the first step at which an edge
// belonged to whatever the largest component was, which yields a monotone reveal.
function computeLinkMetrics(existingFeatures, linkFeatures, strategy) {
	const stepKey = `lcc_step_${strategy}`;
	const index = new ComponentIndex();
	let totalLength = 0;

	for (const f of existingFeatures) {
		const { u, v, length } = f.properties ?? {};
		if (typeof u !== 'number' || typeof v !== 'number') continue;
		index.union(u, v);
		if (typeof length === 'number') {
			index.addLength(u, length);
			totalLength += length;
		}
	}

	const baselineShare = totalLength > 0 ? index.largestLength / totalLength : 0;

	// Edges already wired into the largest component before anything is built get -1 so
	// they read as connected at frame 0.
	let pending = existingFeatures.map((_, i) => i);
	const stamp = (step) => {
		const root = index.largestRoot;
		pending = pending.filter((i) => {
			const props = existingFeatures[i].properties;
			if (typeof props.u !== 'number' || index.find(props.u) !== root) return true;
			props[stepKey] = step;
			return false;
		});
	};
	stamp(-1);

	let cumulative = 0;
	let prevShare = baselineShare;

	for (let step = 0; step < linkFeatures.length; step++) {
		const f = linkFeatures[step];
		const props = f.properties ?? {};
		const length = geodesicLength(f.geometry);
		const nodes = Array.isArray(props.nodelist) ? props.nodelist : [];
		const edges = parseEdgeList(props.edge_list);

		if (nodes.length > 0) index.addLength(nodes[0], length);
		for (const [u, v] of edges) index.union(u, v);

		totalLength += length;
		cumulative += length;

		const share = totalLength > 0 ? index.largestLength / totalLength : 0;
		props.ordering = step;
		// Stored as whole meters to match the growbikenet export; the running total keeps
		// full precision so rounding does not accumulate.
		props.length = Math.round(length);
		props.length_cumulative = Math.round(cumulative);
		props.lcc_share = share;
		props.lcc_gain = share - prevShare;
		prevShare = share;

		if (pending.length > 0) stamp(step);
	}

	return { baselineShare, finalShare: prevShare, addedLength: cumulative };
}

// Two export shapes are supported. Sep 2026 and later:
//   {cid}-linkbikenet-{exportStrategy}.geojson
//   {cid}-linkbikenet-{exportStrategy}-existing_bike_network.geojson   (one baseline per strategy)
// Aug 2026 and earlier (still reachable via `--date`):
//   {cid}-{strategy}.geojson
//   {cid}-existing_bike_network.geojson                                (one baseline per city)
function classifyLinkbikenetFile(name) {
	const stem = name.replace(/\.geojson$/, '');
	// The 2026-09-09 re-export moved every layer behind a `-linkbikenet-` infix, the city boundary
	// included; earlier drops shipped them bare. Match either spelling, or the infix stays on the
	// city and `toCityId` invents a slug for it.
	const cityFor = (layer) => {
		for (const suffix of [`-linkbikenet-${layer}`, `-${layer}`]) {
			if (stem.endsWith(suffix)) return toCityId(stem.slice(0, -suffix.length));
		}
		return null;
	};

	let slug = cityFor('city_boundary');
	if (slug) return { kind: 'boundary', slug };

	// Strategy-qualified layers first: a per-strategy baseline also ends with
	// `-existing_bike_network`, so the shared fall-through below would swallow it and keep the
	// strategy name as part of the city.
	for (const [exportName, strategy] of Object.entries(LINKBIKENET_STRATEGY_BY_EXPORT_NAME)) {
		slug = cityFor(`${exportName}-existing_bike_network`);
		if (slug) return { kind: 'existing', strategy, slug };
		slug = cityFor(exportName);
		if (slug) return { kind: 'links', strategy, slug };
	}

	slug = cityFor('existing_bike_network');
	if (slug) return { kind: 'existing', strategy: null, slug };

	for (const strategy of LINKBIKENET_STRATEGIES) {
		slug = cityFor(strategy);
		if (slug) return { kind: 'links', strategy, slug };
	}
	return null;
}

// The Sep 2026 linkbikenet export writes bare `NaN` for absent OSM tag values, which is not JSON.
// The lookbehind/lookahead keep the substitution to value positions, so a quoted "NaN" in a
// street name is left alone.
function sanitizeNonJsonNumbers(text) {
	return text.replace(/(?<=[:,[\s])(NaN|-?Infinity)(?=[,\]}\s])/g, 'null');
}

// Parse + reproject only. Coordinate rounding is deferred until after lengths have been
// measured, so the 5-decimal payload rounding does not leak into the length figures.
function parseAndReproject(text) {
	const fc = JSON.parse(sanitizeNonJsonNumbers(text));
	for (const f of fc.features ?? []) {
		if (f.geometry && looksProjected(f.geometry)) reprojectInPlace(f.geometry);
	}
	if (fc.crs) delete fc.crs;
	return fc;
}

function roundAndSerialize(fc, keepProps, boundsAcc) {
	for (const f of fc.features ?? []) {
		if (f.geometry) roundCoordsInPlace(f.geometry);
		if (boundsAcc) walkCoords(f.geometry, ([x, y]) => expandBounds(boundsAcc, x, y));
		const src = f.properties ?? {};
		const kept = {};
		for (const k of keepProps) {
			if (src[k] !== undefined && src[k] !== null) kept[k] = src[k];
		}
		normalizeProps(kept);
		f.properties = kept;
	}
	return JSON.stringify(fc);
}

const LINK_KEEP_PROPS = ['ordering', 'length', 'length_cumulative', 'lcc_share', 'lcc_gain'];
const LINKBIKENET_EXISTING_KEEP_PROPS = ['length', ...LCC_STEP_PROPS];

async function mirrorLinkbikenetDir(srcDir, dstDir, dryRun, lengthAcc) {
	await mkdir(dstDir, { recursive: true });
	const srcFiles = await listFiles(srcDir);
	const dstFilesBefore = existsSync(dstDir) ? await listFiles(dstDir) : [];

	const boundsBySlug = new Map();
	const planned = new Map();
	const bySlug = new Map();

	for (const f of srcFiles) {
		if (!f.name.endsWith('.geojson')) continue;
		const info = classifyLinkbikenetFile(f.name);
		if (!info) {
			console.warn(`[warn] unrecognized linkbikenet filename: ${f.name}`);
			continue;
		}
		let entry = bySlug.get(info.slug);
		if (!entry) {
			entry = { boundary: null, existing: null, existingByStrategy: new Map(), links: new Map() };
			bySlug.set(info.slug, entry);
		}
		if (info.kind === 'boundary') entry.boundary = f;
		else if (info.kind === 'existing') {
			if (info.strategy) entry.existingByStrategy.set(info.strategy, f);
			else entry.existing = f;
		} else entry.links.set(info.strategy, f);
	}

	for (const [slug, entry] of bySlug) {
		// The boundary is kept even for an excluded city — see the equivalent note in
		// mirrorFixbikenetDir. Skipped before the assertions below, so a quarantined city's export
		// shape (missing baseline, no strategies) never trips them.
		if (isExcluded('linkbikenet', slug)) {
			if (entry.boundary) {
				planned.set(
					`${slug}-city_boundary.geojson`,
					transformGeojson(await readFile(entry.boundary.full, 'utf8'), null, null)
				);
			}
			continue;
		}
		if (!entry.existing && entry.existingByStrategy.size === 0) {
			throw new Error(`linkbikenet: missing existing_bike_network geojson for slug "${slug}"`);
		}
		if (entry.links.size === 0) {
			throw new Error(`linkbikenet: no strategy geojson found for slug "${slug}"`);
		}

		const acc = [Infinity, Infinity, -Infinity, -Infinity];
		boundsBySlug.set(slug, acc);

		if (entry.boundary) {
			planned.set(
				`${slug}-city_boundary.geojson`,
				transformGeojson(await readFile(entry.boundary.full, 'utf8'), null, null)
			);
		}

		// The Sep 2026 export ships one baseline per strategy, each carrying a plain `lcc_step`.
		// They are the same street network in the same order, so fold them into the single
		// per-city baseline the app downloads, one `lcc_step_<strategy>` column per strategy.
		const perStrategyBaselines = new Map();
		for (const [strategy, file] of entry.existingByStrategy) {
			perStrategyBaselines.set(strategy, parseAndReproject(await readFile(file.full, 'utf8')));
		}
		// A per-strategy baseline is the network its own `lcc_step` was computed over, so it is
		// always the correct join target. The bare file is only authoritative for the pre-Sep 2026
		// shape (reachable via `--date`), where it is the only baseline shipped. The 2026-09-09
		// re-upload left budapest_hu with a stale bare file alongside the three good ones — 9773
		// edges against the strategies' 5358 — and preferring it stamped `lcc_step` onto 19% of the
		// baseline, leaving the rest to render as permanently fragmented.
		const existing =
			perStrategyBaselines.size > 0
				? [...perStrategyBaselines.values()][0]
				: parseAndReproject(await readFile(entry.existing.full, 'utf8'));

		if (entry.existing && perStrategyBaselines.size > 0) {
			console.warn(
				`[warn] linkbikenet: "${slug}" ships both a bare existing_bike_network and ` +
					`${perStrategyBaselines.size} per-strategy baselines; using the per-strategy ones. ` +
					`The bare file is likely stale export residue.`
			);
		}

		// Backstop for `--date` runs against the 2026-09-09 export, whose cleanup collapsed the three
		// per-strategy baselines into one file carrying a single, unlabelled `lcc_step` (spot-checked
		// on aachen_de: the values are `closest_components`'). The map recolours the baseline per
		// strategy from `lcc_step_<strategy>`, so one column cannot serve all three — and the `u`/`v`
		// columns the union-find fallback would need to rebuild them are gone from that file too.
		// Fail loudly rather than ship a build where two of the three strategies quietly show the
		// wrong connected/fragmented split. Fixed upstream on 2026-09-09; see dataexport#36.
		if (perStrategyBaselines.size === 0) {
			const props = existing?.features?.[0]?.properties ?? {};
			if ('lcc_step' in props && !('u' in props)) {
				throw new Error(
					`linkbikenet: "${slug}" ships a single baseline with one unlabelled \`lcc_step\` ` +
						`column. The map needs one per strategy (lcc_step_largest_closest / _largest / ` +
						`_closest). Ask for a baseline carrying all three (or per-strategy baselines as ` +
						`before), or pin the previous export with --date.`
				);
			}
		}

		for (const [strategy, fc] of perStrategyBaselines) {
			const stepByEdge = new Map();
			for (const f of fc.features ?? []) {
				stepByEdge.set(`${f.properties?.u}|${f.properties?.v}`, f.properties?.lcc_step);
			}
			// The export counts steps on its own 1-based `ordering` scale, where 0 means "already in
			// the largest component before anything was built". The links below are renumbered to
			// the app's 0-based steps, so shift by one: 0 becomes the -1 the map reads as
			// connected-from-the-start, and step k lands on the link that now carries ordering k-1.
			for (const f of existing.features ?? []) {
				const step = stepByEdge.get(`${f.properties?.u}|${f.properties?.v}`);
				if (typeof step === 'number') f.properties[`lcc_step_${strategy}`] = step - 1;
			}

			// A baseline edge with no `lcc_step_<strategy>` never enters the map's `connectedIndex`,
			// so it renders as fragmented for the whole animation. The `u|v` join is direction-
			// sensitive, so tolerate a few stray reversed edges — but a large shortfall means the
			// baseline and the step column describe different networks.
			const key = `lcc_step_${strategy}`;
			const total = existing.features?.length ?? 0;
			const stamped = (existing.features ?? []).filter(
				(f) => typeof f.properties?.[key] === 'number'
			).length;
			if (total > 0 && stamped < total * 0.99) {
				const msg =
					`linkbikenet: "${slug}" — only ${stamped}/${total} baseline edges got \`${key}\`. ` +
					`The baseline and the per-strategy step column describe different networks.`;
				if (!LCC_STEP_GUARD_EXEMPT.has(`${slug}:${strategy}`)) throw new Error(msg);
				console.warn(`[warn] ${msg} Exempted in LCC_STEP_GUARD_EXEMPT; shipping as-is.`);
			}
		}
		for (const f of existing.features ?? []) {
			const props = f.properties;
			if (props && typeof props.length === 'number') props.length = Math.round(props.length);
		}

		const linkCollections = new Map();
		for (const [strategy, file] of entry.links) {
			linkCollections.set(strategy, parseAndReproject(await readFile(file.full, 'utf8')));
		}

		for (const strategy of LINKBIKENET_STRATEGIES) {
			const fc = linkCollections.get(strategy);
			if (!fc) continue;
			let addedLength;
			let baselineShare;
			let finalShare;
			if (perStrategyBaselines.size > 0) {
				// The export now computes the LCC series itself, so trust its `lcc_share`/`lcc_gain`
				// and only measure what it omits: per-link length and the running total. Its first
				// row is a geometry-less summary of the pre-build state, not a segment.
				const summary = (fc.features ?? []).find((f) => !f.geometry)?.properties;
				const links = (fc.features ?? [])
					.filter((f) => f.geometry)
					.sort((a, b) => (a.properties?.ordering ?? 0) - (b.properties?.ordering ?? 0));
				let cumulative = 0;
				// The export's own `lcc_gain` is the *length* the largest component gained, in
				// meters. The app reads `lcc_gain` as the step's share delta — it recovers the
				// pre-build share as `lcc_share - lcc_gain` — so recompute it from consecutive
				// shares, seeded with the summary row's baseline share.
				let prevShare = summary?.lcc_share ?? 0;
				links.forEach((f, i) => {
					const length = geodesicLength(f.geometry);
					cumulative += length;
					f.properties.ordering = i;
					f.properties.length = Math.round(length);
					f.properties.length_cumulative = Math.round(cumulative);
					const share = f.properties.lcc_share ?? prevShare;
					f.properties.lcc_gain = share - prevShare;
					prevShare = share;
				});
				fc.features = links;
				addedLength = cumulative;
				baselineShare = summary?.lcc_share ?? 0;
				finalShare = links[links.length - 1]?.properties?.lcc_share ?? baselineShare;
			} else {
				const stats = computeLinkMetrics(existing.features ?? [], fc.features ?? [], strategy);
				addedLength = stats.addedLength;
				baselineShare = stats.baselineShare;
				finalShare = stats.finalShare;
			}
			lengthAcc.meters += addedLength;
			// One line per city per strategy is 1197 lines at the current catalog size; keep the
			// detail for a handful of cities and let the run summary speak for the rest.
			if (bySlug.size <= 10) {
				console.log(
					`[update-data] linkbikenet/: ${slug}/${strategy} — ${fc.features.length} links, ` +
						`${Math.round(addedLength / 1000)} km added, LCC ` +
						`${(baselineShare * 100).toFixed(1)}% → ${(finalShare * 100).toFixed(1)}%`
				);
			}
			planned.set(
				`${slug}-${strategy}-network.geojson`,
				roundAndSerialize(fc, LINK_KEEP_PROPS, acc)
			);
		}

		// Shared across all three strategy views — it carries one `lcc_step_*` column per
		// strategy, so the map can recolor it without a second download.
		planned.set(
			`${slug}-existing-network.geojson`,
			roundAndSerialize(existing, LINKBIKENET_EXISTING_KEEP_PROPS, acc)
		);
	}

	let added = 0;
	let updated = 0;
	let removed = 0;
	const plannedNames = new Set(planned.keys());

	for (const [name, payload] of planned) {
		const dstPath = path.join(dstDir, name);
		const result = await writeIfChanged(payload, dstPath, dryRun);
		if (result === 'added') added++;
		else if (result === 'updated') updated++;
	}

	for (const f of dstFilesBefore) {
		if (!plannedNames.has(f.name)) {
			removed++;
			if (!dryRun) await rm(f.full);
		}
	}

	return { added, updated, removed, boundsBySlug };
}

const SUPERBLOCKIFY_FILE = /^(.+)-superblockify-(betweenness|residential)-(blocks|edges)\.geojson$/;

// The export names the per-block layer `blocks` with `street_length_total`/`street_segment_count`;
// the app reads it as `ltns` with `length_total`/`m`. Remap the fields before the allow-list runs.
//
// `population_density` is converted, not recomputed: the export gives people per **m²**
// (0.014580087 for an Amsterdam block) while every density the app shows, formats and ramps is
// people per km². A naive passthrough would be off by a factor of a million.
function renameSuperblockBlockProps(raw) {
	const fc = JSON.parse(raw);
	for (const f of fc.features ?? []) {
		const p = f.properties;
		if (!p) continue;
		if (p.street_length_total !== undefined) p.length_total = p.street_length_total;
		if (p.street_segment_count !== undefined) p.m = p.street_segment_count;
		if (typeof p.population_density === 'number') p.population_density *= 1e6;
	}
	return JSON.stringify(fc);
}

async function mirrorSuperblockifyDir(srcDir, dstDir, dryRun, lengthAcc) {
	await mkdir(dstDir, { recursive: true });
	const srcFiles = await listFiles(srcDir);
	const dstFilesBefore = existsSync(dstDir) ? await listFiles(dstDir) : [];

	const boundsBySlug = new Map();
	const planned = new Map();
	const excludedSlugs = new Set();
	const excludedSamples = new Map();

	for (const f of srcFiles) {
		if (f.name.endsWith('-city_boundary.geojson')) continue; // boundary comes from growbikenet
		const m = f.name.match(SUPERBLOCKIFY_FILE);
		if (!m) {
			if (f.name.endsWith('.geojson'))
				console.warn(`[warn] unrecognized superblockify filename: ${f.name}`);
			continue;
		}
		const slug = toCityId(m[1]);
		if (isExcluded('superblockify', slug)) {
			excludedSlugs.add(slug);
			// Sampled once per city — enough to notice a corrected export later (see
			// assertPlacement's caller in main()), not a substitute for the precise bounds a mirrored
			// file would otherwise accumulate.
			if (!excludedSamples.has(slug)) excludedSamples.set(slug, await sampleBbox(f.full));
			continue;
		}
		const analysis = m[2];
		// Only the edge layer defines the city's extent and contributes network length; `blocks` is
		// one representative point per block, sitting inside that extent, output as the `ltns` layer.
		const isEdges = m[3] === 'edges';
		const outLayer = isEdges ? 'edges' : 'ltns';

		let acc = boundsBySlug.get(slug);
		if (!acc) {
			acc = [Infinity, Infinity, -Infinity, -Infinity];
			boundsBySlug.set(slug, acc);
		}

		let raw = await readFile(f.full, 'utf8');
		if (!isEdges) raw = renameSuperblockBlockProps(raw);
		const payload = transformGeojson(
			raw,
			isEdges ? acc : null,
			isEdges ? lengthAcc : null,
			superblockifyKeepProps(outLayer, analysis),
			// The export carries no reliable projected `length`; derive it from lng/lat geometry.
			{ remeasureLength: isEdges }
		);
		planned.set(`${slug}-${analysis}-${outLayer}.geojson`, payload);
	}

	let added = 0;
	let updated = 0;
	let removed = 0;
	const plannedNames = new Set(planned.keys());

	for (const [name, payload] of planned) {
		const dstPath = path.join(dstDir, name);
		const result = await writeIfChanged(payload, dstPath, dryRun);
		if (result === 'added') added++;
		else if (result === 'updated') updated++;
	}

	for (const f of dstFilesBefore) {
		if (!plannedNames.has(f.name)) {
			removed++;
			if (!dryRun) await rm(f.full);
		}
	}

	if (excludedSlugs.size > 0) {
		console.log(
			`[update-data]   superblockify: skipped ${excludedSlugs.size} quarantined ` +
				`cit${excludedSlugs.size === 1 ? 'y' : 'ies'}: ${[...excludedSlugs].sort().join(', ')}`
		);
	}

	return { added, updated, removed, boundsBySlug, excludedSamples };
}

async function copyFile(src, dst, dryRun) {
	if (!existsSync(src)) throw new Error(`Missing source file: ${src}`);
	if (dryRun) return;
	await mkdir(path.dirname(dst), { recursive: true });
	await cp(src, dst);
}

// ── Simplified city boundaries (basemap label clipping) ─────────────────────────
//
// The basemap clips place labels to the city polygon with a `within` filter, which serialises the
// polygon into every tile-layout call. The exported boundaries run 4 800–12 800 vertices (london
// is 248 KB), far more than a point-in-polygon test on label anchors needs. Douglas–Peucker at
// ~100 m takes london to 399 points / 7.7 KB and amsterdam to 100 / 1.9 KB.

/** ≈ 70–110 m at European latitudes — well inside the precision label clipping needs. */
const BOUNDARY_TOLERANCE_DEG = 0.001;
/** Drop islets below ~2 simplification cells; they can never hold a label. */
const MIN_RING_AREA_DEG2 = BOUNDARY_TOLERANCE_DEG ** 2 * 4;

function sqSegDist(p, a, b) {
	let x = a[0];
	let y = a[1];
	let dx = b[0] - x;
	let dy = b[1] - y;
	if (dx || dy) {
		const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
		if (t > 1) {
			x = b[0];
			y = b[1];
		} else if (t > 0) {
			x += dx * t;
			y += dy * t;
		}
	}
	dx = p[0] - x;
	dy = p[1] - y;
	return dx * dx + dy * dy;
}

// Iterative rather than recursive: a 12 800-vertex ring would otherwise risk the stack.
function simplifyRing(pts, sqTol) {
	if (pts.length < 5) return pts;
	const last = pts.length - 1;
	const keep = new Uint8Array(pts.length);
	keep[0] = 1;
	keep[last] = 1;
	const stack = [[0, last]];
	while (stack.length > 0) {
		const [from, to] = stack.pop();
		let maxDist = 0;
		let idx = 0;
		for (let i = from + 1; i < to; i++) {
			const d = sqSegDist(pts[i], pts[from], pts[to]);
			if (d > maxDist) {
				maxDist = d;
				idx = i;
			}
		}
		if (maxDist > sqTol) {
			keep[idx] = 1;
			stack.push([from, idx], [idx, to]);
		}
	}
	const out = pts.filter((_, i) => keep[i] === 1);
	// A ring simplified past a triangle is degenerate — keep the original rather than emit it.
	return out.length >= 4 ? out : pts;
}

/** Shoelace area in square degrees. Only ever compared against a threshold, never reported. */
function ringArea(ring) {
	let a = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
	}
	return Math.abs(a / 2);
}

function simplifyBoundary(fc) {
	const sqTol = BOUNDARY_TOLERANCE_DEG ** 2;
	const polygons = [];
	for (const feature of fc.features ?? []) {
		const geom = feature.geometry;
		if (!geom) continue;
		const source =
			geom.type === 'Polygon'
				? [geom.coordinates]
				: geom.type === 'MultiPolygon'
					? geom.coordinates
					: [];
		for (const rings of source) {
			if (rings.length === 0 || ringArea(rings[0]) < MIN_RING_AREA_DEG2) continue;
			polygons.push(rings.map((ring) => simplifyRing(ring, sqTol)));
		}
	}
	if (polygons.length === 0) return null;
	return {
		type: 'FeatureCollection',
		features: [
			{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } }
		]
	};
}

// Reads `data/`, not the export root, so a `--tool`-filtered run still produces the full
// set — every tool's mirrored boundaries are already on disk by the time this runs.
async function writeSimplifiedBoundaries(dryRun) {
	const dataDir = DATA_DIR;
	const outDir = path.join(dataDir, 'cities');
	const entries = existsSync(dataDir) ? await readdir(dataDir, { withFileTypes: true }) : [];

	const sourceBySlug = new Map();
	for (const { name } of entries.filter((e) => e.isDirectory())) {
		if (name === 'cities') continue;
		for (const file of await listFiles(path.join(dataDir, name))) {
			if (!file.name.endsWith('-city_boundary.geojson')) continue;
			const slug = file.name.slice(0, -'-city_boundary.geojson'.length);
			if (!sourceBySlug.has(slug)) sourceBySlug.set(slug, file.full);
		}
	}

	if (!dryRun) await mkdir(outDir, { recursive: true });
	const written = [];
	const skipped = [];
	// The city's own reference bbox for `assertPlacement` below — a tool's data is compared against
	// this, not against `cities.json`'s bounds, which a misplacement is precisely what would poison.
	const bboxBySlug = new Map();
	for (const [slug, src] of [...sourceBySlug].sort(([a], [b]) => a.localeCompare(b))) {
		const simplified = simplifyBoundary(JSON.parse(await readFile(src, 'utf8')));
		if (!simplified) {
			skipped.push(slug);
			continue;
		}
		const acc = [Infinity, Infinity, -Infinity, -Infinity];
		for (const f of simplified.features)
			walkCoords(f.geometry, ([x, y]) => expandBounds(acc, x, y));
		bboxBySlug.set(slug, acc);
		await writeIfChanged(
			JSON.stringify(simplified),
			path.join(outDir, `${slug}-boundary.geojson`),
			dryRun
		);
		written.push(slug);
	}

	// Prune boundaries for slugs that have left the export, matching how the tool mirrors
	// prune their own directories.
	const keep = new Set(written.map((slug) => `${slug}-boundary.geojson`));
	for (const file of existsSync(outDir) ? await listFiles(outDir) : []) {
		if (!file.name.endsWith('-boundary.geojson') || keep.has(file.name)) continue;
		if (!dryRun) await rm(file.full);
		console.log(`[update-data]   boundaries: removed stale ${file.name}`);
	}

	const indexPath = path.resolve(WWW_ROOT, 'src/lib/data/city-boundaries.json');
	if (!dryRun) {
		const prettier = await import('prettier');
		const config = (await prettier.resolveConfig(indexPath)) ?? {};
		await writeFile(
			indexPath,
			await prettier.format(JSON.stringify(written), { ...config, filepath: indexPath }),
			'utf8'
		);
	}
	if (skipped.length > 0) {
		console.warn(`[warn] No usable boundary polygon for: ${skipped.join(', ')}`);
	}
	return { count: written.length, outDir, indexPath, bboxBySlug };
}

// Committed listing of every tool data file on disk. The build no longer ships data/ (it is
// served off-repo — see www/DEPLOY_DATA.md), so $lib/data/datasets enumerates datasets from this
// manifest instead of scanning the filesystem. Scans the whole tree like writeSimplifiedBoundaries,
// so a filtered run still emits a complete list rather than dropping the tools it did not touch.
async function writeDataFilesManifest(dryRun) {
	const dataDir = DATA_DIR;
	const manifest = {};
	for (const tool of Object.keys(TOOL_RULES)) {
		const toolDir = path.join(dataDir, tool);
		const files = existsSync(toolDir) ? await listFiles(toolDir) : [];
		manifest[tool] = files
			.map((f) => f.name)
			// Raw `-city_boundary.geojson` sources feed writeSimplifiedBoundaries; they are never
			// parsed into a Dataset, so keep them out of the manifest for a cleaner committed diff.
			.filter((name) => name.endsWith('.geojson') && !name.endsWith('-city_boundary.geojson'))
			.sort((a, b) => a.localeCompare(b));
	}
	const outPath = path.resolve(WWW_ROOT, 'src/lib/data/data-files.json');
	if (!dryRun) {
		const prettier = await import('prettier');
		const config = (await prettier.resolveConfig(outPath)) ?? {};
		await writeFile(
			outPath,
			await prettier.format(JSON.stringify(manifest), { ...config, filepath: outPath }),
			'utf8'
		);
	}
	const total = Object.values(manifest).reduce((n, list) => n + list.length, 0);
	return { outPath, total, toolCount: Object.keys(manifest).length };
}

// `meta/versions.csv` (`tool,version,osm_data_date`) records which release of each tool produced
// this export, and how old the OpenStreetMap extract behind it is. Emitted as JSON so the hero HUD
// and the tool pages can show a real version instead of the website's own package version, and so
// a future rebuild can be traced back to its inputs.
async function writeToolVersions(versionsCsvPath, dryRun) {
	const { rows } = parseCsv(await readFile(versionsCsvPath, 'utf8'), ',');
	const toolsPath = path.resolve(WWW_ROOT, 'src/lib/data/tools.json');
	const knownSlugs = new Set(JSON.parse(await readFile(toolsPath, 'utf8')).map((t) => t.slug));
	const versions = {};
	const unknown = [];
	for (const row of rows) {
		const tool = (row['tool'] ?? '').trim();
		const version = (row['version'] ?? '').trim();
		if (!tool || !version) continue;
		if (!knownSlugs.has(tool)) unknown.push(tool);
		const osmDataDate = (row['osm_data_date'] ?? '').trim();
		versions[tool] = osmDataDate ? { version, osmDataDate } : { version };
	}
	const outPath = path.resolve(WWW_ROOT, 'src/lib/data/tool-versions.json');
	if (!dryRun) {
		const prettier = await import('prettier');
		const config = (await prettier.resolveConfig(outPath)) ?? {};
		await writeFile(
			outPath,
			await prettier.format(JSON.stringify(versions), { ...config, filepath: outPath }),
			'utf8'
		);
	}
	return { outPath, count: Object.keys(versions).length, unknown };
}

// The city metadata CSVs now ship inside the export at `dataexports/<latest|YYYYMMDD>/meta/`.
// Prefer `latest/meta`, then the newest dated `meta/`; returns null when the export root carries
// no meta (e.g. a bare data root without a meta/ dir), leaving callers to fall back to the committed copy.
async function resolveMetaDir(dataRoot, pinnedDate) {
	const exportsRoot = path.join(dataRoot, 'dataexports');
	if (!existsSync(exportsRoot)) return null;
	const entries = await readdir(exportsRoot);
	const candidates = [];
	if (!pinnedDate && entries.includes('latest')) candidates.push('latest');
	const dated = entries.filter((e) => /^\d{8}$/.test(e)).sort();
	candidates.push(
		...(pinnedDate ? (dated.includes(pinnedDate) ? [pinnedDate] : []) : dated.reverse())
	);
	for (const c of candidates) {
		const dir = path.join(exportsRoot, c, 'meta');
		if (existsSync(dir)) return dir;
	}
	return null;
}

function toFiniteNumber(v) {
	if (v === undefined || v === null || v === '') return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

async function buildCitiesJson({
	slugs,
	boundsBySlug,
	citiesCsvPath,
	recTableCsvPath,
	networkMetricsCsvPath,
	dryRun
}) {
	const citiesText = await readFile(citiesCsvPath, 'utf8');
	const recTableText = await readFile(recTableCsvPath, 'utf8');
	const citiesRows = parseCsv(citiesText, ';').rows;
	const recTable = parseCsv(recTableText, ',').rows;
	const networkRows = networkMetricsCsvPath
		? parseCsv(await readFile(networkMetricsCsvPath, 'utf8'), ',').rows
		: [];

	// Key cities.csv by its cityid (explicit column when present, else derived `<base>_<cc>`);
	// rec_table.csv and network_metrics.csv carry an explicit `cityid`, keyed verbatim.
	const cityRowBySlug = new Map();
	for (const row of citiesRows) {
		const cid = cityIdFromRow(row);
		if (cid) cityRowBySlug.set(cid, row);
	}
	const recBySlug = new Map();
	for (const row of recTable) {
		const cid = (row['cityid'] ?? '').trim().toLowerCase();
		if (cid) recBySlug.set(cid, row);
	}
	const networkBySlug = new Map();
	for (const row of networkRows) {
		const cid = (row['cityid'] ?? '').trim().toLowerCase();
		if (cid) networkBySlug.set(cid, row);
	}

	const unmatched = { cities: [], recTable: [] };
	const cities = [];

	for (const slug of slugs) {
		const acc = boundsBySlug.get(slug);
		if (!acc || !Number.isFinite(acc[0])) {
			throw new Error(`No feature coordinates accumulated for ${slug}`);
		}
		const bounds = [
			[acc[0], acc[1]],
			[acc[2], acc[3]]
		];

		// Fallback name when a data slug has no cities.csv row: strip the `_<cc>` suffix and title-case.
		let name = slug
			.replace(/_[a-z]{2}$/, '')
			.replace(/-/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
		let country;
		let countryCode;
		let population;
		const cityRow = cityRowBySlug.get(slug);
		if (cityRow) {
			name = cityRow['name_en'];
			country = cityRow['country_en'];
			countryCode = (cityRow['country_code'] ?? '').trim().toUpperCase() || undefined;
			population = toFiniteNumber(cityRow['population']);
		} else {
			unmatched.cities.push(slug);
		}

		const recRow = recBySlug.get(slug);
		let recommended;
		if (recRow) {
			recommended = {
				gbn: recRow['gbn'] === '1',
				gbn_plus: recRow['gbn+'] === '1',
				lbn: recRow['lbn'] === '1',
				fbn: recRow['fbn'] === '1',
				sb: recRow['sb'] === '1'
			};
		} else {
			unmatched.recTable.push(slug);
		}

		const networkRow = networkBySlug.get(slug);
		let metrics;
		if (networkRow) {
			const m = {
				cov_ratio: toFiniteNumber(networkRow['cov_ratio']),
				l_ratio: toFiniteNumber(networkRow['l_ratio']),
				gcc1: toFiniteNumber(networkRow['gcc1']),
				gcc2: toFiniteNumber(networkRow['gcc2']),
				gcc3: toFiniteNumber(networkRow['gcc3'])
			};
			if (Object.values(m).some((v) => v !== undefined)) metrics = m;
		}

		const entry = { name, slug, bounds };
		if (country) entry.country = country;
		if (countryCode) entry.countryCode = countryCode;
		if (population !== undefined) entry.population = population;
		if (recommended) entry.recommended = recommended;
		if (metrics) entry.metrics = metrics;
		cities.push(entry);
	}

	// cities.csv rows whose derived cityid never appears in the data — the inverse of unmatched.cities.
	const dataSlugs = new Set(slugs);
	const citiesWithoutData = [...cityRowBySlug.keys()].filter((cid) => !dataSlugs.has(cid));

	cities.sort((a, b) => a.name.localeCompare(b.name));

	const outPath = path.resolve(WWW_ROOT, 'src/lib/data/cities.json');
	if (!dryRun) {
		const prettier = await import('prettier');
		const config = (await prettier.resolveConfig(outPath)) ?? {};
		const raw = JSON.stringify(cities);
		const formatted = await prettier.format(raw, { ...config, filepath: outPath });
		await writeFile(outPath, formatted, 'utf8');
	}

	return { cities, unmatched, citiesWithoutData, outPath };
}

async function verifyToolsJson() {
	const toolsPath = path.resolve(WWW_ROOT, 'src/lib/data/tools.json');
	const raw = await readFile(toolsPath, 'utf8');
	const data = JSON.parse(raw);
	if (!Array.isArray(data)) throw new Error('tools.json must be an array');
	const slugs = new Set();
	for (const tool of data) {
		for (const field of [
			'name',
			'slug',
			'shortDescription',
			'questionAnswered',
			'category',
			'status'
		]) {
			if (typeof tool[field] !== 'string' || tool[field].length === 0) {
				throw new Error(`tools.json: entry "${tool.name ?? '?'}" missing "${field}"`);
			}
		}
		if (!['interactive', 'static'].includes(tool.category)) {
			throw new Error(`tools.json: invalid category "${tool.category}" for ${tool.slug}`);
		}
		if (!['active', 'coming-soon'].includes(tool.status)) {
			throw new Error(`tools.json: invalid status "${tool.status}" for ${tool.slug}`);
		}
		if (
			tool.tutorial !== undefined &&
			!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(tool.tutorial)
		) {
			throw new Error(`tools.json: ${tool.slug} tutorial must be a youtube.com/watch?v= URL`);
		}
		if (
			tool.tutorial !== undefined &&
			!existsSync(path.join(WWW_ROOT, 'src/lib/assets/media/tutorials', `${tool.slug}.webp`))
		) {
			console.warn(
				`[warn] tools.json: ${tool.slug} has a tutorial but no thumbnail, so its tool page falls back to a plain button. Run pnpm generate:tutorial-thumbs.`
			);
		}
		if (slugs.has(tool.slug)) throw new Error(`tools.json: duplicate slug "${tool.slug}"`);
		slugs.add(tool.slug);
	}
	return data.length;
}

// An export is allowed to ship fewer files than www/data/ already holds — a tool drops a variant,
// a city leaves the set. It is not allowed to ship a small fraction of them: that is the signature
// of a stale or half-synced export root, and every mirror step prunes, so the run would delete the
// difference. Renaming churn (which the tools do between drops) is safe here, because the export
// still carries one file per result under the new name.
const PRUNE_GUARD_RATIO = 0.75;

async function countGeojson(dir) {
	if (!existsSync(dir)) return 0;
	const entries = await readdir(dir, { withFileTypes: true });
	return entries.filter((e) => e.isFile() && e.name.endsWith('.geojson')).length;
}

async function assertExportNotStale(exportsByTool, force) {
	const suspect = [];
	for (const [tool, info] of exportsByTool) {
		const existing = await countGeojson(path.join(DATA_DIR, tool));
		if (existing === 0) continue;
		const incoming = await countGeojson(info.dir);
		if (incoming < existing * PRUNE_GUARD_RATIO) suspect.push({ tool, existing, incoming });
	}
	if (suspect.length === 0) return;

	const lines = suspect.map(
		({ tool, existing, incoming }) =>
			`  ${tool}: export has ${incoming} file(s), data/${tool}/ holds ${existing}`
	);
	const message =
		`Export looks stale — it would prune most of www/data/:\n${lines.join('\n')}\n` +
		`Check --data-root and --date (a bare run reads ${DEFAULT_DATA_ROOT}), or re-run with ` +
		`--force if the export really is this much smaller.`;
	if (force) console.warn(`[warn] ${message}`);
	else throw new Error(message);
}

async function processTool(tool, exportInfo, dryRun, lengthAcc) {
	const rules = TOOL_RULES[tool];
	if (!rules) {
		console.warn(`[warn] no rules defined for tool "${tool}" — skipping`);
		return null;
	}
	const dstDir = path.join(DATA_DIR, tool);
	console.log(`[update-data] ${tool}/: source ${exportInfo.date}`);

	if (rules.format === 'geojson') {
		const files = await listFiles(exportInfo.dir);
		const verified = await verifyGeojsonExport(files, rules);
		for (const w of verified.warnings) console.warn(`[warn] ${tool}: ${w}`);
		const result = await mirrorGrowbikenetDir(exportInfo.dir, dstDir, dryRun, lengthAcc);
		console.log(
			`[update-data] ${tool}/: +${result.added} new, ~${result.updated} updated, -${result.removed} removed`
		);
		return { slugs: verified.slugs, boundsBySlug: result.boundsBySlug };
	}

	if (rules.format === 'fixbikenet-geojson') {
		const files = await listFiles(exportInfo.dir);
		const slugs = new Set();
		for (const f of files) {
			if (!f.name.endsWith('.geojson')) continue;
			slugs.add(classifyFixbikenetFile(f.name).slug);
		}
		const result = await mirrorFixbikenetDir(exportInfo.dir, dstDir, dryRun, lengthAcc);
		console.log(
			`[update-data] ${tool}/: +${result.added} new, ~${result.updated} updated, -${result.removed} removed`
		);
		return { slugs: [...slugs].sort(), boundsBySlug: result.boundsBySlug };
	}

	if (rules.format === 'linkbikenet-geojson') {
		const files = await listFiles(exportInfo.dir);
		const slugs = new Set();
		for (const f of files) {
			if (!f.name.endsWith('.geojson')) continue;
			const info = classifyLinkbikenetFile(f.name);
			if (info) slugs.add(info.slug);
		}
		const result = await mirrorLinkbikenetDir(exportInfo.dir, dstDir, dryRun, lengthAcc);
		console.log(
			`[update-data] ${tool}/: +${result.added} new, ~${result.updated} updated, -${result.removed} removed`
		);
		return { slugs: [...slugs].sort(), boundsBySlug: result.boundsBySlug };
	}

	if (rules.format === 'sortbikenet-geojson') {
		const files = await listFiles(exportInfo.dir);
		const slugs = new Set();
		for (const f of files) {
			const info = classifySortbikenetFile(f.name);
			if (info) slugs.add(info.slug);
		}
		const result = await mirrorSortbikenetDir(exportInfo.dir, dstDir, dryRun, lengthAcc);
		console.log(
			`[update-data] ${tool}/: +${result.added} new, ~${result.updated} updated, -${result.removed} removed`
		);
		return { slugs: [...slugs].sort(), boundsBySlug: result.boundsBySlug };
	}

	if (rules.format === 'superblockify-geojson') {
		const files = await listFiles(exportInfo.dir);
		const slugs = new Set();
		for (const f of files) {
			const m = f.name.match(SUPERBLOCKIFY_FILE);
			if (m) slugs.add(toCityId(m[1]));
		}
		const result = await mirrorSuperblockifyDir(exportInfo.dir, dstDir, dryRun, lengthAcc);
		console.log(
			`[update-data] ${tool}/: +${result.added} new, ~${result.updated} updated, -${result.removed} removed`
		);
		return {
			slugs: [...slugs].sort(),
			boundsBySlug: result.boundsBySlug,
			excludedSamples: result.excludedSamples
		};
	}

	throw new Error(`Unknown format "${rules.format}" for tool "${tool}"`);
}

function mergeBounds(target, source) {
	for (const [slug, src] of source) {
		const dst = target.get(slug);
		if (!dst) {
			target.set(slug, [...src]);
			continue;
		}
		if (src[0] < dst[0]) dst[0] = src[0];
		if (src[1] < dst[1]) dst[1] = src[1];
		if (src[2] > dst[2]) dst[2] = src[2];
		if (src[3] > dst[3]) dst[3] = src[3];
	}
}

/**
 * How far a tool's data may sit outside the city boundary before it is the wrong city. Measured
 * across the frozen export, the widest legitimate overshoot is 0.65 boundary-widths (zagreb_hr,
 * whose network reaches well past the municipal line); the misplaced Danish datasets sit some 200
 * widths away. Three widths of padding is ~4.6x the observed worst case, so the gate only ever
 * fires on an unambiguous mislocation — a near-miss (a same-named town one valley over) is left to
 * the advisory threshold in check:datasets, which does not block an import.
 */
const PLACEMENT_PAD_WIDTHS = 3;
/** Floor, so a 0.03°-wide city is not held to a 0.09° margin. */
const PLACEMENT_PAD_MIN_DEG = 0.05;

/**
 * Fails the run when a tool's mirrored data sits nowhere near the city it is filed under. Compared
 * against the city's own simplified boundary, not `cities.json`'s bounds — the latter is derived
 * from this same tool data, so it is exactly what a misplacement would poison. Excluded pairs never
 * reach this: their mirror skipped them before contributing to `boundsByTool`.
 */
function assertPlacement(boundsByTool, boundaryBboxBySlug) {
	const misplaced = [];
	for (const [tool, bySlug] of boundsByTool) {
		for (const [slug, acc] of bySlug) {
			const ref = boundaryBboxBySlug.get(slug);
			if (!ref || !Number.isFinite(acc[0])) continue;
			if (!intersectsPadded(acc, ref, PLACEMENT_PAD_WIDTHS, PLACEMENT_PAD_MIN_DEG)) {
				misplaced.push({ tool, slug, acc, ref });
			}
		}
	}
	if (misplaced.length === 0) return;
	throw new Error(
		`Data located outside the city it is named for:\n` +
			misplaced
				.map(
					({ tool, slug, acc, ref }) =>
						`  ${tool}/${slug}: data at ${fmtBounds(acc)}, boundary at ${fmtBounds(ref)}`
				)
				.join('\n') +
			`\nThis is an upstream export bug, not a transform bug — compare the export's own ` +
			`<cityid>-<tool>-city_boundary.geojson, which is normally correct.\nRecord the pair in ` +
			`src/lib/data/excluded-datasets.json (with the reason and the upstream issue) and re-run.`
	);
}

/**
 * Tells the maintainer when a quarantined pair no longer needs to be — the export's own bbox for
 * that city, sampled while the mirror was skipping it, now agrees with the real boundary. Advisory
 * only: removing the entry from excluded-datasets.json is a manual, deliberate step.
 */
function reportStaleQuarantines(excludedSamplesByTool, boundaryBboxBySlug) {
	for (const [tool, samples] of excludedSamplesByTool) {
		for (const [slug, sample] of samples) {
			const ref = boundaryBboxBySlug.get(slug);
			if (!sample || !ref) continue;
			if (intersectsPadded(sample, ref, PLACEMENT_PAD_WIDTHS, PLACEMENT_PAD_MIN_DEG)) {
				console.warn(
					`[warn] quarantined ${tool}/${slug} now looks correctly placed (sampled at ` +
						`${fmtBounds(sample)}, boundary at ${fmtBounds(ref)}) — remove it from ` +
						`src/lib/data/excluded-datasets.json and re-run.`
				);
			}
		}
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.boundariesOnly) {
		const only = await writeSimplifiedBoundaries(args.dryRun);
		console.log(
			`[update-data] boundaries: ${only.count} cities → ${path.relative(WWW_ROOT, only.outDir)}/, ` +
				`index → ${path.relative(WWW_ROOT, only.indexPath)}`
		);
		const manifest = await writeDataFilesManifest(args.dryRun);
		console.log(
			`[update-data] data-files.json: ${manifest.total} files across ${manifest.toolCount} tools → ${path.relative(WWW_ROOT, manifest.outPath)}`
		);
		console.log('[update-data] done (boundaries only).');
		return;
	}

	const dataRoot = args.dataRoot;
	if (!existsSync(dataRoot)) throw new Error(`Data root does not exist: ${dataRoot}`);

	const allExports = await pickExportsByTool(dataRoot, args.date);
	const exportsByTool = args.tools
		? new Map([...allExports].filter(([tool]) => args.tools.has(tool)))
		: allExports;
	if (args.tools) {
		const missing = [...args.tools].filter((tool) => !allExports.has(tool));
		if (missing.length > 0) {
			throw new Error(`--tool: no export found under ${dataRoot} for: ${missing.join(', ')}`);
		}
	}
	// Resolve the meta CSVs from the export's `meta/`, falling back to the committed copy in
	// data/cities/ (the superblockify-only root has no meta, but still needs the name→cityid
	// map to slug its files consistently with the other tools).
	const metaDir = await resolveMetaDir(dataRoot, args.date);
	const committedCitiesDir = path.join(DATA_DIR, 'cities');
	const metaCsv = (name) => {
		const fromExport = metaDir ? path.join(metaDir, name) : null;
		if (fromExport && existsSync(fromExport)) return fromExport;
		const committed = path.join(committedCitiesDir, name);
		return existsSync(committed) ? committed : null;
	};
	const citiesCsv = metaCsv('cities.csv');
	const recTableCsv = metaCsv('rec_table.csv');
	const networkMetricsCsv = metaCsv('network_metrics.csv');
	const versionsCsv = metaCsv('versions.csv');
	if (!citiesCsv) {
		throw new Error(
			`Missing cities.csv (looked in export meta/ under ${dataRoot} and ${committedCitiesDir})`
		);
	}

	// Built before any tool is mirrored so fixbikenet/linkbikenet/superblockify names resolve to
	// country-suffixed cityids as they are imported.
	({ map: NAME_TO_CITYID, cityIds: KNOWN_CITYIDS } = buildNameToCityId(
		parseCsv(await readFile(citiesCsv, 'utf8'), ';').rows
	));

	console.log(`[update-data] data root:      ${dataRoot}`);
	console.log(`[update-data] tools:          ${[...exportsByTool.keys()].join(', ')}`);
	console.log(
		`[update-data] meta:           ${metaDir ? path.relative(WWW_ROOT, metaDir) : '(committed fallback)'}`
	);
	if (args.tools) console.log('[update-data] filtered run: cities.json and city CSVs left alone');
	if (args.dryRun) console.log('[update-data] dry-run: no files will be modified');

	await assertExportNotStale(exportsByTool, args.force);

	const allSlugs = new Set();
	const combinedBounds = new Map();
	// Sum of every edge `length`, per tool. Intentionally double-counts edges shared between
	// metric/seed variants — a gross "total km moved through" figure.
	const lengthKmByTool = {};
	// Per-tool bounds, kept apart from the merged `combinedBounds` above: `assertPlacement` needs to
	// know which *single* tool a bad bbox came from, which the merge already throws away.
	const boundsByTool = new Map();
	// Sampled bbox of anything a mirror skipped for being quarantined, so a corrected export can be
	// noticed — see the "stale quarantine" report below.
	const excludedSamplesByTool = new Map();

	for (const [tool, info] of exportsByTool) {
		const acc = { meters: 0 };
		const result = await processTool(tool, info, args.dryRun, acc);
		if (!result) continue;
		lengthKmByTool[tool] = Math.round(acc.meters / 1000);
		for (const slug of result.slugs) allSlugs.add(slug);
		mergeBounds(combinedBounds, result.boundsBySlug);
		boundsByTool.set(tool, result.boundsBySlug);
		if (result.excludedSamples) excludedSamplesByTool.set(tool, result.excludedSamples);
	}

	if (!args.tools) {
		const dataDir = DATA_DIR;
		const entries = existsSync(dataDir) ? await readdir(dataDir, { withFileTypes: true }) : [];
		for (const { name } of entries.filter((e) => e.isDirectory())) {
			if (name === 'cities' || exportsByTool.has(name)) continue;
			console.warn(
				`[warn] data/${name}/ has no source in this export root — its data and its ` +
					`site-stats figure are carried forward from a previous run.`
			);
		}
	}

	if (!args.tools) {
		for (const src of [citiesCsv, recTableCsv, networkMetricsCsv, versionsCsv]) {
			if (!src) continue;
			const dst = path.join(committedCitiesDir, path.basename(src));
			if (path.resolve(src) !== path.resolve(dst)) await copyFile(src, dst, args.dryRun);
		}
		console.log(
			`[update-data] cities CSVs copied to ${path.relative(WWW_ROOT, committedCitiesDir)}/`
		);
	}

	// Runs on filtered runs too — it reads the complete `data/` tree rather than this run's
	// export root, so it cannot produce a partial set.
	const boundaries = await writeSimplifiedBoundaries(args.dryRun);
	console.log(
		`[update-data] boundaries: ${boundaries.count} cities → ${path.relative(WWW_ROOT, boundaries.outDir)}/, ` +
			`index → ${path.relative(WWW_ROOT, boundaries.indexPath)}`
	);

	// Before anything below rewrites the committed JSON: a misplaced tool result must abort the run
	// rather than poison cities.json/data-files.json with it. Boundaries above are unaffected by a
	// misplacement (they come from the export's own, normally-correct city_boundary file), so they
	// are already right even on a failing run.
	assertPlacement(boundsByTool, boundaries.bboxBySlug);
	reportStaleQuarantines(excludedSamplesByTool, boundaries.bboxBySlug);

	// Same rationale as boundaries: reads the complete data/ tree, so filtered runs stay whole.
	const manifest = await writeDataFilesManifest(args.dryRun);
	console.log(
		`[update-data] data-files.json: ${manifest.total} files across ${manifest.toolCount} tools → ${path.relative(WWW_ROOT, manifest.outPath)}`
	);

	// Export-wide, like the manifest above, so a `--tool` run keeps it whole.
	if (versionsCsv) {
		const versions = await writeToolVersions(versionsCsv, args.dryRun);
		console.log(
			`[update-data] tool-versions.json: ${versions.count} tools → ${path.relative(WWW_ROOT, versions.outPath)}`
		);
		if (versions.unknown.length > 0) {
			console.warn(
				`[warn] versions.csv names tools missing from tools.json: ${versions.unknown.join(', ')}`
			);
		}
	} else {
		console.warn('[warn] no versions.csv in the export meta/ — tool-versions.json left as is.');
	}

	// A filtered run sees only part of the city list, so rebuilding cities.json from it would
	// drop every city the filtered tools do not cover.
	let unmatched = { cities: [], recTable: [] };
	let citiesWithoutData = [];
	if (args.tools) {
		console.log('[update-data] cities.json: skipped (filtered run)');
	} else {
		const built = await buildCitiesJson({
			slugs: [...allSlugs].sort(),
			boundsBySlug: combinedBounds,
			citiesCsvPath: citiesCsv,
			recTableCsvPath: recTableCsv,
			networkMetricsCsvPath: networkMetricsCsv,
			dryRun: args.dryRun
		});
		unmatched = built.unmatched;
		citiesWithoutData = built.citiesWithoutData;
		console.log(
			`[update-data] cities.json: ${built.cities.length} cities → ${path.relative(WWW_ROOT, built.outPath)}`
		);
	}

	// Carried forward per tool, so the published total does not silently drop a tool
	// that happens to be absent from the export root this run (e.g. a --tool-filtered run).
	const siteStatsPath = path.resolve(WWW_ROOT, 'src/lib/data/site-stats.json');
	const previous = existsSync(siteStatsPath)
		? JSON.parse(await readFile(siteStatsPath, 'utf8'))
		: {};
	// `networkLengthKmByAlgorithm` is the pre-rename key. Reading it too costs nothing and keeps a
	// stale site-stats.json from silently zeroing the carried-forward tools — the failure would
	// surface only as a wrong headline number on the landing page.
	const networkLengthKmByTool = {
		...(previous.networkLengthKmByTool ?? previous.networkLengthKmByAlgorithm ?? {}),
		...lengthKmByTool
	};
	const siteStats = {
		totalNetworkLengthKm: Object.values(networkLengthKmByTool).reduce((a, b) => a + b, 0),
		networkLengthKmByTool
	};
	if (!args.dryRun) {
		const prettier = await import('prettier');
		const config = (await prettier.resolveConfig(siteStatsPath)) ?? {};
		const formatted = await prettier.format(JSON.stringify(siteStats), {
			...config,
			filepath: siteStatsPath
		});
		await writeFile(siteStatsPath, formatted, 'utf8');
	}
	for (const [tool, km] of Object.entries(networkLengthKmByTool)) {
		const carried = tool in lengthKmByTool ? '' : ' (carried forward)';
		console.log(`[update-data]   ${tool}: ${km.toLocaleString('en-US')} km${carried}`);
	}
	console.log(
		`[update-data] site-stats.json: ${siteStats.totalNetworkLengthKm.toLocaleString('en-US')} km network length → ${path.relative(WWW_ROOT, siteStatsPath)}`
	);

	if (UNRESOLVED_CITY_NAMES.size > 0) {
		console.warn(
			`[warn] No cities.csv cityid for (fell back to bare slug): ${[...UNRESOLVED_CITY_NAMES].sort().join(', ')}`
		);
	}
	if (unmatched.cities.length > 0) {
		console.warn(`[warn] No cities.csv row for data slug: ${unmatched.cities.join(', ')}`);
	}
	if (unmatched.recTable.length > 0) {
		console.warn(`[warn] No rec_table.csv row for: ${unmatched.recTable.join(', ')}`);
	}
	if (citiesWithoutData.length > 0) {
		console.warn(
			`[warn] ${citiesWithoutData.length} cities.csv rows have no data on disk (not shown in the site).`
		);
	}

	const toolCount = await verifyToolsJson();
	console.log(`[update-data] tools.json: ${toolCount} entries validated`);

	console.log('[update-data] done.');
}

main().catch((err) => {
	console.error(`[update-data] ERROR: ${err.message}`);
	process.exit(1);
});
