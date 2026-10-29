/**
 * The 1–10 "importance" score: a log spread of a heavily right-skewed centrality metric onto a
 * small integer scale, so most edges don't collapse onto the bottom step. `importanceScore` labels
 * the tooltip's value; `logNorm` also places its marker dot along the ramp.
 */

/** Position of `value` in the log-scaled [min, max] domain, clamped to [0, 1]. */
export function logNorm(value, min, max) {
	// The domain floors at a positive value — the extent min, or a small fraction of the max where
	// the min is zero (betweenness has zero-valued edges) — so log(0) never appears.
	const floor = min > 0 ? min : max * 1e-4;
	const v = Math.max(value, floor);
	const span = Math.log(max) - Math.log(floor);
	const t = span > 0 ? (Math.log(v) - Math.log(floor)) / span : 1;
	return Math.min(1, Math.max(0, t));
}

/**
 * @param {number} value
 * @param {{ min: number, max: number } | null | undefined} extent
 * @param {[number, number]} range
 * @returns {number | null} the rounded integer score, or null when there is no extent at all.
 */
export function importanceScore(value, extent, [lo, hi]) {
	if (!extent) return null;
	// A single-valued metric has no spread to rank within — 74 of growbikenet's small `rail` and
	// `school` datasets are a handful of segments that all carry the same centrality. `logNorm`
	// returns 1 for a zero-width domain, so every one of them scores `hi`: equally the most
	// important segment in this dataset, which is true of all of them. The alternative — bailing
	// out and letting the caller print the raw centrality under an "Importance" label — read as a
	// score below the scale's own minimum.
	return Math.round(lo + logNorm(value, extent.min, extent.max) * (hi - lo));
}

/**
 * Whether a metric varies at all across its dataset. A single-valued one still scores (the top of
 * the scale, above), but there is no distribution behind that score — so the ramp and the histogram
 * that would place it have nothing to show, and every surface drawing one asks here first.
 *
 * @param {{ min: number, max: number } | null | undefined} extent
 */
export function hasSpread(extent) {
	return extent != null && extent.max > extent.min;
}
