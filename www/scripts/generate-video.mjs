#!/usr/bin/env node
// Render a 4K video of an ordered build-up (growbikenet / linkbikenet) — basemap and data layer
// only: no labels, no legend, no HUD, no playback bar, no nav control.
//
//   pnpm generate:video                                       # copenhagen, 3840×2160
//   pnpm generate:video --city podgorica
//   pnpm generate:videos                                      # both target cities
//   pnpm generate:video --city paris --type rail --variant default --labels
//   pnpm generate:video --codec prores --duration 30 --fps 60
//   pnpm generate:video --width 960 --height 540 --scale 1 --duration 4    # fast smoke test
//
// Frames are stepped deterministically through /animation/[tool]/[city] (each waits for
// MapLibre's `idle`) and piped straight into ffmpeg — a 4K run is hundreds of frames at several
// megabytes each, which is gigabytes of PNGs if they touch disk.
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { WWW_ROOT } from './server-config.mjs';
import { CAPTURE_READY, frameReadySelector, parseArgs, resolveServer } from './capture-common.mjs';

const FLAGS = {
	tool: String,
	city: String,
	metric: String,
	type: String,
	variant: String,
	width: Number,
	height: Number,
	scale: Number,
	fps: Number,
	duration: Number,
	perStep: Boolean,
	hold: Number,
	padding: Number,
	weight: Number,
	labels: Boolean,
	attribution: Boolean,
	seeds: Boolean,
	codec: String,
	idleTimeout: Number,
	settle: Number,
	all: Boolean,
	baseUrl: String,
	out: String,
	framesDir: String
};

const opts = {
	tool: 'growbikenet',
	city: 'copenhagen_dk',
	metric: 'betweenness',
	type: 'grid',
	variant: 'from_bikenw',
	// CSS pixels. MapLibre sizes line widths in CSS px and scales them by zoom, so rendering at a
	// 3840-wide *viewport* would fit the same bounds ~2.3 zoom stops higher and leave the network
	// as hairlines. 1920 CSS px at deviceScaleFactor 2 gives a true 3840×2160 backing store with
	// the weights the map was designed around.
	width: 1920,
	height: 1080,
	scale: 2,
	fps: 30,
	duration: 24,
	// One output frame per build step, ignoring --duration: the run lasts `steps / fps` seconds.
	// Nothing is subsampled and nothing is held, so every step is on screen for exactly one frame.
	perStep: false,
	hold: 2,
	padding: 60,
	weight: 1,
	labels: false,
	// Off so the frame is nothing but basemap and data. The basemap is OSM/ODbL via Protomaps, so
	// wherever the video is published the credit still has to appear — in the edit, an end card or
	// the description. `--attribution` puts it back in-frame.
	attribution: false,
	seeds: true,
	codec: 'h264',
	// A step that adds nothing visible never fires `idle`. `stepFor` dedupe removes most of those;
	// this caps the rest at something that cannot dominate a 700-frame run.
	idleTimeout: 2000,
	settle: 2500,
	all: false,
	baseUrl: null,
	out: null,
	framesDir: null,
	...parseArgs(process.argv.slice(2), FLAGS, 'video')
};

/** Cities rendered by `--all` / `pnpm generate:videos`. */
const TARGETS = ['copenhagen', 'podgorica'];

const CODECS = {
	h264: {
		ext: 'mp4',
		args: [
			'-c:v',
			'libx264',
			'-preset',
			'slow',
			'-crf',
			'16',
			'-pix_fmt',
			'yuv420p',
			'-movflags',
			'+faststart'
		]
	},
	// 422 HQ — for editing and grading, not for delivery. Expect multiple gigabytes.
	prores: { ext: 'mov', args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'] },
	vp9: {
		ext: 'webm',
		args: ['-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-pix_fmt', 'yuv420p']
	}
};

function fail(message) {
	console.error(`[video] ${message}`);
	process.exit(1);
}

// ---- preflight ------------------------------------------------------------------------------

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0)
	fail('ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`).');

