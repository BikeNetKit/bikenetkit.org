// Shared plumbing for the Playwright-driven exporters: `generate-gif.mjs` and `generate-video.mjs`,
// which step /animation/[tool]/[city] frame by frame, and `generate-hero-clips.mjs` (server lookup,
// argument parsing and `openEncoder` only).
//
// The /animation page contract lives here rather than in either script: the `window.__capture`
// bridge and the `data-*` ready flags have to stay in lockstep across them. The /hero-clip contract
// lives in src/lib/hero-clip/bridge.js instead, because the page imports it too.
//
// `openEncoder` is the ffmpeg plumbing `generate-video.mjs` still carries inline; keep the two in
// step until that script is moved onto it.
import { spawn } from 'node:child_process';
import { WWW_ROOT, isPortOpen } from './server-config.mjs';

/** Set on `<body>` once MapLibre has painted its first frame. */
export const CAPTURE_READY = 'body[data-map-ready="true"]';

/**
 * Set on `<body>` once MapLibre has painted the requested frame. The value is the *frame index*
 * passed to `window.__capture.setFrame()`, not the underlying `ordering` threshold.
 */
export const frameReadySelector = (frameIndex) => `body[data-frame-ready="${frameIndex}"]`;

/**
 * Parse `--key value`, `--key=value` and, for boolean flags, `--key` / `--no-key`.
 *
 * @param {string[]} argv   process.argv.slice(2)
 * @param {Record<string, StringConstructor|NumberConstructor|BooleanConstructor>} flags
 * @param {string} [label]  log prefix used when reporting an unknown flag
 */
export function parseArgs(argv, flags, label = 'args') {
	const parsed = {};
	const toCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		// `pnpm <script> -- --flag` passes the bare `--` separator through to the script.
		if (arg === '--' || !arg.startsWith('--')) continue;

		const raw = arg.slice(2).replace(/=.*$/, '');
		const negated = raw.startsWith('no-') && flags[toCamel(raw.slice(3))] === Boolean;
		const key = toCamel(negated ? raw.slice(3) : raw);
		const cast = flags[key];

		if (!cast) {
			console.error(`[${label}] Unknown flag: ${arg}`);
			process.exit(1);
		}

		if (cast === Boolean) {
			// `--flag` alone means true; `--no-flag` means false; `--flag=false` is honoured too.
			const explicit = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : null;
			parsed[key] = explicit === null ? !negated : explicit !== 'false' && explicit !== '0';
			continue;
		}

		const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
		if (value === undefined) {
			console.error(`[${label}] Missing value for ${arg}`);
			process.exit(1);
		}
		parsed[key] = cast(value);
	}
	return parsed;
}

/**
 * Reuse whatever server is already running — `pnpm dev` (5173) first, then a preview build
 * (4173/4174) — and otherwise start a throwaway dev server on 4174.
 *
 * Unlike `/screenshot`, `/animation` is safe to capture against a dev server: it passes
 * `showDebug={false}`, so the `import.meta.env.DEV` MapDebugOverlay never renders into a frame.
 *
 * @returns {Promise<{ baseURL: string, stop: () => void }>}
 */
export async function resolveServer({ baseUrl = null, label = 'capture' } = {}) {
	if (baseUrl) return { baseURL: baseUrl, stop: () => {} };

	for (const port of [5173, 4173, 4174]) {
		if (await isPortOpen(port)) {
			console.log(`[${label}] using the server already running on :${port}`);
			return { baseURL: `http://localhost:${port}`, stop: () => {} };
		}
	}

	console.log(`[${label}] no server found — starting vite dev on :4174`);
	const child = spawn('pnpm', ['exec', 'vite', 'dev', '--port', '4174', '--strictPort'], {
		cwd: WWW_ROOT,
		stdio: 'ignore'
	});
	for (let i = 0; i < 120; i++) {
		if (await isPortOpen(4174)) break;
		await new Promise((r) => setTimeout(r, 500));
	}
	return { baseURL: 'http://localhost:4174', stop: () => child.kill() };
}

/**
 * Spawn ffmpeg reading PNG frames on stdin, with the plumbing a frame-stepping exporter needs:
 * backpressure-aware writes, stderr captured for the error message, and a `finish()` that never
 * rejects on its own — a frame loop that throws first must surface its own error, not ffmpeg's.
 *
 * @param {string[]} args  ffmpeg arguments after the input (`-i -` is supplied here)
 * @param {{ fps: number, label?: string }} opts
 */
export function openEncoder(args, { fps, label = 'encode' }) {
	const ffmpeg = spawn(
		'ffmpeg',
		[
			'-y',
			'-loglevel',
			'error',
			'-f',
			'image2pipe',
			'-framerate',
			String(fps),
			'-c:v',
			'png',
			'-i',
			'-',
			...args
		],
		{ stdio: ['pipe', 'inherit', 'pipe'] }
	);

	let stderr = '';
	/** @type {Error | null} */
	let error = null;
	ffmpeg.stderr.on('data', (chunk) => (stderr += chunk));
	// The frame loop can still be writing when ffmpeg dies; without this the EPIPE lands as an
	// unhandled 'error' event.
	ffmpeg.stdin.on('error', (err) => (error ??= err));
	const closed = new Promise((resolve) => {
		ffmpeg.on('error', (err) => {
			error ??= err;
			resolve(undefined);
		});
		ffmpeg.on('close', (code, signal) => {
			if (code !== 0)
				error ??= new Error(
					`[${label}] ffmpeg exited with ${signal ? `signal ${signal}` : `code ${code}`}` +
						(stderr.trim() ? `\n${stderr.trim()}` : '')
				);
			resolve(undefined);
		});
	});

	return {
		/** @param {Buffer} buf */
		write: (buf) =>
			new Promise((resolve) => {
				if (error) return resolve(undefined);
				if (ffmpeg.stdin.write(buf)) resolve(undefined);
				else ffmpeg.stdin.once('drain', () => resolve(undefined));
			}),
		/** Close stdin and wait for ffmpeg; throws whatever went wrong on the way. */
		finish: async () => {
			ffmpeg.stdin.end();
			await closed;
			if (error) throw error;
		},
		abort: () => ffmpeg.kill('SIGKILL')
	};
}
