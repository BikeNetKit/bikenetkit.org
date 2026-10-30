#!/usr/bin/env node
// Render the hero animation clips listed in scripts/hero-clips.json: one city × one tool per
// clip, the landing hero's map on its own (no logo, headline, HUD or credit), fading in from
// white, building up, orbiting, tearing down in reverse and fading out to white.
//
//   pnpm generate:hero-clips -- --base-url http://localhost:5187        # all 20, 1080p60
//   pnpm generate:hero-clips -- --only "berlin|paris"                   # regex on tool/city
//   pnpm generate:hero-clips -- --only prague --fps 30 --codecs h264    # quick look
//   pnpm generate:hero-clips -- --orbit-speed 6 --hold 6 --scale 2      # variations
//   pnpm generate:hero-clips -- --transparent                           # no basemap, + alpha
//   pnpm generate:hero-clips -- --tight                                 # closer, for social
//
// Frames are stepped deterministically through /hero-clip/[tool]/[city] and piped into one
// ffmpeg per clip, which writes every requested codec from the same frames. The basemap is
// OSM/ODbL via Protomaps and its credit is not in the frame: the edit or caption owes it.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import { WWW_ROOT } from './server-config.mjs';
import { openEncoder, parseArgs, resolveServer } from './capture-common.mjs';
import { CLIP_SETTLED } from '../src/lib/hero-clip/bridge.js';

const FLAGS = {
	only: String,
	force: Boolean,
	fps: Number,
	width: Number,
	height: Number,
	scale: Number,
	fadeIn: Number,
	build: Number,
	hold: Number,
	teardown: Number,
	fadeOut: Number,
	orbitSpeed: Number,
	transparent: Boolean,
	tight: Boolean,
	zoom: Number,
	focus: String,
	codecs: String,
	gpu: Boolean,
	sheet: Boolean,
	baseUrl: String,
	outDir: String,
	framesDir: String,
	manifest: String
};

const opts = {
	only: null,
	force: false,
	fps: 60,
	width: 1920,
	height: 1080,
	// Supersampling: render at `scale`× and let ffmpeg scale down with lanczos.
	scale: 1,
	fadeIn: null,
	build: null,
	hold: null,
	teardown: null,
	fadeOut: null,
	orbitSpeed: null,
	transparent: false,
	// A closer frame for social video: TIGHT_ZOOM stops past the fit, centered on the network's
	// densest part (`focus: 'data'`). Entries may set their own `zoom` / `focus` for this mode;
	// --zoom / --focus on the command line win over both.
	tight: false,
	zoom: null,
	focus: null,
	codecs: null,
	// SwiftShader (headless Chromium's default) costs ~2 s a frame; Metal ANGLE ~0.3 s.
	gpu: true,
	sheet: true,
	baseUrl: null,
	outDir: 'exports/hero-clips',
	framesDir: null,
	manifest: 'scripts/hero-clips.json',
	...parseArgs(process.argv.slice(2), FLAGS, 'hero-clips')
};

const PHASE_KEYS = ['fadeIn', 'build', 'hold', 'teardown', 'fadeOut'];
const TIGHT_ZOOM = 1.2;
const ATTRIBUTION = '© OpenStreetMap contributors';
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const BT709 = [
	'-colorspace',
	'bt709',
	'-color_primaries',
	'bt709',
	'-color_trc',
	'bt709',
	'-color_range',
	'tv'
];

