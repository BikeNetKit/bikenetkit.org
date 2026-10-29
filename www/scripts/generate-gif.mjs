#!/usr/bin/env node
// Capture an animated GIF of an ordered build-up (growbikenet / linkbikenet) — a plain
// top-down data view with no legend, HUD, playback bar or nav control.
//
//   pnpm generate:gif                                     # paris, betweenness/rail/from_scratch
//   pnpm generate:gif --city amsterdam --type grid        # another dataset
//   pnpm generate:gif --frames 150 --fps 25               # smoother, larger file
//   pnpm generate:gif --no-seeds --size 640               # no seed dots, smaller frame
//
// Frames are stepped deterministically through /animation/[tool]/[city] (each frame waits
// for MapLibre's `idle` event), then encoded by ffmpeg.
import { chromium } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { WWW_ROOT } from './server-config.mjs';
import { CAPTURE_READY, frameReadySelector, parseArgs, resolveServer } from './capture-common.mjs';

const FLAGS = {
	tool: String,
	city: String,
	metric: String,
	type: String,
	variant: String,
	size: Number,
	frames: Number,
	fps: Number,
	hold: Number,
	seeds: Boolean,
	baseUrl: String,
	out: String
};

const opts = {
	tool: 'growbikenet',
	city: 'paris_fr',
	metric: 'betweenness',
	type: 'rail',
	variant: 'from_scratch',
	size: 800,
	frames: 90,
	fps: 15,
	hold: 1.5,
	seeds: true,
	baseUrl: null,
	out: null,
	...parseArgs(process.argv.slice(2), FLAGS, 'gif')
};

const outPath = path.resolve(
	WWW_ROOT,
	opts.out ?? path.join('static/media', `${opts.tool}-${opts.city}.gif`)
);

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
	console.error('[gif] ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`).');
	process.exit(1);
}

const { baseURL, stop } = await resolveServer({ baseUrl: opts.baseUrl, label: 'gif' });
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'bnk-gif-'));
const browser = await chromium.launch();

try {
	const page = await browser.newPage({
		viewport: { width: opts.size, height: opts.size },
		deviceScaleFactor: 1
	});

	const query = new URLSearchParams({
		size: String(opts.size),
		metric: opts.metric,
		type: opts.type,
		variant: opts.variant,
		seeds: opts.seeds ? '1' : '0'
	});
	const url = `${baseURL}/animation/${opts.tool}/${opts.city}?${query}`;
	console.log(`[gif] ${url}`);

	await page.goto(url, { waitUntil: 'networkidle' });
	await page.waitForSelector(CAPTURE_READY, { timeout: 60_000 });
	// Let the basemap tiles and glyphs settle so every frame shares the same background.
	await page.waitForTimeout(1500);

	// `total` counts frames, and frame 0 is the starting condition (existing network only), so the
	// dataset's build steps are `total - 1`.
	const total = await page.evaluate(() => window.__capture.total());
	const steps = total - 1;
	if (steps < 2) throw new Error(`Dataset has ${steps} ordered step(s) — nothing to animate.`);
	const count = Math.min(opts.frames, total);
	console.log(`[gif] ${steps} build steps → ${count} frames @ ${opts.fps}fps`);

	const framePath = (i) => path.join(tmpDir, `frame-${String(i).padStart(4, '0')}.png`);

	for (let i = 0; i < count; i++) {
		const step = Math.round((i / (count - 1)) * (total - 1));
		await page.evaluate((n) => window.__capture.setFrame(n), step);
		// A step that adds nothing visible can skip `idle`; the screenshot is correct regardless.
		await page.waitForSelector(frameReadySelector(step), { timeout: 10_000 }).catch(() => {});
		await page.screenshot({
			path: framePath(i),
			clip: { x: 0, y: 0, width: opts.size, height: opts.size }
		});
		if ((i + 1) % 10 === 0 || i === count - 1) console.log(`[gif] frame ${i + 1}/${count}`);
	}

	// Hold on the completed network before the loop restarts.
	const holdFrames = Math.max(0, Math.round(opts.hold * opts.fps));
	for (let i = 0; i < holdFrames; i++) cpSync(framePath(count - 1), framePath(count + i));

	mkdirSync(path.dirname(outPath), { recursive: true });

	// `stats_mode=diff` prices the palette on the changing pixels and `diff_mode=rectangle`
	// re-encodes only the changed region — most of every frame is identical basemap.
	const filter =
		`fps=${opts.fps},split [a][b];` +
		`[a] palettegen=max_colors=192:stats_mode=diff [p];` +
		`[b][p] paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;

	const ffmpeg = spawnSync(
		'ffmpeg',
		[
			'-y',
			'-loglevel',
			'error',
			'-framerate',
			String(opts.fps),
			'-i',
			path.join(tmpDir, 'frame-%04d.png'),
			'-filter_complex',
			filter,
			'-loop',
			'0',
			outPath
		],
		{ stdio: 'inherit' }
	);
	if (ffmpeg.status !== 0) throw new Error(`ffmpeg exited with code ${ffmpeg.status}`);

	const mb = statSync(outPath).size / 1024 ** 2;
	console.log(
		`[gif] ${path.relative(WWW_ROOT, outPath)} — ${opts.size}×${opts.size}, ` +
			`${count + holdFrames} frames, ${mb.toFixed(1)} MB`
	);
	if (mb > 10) console.warn('[gif] over 10 MB — consider --size 640 or fewer --frames.');
} finally {
	await browser.close();
	if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
	stop();
}
