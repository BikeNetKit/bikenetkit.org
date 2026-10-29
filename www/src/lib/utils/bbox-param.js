/**
 * The `?bbox=` deeplink on /embed: `minLon,minLat,maxLon,maxLat`, the order GeoJSON and OSM use.
 * A box rather than a centre and zoom, because it describes what should be visible — so it
 * survives an iframe of a different size than the window it was taken from.
 */

/** @typedef {[[number, number], [number, number]]} Bbox */

// ~1 m: precise enough to reproduce a framing, short enough to keep the URL readable.
const DECIMALS = 5;

/** @param {Bbox} bbox */
export function formatBbox([[w, s], [e, n]]) {
	return [w, s, e, n].map((v) => v.toFixed(DECIMALS)).join(',');
}

/**
 * Anything malformed yields null, so the embed falls back to the city framing rather than break
 * the page it is embedded in.
 *
 * @param {string | null} raw
 * @returns {Bbox | null}
 */
export function parseBbox(raw) {
	const parts = raw?.split(',').map(Number);
	if (!parts || parts.length !== 4 || !parts.every(Number.isFinite)) return null;
	const [w, s, e, n] = parts;
	if (w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) return null;
	return [
		[w, s],
		[e, n]
	];
}
