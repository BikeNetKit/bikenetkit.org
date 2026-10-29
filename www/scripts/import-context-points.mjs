#!/usr/bin/env node
/**
 * Context points for growbikenet's rail and school focus modes: the places themselves, drawn as
 * symbols under the seed dots.
 *
 * Michael's OSM extracts (one `<cityid>.geojson` per city and kind) are not part of any tool
 * export, so `update-data` never sees them. They ship next to it on the server, in
 * `dataexports/context/`, and `pnpm pull-data` runs this after pulling them. It turns each file
 * into plain points under `www/data/context/<kind>/<cityid>.geojson` and writes the committed
 * `src/lib/data/context-points.json` manifest the app gates its fetch on, so an uncovered city
 * never costs a 404.
 *
 *   pnpm import:context                          # reads <pull root>/dataexports/context
 *   pnpm import:context -- --src <dir>           # a local copy, to test an edit before uploading it
 *   pnpm import:context -- --dry-run             # report only, write nothing
 *
 * The source carries no properties at all, and the schools are mostly building footprints. A
 * polygon becomes the area-weighted centroid of its largest outer ring; a point that falls inside
 * one of the same city's polygons is the same school tagged twice (node + building) and is dropped.
 * Coordinates are rounded to 5 dp (~1 m).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextSourceDir } from './server-config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW_ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(WWW_ROOT, 'data', 'context');
const MANIFEST_PATH = path.join(WWW_ROOT, 'src/lib/data/context-points.json');

const KINDS = { rail: 'rail_stations_geojson', school: 'schools_geojson' };
const DP = 1e5;

const args = { src: contextSourceDir(), dryRun: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--src') args.src = path.resolve(argv[++i]);
	else if (argv[i] === '--dry-run') args.dryRun = true;
	else if (argv[i] !== '--') {
		console.error(
			`Unknown argument: ${argv[i]}\nUsage: import-context-points [--src <dir>] [--dry-run]`
		);
		process.exit(1);
	}
}

for (const dir of [args.src, ...Object.values(KINDS).map((d) => path.join(args.src, d))]) {
	if (!existsSync(dir)) {
		console.error(`[import-context] source not found: ${dir} — run \`pnpm pull-data\` first.`);
		process.exit(1);
	}
}

/** @param {number[][]} ring */
function ringArea(ring) {
	let a = 0;
	for (let i = 0; i < ring.length - 1; i++)
		a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
	return a / 2;
}

/** @param {number[][]} ring */
function ringCentroid(ring) {
	let a = 0;
	let x = 0;
	let y = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const [x1, y1] = ring[i];
		const [x2, y2] = ring[i + 1];
		const f = x1 * y2 - x2 * y1;
		a += f;
		x += (x1 + x2) * f;
		y += (y1 + y2) * f;
	}
	return a ? [x / (3 * a), y / (3 * a)] : ring[0];
}

/** @param {number} x @param {number} y @param {number[][]} ring */
function inRing(x, y, ring) {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/** @param {{ type: string, coordinates: any }} geom */
function outerRings(geom) {
	if (geom.type === 'Polygon') return [geom.coordinates[0]];
	if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]);
	return [];
}

/** @param {number[]} c */
const round = (c) => [Math.round(c[0] * DP) / DP, Math.round(c[1] * DP) / DP];

/** @param {string} file */
function convert(file) {
	const { features } = JSON.parse(readFileSync(file, 'utf8'));
	const rings = features.flatMap((f) => (f.geometry ? outerRings(f.geometry) : []));
	const points = [];
	let duplicates = 0;
	for (const { geometry } of features) {
		if (!geometry) continue;
		if (geometry.type === 'Point') {
			const [x, y] = geometry.coordinates;
			if (rings.some((r) => inRing(x, y, r))) {
				duplicates++;
				continue;
			}
			points.push(round(geometry.coordinates));
		} else {
			const largest = outerRings(geometry).sort(
				(r, s) => Math.abs(ringArea(s)) - Math.abs(ringArea(r))
			)[0];
			if (largest) points.push(round(ringCentroid(largest)));
		}
	}
	return { input: features.length, duplicates, points };
}

/** @type {Record<string, string[]>} */
const manifest = {};
for (const [kind, dir] of Object.entries(KINDS)) {
	const srcDir = path.join(args.src, dir);
	const outDir = path.join(OUT_DIR, kind);
	const files = readdirSync(srcDir).filter((f) => f.endsWith('.geojson'));
	const totals = { files: 0, input: 0, duplicates: 0, output: 0 };
	const cities = [];
	if (!args.dryRun) mkdirSync(outDir, { recursive: true });
	for (const name of files) {
		const city = name.replace(/\.geojson$/, '');
		const { input, duplicates, points } = convert(path.join(srcDir, name));
		totals.files++;
		totals.input += input;
		totals.duplicates += duplicates;
		totals.output += points.length;
		if (!points.length) continue;
		cities.push(city);
		if (args.dryRun) continue;
		const fc = {
			type: 'FeatureCollection',
			features: points.map((coordinates) => ({
				type: 'Feature',
				properties: {},
				geometry: { type: 'Point', coordinates }
			}))
		};
		// pull-data runs this on every pull. Rewriting an unchanged file would bump its mtime, and
		// deploy:data and compress:data would then re-upload and recompress all of them each time.
		const outFile = path.join(outDir, name);
		const json = JSON.stringify(fc);
		if (existsSync(outFile) && readFileSync(outFile, 'utf8') === json) continue;
		writeFileSync(outFile, json);
	}
	cities.sort((a, b) => a.localeCompare(b));
	manifest[kind] = cities;

	let pruned = 0;
	if (existsSync(outDir)) {
		const keep = new Set(cities.map((c) => `${c}.geojson`));
		for (const f of readdirSync(outDir)) {
			if (keep.has(f)) continue;
			pruned++;
			if (!args.dryRun) rmSync(path.join(outDir, f));
		}
	}
	console.log(
		`[import-context] ${kind}: ${totals.files} files, ${totals.input} features in, ` +
			`${totals.duplicates} duplicate points dropped, ${totals.output} points out, ` +
			`${cities.length} cities, ${pruned} stale files ${args.dryRun ? 'would be ' : ''}pruned`
	);
}

if (!args.dryRun) {
	const prettier = await import('prettier');
	const config = (await prettier.resolveConfig(MANIFEST_PATH)) ?? {};
	writeFileSync(
		MANIFEST_PATH,
		await prettier.format(JSON.stringify(manifest), { ...config, filepath: MANIFEST_PATH })
	);
	console.log(`[import-context] manifest → ${path.relative(WWW_ROOT, MANIFEST_PATH)}`);
}
