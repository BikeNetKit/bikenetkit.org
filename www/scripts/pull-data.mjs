#!/usr/bin/env node
// Pull the latest raw tool exports from the server, transform them into www/data +
// www/src/lib/data with update-data, then import the rail stations, schools and contact links.
//
//   pnpm pull-data                 # rsync exports, then transform and import
//   pnpm pull-data -- --dry-run    # show what rsync + the importers would do, write nothing
//   pnpm pull-data -- --date 20260608   # pin a specific export date (forwarded to update-data)
//
// Server source (DEPLOY_DATA_PATH) holds <latest|date>/<tool>/ dirs plus a <latest|date>/meta/
// dir carrying the city metadata CSVs (cities.csv, rec_table.csv, network_metrics.csv). The meta
// now ships with the export, so the pull dir is a complete --data-root for update-data on its own.
// Next to the dated dirs sits context/ — rail stations, schools and contact links, which no tool
// exports and which are not versioned with a tool release. update-data ignores it.
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
	contextSourceDir,
	getDeployConfig,
	getPullRoot,
	run,
	warnIfOpenrsync,
	withTrailingSlash
} from './server-config.mjs';

const PULL_ROOT = getPullRoot();

// Forwarded to update-data (--dry-run, --date, ...); drop the bare `--` pnpm leaves in.
const passthrough = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = passthrough.includes('--dry-run');

const { host, dataPath } = getDeployConfig();

// 1. rsync the raw exports (tool dirs + meta/, plus context/) into <pull>/dataexports/.
// Logged because the destination is created with mkdir -p: on a checkout laid out differently from
// the maintainer's, a wrong default lands silently rather than failing.
console.log(
	`[pull-data] export root: ${PULL_ROOT}${process.env.DATA_PULL_ROOT ? '' : '  (default — set DATA_PULL_ROOT to change)'}`
);
const exportsDst = path.join(PULL_ROOT, 'dataexports');
await mkdir(exportsDst, { recursive: true });

warnIfOpenrsync('pull-data');

// --timeout turns a stalled transfer into an error instead of a silent hang. rsync skips what
// already arrived, so re-running resumes where it stopped.
const rsyncArgs = ['-az', '--delete', '--timeout=120', '--progress', '-e', 'ssh'];
if (dryRun) rsyncArgs.push('--dry-run');
rsyncArgs.push(`${host}:${withTrailingSlash(dataPath)}`, withTrailingSlash(exportsDst));
await run('rsync', rsyncArgs);

// 2. Transform via the existing update-data script, pointed at the pull dir. A dry run on a fresh
// pull dir has nothing to transform — rsync only listed the files — so it stops short of update-data
// instead of failing there.
const hasExport = (await readdir(exportsDst)).some((e) => e === 'latest' || /^\d{8}$/.test(e));
if (dryRun && !hasExport) {
	console.warn(
		`[pull-data] dry run: no export pulled into ${exportsDst} yet, skipping update-data.`
	);
} else {
	await run('node', ['scripts/update-data.mjs', '--data-root', PULL_ROOT, ...passthrough]);
}

// 3. Import the context sources on every pull: deploy:data mirrors www/data/ with --delete, so a
// machine without www/data/context/ would wipe the rail stations and schools from the data host.
// The contacts importer reads cities.json, so it runs after update-data. Only --dry-run is
// forwarded; both importers reject --date and --tool.
const contextDir = contextSourceDir(PULL_ROOT);
if (!existsSync(contextDir)) {
	if (!dryRun) {
		console.error(
			`[pull-data] ${contextDir} is missing: the server export has no context/ dir.\n` +
				`            Upload rail_stations_geojson/, schools_geojson/ and contact_links/ there.`
		);
		process.exit(1);
	}
	console.warn(`[pull-data] dry run: ${contextDir} not pulled yet, skipping the context imports.`);
} else {
	const flags = dryRun ? ['--dry-run'] : [];
	await run('node', ['scripts/import-context-points.mjs', '--src', contextDir, ...flags]);
	await run('node', [
		'scripts/import-contact-links.mjs',
		'--src',
		path.join(contextDir, 'contact_links'),
		...flags
	]);
}

console.log('\n[pull-data] done.');
