#!/usr/bin/env node
// Build the self-hosted basemap archive from a Protomaps planet build.
//
//   pnpm basemap:build                       # dry run: report the size, download nothing
//   pnpm basemap:build -- --run              # extract for real (~45 GB, well under an hour)
//   pnpm basemap:build -- --run --date 20260902    # pin a specific planet build
//
// One step: pull the region below at z0-15 out of the 137 GB remote planet build over HTTP range
// requests. Only the bytes we keep cross the network, and the output is byte-for-byte Protomaps'
// own tiles — same Hilbert ordering, run-length encoding, bounds and metadata.
//
// We deliberately do NOT post-process the archive to strip the source-layers the style ignores
// (`pois` above all). It looks like an easy win and is not. Measured across every tile in a bbox,
// dropping them saves only 7-10% (Amsterdam 30.7 -> 28.7 MB, London 129.7 -> 117.2 MB) — a single
// pois-dense city-centre tile suggests far more, which is exactly the sampling trap. Against that,
// tippecanoe's tile-join costs ~4 hours per rebuild, resets the archive bounds to the whole world,
// and inflates the PMTiles directory ~7x by breaking the run-length encoding that collapses runs
// of identical ocean tiles. See www/DEPLOY_TILES.md for the measurements.
import { statfs } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBasemapWorkDir, run } from './server-config.mjs';

// Europe plus near neighbours, and the three Macaronesian archipelagos (Madeira, Canaries,
// Azores). A MultiPolygon rather than one bbox: a bbox reaching south to the Canaries (lat 27.5)
// would drag in the whole North African and Levantine coast for nothing. Funchal — the only city
// in the catalog outside the old `-25,34,40,72` crop — is in the Madeira box. Measured cost of
// all three archipelagos at z0-15: 98 MB against a ~46 GB archive.
const REGION_FILE = fileURLToPath(new URL('./basemap-region.geojson', import.meta.url));

/** Envelope of every ring in the region file — what `pmtiles show` should report as bounds. */
function regionEnvelope(file) {
	const rings = JSON.parse(readFileSync(file, 'utf8')).coordinates.flat(2);
	const lon = rings.map(([x]) => x);
	const lat = rings.map(([, y]) => y);
	return [Math.min(...lon), Math.min(...lat), Math.max(...lon), Math.max(...lat)].join(',');
}

// Protomaps builds the planet no deeper than this. MAX_ZOOM in render-config.js is 17; those last
// two levels come from MapLibre overzooming z15, exactly as api.protomaps.com did.
const MAXZOOM = 15;

const REQUIRED_FREE_GB = 60;

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = !args.includes('--run');
const pinnedDate = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

if (pinnedDate && !/^\d{8}$/.test(pinnedDate)) {
	console.error(`[basemap] --date must be YYYYMMDD, got: ${pinnedDate}`);
	process.exit(1);
}

const workDir = getBasemapWorkDir();

function buildUrl(stamp) {
	return `https://build.protomaps.com/${stamp}.pmtiles`;
}

// Protomaps keeps only about a week of daily builds, so the newest available date has to be
// discovered rather than computed. Walk back from today until one responds.
async function latestBuildDate() {
	const today = new Date();
	for (let back = 0; back < 10; back++) {
		const d = new Date(today);
		d.setUTCDate(d.getUTCDate() - back);
		const stamp = d.toISOString().slice(0, 10).replaceAll('-', '');
		const res = await fetch(buildUrl(stamp), { method: 'HEAD' });
		if (res.ok) return stamp;
	}
	console.error(
		`[basemap] No planet build found in the last 10 days.\n` +
			`          Check https://maps.protomaps.com/builds/ and pass --date.`
	);
	process.exit(1);
}

const { bavail, bsize } = await statfs(workDir);
const freeGb = (bavail * bsize) / 1e9;
console.log(`[basemap] work dir: ${workDir} (${freeGb.toFixed(0)} GB free)`);
if (!dryRun && freeGb < REQUIRED_FREE_GB) {
	console.error(`[basemap] Need ~${REQUIRED_FREE_GB} GB free. Free up space or use a larger disk.`);
	process.exit(1);
}

const date = pinnedDate ?? (await latestBuildDate());
const planet = buildUrl(date);
const out = path.join(workDir, `basemap-${date}.pmtiles`);
const envelope = regionEnvelope(REGION_FILE);

console.log(`[basemap] source: ${planet}`);
console.log(
	`[basemap] region: ${path.basename(REGION_FILE)} (envelope ${envelope}) · z0-${MAXZOOM}`
);
console.log(`[basemap] output: ${out}`);
if (dryRun) console.log(`[basemap] DRY RUN — pass --run to execute.\n`);

await run('pmtiles', [
	'extract',
	planet,
	out,
	`--region=${REGION_FILE}`,
	`--maxzoom=${MAXZOOM}`,
	'--download-threads=8',
	...(dryRun ? ['--dry-run'] : [])
]);

if (dryRun) {
	console.log(`\n[basemap] dry run complete — nothing written. Re-run with --run.`);
	process.exit(0);
}

// Verify before this ever reaches the server.
await run('pmtiles', ['show', out]);
await run('pmtiles', ['verify', out]);

console.log(
	`\n[basemap] done — ${(statSync(out).size / 1e9).toFixed(1)} GB  ${path.basename(out)}\n\n` +
		`          Check the pmtiles show output above: max zoom ${MAXZOOM}, bounds ${envelope},\n` +
		`          clustered true. Then set PUBLIC_BASEMAP_URL and run \`pnpm deploy:basemap\`.`
);
