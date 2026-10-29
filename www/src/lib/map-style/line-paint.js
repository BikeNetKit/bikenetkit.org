import { coreColors } from '$lib/colors.js';
import { DEFAULT_LINE_WIDTH_RANGE, ZOOM_SCALE_STOPS } from './render-config.js';

export const RAMP_COLORS = [coreColors.ramp0, coreColors.ramp1, coreColors.ramp2, coreColors.ramp3];

/** @type {NonNullable<import('maplibre-gl').LineLayerSpecification['layout']>} */
export const ROUND_LINE_LAYOUT = {
	'line-cap': 'round',
	'line-join': 'round'
};

// Structured as a zoom-interpolate of multiplied stops because MapLibre
// requires `['zoom']` at the top level of an interpolate — it cannot be
// nested inside another expression like `*`. Stops live in render-config.js.
export function withZoomScale(width) {
	return /** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<number>} */ ([
		'interpolate',
		['linear'],
		['zoom'],
		...ZOOM_SCALE_STOPS.flatMap(([zoom, multiplier]) => [zoom, ['*', multiplier, width]])
	]);
}

export function quantile(sorted, q) {
	const i = q * (sorted.length - 1);
	const lo = Math.floor(i);
	const hi = Math.ceil(i);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Color/width stops at evenly-spaced quantiles, with duplicate input values
// dropped — MapLibre's `interpolate` requires strictly ascending inputs.
export function computeRampStops(
	sortedValues,
	colors = RAMP_COLORS,
	widthRange = DEFAULT_LINE_WIDTH_RANGE
) {
	const [minWidth, maxWidth] = widthRange;
	const finite = sortedValues.filter((v) => Number.isFinite(v));
	if (finite.length === 0) return [];
	return Array.from({ length: colors.length }, (_, i) => {
		const p = i / (colors.length - 1);
		return {
			input: quantile(finite, p),
			color: colors[i],
			width: minWidth + p * (maxWidth - minWidth)
		};
	}).filter((s, i, arr) => i === 0 || s.input > arr[i - 1].input);
}

/** @returns {NonNullable<import('maplibre-gl').LineLayerSpecification['paint']>} */
export function makeLinePaint(
	sortedValues,
	metricProperty,
	colors = RAMP_COLORS,
	widthRange = DEFAULT_LINE_WIDTH_RANGE
) {
	const [minWidth] = widthRange;
	const stops = computeRampStops(sortedValues, colors, widthRange);

	if (stops.length === 0)
		return {
			'line-color': colors[colors.length - 1],
			'line-width': withZoomScale(minWidth),
			'line-opacity': 1
		};

	if (stops.length < 2) {
		const last = stops[stops.length - 1];
		return {
			'line-color': last.color,
			'line-width': withZoomScale(last.width),
			'line-opacity': 1
		};
	}

	return {
		'line-color':
			/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<string>} */ ([
				'interpolate',
				['linear'],
				['get', metricProperty],
				...stops.flatMap((s) => [s.input, s.color])
			]),
		'line-width': withZoomScale([
			'interpolate',
			['linear'],
			['get', metricProperty],
			...stops.flatMap((s) => [s.input, s.width])
		]),
		'line-opacity': 1
	};
}

function hexToRgb(hex) {
	let h = hex.replace('#', '');
	if (h.length === 3)
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	const num = parseInt(h, 16);
	return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');

// Component-wise sRGB interpolation — matches MapLibre's color interpolation.
export function lerpHex(a, b, t) {
	const [ar, ag, ab] = hexToRgb(a);
	const [br, bg, bb] = hexToRgb(b);
	return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}

// LinkBikeNet's connectivity gain. The ramp spreads over the links that add something (see
// RAMP_FLOOR in metric-scale.js); every other link clamps to the first colour, and in a
// `closest_components` build that is most of them. It starts part-way to ramp-2 because ramp-0
// all but vanishes on the paper basemap.
const GAIN_RAMP_COLORS = [
	lerpHex(coreColors.ramp1, coreColors.ramp2, 0.4),
	coreColors.ramp2,
	coreColors.ramp3
];

/** @param {string} metricProperty */
export function rampColorsFor(metricProperty) {
	return metricProperty === 'lcc_gain' ? GAIN_RAMP_COLORS : RAMP_COLORS;
}

// Plain-JS evaluators mirroring the `interpolate` expressions above, for
// contexts (e.g. SVG export) that need a concrete value per feature.
export function widthForValue(value, stops) {
	if (stops.length === 0) return 0;
	if (stops.length === 1 || !Number.isFinite(value) || value <= stops[0].input)
		return stops[0].width;
	const last = stops[stops.length - 1];
	if (value >= last.input) return last.width;
	for (let i = 1; i < stops.length; i++) {
		if (value <= stops[i].input) {
			const a = stops[i - 1];
			const b = stops[i];
			const t = (value - a.input) / (b.input - a.input);
			return a.width + (b.width - a.width) * t;
		}
	}
	return last.width;
}

export function colorForValue(value, stops) {
	if (stops.length === 0) return null;
	if (stops.length === 1 || !Number.isFinite(value) || value <= stops[0].input)
		return stops[0].color;
	const last = stops[stops.length - 1];
	if (value >= last.input) return last.color;
	for (let i = 1; i < stops.length; i++) {
		if (value <= stops[i].input) {
			const a = stops[i - 1];
			const b = stops[i];
			const t = (value - a.input) / (b.input - a.input);
			return lerpHex(a.color, b.color, t);
		}
	}
	return last.color;
}

export function zoomScale(zoom) {
	const first = ZOOM_SCALE_STOPS[0];
	const last = ZOOM_SCALE_STOPS[ZOOM_SCALE_STOPS.length - 1];
	if (zoom <= first[0]) return first[1];
	if (zoom >= last[0]) return last[1];
	for (let i = 1; i < ZOOM_SCALE_STOPS.length; i++) {
		if (zoom <= ZOOM_SCALE_STOPS[i][0]) {
			const [z0, m0] = ZOOM_SCALE_STOPS[i - 1];
			const [z1, m1] = ZOOM_SCALE_STOPS[i];
			const t = (zoom - z0) / (z1 - z0);
			return m0 + (m1 - m0) * t;
		}
	}
	return last[1];
}
