// Shared helpers for the server data-pull / deploy scripts.
// Auth is key-based SSH (run `ssh-copy-id` once); no secrets live in this repo.
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WWW_ROOT = path.resolve(__dirname, '..');

// The off-repo trees, deliberately *outside* `static/`: everything under `static/` is copied into
// `build/` by Vite on every build, and these two are ~2.4 GB that the deploy then excluded again.
// Served in dev/preview by the `offRepoData` plugin in vite.config.js, and in production from
// data.bikenetkit.org. Import these rather than re-deriving the paths — a missed site is then a
// crash, not a silently empty listing. See www/DEPLOY_DATA.md.
export const DATA_DIR = path.join(WWW_ROOT, 'data');
export const SCREENSHOTS_DIR = path.join(WWW_ROOT, 'screenshots');

// Load www/.env into process.env (Node >=20.12). Vite-managed; safe to call once.
export function loadEnv() {
	const envPath = path.join(WWW_ROOT, '.env');
	if (existsSync(envPath)) process.loadEnvFile(envPath);
}

// Where `pnpm pull-data` mirrors the server export to. Defaults to the maintainer's sibling
// checkout; override with DATA_PULL_ROOT in www/.env for any other layout.
export function getPullRoot() {
	loadEnv();
	return process.env.DATA_PULL_ROOT
		? path.resolve(process.env.DATA_PULL_ROOT)
		: path.resolve(WWW_ROOT, '..', '..', '05_dev_data_pull');
}

// Rail stations, schools and contact links: not part of any tool export, but shipped next to them
// on the server as dataexports/context/, so `pull-data` brings them down with everything else.
export const contextSourceDir = (pullRoot = getPullRoot()) =>
	path.join(pullRoot, 'dataexports', 'context');

// Read + validate the DEPLOY_* config. Missing keys fail loudly with guidance.
export function getDeployConfig() {
	loadEnv();
	const host = process.env.DEPLOY_HOST?.trim();
	const dataPath = process.env.DEPLOY_DATA_PATH?.trim();
	const webPath = process.env.DEPLOY_WEB_PATH?.trim();
	// Optional: target dir for the placeholder build (`pnpm deploy:placeholder`).
	const placeholderWebPath =
		process.env.DEPLOY_PLACEHOLDER_WEB_PATH?.trim() || '~/bikenetkit/placeholder-website/';
	// Optional: target dir for the preview build (`pnpm deploy:preview`), served by the preview
	// vhost (noindex, optionally password-gated). Its own dir, so that it stays separate from what is live.
	const previewWebPath =
		process.env.DEPLOY_PREVIEW_WEB_PATH?.trim() || '~/bikenetkit/preview-website/';
	// Optional: target dir for the basemap archive (`pnpm deploy:basemap`). Deliberately outside
	// the website dir, which `deploy:site` syncs with --delete.
	const tilesPath = process.env.DEPLOY_TILES_PATH?.trim() || '~/bikenetkit/tiles/';
	// Optional: target dir for self-hosted media (`pnpm deploy:media`). Served at
	// tiles.bikenetkit.org/media/; like the tiles archive, kept outside the --delete'd website dir.
	const mediaPath = process.env.DEPLOY_MEDIA_PATH?.trim() || '~/bikenetkit/tiles/media/';
	// Optional: target dir for the off-repo GeoJSON data (`pnpm deploy:data`), served at
	// data.bikenetkit.org. Like the tiles dir, deliberately outside the website dir.
	const dataWebPath = process.env.DEPLOY_DATA_WEB_PATH?.trim() || '~/bikenetkit/data/';
	// Optional: PUBLIC_DATA_URL to bake into a deployed build. www/.env leaves it empty for local
	// dev, where the vite.config.js middleware serves `/data/` from www/data/. A deployed build has
	// no such middleware and never carries the data, so it must point at the data subdomain.
	const publicDataUrl = process.env.DEPLOY_PUBLIC_DATA_URL?.trim() || 'https://data.bikenetkit.org';
	const missing = [];
	if (!host) missing.push('DEPLOY_HOST');
	if (!dataPath) missing.push('DEPLOY_DATA_PATH');
	if (!webPath) missing.push('DEPLOY_WEB_PATH');
	if (missing.length) {
		console.error(
			`[config] Missing in www/.env: ${missing.join(', ')}\n` +
				`         See www/.env.example for the expected keys.`
		);
		process.exit(1);
	}
	return {
		host,
		dataPath,
		webPath,
		placeholderWebPath,
		previewWebPath,
		tilesPath,
		mediaPath,
		dataWebPath,
		publicDataUrl
	};
}

