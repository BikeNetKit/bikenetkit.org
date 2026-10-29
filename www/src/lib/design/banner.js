import cityBgRaw from '$lib/assets/brand/city-bg.svg?raw';
import cityBgPngUrl from '$lib/assets/brand/city-bg@2x.png?url';
import { lockupGeometry, slugifyName } from './sublogo.js';
import { coreColors } from '$lib/colors.js';

// The two canvases the same artwork is rendered on: GitHub renders repo social previews at
// 1280x640, Open Graph consumers expect 1200x630. See DESIGN.md § Banners.
export const CANVAS = {
	github: { width: 1280, height: 640 },
	og: { width: 1200, height: 630 }
};

// Ratios rather than absolutes, so both canvases share one geometry. On CANVAS.github they
// reproduce the values this module carried when it only knew that one size: a 1040 content
// box, a 3.2 scale cap, and the artwork at 0.68 / -12.8 / -47.2.
const CONTENT_WIDTH_RATIO = 0.8125;
const LOCKUP_HEIGHT_RATIO = 0.295;
const OVERSCAN = 1.02;

export const BANNER = {
	// GitHub's crop-safe border recommendation; nothing is drawn inside it.
	safe: 40,
	// Paper-coloured halo so the mark holds up wherever a street runs behind it.
	halo: { width: 5, fill: coreColors.paperBase },
	source: { width: 1920, height: 1080 }
};

export const cityBgUrl = cityBgPngUrl;

// Inner markup of city-bg.svg (defs included), nested into the exported banner so the file
// stays self-contained. Guarded so a re-exported asset fails here rather than shipping a
// banner with no background.
const cityBgInner = cityBgRaw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

if (!cityBgInner.includes('<defs>') || !cityBgInner.includes('<path')) {
	throw new Error('city-bg.svg: could not extract the artwork markup — check the exported file.');
}

function round(value, places = 2) {
	return Number(value.toFixed(places));
}

// city-bg.svg is 1920x1080 (16:9) and neither canvas is, so the artwork is cover-cropped with
// 2% overscan — that pushes its rx=10 corners and its 1px border stroke outside the viewport,
// which the root <svg> clips for us.
function coverBg({ width, height }) {
	const scale = round(
		Math.max(width / BANNER.source.width, height / BANNER.source.height) * OVERSCAN,
		4
	);
	return {
		scale,
		x: round((width - BANNER.source.width * scale) / 2),
		y: round((height - BANNER.source.height * scale) / 2),
		width: BANNER.source.width * scale,
		height: BANNER.source.height * scale
	};
}

// Geometry only — shared by the on-page preview (which references the PNG artwork) and by
// bannerSvg() (which inlines the vector artwork), so the two can never drift apart.
export function bannerLayout(font, text, canvas = CANVAS.github) {
	const lockup = lockupGeometry(font, text);
	if (!lockup) return null;

	const { width, height } = canvas;
	const bg = coverBg(canvas);
	const maxScale = (height * LOCKUP_HEIGHT_RATIO) / lockup.height;
	const scale = Math.min((width * CONTENT_WIDTH_RATIO) / lockup.width, maxScale);
	const top = (height - lockup.height * scale) / 2;
	const left = (width - lockup.width * scale) / 2;

	return {
		width,
		height,
		bg,
		lockup,
		lockupTransform: `translate(${round(left)} ${round(top)}) scale(${round(scale, 4)})`,
		// The halo is an underlay of the same shapes, stroked and filled in the paper colour.
		// A centred stroke only grows half its width outward, and it sits inside the scaled
		// lockup group, so the width is doubled and divided by the scale to land at 5px.
		halo: {
			fill: BANNER.halo.fill,
			strokeWidth: round((BANNER.halo.width * 2) / scale, 3)
		},
		bgTransform: `translate(${bg.x} ${bg.y}) scale(${bg.scale})`
	};
}

function haloPath(d, halo, extra = '') {
	return (
		`<path d="${d}"${extra} fill="${halo.fill}" stroke="${halo.fill}" ` +
		`stroke-width="${halo.strokeWidth}" stroke-linejoin="round"/>`
	);
}

export function bannerSvg(font, text, canvas = CANVAS.github) {
	const layout = bannerLayout(font, text, canvas);
	if (!layout) return null;
	return [
		`<svg width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" fill="none" xmlns="http://www.w3.org/2000/svg">`,
		`<g transform="${layout.bgTransform}">`,
		cityBgInner.trim(),
		'</g>',
		`<g transform="${layout.lockupTransform}">`,
		...layout.lockup.iconShapes.map((shape) =>
			haloPath(
				shape.d,
				layout.halo,
				shape['fill-rule']
					? ` fill-rule="${shape['fill-rule']}" clip-rule="${shape['clip-rule']}"`
					: ''
			)
		),
		haloPath(layout.lockup.wordmarkPath, layout.halo),
		...layout.lockup.iconPaths,
		`<path d="${layout.lockup.wordmarkPath}" fill="${layout.lockup.fill}"/>`,
		'</g>',
		'</svg>',
		''
	].join('\n');
}

export function bannerName(text) {
	return `github-banner-${slugifyName(text) || 'custom'}`;
}
