import { MIN_ZOOM, MAX_ZOOM } from '$lib/map-style/render-config.js';
import { padBounds, type LngLatBoundsArray } from './bounds';

const TILE = 512;

const mercX = (lng: number): number => (lng + 180) / 360;
const mercY = (lat: number): number =>
	(180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export type Projection = {
	project: (coord: [number, number]) => [number, number];
	zoom: number;
};

export type ProjectionOptions = {
	padding?: number;
	minZoom?: number;
	maxZoom?: number;
	maxBoundsPadFactor?: number;
};

/**
 * Reproduces MapLibre's default north-up Web Mercator camera for
 * `map.fitBounds(bounds, { padding })` into a square `size`×`size` viewport,
 * including the `maxBounds = padBounds(bounds, factor)` constraint every map
 * component applies — which forces a zoom-in when the (padded) bounds are
 * narrower than the square viewport in either dimension.
 */
export function makeProjection(
	bounds: LngLatBoundsArray,
	size: number,
	{
		padding = 40,
		minZoom = MIN_ZOOM,
		maxZoom = MAX_ZOOM,
		maxBoundsPadFactor = 0.3
	}: ProjectionOptions = {}
): Projection {
	const [[w, s], [e, n]] = bounds;
	const x0 = mercX(w);
	const x1 = mercX(e);
	const y0 = mercY(n);
	const y1 = mercY(s);
	const avail = size - 2 * padding;
	const zx = Math.log2(avail / ((x1 - x0) * TILE));
	const zy = Math.log2(avail / ((y1 - y0) * TILE));
	const fitZoom = clamp(Math.min(zx, zy), minZoom, maxZoom);

	// MapLibre keeps the viewport within `maxBounds`; if the padded bounds are
	// smaller than the viewport at fitZoom, it scales up (zooms in).
	const ws0 = TILE * 2 ** fitZoom;
	const [[mw, ms], [me, mn]] = padBounds(bounds, maxBoundsPadFactor);
	const pxW = (mercX(me) - mercX(mw)) * ws0;
	const pxH = (mercY(ms) - mercY(mn)) * ws0;
	const sx = pxW < size ? size / pxW : 1;
	const sy = pxH < size ? size / pxH : 1;
	const zoom = clamp(fitZoom + Math.log2(Math.max(sx, sy)), minZoom, maxZoom);

	const worldSize = TILE * 2 ** zoom;
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	const project = ([lng, lat]: [number, number]): [number, number] => [
		(mercX(lng) - cx) * worldSize + size / 2,
		(mercY(lat) - cy) * worldSize + size / 2
	];
	return { project, zoom };
}
