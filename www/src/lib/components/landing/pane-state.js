// The state an AmbientMapPane is bound to: the landing hero keeps two (one per cross-fade pane),
// the /hero-clip capture route one.

/**
 * @typedef {Object} PaneCombo
 * @property {string} tool
 * @property {string} city
 * @property {string} [metric]
 * @property {string} [type]
 * @property {string} [variant]
 */

/**
 * @typedef {Object} PaneCurrent
 * @property {PaneCombo} combo
 * @property {string} mode
 * @property {number} total
 * @property {number[]} cumulativeLengths
 * @property {number} baselineLength
 * @property {GeoJSON.FeatureCollection | null} [geojson]  the revealed layer; `null` for superblock clips
 * @property {GeoJSON.FeatureCollection | null} [hulls]
 */

/**
 * @typedef {{ current: PaneCurrent | null, frame: number, bearing: number, zoom: number, baseZoom: number, zoomPullOffset: number, center: [number, number], phase: string }} PaneState
 */

/** @returns {PaneState} */
export const makePaneState = () => ({
	current: null,
	frame: -1,
	bearing: 0,
	zoom: 5,
	baseZoom: 5,
	zoomPullOffset: 0,
	center: [0, 51],
	phase: 'idle'
});
