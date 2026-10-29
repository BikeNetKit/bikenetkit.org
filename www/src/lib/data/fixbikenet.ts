import { importanceScore } from '$lib/map-style/importance.js';
import { coreColors } from '$lib/colors.js';
import { streetLabel } from '$lib/data/metric-meta';

/** FixBikeNet's gap ramp: the standard ramp without `ramp-0`. */
export const FIXBIKENET_RAMP = [coreColors.ramp1, coreColors.ramp2, coreColors.ramp3];

/** The gap benefit is shown as a 1–10 score (a log spread of the skewed extent). */
export const GAP_SCORE_RANGE: [number, number] = [1, 10];

type RankedGap = {
	idx: number;
	rank: number;
	label: string | null;
	benefit: number;
	score: number | null;
	feature: GeoJSON.Feature;
};

/**
 * The missing links, most severe first. `idx` is the feature's array position — the feature-state
 * id `generateId` assigns — so highlighting it lights the matching segment/dot on the map.
 *
 * Ranked over *segments*, so one street can hold several rows — London's #3 and #4 are both
 * Westferry Road, and their benefits (7174, 7173) even round to the same score. The gap network
 * splits at intersections, which is why; the rank and the map highlight are what tell the two
 * apart. Not deduplicated by name on purpose: 184 of 398 cities repeat a name here, and picking one
 * segment per street would make this a ranking of streets rather than of gaps.
 *
 * The whole ranking is built, not just the top few: every gap network in the frozen export caps at
 * 50 features, so it costs one pass over a file the map has already parsed.
 */
export function rankGaps(
	fc: GeoJSON.FeatureCollection | null | undefined,
	extent: { min: number; max: number } | null | undefined
): RankedGap[] {
	return (fc?.features ?? [])
		.map((feature, idx) => ({ idx, benefit: feature.properties?.benefit, feature }))
		.filter((s): s is { idx: number; benefit: number; feature: GeoJSON.Feature } =>
			Number.isFinite(s.benefit)
		)
		.sort((a, b) => b.benefit - a.benefit)
		.map((s, rank) => ({
			idx: s.idx,
			rank: rank + 1,
			label: streetLabel(s.feature.properties?.name),
			benefit: s.benefit,
			score: importanceScore(s.benefit, extent, GAP_SCORE_RANGE),
			feature: s.feature
		}));
}