// Working disk for the basemap build (`pnpm basemap:build`). This is an external drive, not a
// repo path: the archive is ~46 GB, which fits on neither the repo nor the laptop's boot volume.
export function getBasemapWorkDir() {
	loadEnv();
	const workDir = process.env.BASEMAP_WORK_DIR?.trim();
	if (!workDir) {
		console.error(
			`[config] Missing in www/.env: BASEMAP_WORK_DIR\n` +
				`         See www/.env.example for the expected keys.`
		);
		process.exit(1);
	}
	if (!existsSync(workDir)) {
		console.error(
			`[config] BASEMAP_WORK_DIR does not exist: ${workDir}\n` +
				`         Is the external drive mounted?`
		);
		process.exit(1);
	}
	return workDir;
}

// macOS ships openrsync as /usr/bin/rsync. On a multi-GB pull it stalls mid-transfer and never
// recovers (2026-10-13: with and without -z), while GNU rsync from Homebrew does not.
export function warnIfOpenrsync(tag) {
	const version = spawnSync('rsync', ['--version'], { encoding: 'utf8' }).stdout ?? '';
	if (!version.includes('openrsync')) return;
	const indent = ' '.repeat(tag.length + 3);
	console.warn(
		`[${tag}] WARNING: \`rsync\` is macOS's openrsync, which stalls on large pulls.\n` +
			`${indent}Install GNU rsync (\`brew install rsync\`) so it comes first on PATH.`
	);
}

// Spawn a command, inheriting stdio. Resolves on exit 0, rejects otherwise.
// `display` shortens any argument that spans lines — `compress-data.mjs` passes a ~90-line shell
// script as a single ssh argument, and echoing it verbatim buries the command and its output.
export function run(cmd, args, opts = {}) {
	const display = [cmd, ...args]
		.map((a) => (a.includes('\n') ? `<${a.split('\n').length}-line script>` : a))
		.join(' ');
	console.log(`\n$ ${display}\n`);
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: 'inherit', cwd: WWW_ROOT, ...opts });
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`\`${display}\` exited with code ${code}`));
		});
	});
}

// Probe for a dev/preview server already listening, so generators can reuse it.
export function isPortOpen(port, host = '127.0.0.1', timeout = 500) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		let done = false;
		const finish = (result) => {
			if (done) return;
			done = true;
			socket.destroy();
			resolve(result);
		};
		socket.setTimeout(timeout);
		socket.once('connect', () => finish(true));
		socket.once('timeout', () => finish(false));
		socket.once('error', () => finish(false));
		socket.connect(port, host);
	});
}

// Tell a vite dev server apart from a built preview. Dev serves the HMR client as
// a module; a build 404s it. Probing that endpoint beats sniffing page HTML, which
// varies by route and SvelteKit version. Static exports must not be captured
// against dev, or `import.meta.env.DEV` UI (MapDebugOverlay) is burned into the
// output. Returns null when the server can't be reached.
export async function isViteDevServer(baseURL, timeout = 5000) {
	try {
		const res = await fetch(new URL('/@vite/client', baseURL), {
			signal: AbortSignal.timeout(timeout)
		});
		return res.ok && (res.headers.get('content-type') ?? '').includes('javascript');
	} catch {
		return null;
	}
}

// rsync needs a trailing slash on the source dir so its *contents* are synced.
export function withTrailingSlash(p) {
	return p.endsWith('/') ? p : `${p}/`;
}
