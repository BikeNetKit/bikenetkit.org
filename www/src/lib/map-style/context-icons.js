/**
 * Symbols for growbikenet's rail and school focus modes: the stations and schools themselves, from
 * an OSM extract (`pnpm import:context`), drawn as solid light-grey pictograms beneath the network
 * — the basemap's address-label grey, so they read as places rather than as data.
 *
 * Rasterized at runtime with `Path2D` and registered on the map once per kind (`map.addImage`): the
 * style has no sprite, and emoji cannot go through the glyph pipeline (fontnik caps at U+FFFF).
 * Geometry is Lucide's `train-front` and `house` (@lucide/svelte 1.16.0, ISC), copied as
 * path data. Lucide is outline-only, so each icon's closed shapes are filled and its interior
 * details are cut back out in white.
 */
import { theme } from './theme.js';

/**
 * Drawn in order: `fill` shapes (filled and stroked grey), `cut` details (stroked white over them),
 * `stroke` lines (grey). Every grey pass gets a wider white pass underneath first, as a halo.
 * @type {Record<string, { fill: string[], cut?: string[], stroke?: string[] }>}
 */
const GEOMETRY = {
	rail: {
		fill: ['M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z'],
		cut: ['M8 3.1V7a4 4 0 0 0 8 0V3.1', 'm9 15-1-1', 'm15 15 1-1'],
		stroke: ['m8 19-2 3', 'm16 19 2 3']
	},
	school: {
		fill: [
			'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
		],
		cut: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8']
	}
};

export const CONTEXT_ICON_KINDS = Object.keys(GEOMETRY);

const ICON_PX = 18;
const HALO_WIDTH = 5;
const LINE_WIDTH = 2;
export const CONTEXT_ICON_PIXEL_RATIO = 3;

/** @param {string} kind */
export const contextIconId = (kind) => `context-${kind}`;

/**
 * Synchronous, browser-only. Null for a kind without a symbol, and during SSR.
 * @param {string} kind
 * @returns {ImageData | null}
 */
export function renderContextIcon(kind) {
	const geo = GEOMETRY[kind];
	if (!geo || typeof document === 'undefined') return null;
	const px = ICON_PX * CONTEXT_ICON_PIXEL_RATIO;
	const canvas = document.createElement('canvas');
	canvas.width = px;
	canvas.height = px;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.scale(px / 24, px / 24);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	const fills = geo.fill.map((d) => new Path2D(d));
	const strokes = (geo.stroke ?? []).map((d) => new Path2D(d));

	ctx.strokeStyle = theme.address_label_halo;
	ctx.lineWidth = HALO_WIDTH;
	for (const p of [...fills, ...strokes]) ctx.stroke(p);

	// Each filled shape is outlined white first, so overlapping shapes (the cap over its band) stay
	// legible as separate parts instead of merging into one blob.
	for (const p of fills) {
		ctx.strokeStyle = theme.address_label_halo;
		ctx.lineWidth = LINE_WIDTH + 1.5;
		ctx.stroke(p);
		ctx.fillStyle = theme.address_label;
		ctx.strokeStyle = theme.address_label;
		ctx.lineWidth = LINE_WIDTH;
		ctx.fill(p);
		ctx.stroke(p);
	}

	ctx.strokeStyle = theme.address_label_halo;
	ctx.lineWidth = 1.75;
	for (const d of geo.cut ?? []) ctx.stroke(new Path2D(d));

	ctx.strokeStyle = theme.address_label;
	ctx.lineWidth = LINE_WIDTH;
	for (const p of strokes) ctx.stroke(p);

	return ctx.getImageData(0, 0, px, px);
}
