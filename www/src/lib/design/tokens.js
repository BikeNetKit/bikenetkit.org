import layoutCss from '../../routes/layout.css?raw';

const THEME_RE = /@theme\s*\{([\s\S]*?)\n\}/;
const DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

const TOKEN_NOTES = {
	'base-eden': 'primary brand green',
	'base-turtle-green': 'muted green / brand ink',
	'base-lime': 'vivid accent',
	'base-sand': 'paper base',
	'ink-link': 'inline prose links (apply via the .link class)',
	'category-other': 'unclassified fallback',
	'existing-network': 'existing bike infrastructure baseline',
	'existing-network-connected': 'wired into the largest connected component',
	'existing-network-hover': 'map hover state',
	'existing-network-ink': 'baseline lengths as text (legible on white)',
	notice: 'heading + icon on the notice fill',
	'notice-subtle': 'notice fill (CardPanel surface="notice")'
};

function categorize(name) {
	if (name.startsWith('--color-')) return 'color';
	if (name.startsWith('--font-')) return 'font';
	if (name.startsWith('--text-')) return 'fontSize';
	if (name.startsWith('--tracking-')) return 'tracking';
	return 'other';
}

export function parseThemeTokens(css = layoutCss) {
	const body = css.match(THEME_RE)?.[1] ?? '';
	const out = [];
	for (const m of body.matchAll(DECL_RE)) {
		out.push({ name: m[1], rawValue: m[2].trim(), category: categorize(m[1]) });
	}
	return out;
}

const hexByte = (n) => n.toString(16).padStart(2, '0');

function rgbToHex(rgb) {
	const m = rgb.match(/rgba?\(([^)]+)\)/i);
	if (!m) return null;
	const parts = m[1].split(/[,\s/]+/).filter(Boolean);
	const [r, g, b] = parts.slice(0, 3).map((v) => Math.round(parseFloat(v)));
	const alpha = parts[3] !== undefined ? Math.round(parseFloat(parts[3]) * 255) : 255;
	const base = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
	return alpha < 255 ? `${base}${hexByte(alpha)}` : base;
}

/**
 * The engine does not always hand back `rgb()`. A `color-mix(in lch, …)` token computes to
 * `lch(83.16 65.58 133.05)` in Chrome, which serializes in the mix's own space — so the
 * `color-mix()` tokens would otherwise carry an `lch()` string in the `hex` field and leave the
 * W3C export non-conformant. Painting the value on a 1×1 canvas converts whatever CSS color it
 * is to sRGB bytes without hand-rolling the conversion.
 */
