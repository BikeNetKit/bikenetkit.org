#!/usr/bin/env node
// Upload the off-repo GeoJSON data (data/) to the server dir served at data.bikenetkit.org.
//
//   pnpm deploy:data              # rsync data/ -> server data dir
//   pnpm deploy:data -- --dry-run # show what rsync would transfer, change nothing
//   pnpm deploy:data -- --force   # mirror screenshots/ exactly (with --delete) even when sparse
//
// The target (DEPLOY_DATA_WEB_PATH) is deliberately NOT under the website dir: `pnpm deploy:site`
// syncs that with --delete and would erase the data on the next site deploy — the same reason the
// basemap archive lives in its own dir. See www/DEPLOY_DATA.md for the nginx block (gzip + CORS).
//
// screenshots/ is generated locally over hours (pnpm generate:screenshots), unlike
// data/ which is pulled from the server export. A screenshot sync that used --delete
// unconditionally would prune the server's complete set down to whatever partial set happens to
// be on disk locally. screenshot-coverage.mjs reports coverage against the datasets the committed
// manifest lists (src/lib/data/data-files.json); below 90% the screenshot sync drops --delete
// (purely additive) unless --force.
//
// data/context/ (rail stations and schools) does not come from the tool export but from the
// importers `pnpm pull-data` runs. A machine without it would delete them from the data host on the
// --delete sync below, so a missing or empty context/ aborts before anything transfers.
//
// Both rsyncs exclude .DS_Store (same as scripts/deploy.mjs), since Finder can drop one into
// either static/ tree during local generation/review.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
	WWW_ROOT,
	DATA_DIR,
	SCREENSHOTS_DIR,
	getDeployConfig,
	run,
	withTrailingSlash
} from './server-config.mjs';
import { screenshotCoverage, formatCoverage } from './screenshot-coverage.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const SPARSE_RATIO = 0.9;

const src = DATA_DIR;
if (!existsSync(src)) {
	console.error(
		`[data] ${src} does not exist.\n` + `       Populate it with \`pnpm pull-data\` first.`
	);
	process.exit(1);
}

const contextDir = path.join(src, 'context');
if (!existsSync(contextDir) || readdirSync(contextDir).length === 0) {
	console.error(
		`[data] ${path.relative(WWW_ROOT, contextDir)}/ is missing or empty — uploading would delete\n` +
			`       the rail stations and schools from the data host. Run \`pnpm pull-data\` first.`
	);
	process.exit(1);
}

// Report screenshot coverage before the long transfers, so the verdict is not buried in
// --progress output (it is repeated in the closing summary).
const coverage = screenshotCoverage();
console.log(formatCoverage(coverage));

const sparse = coverage.ratio < SPARSE_RATIO;
const missing = coverage.expected - coverage.present;
if (coverage.present === 0) {
	console.warn(
		`[data] WARNING: no screenshots generated locally — the screenshot sync is skipped.\n` +
			`       Run \`pnpm generate:screenshots\` (needs a production build).`
	);
} else if (sparse && !force) {
	console.warn(
		`[data] WARNING: local screenshots look sparsely populated (${missing} missing).\n` +
			`       Syncing WITHOUT --delete so the server's existing screenshots are kept.\n` +
			`       Finish \`pnpm generate:screenshots\`, or pass --force to mirror exactly.`
	);
} else if (sparse && force) {
	console.warn(
		`[data] WARNING: local screenshots look sparsely populated (${missing} missing), but ` +
			`--force is set.\n` +
			`       Syncing WITH --delete — the server's screenshots will mirror this partial set.`
	);
} else if (missing) {
	console.log(`[data] note: ${missing} screenshot(s) missing — syncing the rest.`);
}

const { host, dataWebPath } = getDeployConfig();
console.log(`[data] syncing ${path.relative(WWW_ROOT, src)}/ to ${host}:${dataWebPath}`);

// --delete prunes files for cities/layers that left the local tree, keeping the served data an
// exact mirror of data/. Safe here because this dir is dedicated to the data and only
// deploy:data writes to it (unlike the shared tiles volume, which is pruned by hand).
// `--exclude=screenshots` keeps this sync from deleting the sibling screenshots dir pushed below.
//
// The `*.gz`/`*.br` excludes exist for the same reason: `pnpm compress:data` writes those on the
// server (they are derived, and never exist locally), so without the exclude every --delete would
// wipe the whole pre-compressed set. Excluded from the delete, an orphan can outlive its source —
// compress:data prunes those on its next run.
const rsyncArgs = [
	'-a',
	'--delete',
	'--exclude=screenshots',
	'--exclude=.DS_Store',
	'--exclude=*.gz',
	'--exclude=*.br',
	'--partial',
	'--progress',
	'-e',
	'ssh'
];
if (dryRun) rsyncArgs.push('--dry-run');
rsyncArgs.push(withTrailingSlash(src), `${host}:${withTrailingSlash(dataWebPath)}`);
await run('rsync', rsyncArgs);

// Per-dataset screenshots ride the same host under /screenshots (see tool-paths.ts `screenshotFor`,
// which resolves them to `${PUBLIC_DATA_URL}/screenshots/...`). Skipped if none have been generated
// — see the coverage report above for why, and the --delete gating for the sparse case.
// `coverage.present === 0` implies `screenshots/` is absent or empty (screenshotCoverage()
// can only find a .webp if the tool dir exists), so there is no separate existsSync case to handle.
const screenshotsSrc = SCREENSHOTS_DIR;
if (coverage.present > 0) {
	const dst = `${withTrailingSlash(dataWebPath)}screenshots/`;
	const prune = force || !sparse;
	console.log(
		`[data] syncing screenshots/ to ${host}:${dst}` + (prune ? '' : ' (additive, no --delete)')
	);
	const shotArgs = [
		'-a',
		...(prune ? ['--delete'] : []),
		'--exclude=.DS_Store',
		'--partial',
		'--progress',
		'-e',
		'ssh'
	];
	if (dryRun) shotArgs.push('--dry-run');
	shotArgs.push(withTrailingSlash(screenshotsSrc), `${host}:${dst}`);
	await run('rsync', shotArgs);
}
// else: warned above. An empty/near-empty tree has nothing to add and must not prune the server.

const screenshotsStatus =
	coverage.present === 0
		? ' — NOT synced'
		: sparse
			? force
				? ' — force-mirrored (partial set, --delete)'
				: ' — synced additively (no --delete)'
			: '';
console.log(
	`\n[data] done.\n` +
		`       screenshots: ${coverage.present}/${coverage.expected}${screenshotsStatus}\n` +
		`       Run \`pnpm compress:data\` to refresh the pre-compressed .gz/.br siblings.\n` +
		`       Ensure PUBLIC_DATA_URL=https://data.bikenetkit.org in deployed builds.\n` +
		`       See www/DEPLOY_DATA.md for the nginx block (gzip + CORS).`
);