const codec = CODECS[opts.codec];
if (!codec) fail(`Unknown --codec ${opts.codec}. Known: ${Object.keys(CODECS).join(', ')}.`);

const outW = opts.width * opts.scale;
const outH = opts.height * opts.scale;

// MapLibre's `maxCanvasSize` defaults to [4096, 4096] and silently *downscales* past it — the
// video would encode at the requested size while carrying less detail than it claims.
if (outW > 4096 || outH > 4096)
	fail(
		`${outW}×${outH} exceeds MapLibre's default maxCanvasSize [4096, 4096], which would be ` +
			`silently downscaled. Lower --scale or --width/--height.`
	);
if (outW % 2 || outH % 2) fail(`${outW}×${outH} must have even dimensions for yuv420p.`);
if (opts.duration <= 0 || opts.fps <= 0) fail('--duration and --fps must both be positive.');

const cities = opts.all ? TARGETS : [opts.city];
if (opts.all && opts.out) fail('--out names a single file; it cannot be combined with --all.');

// ---- render ---------------------------------------------------------------------------------

const { baseURL, stop } = await resolveServer({ baseUrl: opts.baseUrl, label: 'video' });
const browser = await chromium.launch();

try {
	for (const city of cities) await renderCity(city);
} finally {
	await browser.close();
	stop();
}