function paintToHex(ctx, value) {
	// An unparseable fillStyle is silently ignored, leaving the previous value in place; the
	// sentinel makes that case detectable instead of yielding the last token's color.
	ctx.fillStyle = '#000000';
	ctx.fillStyle = value;
	if (ctx.fillStyle === '#000000' && !/^(#000000|black|rgba?\(0,\s*0,\s*0)/i.test(value)) {
		return null;
	}
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	const base = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
	return a < 255 ? `${base}${hexByte(a)}` : base;
}

export function resolveTokens(tokens, probeEl) {
	const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	return tokens.map((t) => {
		if (t.category !== 'color') return { ...t, value: t.rawValue, hex: null };
		probeEl.style.color = `var(${t.name})`;
		const value = getComputedStyle(probeEl).color.trim();
		// `rgb()` is converted arithmetically rather than through the canvas: exact, and it avoids
		// the un-premultiply rounding getImageData does on translucent pixels.
		const hex = rgbToHex(value) ?? (ctx ? paintToHex(ctx, value) : null);
		return { ...t, value, hex };
	});
}

function aliasOf(rawValue) {
	return rawValue.match(/^var\(--color-([a-z0-9-]+)\)$/i)?.[1] ?? null;
}

/** @type {[string, (n: string) => boolean][]} */
const COLOR_GROUPS = [
	['ramp', (n) => n.startsWith('ramp-')],
	['category', (n) => n.startsWith('category-')],
	['network', (n) => n.startsWith('existing-network')],
	['notice', (n) => n.startsWith('notice')],
	['base', (n) => n.startsWith('base-')],
	['surface', (n) => n === 'paper' || n.startsWith('paper-')],
	['border', (n) => n.startsWith('border')],
	['ink', (n) => n.startsWith('ink')],
	['brand', (n) => n.startsWith('brand')]
];

export function groupColorTokens(resolved) {
	const groups = {
		base: [],
		brand: [],
		ink: [],
		surface: [],
		border: [],
		ramp: [],
		category: [],
		network: [],
		notice: []
	};
	for (const t of resolved) {
		if (t.category !== 'color') continue;
		const short = t.name.replace('--color-', '');
		const bucket = COLOR_GROUPS.find(([, test]) => test(short))?.[0];
		if (!bucket) continue;
		groups[bucket].push({
			name: short,
			value: t.hex ?? t.value,
			alias: aliasOf(t.rawValue),
			note: TOKEN_NOTES[short] ?? null
		});
	}
	return groups;
}

export function buildTokenExport(resolved, version) {
	const colors = {};
	const fonts = {};
	const fontSizes = {};
	const tracking = {};
	for (const t of resolved) {
		if (t.category === 'color') {
			colors[t.name.replace('--color-', '')] = {
				var: t.name,
				raw: t.rawValue,
				value: t.value,
				hex: t.hex
			};
		} else if (t.category === 'font') {
			fonts[t.name.replace('--font-', '')] = t.rawValue;
		} else if (t.category === 'fontSize') {
			fontSizes[t.name.replace('--text-', '')] = t.rawValue;
		} else if (t.category === 'tracking') {
			tracking[t.name.replace('--tracking-', '')] = t.rawValue;
		}
	}
	return {
		name: 'BikeNetKit design tokens',
		generatedFrom: 'www/src/routes/layout.css',
		version,
		colors,
		fonts,
		fontSizes,
		tracking
	};
}

// The DTCG `dimension` type admits only px and rem. Letter-spacing here is in em, which is relative
// to the element's own font size and so cannot be converted to either. Emitted anyway, flagged, on
// the grounds that a documented deviation beats dropping the tokens from a hand-off file.
const EM_DIMENSION_NOTE = 'letter-spacing in em — outside the DTCG dimension unit set (px | rem)';

/** `'Public Sans', sans-serif` → `['Public Sans', 'sans-serif']` */
function fontStack(rawValue) {
	return rawValue.split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, ''));
}

/**
 * @typedef {object} DtcgToken
 * @property {string | string[]} $value
 * @property {string} [$description]
 * @property {{ 'org.bikenetkit': { var: string, css: string } }} [$extensions]
 */

/**
 * The same resolved tokens in the W3C Design Tokens Community Group interchange format: every
 * token an object with a `$value`, `$type` hoisted to the group. Values are the fully computed
 * ones — `color-mix()` and `var()` chains come out as concrete hex — because the widest set of
 * consumers (Style Dictionary, Tokens Studio, Figma variable importers) reads a literal without
 * having to resolve an alias graph. The `--color-…` name and the original declaration have no
 * home in the format proper, so they ride along in `$extensions`.
 */
export function buildDtcgExport(resolved, version) {
	/** @type {Record<string, DtcgToken>} */
	const color = {};
	/** @type {Record<string, DtcgToken>} */
	const fontFamily = {};
	/** @type {Record<string, DtcgToken>} */
	const fontSize = {};
	/** @type {Record<string, DtcgToken>} */
	const letterSpacing = {};

	for (const t of resolved) {
		if (t.category === 'color') {
			const name = t.name.replace('--color-', '');
			const note = TOKEN_NOTES[name];
			color[name] = {
				$value: t.hex ?? t.value,
				...(note ? { $description: note } : {}),
				$extensions: { 'org.bikenetkit': { var: t.name, css: t.rawValue } }
			};
		} else if (t.category === 'font') {
			fontFamily[t.name.replace('--font-', '')] = { $value: fontStack(t.rawValue) };
		} else if (t.category === 'fontSize') {
			fontSize[t.name.replace('--text-', '')] = { $value: t.rawValue };
		} else if (t.category === 'tracking') {
			letterSpacing[t.name.replace('--tracking-', '')] = {
				$value: t.rawValue,
				$description: EM_DIMENSION_NOTE
			};
		}
	}

	return {
		$description: `BikeNetKit design tokens v${version} — generated from www/src/routes/layout.css`,
		color: { $type: 'color', ...color },
		fontFamily: { $type: 'fontFamily', ...fontFamily },
		fontSize: { $type: 'dimension', ...fontSize },
		letterSpacing: { $type: 'dimension', ...letterSpacing }
	};
}
