#!/usr/bin/env node
// Upload the basemap archive built by `pnpm basemap:build` to the server's tiles dir.
//
//   pnpm deploy:basemap                       # upload the newest basemap-*.pmtiles
//   pnpm deploy:basemap -- --dry-run          # show what rsync would transfer
//   pnpm deploy:basemap -- --date 20260902    # pick a specific archive
//
// The target (DEPLOY_TILES_PATH) is deliberately NOT under the website dir: `pnpm deploy:site`
// syncs that with --delete and would erase a 46 GB archive on the next site deploy.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getBasemapWorkDir, getDeployConfig, run, withTrailingSlash } from './server-config.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const pinnedDate = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

const workDir = getBasemapWorkDir();
const { host, tilesPath } = getDeployConfig();

const archives = readdirSync(workDir)
	.filter((f) => /^basemap-\d{8}\.pmtiles$/.test(f))
	.sort();
if (!archives.length) {
	console.error(
		`[basemap] No basemap-*.pmtiles in ${workDir}.\n` +
			`          Run \`pnpm basemap:build -- --run\` first.`
	);
	process.exit(1);
}

const name = pinnedDate ? `basemap-${pinnedDate}.pmtiles` : archives.at(-1);
const src = path.join(workDir, name);
if (!archives.includes(name)) {
	console.error(`[basemap] ${name} not found. Available: ${archives.join(', ')}`);
	process.exit(1);
}

const sizeGb = statSync(src).size / 1e9;
console.log(`[basemap] uploading ${name} (${sizeGb.toFixed(1)} GB) to ${host}:${tilesPath}`);
console.log(
	`[basemap] this takes hours on a home connection — --partial resumes an interrupted run.`
);

// --inplace rather than rsync's default write-to-temp-then-rename: the tiles now live on a
// dedicated volume (~50 GB free beside the ~46 GB archive; see DEPLOY_TILES.md "Storage volume"),
// which still cannot hold two full copies. The trade-off is that the file is briefly inconsistent
// mid-transfer, so re-uploads want a quiet window. No --delete: older dated archives are pruned
// by hand once the new PUBLIC_BASEMAP_URL is live and verified.
const rsyncArgs = ['-a', '--inplace', '--partial', '--progress', '-e', 'ssh'];
if (dryRun) rsyncArgs.push('--dry-run');
rsyncArgs.push(src, `${host}:${withTrailingSlash(tilesPath)}`);
await run('rsync', rsyncArgs);

console.log(
	`\n[basemap] done.\n` +
		`          Set PUBLIC_BASEMAP_URL to https://tiles.bikenetkit.org/${name}\n` +
		`          then \`pnpm deploy:site\`. See www/DEPLOY_TILES.md for the nginx block.`
);
