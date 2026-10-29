import { quantile } from './line-paint.js';
import { HISTOGRAM_BIN_COUNT } from './render-config.js';

/**
 * The distribution of one metric over one dataset: the sorted values the line paint interpolates
 * over, the histogram the legend draws, and the extent it labels.
 *
 * A pure function of the data — no map instance — so the control panels can render the same ramp
 * the layers are painted with, without waiting for the map to mount.
 *
 * `properties` is nullable so a real `GeoJSON.FeatureCollection` satisfies this: GeoJSON types
 * `properties` as `GeoJsonProperties`, i.e. `{ [k: string]: any } | null`. The layers now arrive
 * typed (see $lib/data/dataset-layers) rather than as `any` off `res.json()`.
 *
 * @param {{ features?: Array<{ properties?: Record<string, unknown> | null }> } | null | undefined} geojson
 * @param {string} metricProperty
 * @param {(feature: { properties?: Record<string, unknown> | null }) => boolean} [include]
 *   Feature predicate. `Map` counts only features carrying an `ordering` — the ones the playhead
 *   builds — while `MapStatic` counts every feature.
 */
export function metricScale(geojson, metricProperty, include) {
	const values = (geojson?.features ?? [])
		.filter((f) => (include ? include(f) : true))
		.map((f) => f.properties?.[metricProperty])
		.filter(
			/** @type {(v: unknown) => v is number} */ (
				(v) => typeof v === 'number' && Number.isFinite(v)
			)
		)
		.sort((a, b) => a - b);
	const sortedValues = floored(values, RAMP_FLOOR[metricProperty]);

	return {
		sortedValues,
		histogram: histogramOf(sortedValues),
		legend: extentOf(sortedValues)
	};
}

// A metric whose ramp spreads only over the values above a floor. LinkBikeNet's `lcc_gain` is 0, or
// slightly below where the network grows and the largest component does not, for every link that
// joins two small pieces: 69% of Aachen's `closest_components` build. Counted in, those ties take
// over the quantile stops and the legend dips below zero. Left out, they clamp to the first colour.
/** @type {Record<string, number>} */
const RAMP_FLOOR = { lcc_gain: 0 };

/**
 * @param {number[]} sortedValues
 * @param {number | undefined} floor
 */
function floored(sortedValues, floor) {
	if (floor === undefined) return sortedValues;
	const above = sortedValues.filter((v) => v > floor);
	return above.length > 0 ? above : sortedValues.map(() => floor);
}

/** @param {number[]} sortedValues */
function histogramOf(sortedValues) {
	if (sortedValues.length === 0) return null;
	const min = sortedValues[0];
	const max = sortedValues[sortedValues.length - 1];
	// A single-valued metric has no distribution to draw — the ramp would be one bar at full height.
	if (min === max) return null;

	const binWidth = (max - min) / HISTOGRAM_BIN_COUNT;
	const bins = Array.from({ length: HISTOGRAM_BIN_COUNT }, (_, i) => ({
		start: min + i * binWidth,
		end: min + (i + 1) * binWidth,
		count: 0
	}));
	for (const v of sortedValues) {
		const idx = Math.min(Math.floor((v - min) / binWidth), HISTOGRAM_BIN_COUNT - 1);
		bins[idx].count++;
	}
	return { bins, maxCount: Math.max(...bins.map((b) => b.count)), min, max };
}

/** @param {number[]} sortedValues */
function extentOf(sortedValues) {
	if (sortedValues.length === 0) return null;
	return { min: quantile(sortedValues, 0), max: quantile(sortedValues, 1) };
}
