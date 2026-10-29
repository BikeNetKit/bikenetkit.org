import baseLockup from '$lib/assets/brand/logo-word-mark-horizontal.svg?raw';
import { coreColors } from '$lib/colors.js';
import { splitWordMark } from '$lib/utils/word-mark.js';

// WOFF, not WOFF2: opentype.js parses the `wOFF` signature via its bundled inflate but throws on
// `wOF2`. Using it means the site never has to publish the TTF/OTF — see README.md § Fonts.
const FONT_URL = '/fonts/BespokeSans_Complete/Fonts/WEB/fonts/BespokeSans-BoldItalic.woff';

// Measured from logo-word-mark-horizontal.svg by fitting Bespoke Sans Bold Italic
// against its outlined glyphs. See DESIGN.md § Logo sublogos.
const LOCKUP = {
	fontSize: 32,
	baseline: 43.64,
	textLeft: 76.28,
	trailing: 6.792,
	height: 59,
	wordGap: 4.22,
	fill: coreColors.brand
};

let fontPromise = null;

export function loadBrandFont() {
	if (!fontPromise) {
		fontPromise = (async () => {
			const [opentype, response] = await Promise.all([import('opentype.js'), fetch(FONT_URL)]);
			if (!response.ok) {
				throw new Error(`Could not load ${FONT_URL} (${response.status})`);
			}
			return opentype.parse(await response.arrayBuffer());
		})().catch((error) => {
			fontPromise = null;
			throw error;
		});
	}
	return fontPromise;
}

function round(value, places = 2) {
	return Number(value.toFixed(places));
}

// opentype.js 2.0.0's Path#toPathData serialises any coordinate that is an integer plus float
// noise (e.g. 234.00000000000003) as "NaN", which truncates the glyph in every SVG renderer:
// its roundDecimal() builds "2.8e-14" + "e+3" and hands that to Math.round(). Pen positions
// accumulate exactly that kind of noise, so we serialise the commands ourselves.
function pathData(commands, places = 3) {
	const n = (value) => String(round(value, places));
	let d = '';
	for (const cmd of commands) {
		if (cmd.type === 'M' || cmd.type === 'L') {
			d += `${cmd.type}${n(cmd.x)} ${n(cmd.y)}`;
		} else if (cmd.type === 'C') {
			d += `C${n(cmd.x1)} ${n(cmd.y1)} ${n(cmd.x2)} ${n(cmd.y2)} ${n(cmd.x)} ${n(cmd.y)}`;
		} else if (cmd.type === 'Q') {
			d += `Q${n(cmd.x1)} ${n(cmd.y1)} ${n(cmd.x)} ${n(cmd.y)}`;
		} else if (cmd.type === 'Z') {
			d += 'Z';
		}
	}
	return d;
}

function unionBox(box, path) {
	const b = path.getBoundingBox();
	if (!box) return { x1: b.x1, x2: b.x2 };
	return { x1: Math.min(box.x1, b.x1), x2: Math.max(box.x2, b.x2) };
}

function layout(font, segments, penStart, { fontSize, wordGap, baseline }) {
	const paths = [];
	let pen = penStart;
	for (const [i, segment] of segments.entries()) {
		if (i > 0) pen += wordGap;
		paths.push(font.getPath(segment, pen, baseline, fontSize, { kerning: true }));
		pen += font.getAdvanceWidth(segment, fontSize, { kerning: true });
	}
	return paths;
}

// Typesets the name the way the wordmark is built: kerning inside each word, an explicit
// gap between words, and the result aligned by its ink edge rather than the pen origin.
function typesetWordmark(font, text) {
	const segments = splitWordMark(text);
	if (!segments.length) return null;
	const probe = layout(font, segments, 0, LOCKUP);
	const probeBox = probe.reduce(unionBox, null);
	if (!probeBox || !Number.isFinite(probeBox.x1)) return null;
	const paths = layout(font, segments, LOCKUP.textLeft - probeBox.x1, LOCKUP);
	return {
		d: paths.map((path) => pathData(path.commands)).join(''),
		inkRight: LOCKUP.textLeft + (probeBox.x2 - probeBox.x1)
	};
}

// The wordmark glyphs are the only paths carrying the brand green; everything else is the
// bike icon, which we keep verbatim. Matched case-insensitively because the asset writes
// #096A51 while the token is lowercase. Guarded so that regenerating the source SVG (a
// different fill, or non-self-closing paths) fails here instead of silently shipping a
// lockup with a missing or duplicated icon.
const ICON_PATH_COUNT = 3;
const isWordmarkPath = new RegExp(`fill="${LOCKUP.fill}"`, 'i');
const iconPaths = [...baseLockup.matchAll(/<path\b[^>]*\/>/g)]
	.map((match) => match[0])
	.filter((path) => !isWordmarkPath.test(path));

if (iconPaths.length !== ICON_PATH_COUNT) {
	throw new Error(
		`logo-word-mark-horizontal.svg: expected ${ICON_PATH_COUNT} icon paths, found ${iconPaths.length}. ` +
			`Check that the wordmark glyphs still use fill="${LOCKUP.fill}" and that paths are self-closing.`
	);
}

// Attribute form of the same paths, so Svelte can render them as real SVG nodes
// instead of {@html}, which would insert them into the wrong namespace.
export const iconShapes = iconPaths.map((path) =>
	Object.fromEntries(
		[...path.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])
	)
);

// The lockup broken into its parts, so the banner can place it on another canvas.
export function lockupGeometry(font, text) {
	const typeset = typesetWordmark(font, text);
	if (!typeset) return null;
	return {
		width: round(typeset.inkRight + LOCKUP.trailing),
		height: LOCKUP.height,
		iconPaths,
		iconShapes,
		wordmarkPath: typeset.d,
		fill: LOCKUP.fill
	};
}

export function renderHorizontalLockup(font, text) {
	const lockup = lockupGeometry(font, text);
	if (!lockup) return null;
	return [
		`<svg width="${lockup.width}" height="${lockup.height}" viewBox="0 0 ${lockup.width} ${lockup.height}" fill="none" xmlns="http://www.w3.org/2000/svg">`,
		...lockup.iconPaths,
		`<path d="${lockup.wordmarkPath}" fill="${lockup.fill}"/>`,
		'</svg>',
		''
	].join('\n');
}

export function slugifyName(text) {
	return text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function unsupportedChars(font, text) {
	const missing = new Set();
	for (const char of text.replace(/\s+/g, '')) {
		if (font.charToGlyphIndex(char) === 0) missing.add(char);
	}
	return [...missing];
}
