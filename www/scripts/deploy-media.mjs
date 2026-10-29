#!/usr/bin/env node
// Upload self-hosted media (the web-encoded intro video) to the server's media dir.
//
//   pnpm deploy:media                              # upload the 1080p + 720p renditions
//   pnpm deploy:media -- --dry-run                 # show what rsync would transfer
//   pnpm deploy:media -- --src path/to/file.mp4    # upload a specific file instead
//
// The target (DEPLOY_MEDIA_PATH, default ~/bikenetkit/tiles/media/) sits under the tiles dir so it
// is served at https://tiles.bikenetkit.org/media/ and is NOT wiped by `pnpm deploy:site --delete`.
// The encoded MP4 lives outside the repo (see www/DEPLOY_TILES.md "Intro video"); only the WebVTT
// caption file is committed, under www/static/media/.
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { getDeployConfig, loadEnv, run, withTrailingSlash, WWW_ROOT } from './server-config.mjs';

// Before mediaDir below: getDeployConfig() loads www/.env, but not until it is called.
loadEnv();

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const pinnedSrc = args.includes('--src') ? args[args.indexOf('--src') + 1] : null;

// Default sources: the web-encoded renditions from the editor's delivery (gitignored working dir).
// The 720p variant is served to narrow viewports via matchMedia (see ProblemSolutionExplainer).
// Defaults to the retired 05_dev_data checkout, which only the maintainer still has; override with
// MEDIA_SRC_DIR, or pass --src <file>.
const mediaDir = process.env.MEDIA_SRC_DIR
	? path.resolve(process.env.MEDIA_SRC_DIR)
	: path.resolve(WWW_ROOT, '../../05_dev_data/media');
const defaultSrcs = ['bikenetkit-intro.mp4', 'bikenetkit-intro-720p.mp4'].map((f) =>
	path.join(mediaDir, f)
);
const sources = pinnedSrc ? [path.resolve(pinnedSrc)] : defaultSrcs.filter((f) => existsSync(f));

if (!sources.length) {
	console.error(
		`[media] No source files found in ${mediaDir}\n` +
			`[media] That path defaults to the maintainer's retired 05_dev_data checkout.\n` +
			`[media] Set MEDIA_SRC_DIR in www/.env, or pass --src <file>.\n` +
			`        Encode them first — see www/DEPLOY_TILES.md "Self-hosted media".`
	);
	process.exit(1);
}

const { host, mediaPath } = getDeployConfig();
for (const s of sources) {
	console.log(`[media] uploading ${path.basename(s)} (${(statSync(s).size / 1e6).toFixed(1)} MB)`);
}

// Ensure the remote media/ dir exists (macOS ships openrsync, which lacks --mkpath).
if (!dryRun) await run('ssh', [host, `mkdir -p ${mediaPath}`]);

// One rsync call for all renditions. No --delete: other media in the dir coexist.
const rsyncArgs = ['-a', '--partial', '--progress', '-e', 'ssh'];
if (dryRun) rsyncArgs.push('--dry-run');
rsyncArgs.push(...sources, `${host}:${withTrailingSlash(mediaPath)}`);
await run('rsync', rsyncArgs);

const uploaded = sources.map((s) => path.basename(s)).join(', ');
console.log(
	`\n[media] done — uploaded: ${uploaded}\n` +
		`        Serve /media/ from the tiles vhost (see www/DEPLOY_TILES.md), then confirm\n` +
		`        PUBLIC_VIDEO_URL resolves (720p is derived as -720p.mp4).`
);