async function renderCity(city) {
	const outPath = path.resolve(
		WWW_ROOT,
		opts.out ??
			path.join(
				'exports',
				`${opts.tool}-${city}-${opts.metric}-${opts.type}-${opts.variant}-${outH}p.${codec.ext}`
			)
	);
	mkdirSync(path.dirname(outPath), { recursive: true });
	if (opts.framesDir) mkdirSync(path.resolve(WWW_ROOT, opts.framesDir), { recursive: true });

	const page = await browser.newPage({
		viewport: { width: opts.width, height: opts.height },
		deviceScaleFactor: opts.scale
	});

	try {
		const query = new URLSearchParams({
			width: String(opts.width),
			height: String(opts.height),
			metric: opts.metric,
			type: opts.type,
			variant: opts.variant,
			seeds: opts.seeds ? '1' : '0',
			labels: opts.labels ? '1' : '0',
			attribution: opts.attribution ? '1' : '0',
			padding: String(opts.padding),
			weight: String(opts.weight)
		});
		const url = `${baseURL}/animation/${opts.tool}/${city}?${query}`;
		console.log(`[video] ${url}`);

		await page.goto(url, { waitUntil: 'networkidle' });
		// A cold 4K start has to compile the style, fetch the dataset and warm the tile cache.
		await page.waitForSelector(CAPTURE_READY, { timeout: 120_000 });
		// Let the basemap tiles and glyphs settle so every frame shares the same background.
		await page.waitForTimeout(opts.settle);

		// A run against `vite dev` dies if anything in the repo is edited mid-render: HMR reloads
		// the page, `window.__capture` goes away and the playhead resets. Catch it here rather
		// than surfacing Playwright's "Execution context was destroyed" ten minutes in.
		let navigated = false;
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) navigated = true;
		});
		const assertLive = () => {
			if (navigated)
				throw new Error(
					`${city}: the page reloaded mid-render — an edit under www/ probably triggered an ` +
						`HMR reload. Re-run without touching the repo, or point --base-url at a ` +
						`\`pnpm preview\` build.`
				);
		};

		// `total` counts frames, and frame 0 is the starting condition (existing network only), so
		// the dataset's build steps are `total - 1`.
		const total = await page.evaluate(() => window.__capture.total());
		const steps = total - 1;
		if (steps < 2) throw new Error(`${city}: ${steps} ordered step(s) — nothing to animate.`);

		// `--per-step` renders `total` frames, so the frame-index mapping below is the identity and
		// every build step gets exactly one frame.
		const count = opts.perStep ? total : Math.max(2, Math.round(opts.duration * opts.fps));
		const holdFrames = Math.max(0, Math.round(opts.hold * opts.fps));
		console.log(
			`[video] ${city}: ${steps} build steps → ${count} + ${holdFrames} frames ` +
				`@ ${opts.fps}fps${opts.perStep ? ' (one frame per step)' : ''}, ` +
				`${outW}×${outH} ${opts.codec}`
		);

		const ffmpeg = spawn(
			'ffmpeg',
			[
				'-y',
				'-loglevel',
				'error',
				'-f',
				'image2pipe',
				'-framerate',
				String(opts.fps),
				'-i',
				'-',
				...codec.args,
				'-r',
				String(opts.fps),
				outPath
			],
			{ stdio: ['pipe', 'inherit', 'pipe'] }
		);

		// `done` must never *reject*: if the frame loop throws first, an unhandled rejection here
		// would crash the process with ffmpeg's symptom and swallow the actual cause. Settle it
		// either way and re-raise afterwards.
		let stderr = '';
		let ffmpegErr = null;
		ffmpeg.stderr.on('data', (chunk) => (stderr += chunk));
		// The frame loop can still be writing when ffmpeg dies; without this the EPIPE lands as an
		// unhandled 'error' event.
		ffmpeg.stdin.on('error', (err) => (ffmpegErr ??= err));
		const done = new Promise((resolve) => {
			ffmpeg.on('error', (err) => {
				ffmpegErr ??= err;
				resolve();
			});
			ffmpeg.on('close', (code, signal) => {
				if (code !== 0)
					ffmpegErr ??= new Error(
						`ffmpeg exited with ${signal ? `signal ${signal}` : `code ${code}`}` +
							(stderr.trim() ? `\n${stderr.trim()}` : '')
					);
				resolve();
			});
		});

		// Respect backpressure: a 4K PNG is megabytes and the pipe will fill long before ffmpeg
		// has drained it.
		const write = (buf) =>
			new Promise((resolve) => {
				if (ffmpegErr) return resolve(); // ffmpeg is gone; `done` carries the reason
				if (ffmpeg.stdin.write(buf)) resolve();
				else ffmpeg.stdin.once('drain', resolve);
			});

		let lastStep = null;
		let lastBuf = null;
		let rendered = 0;

		try {
			for (let i = 0; i < count; i++) {
				assertLive();
				const frameIndex = Math.round((i / (count - 1)) * (total - 1));
				// Two frame indices resolving to the same `ordering` threshold render identical pixels.
				const step = await page.evaluate((n) => window.__capture.stepFor(n), frameIndex);

				if (step !== lastStep || lastBuf === null) {
					await page.evaluate((n) => window.__capture.setFrame(n), frameIndex);
					// A step that adds nothing visible can skip `idle`; the screenshot is correct anyway.
					await page
						.waitForSelector(frameReadySelector(frameIndex), { timeout: opts.idleTimeout })
						.catch(() => {});
					lastBuf = await page.screenshot({
						type: 'png',
						clip: { x: 0, y: 0, width: opts.width, height: opts.height }
					});
					lastStep = step;
					rendered++;
				}

				if (opts.framesDir) {
					writeFileSync(
						path.resolve(WWW_ROOT, opts.framesDir, `${city}-${String(i).padStart(5, '0')}.png`),
						lastBuf
					);
				}
				await write(lastBuf);
				if ((i + 1) % 10 === 0 || i === count - 1)
					console.log(`[video] frame ${i + 1}/${count} (${rendered} rendered)`);
			}

			// Hold on the completed network.
			for (let i = 0; i < holdFrames; i++) await write(lastBuf);

			ffmpeg.stdin.end();
			await done;
			if (ffmpegErr) throw ffmpegErr;
		} catch (err) {
			// Don't leave a truncated file behind — it reads as a finished render.
			ffmpeg.kill('SIGKILL');
			rmSync(outPath, { force: true });
			throw err;
		}

		const mb = statSync(outPath).size / 1024 ** 2;
		console.log(
			`[video] ${path.relative(WWW_ROOT, outPath)} — ${outW}×${outH}, ` +
				`${count + holdFrames} frames (${rendered} rendered), ` +
				`${((count + holdFrames) / opts.fps).toFixed(1)}s, ${mb.toFixed(1)} MB`
		);
	} finally {
		await page.close();
	}
}
