#!/usr/bin/env node
// Pull the screenshots and per-city OG cards the data host serves into www/screenshots/.
//
//   pnpm pull-screenshots              # rsync the server's set, then report coverage
//   pnpm pull-screenshots -- --dry-run # show what rsync would fetch, change nothing
//
// www/screenshots/ is generated locally over hours and gitignored, so a fresh checkout has none of
// it. Without it, `generate:og-cards` rewrites og-cards.json from the few cards that exist locally,
// and `deploy:data` measures coverage against an empty tree. This is the reverse of the screenshot
// half of deploy-data.mjs, and only ever adds: no --delete, so images generated but not uploaded
// yet survive, and --update keeps a local file that is newer than the server's copy.
import {
	SCREENSHOTS_DIR,
	getDeployConfig,
	run,
	warnIfOpenrsync,
	withTrailingSlash
} from './server-config.mjs';
import { screenshotCoverage, formatCoverage } from './screenshot-coverage.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');

const { host, dataWebPath } = getDeployConfig();
warnIfOpenrsync('screenshots');

// --timeout turns a stalled transfer into an error instead of a silent hang; a re-run resumes.
const rsyncArgs = [
	'-a',
	'--update',
	'--exclude=.DS_Store',
	'--partial',
	'--progress',
	'--timeout=120',
	'-e',
	'ssh'
];
if (dryRun) rsyncArgs.push('--dry-run');
rsyncArgs.push(
	`${host}:${withTrailingSlash(dataWebPath)}screenshots/`,
	withTrailingSlash(SCREENSHOTS_DIR)
);
await run('rsync', rsyncArgs);

console.log(`\n${formatCoverage(screenshotCoverage())}`);
