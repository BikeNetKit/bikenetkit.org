// The contract between the /hero-clip capture page and scripts/generate-hero-clips.mjs. Both import
// it, so a renamed flag or a changed `seek` result cannot drift between the two. Relative imports
// only: the script loads it under plain Node.

/**
 * Matches once the page is either ready (`data-clip-ready`: the combo is loaded and the opening
 * camera has painted) or has given up (`data-clip-error` holds the reason).
 */
export const CLIP_SETTLED = 'body[data-clip-ready], body[data-clip-error]';

/**
 * @typedef {Object} ClipMeta
 * @property {{ tool: string, city: string, metric: string, type: string, variant: string }} combo
 * @property {string} cityName
 * @property {string} country
 * @property {string} toolLabel
 * @property {string} metricLabel
 * @property {string} mode
 * @property {number} steps
 * @property {number} baselineLength
 * @property {number | null} totalLength
 * @property {{ center: [number, number], zoom: number, bearing: number, pitch: number }} camera
 * @property {{ buildStart: number, buildEnd: number, teardownStart: number, teardownEnd: number, end: number }} phases
 * @property {boolean | null} basemapLoaded  `null` when rendered without a basemap
 * @property {number} zoomOffset  stops added to the fitted zoom (0 unless framed tighter)
 * @property {[number, number] | null} focus  the center the clip is framed on, when not the city's
 */

/**
 * `window.__clip` on the capture page.
 *
 * @typedef {Object} HeroClipBridge
 * @property {() => number} frames  frame count of the whole clip
 * @property {() => ClipMeta} meta
 * @property {(i: number) => Promise<boolean>} seek  show frame `i`; resolves once MapLibre is idle,
 *   or `false` when it hit the idle timeout and the frame may show unloaded tiles
 */