/** Each codec: output suffix, the filter-graph branch it reads, and its encoder arguments. */
const CODECS = {
	prores: {
		suffix: '.mov',
		pixFmt: 'yuv422p10le',
		args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le']
	},
	h264: {
		suffix: '.mp4',
		pixFmt: 'yuv420p',
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
	alpha: {
		suffix: '-alpha.mov',
		pixFmt: 'yuva444p12le',
		args: ['-c:v', 'prores_ks', '-profile:v', '4', '-alpha_bits', '16', '-pix_fmt', 'yuva444p12le']
	}
};

function fail(message) {
	console.error(`[hero-clips] ${message}`);
	process.exit(1);
}

// ---- preflight ------------------------------------------------------------------------------

const ffmpegCheck = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
if (ffmpegCheck.status !== 0)
	fail(
		'ffmpeg does not run. Install or repair it (e.g. `brew upgrade ffmpeg`).' +
			(ffmpegCheck.stderr ? `\n${ffmpegCheck.stderr.trim().split('\n')[0]}` : '')
	);

const codecs = [
	...new Set(
		(opts.codecs ?? (opts.transparent ? 'alpha,prores,h264' : 'prores,h264'))
			.split(',')
			.map((c) => c.trim())
			.filter(Boolean)
	)
];
if (codecs.length === 0) fail('--codecs names no codec.');
for (const c of codecs)
	if (!CODECS[c]) fail(`Unknown codec "${c}". Known: ${Object.keys(CODECS).join(', ')}.`);
if (codecs.includes('alpha') && !opts.transparent)
	fail('The alpha codec needs --transparent: with the basemap every frame is opaque.');
for (const enc of [...new Set(codecs.map((c) => CODECS[c].args[1]))])
	if (!ffmpegCheck.stdout.includes(` ${enc} `)) fail(`This ffmpeg has no ${enc} encoder.`);

if (!(opts.scale >= 1)) fail('--scale is a supersampling factor and must be 1 or more.');
if (opts.width % 2 || opts.height % 2)
	fail(`${opts.width}×${opts.height} must have even dimensions.`);
if (opts.width * opts.scale > 4096 || opts.height * opts.scale > 4096)
	fail('Rendering past 4096 px exceeds MapLibre’s default maxCanvasSize; lower --scale.');

const manifest = JSON.parse(readFileSync(path.resolve(WWW_ROOT, opts.manifest), 'utf8'));
const onlyRe = opts.only ? new RegExp(opts.only) : null;
const entries = manifest
	.map((entry, i) => ({ ...entry, index: i + 1 }))
	.filter((e) => !onlyRe || onlyRe.test(`${e.tool}/${e.city}`));
if (entries.length === 0) fail(`--only ${opts.only} matches no clip in ${opts.manifest}.`);

const outDir = path.resolve(WWW_ROOT, opts.outDir);
mkdirSync(outDir, { recursive: true });

// ---- render ---------------------------------------------------------------------------------

const { baseURL, stop } = await resolveServer({ baseUrl: opts.baseUrl, label: 'hero-clips' });
const browser = await chromium.launch({ args: opts.gpu ? GPU_ARGS : [] });
const failed = [];

try {
	for (const entry of entries) {
		try {
			await renderClip(entry);
		} catch (err) {
			console.error(`[hero-clips] ${entry.tool}/${entry.city} failed: ${err.message}`);
			failed.push(`${entry.tool}/${entry.city}`);
		}
	}
} finally {
	await browser.close();
	stop();
}
if (failed.length) fail(`${failed.length} clip(s) failed: ${failed.join(', ')}`);

/** Framing for an entry: `zoom` stops past the fit and a `focus`, CLI over entry over preset. */
function framingFor(e) {
	const zoom = opts.zoom ?? (opts.tight ? (e.zoom ?? TIGHT_ZOOM) : 0);
	const entryFocus = Array.isArray(e.focus) ? e.focus.join(',') : e.focus;
	const focus = opts.focus ?? (opts.tight ? (entryFocus ?? 'data') : null);
	return { zoom, focus };
}

function clipName(e) {
	const variant = e.variant && e.variant !== 'default' ? `-${e.variant}` : '';
	const { zoom, focus } = framingFor(e);
	const tight = zoom !== 0 || focus ? '-tight' : '';
	const mode = opts.transparent ? '-transparent' : '';
	return `${String(e.index).padStart(2, '0')}-${e.tool}-${e.city}-${e.metric}-${e.type}${variant}${tight}${mode}`;
}

/** The filter graph: one branch per codec, all fed from the same decoded frames. */
function filterGraph(outW, outH) {
	const down = opts.scale !== 1 ? `scale=${outW}:${outH}:flags=lanczos,` : '';
	// `setparams` tags the frames themselves: the -color_* output options alone leave the
	// transfer and primaries unset, and an NLE then guesses.
	const toYuv = (fmt) =>
		`scale=out_color_matrix=bt709:out_range=tv,format=${fmt},` +
		'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv';
	const opaque = codecs.filter((c) => c !== 'alpha');
	const parts = [];
	if (opts.transparent) {
		const withAlpha = codecs.includes('alpha');
		parts.push(`[0:v]${down}format=rgba,split=${withAlpha ? 2 : 1}${withAlpha ? '[a0]' : ''}[w0]`);
		if (withAlpha) parts.push(`[a0]${toYuv(CODECS.alpha.pixFmt)}[alpha]`);
		if (opaque.length) {
			parts.push(`color=white:s=${outW}x${outH}:r=${opts.fps},format=rgb24[bg]`);
			parts.push(`[bg][w0]overlay=shortest=1:format=rgb[src]`);
		} else parts.push('[w0]nullsink');
	} else {
		parts.push(`[0:v]${down}null[src]`);
	}
	if (opaque.length) {
		parts.push(`[src]split=${opaque.length}${opaque.map((c) => `[${c}0]`).join('')}`);
		for (const c of opaque) parts.push(`[${c}0]${toYuv(CODECS[c].pixFmt)}[${c}]`);
	}
	return parts.join(';');
}

async function renderClip(entry) {
	const name = clipName(entry);
	const outputs = Object.fromEntries(
		codecs.map((c) => [c, path.join(outDir, name + CODECS[c].suffix)])
	);
	// The sidecar is written only after ffmpeg has finished, so it is the completion marker: an
	// interrupted run (Ctrl-C reaches ffmpeg too, which then closes a short but valid file) leaves
	// outputs without one, and the clip is rendered again.
	const sidecar = path.join(outDir, `${name}.json`);
	if (!opts.force && [sidecar, ...Object.values(outputs)].every((p) => existsSync(p))) {
		console.log(`[hero-clips] ${name}: done, skipping (--force to redo)`);
		return;
	}
	rmSync(sidecar, { force: true });

	const phases = Object.fromEntries(
		PHASE_KEYS.map((k) => [k, opts[k] ?? entry[k]]).filter(([, v]) => v != null)
	);
	const framing = framingFor(entry);
	const query = new URLSearchParams({
		metric: entry.metric,
		type: entry.type,
		variant: entry.variant ?? 'default',
		width: String(opts.width),
		height: String(opts.height),
		fps: String(opts.fps),
		bearing: String(entry.bearing ?? 0),
		padding: String(entry.padding ?? 40),
		weight: String(entry.weight ?? 1),
		...(opts.orbitSpeed != null ? { orbit: String(opts.orbitSpeed) } : {}),
		...(opts.transparent ? { transparent: '1' } : {}),
		...(framing.zoom !== 0 ? { zoom: String(framing.zoom) } : {}),
		...(framing.focus ? { focus: framing.focus } : {}),
		...Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, String(v)]))
	});
	const url = `${baseURL}/hero-clip/${entry.tool}/${entry.city}?${query}`;
	console.log(`[hero-clips] ${name}\n[hero-clips] ${url}`);

	const page = await browser.newPage({
		viewport: { width: opts.width, height: opts.height },
		deviceScaleFactor: opts.scale
	});
	const pageErrors = [];
	page.on('pageerror', (err) => pageErrors.push(err.message));

	try {
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector(CLIP_SETTLED, { timeout: 180_000 }).catch(() => {
			throw new Error(
				`the capture page never got ready${pageErrors.length ? ` (${pageErrors[0]})` : ''}. ` +
					`Is ${baseURL} this repo's dev server? Pass --base-url.`
			);
		});
		const clipError = await page.evaluate(() => document.body.dataset.clipError);
		if (clipError) throw new Error(clipError);

		if (opts.gpu) {
			const renderer = await page.evaluate(() => {
				const gl = document.createElement('canvas').getContext('webgl2');
				const info = gl?.getExtension('WEBGL_debug_renderer_info');
				return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
			});
			if (/swiftshader/i.test(renderer))
				console.warn(
					'[hero-clips] GPU requested but Chromium fell back to SwiftShader — expect ~2 s a frame.'
				);
		}

		const meta = await page.evaluate(() => window.__clip.meta());
		if (meta.basemapLoaded === false)
			throw new Error('the basemap did not load — is PUBLIC_BASEMAP_URL set in www/.env?');
		const total = await page.evaluate(() => window.__clip.frames());

		let navigated = false;
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) navigated = true;
		});

		const cdp = await page.context().newCDPSession(page);
		if (opts.transparent)
			await cdp.send('Emulation.setDefaultBackgroundColorOverride', {
				color: { r: 0, g: 0, b: 0, a: 0 }
			});

		const outW = opts.width;
		const outH = opts.height;
		const encoder = openEncoder(
			[
				'-filter_complex',
				filterGraph(outW, outH),
				...codecs.flatMap((c) => [
					'-map',
					`[${c}]`,
					...CODECS[c].args,
					...BT709,
					'-r',
					String(opts.fps),
					outputs[c]
				])
			],
			{ fps: opts.fps, label: 'hero-clips' }
		);

		const p = meta.phases;
		const sheetAt = new Set(
			[
				(p.buildStart + p.buildEnd) / 2,
				p.buildEnd + 0.5,
				(p.buildEnd + p.teardownStart) / 2,
				(p.teardownStart + p.teardownEnd) / 2
			].map((t) => Math.round(t * opts.fps))
		);
		const sheetFrames = [];
		if (opts.framesDir) mkdirSync(path.resolve(WWW_ROOT, opts.framesDir), { recursive: true });

		const started = Date.now();
		let timeouts = 0;
		try {
			for (let i = 0; i < total; i++) {
				if (navigated)
					throw new Error(
						'the page reloaded mid-render — an edit under www/ probably triggered an HMR reload.'
					);
				const idle = await page.evaluate((n) => window.__clip.seek(n), i);
				if (!idle) timeouts++;
				const { data } = await cdp.send('Page.captureScreenshot', {
					format: 'png',
					optimizeForSpeed: true
				});
				const buf = Buffer.from(data, 'base64');
				await encoder.write(buf);
				if (sheetAt.has(i)) sheetFrames.push(buf);
				if (opts.framesDir)
					writeFileSync(
						path.resolve(WWW_ROOT, opts.framesDir, `${name}-${String(i).padStart(4, '0')}.png`),
						buf
					);
				if ((i + 1) % opts.fps === 0 || i === total - 1) {
					const perFrame = (Date.now() - started) / (i + 1);
					const eta = Math.round((perFrame * (total - i - 1)) / 1000);
					console.log(
						`[hero-clips] frame ${i + 1}/${total} · ${perFrame.toFixed(0)} ms/frame · ${eta}s left`
					);
				}
			}
			await encoder.finish();
		} catch (err) {
			// Don't leave a truncated file behind — it reads as a finished render.
			encoder.abort();
			for (const out of Object.values(outputs)) rmSync(out, { force: true });
			throw err;
		}

		if (timeouts)
			console.warn(
				`[hero-clips] ${name}: ${timeouts} frame(s) hit the idle timeout and may show unloaded tiles.`
			);

		writeFileSync(
			sidecar,
			JSON.stringify(
				{
					...meta,
					fps: opts.fps,
					frames: total,
					seconds: total / opts.fps,
					size: [outW, outH],
					supersample: opts.scale,
					transparent: opts.transparent,
					attribution: opts.transparent ? `Data ${ATTRIBUTION}` : ATTRIBUTION,
					outputs: Object.fromEntries(
						Object.entries(outputs).map(([c, f]) => [c, path.basename(f)])
					)
				},
				null,
				'\t'
			) + '\n'
		);
		if (opts.sheet && sheetFrames.length)
			await writeSheet(sheetFrames, path.join(outDir, `${name}-sheet.png`));

		const sizes = Object.values(outputs)
			.map((f) => `${path.basename(f)} ${(statSync(f).size / 1024 ** 2).toFixed(0)} MB`)
			.join(', ');
		console.log(
			`[hero-clips] ${name}: ${total} frames in ${((Date.now() - started) / 60000).toFixed(1)} min — ${sizes}`
		);
	} finally {
		await page.close();
	}
}

/** A 2×2 contact sheet — mid-build, built, mid-hold, mid-tear-down — for reviewing framing. */
async function writeSheet(frames, file) {
	const w = 960;
	const h = Math.round((w * opts.height) / opts.width);
	const tiles = await Promise.all(
		frames.map((f) => sharp(f).resize(w, h).flatten({ background: '#ffffff' }).png().toBuffer())
	);
	await sharp({ create: { width: w * 2, height: h * 2, channels: 3, background: '#ffffff' } })
		.composite(tiles.map((input, i) => ({ input, left: (i % 2) * w, top: Math.floor(i / 2) * h })))
		.png()
		.toFile(file);
}
