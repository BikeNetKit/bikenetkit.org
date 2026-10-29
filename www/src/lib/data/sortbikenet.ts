import { coreColors } from '$lib/colors.js';
import { lineWidthRangeFor } from '$lib/data/tools';
import { EXISTING_NETWORK_LINE_WIDTH } from '$lib/map-style/render-config.js';

/** Slack for float noise between the baseline file's summed lengths and the running total. */
const BASELINE_TOLERANCE_M = 50;

/**
 * SortBikeNet's as-built sequence, read from a scenario's starting network.
 *
 * The file holds the whole plan: nine construction waves ranked by `built_in` date, plus the
 * segments Paris has not built, which carry no `ordering`. Its `length_cumulative` runs from the
 * first wave. The 2021 baseline *is* wave 1, so under `from_2021` that wave is starting network
 * rather than growth: its `ordering` is dropped (the app-wide "not part of the built series"
 * signal — the baseline file draws it) and the running total restarts after it, newly built only,
 * as the model orderings already are. Under `from_scratch` the baseline is a 0.2 km stub below the
 * first wave, and nothing is cut.
 *
 * Returns a copy; the fetched collection is not mutated.
 */
export function realFromBaseline(
	fc: GeoJSON.FeatureCollection,
	baseline: GeoJSON.FeatureCollection | null
): GeoJSON.FeatureCollection {
	const baselineM = (baseline?.features ?? []).reduce(
		(sum, f) => sum + (f.properties?.length ?? 0),
		0
	);

	const waveEndM = new Map<number, number>();
	for (const f of fc.features) {
		const step = f.properties?.ordering;
		if (typeof step !== 'number') continue;
		waveEndM.set(step, Math.max(waveEndM.get(step) ?? 0, f.properties?.length_cumulative ?? 0));
	}
	const cut = new Set(
		[...waveEndM].filter(([, end]) => end <= baselineM + BASELINE_TOLERANCE_M).map(([step]) => step)
	);
	if (cut.size === 0) return fc;
	const cutM = Math.max(...[...cut].map((step) => waveEndM.get(step) ?? 0));

	return {
		...fc,
		features: fc.features.map((f) => {
			const step = f.properties?.ordering;
			if (typeof step !== 'number') return f;
			const properties = { ...f.properties };
			if (cut.has(step)) delete properties.ordering;
			else properties.length_cumulative = (properties.length_cumulative ?? 0) - cutM;
			return { ...f, properties };
		})
	};
}

/**
 * The network-quality total of the starting network, where the file can say it. The export
 * records `total_*` *after* each step, so the frame before the first step has no value of its own
 * — for a model ordering the first step is one segment and borrowing its value is close enough,
 * but for the as-built sequence it is a whole construction wave. There, the waves
 * `realFromBaseline` folded into the baseline still carry the total as it stood when the last of
 * them was built: exactly the starting value. Null where nothing was folded in.
 */
export function baselineQuality(fc: GeoJSON.FeatureCollection, property: string): number | null {
	let value: number | null = null;
	for (const f of fc.features) {
		const p = f.properties;
		if (typeof p?.ordering === 'number' || typeof p?.built_in !== 'string') continue;
		if (typeof p[property] === 'number') value = Math.max(value ?? -Infinity, p[property]);
	}
	return value;
}

/**
 * Every ordering is coloured by when it builds each segment, so the sequence stays readable on the
 * finished network. Dark first: the segments an ordering prioritises are the ones that stand out.
 * The palest ramp stop is left off so the last-built segments still read over the plan outline —
 * and the tool's `renderConfig` holds the line width constant, since the ramp's usual widening
 * would make the *least* prioritised segments the heaviest.
 */
export const SORTBIKENET_RAMP = [coreColors.ramp3, coreColors.ramp2, coreColors.ramp1];

export const SORTBIKENET_QUALITY = 'total_coverage';

/**
 * The orderings a city page previews: ground truth, the classical centrality, the greedy optimum
 * for the area the HUD tracks, and the null model every ordering has to beat. The map's dropdown
 * and the tool page offer all of them.
 */
export const SORTBIKENET_PRIMARY_ORDERINGS = ['real', 'betweenness', 'coverage', 'random'];

/**
 * The orderings the research finds better than the as-built order on both of its yardsticks,
 * area covered and directness. Area covered alone is not enough to rank an ordering, so these are
 * the ones starred wherever orderings are offered.
 */
const SORTBIKENET_PARETO_ORDERINGS = new Set(['hierarchy_coverage', 'dual_betweenness']);

const SORTBIKENET_STAR_LABEL = 'Beats the as-built order on both area covered and directness';

export function sortBikeNetStar(ordering: string): string | undefined {
	return SORTBIKENET_PARETO_ORDERINGS.has(ordering) ? SORTBIKENET_STAR_LABEL : undefined;
}

/**
 * SortBikeNet's baseline is the network the plan starts from, so it is drawn as ground rather than
 * as a thin context line: twice the other tools' width, and lighter so the orderings stay on top.
 */
export const SORTBIKENET_EXISTING_STYLE = {
	width: EXISTING_NETWORK_LINE_WIDTH * 2,
	color: coreColors.existingNetworkLight,
	hoverColor: coreColors.existingNetworkLightHover
};

/**
 * The `BuildupLayers` props that make a build-up read as SortBikeNet — shared by the map page and
 * the capture routes, so a screenshot draws what the page draws.
 */
export function sortBikeNetLayerProps(fc: GeoJSON.FeatureCollection | null) {
	return {
		rampColors: SORTBIKENET_RAMP,
		lineWidthRange: lineWidthRangeFor('sortbikenet'),
		planUnderlay: true,
		existingStyle: SORTBIKENET_EXISTING_STYLE,
		qualityProperty: SORTBIKENET_QUALITY,
		qualityBaseline: fc ? baselineQuality(fc, SORTBIKENET_QUALITY) : null
	};
}
