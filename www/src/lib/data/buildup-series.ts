type FeatureCollection = GeoJSON.FeatureCollection | null | undefined;

export type BuildupSeries = {
	steps: number[];
	cumulative: number[];
	lccShare: number[];
	quality: (number | undefined)[];
	baselineM: number;
	baselineShare: number;
};

export type BuildupFrames = {
	steps: number[];
	cumulative: number[];
	lccShare: number[];
	quality: (number | undefined)[];
};

/**
 * Single source of truth for the playhead's index space. The playhead is an index, but `ordering`
 * is only 0-based — not contiguous. growbikenet leaves gaps (paris rail: 837 features spanning
 * 0…846), so comparing the playhead to the raw property hides the tail of almost every dataset.
 * `steps` maps index → real `ordering` value for the filters; `cumulative` and `lccShare` are built
 * in the same pass and indexed identically, so the scrubber, the filters, the HUD cards and the
 * map tables cannot drift apart.
 */
export function buildupSeries(
	fc: FeatureCollection,
	{
		lccShareProperty = null,
		qualityProperty = null
	}: { lccShareProperty?: string | null; qualityProperty?: string | null } = {}
): BuildupSeries {
	const features = (fc?.features ?? [])
		.filter((f) => typeof f.properties?.ordering === 'number')
		.sort((a, b) => a.properties?.ordering - b.properties?.ordering);

	const steps: number[] = [];
	const cumulative: number[] = [];
	const lccShare: number[] = [];
	const quality: (number | undefined)[] = [];
	for (const f of features) {
		const p = f.properties ?? {};
		const v = p.ordering;
		if (steps.length === 0 || steps[steps.length - 1] !== v) steps.push(v);
		// No dataset currently repeats an `ordering` value; if one ever did, the last feature of
		// the step wins — `length_cumulative` is monotone, so that is the running total once the
		// whole step is built.
		const i = steps.length - 1;
		cumulative[i] = p.length_cumulative ?? 0;
		lccShare[i] = lccShareProperty ? (p[lccShareProperty] ?? 0) : 0;
		quality[i] = qualityProperty ? p[qualityProperty] : undefined;
	}
	// How much of `length_cumulative` was already there before the first step was built. Both
	// importers now write it under X5's definition — newly built only — so this is 0 in practice;
	// it stays as the guard that keeps every downstream readout in "newly built" space if an export
	// ever seeds the running total again.
	const first = features[0]?.properties;
	const baselineM = first ? (first.length_cumulative ?? 0) - (first.length ?? 0) : 0;
	// The connectedness share before anything was built. The export does not carry it, but
	// `lcc_gain` is the first step's delta against exactly that value, so subtracting it back out
	// recovers it.
	const baselineShare =
		first && lccShareProperty ? (first[lccShareProperty] ?? 0) - (first.lcc_gain ?? 0) : 0;
	return { steps, cumulative, lccShare, quality, baselineM, baselineShare };
}

/**
 * The playhead's own space: the series shifted by one, with the starting condition prepended as
 * frame 0 — existing network only, or an empty map where there is none. `steps[0] - 1` sits below
 * every real `ordering`, so the metric layer renders nothing there while linkbikenet's
 * `lcc_step === -1` baseline edges still read as connected from the start. Everything that counts
 * *build steps* (tooltip denominator, build-order legend) stays on the series.
 */
export function buildupFrames(
	series: BuildupSeries,
	qualityBaseline: number | null = null
): BuildupFrames {
	const { steps, cumulative, lccShare, quality, baselineM, baselineShare } = series;
	if (!steps.length) return { steps: [], cumulative: [], lccShare: [], quality: [] };
	return {
		steps: [steps[0] - 1, ...steps],
		cumulative: [baselineM, ...cumulative],
		lccShare: [baselineShare, ...lccShare],
		// The export records the total after each step, not before the first, so the starting
		// network borrows the first step's value — one segment's worth of difference.
		quality: [qualityBaseline ?? quality[0], ...quality]
	};
}

/**
 * Total length of the baseline network, whichever way it ships: as its own file (linkbikenet,
 * fixbikenet) or merged into the result without an `ordering` (growbikenet, whose baseline row
 * carries the whole existing network as one re-measured MultiLineString). Falls back to the
 * cumulative baseline for datasets whose baseline carries no `length`.
 */
export function existingNetworkLength(
	fc: FeatureCollection,
	existingNetwork: FeatureCollection,
	baselineM: number
): number {
	const features =
		existingNetwork?.features ??
		(fc?.features ?? []).filter((f) => typeof f.properties?.ordering !== 'number');
	const sum = features.reduce((acc, f) => acc + (f.properties?.length ?? 0), 0);
	return sum || baselineM;
}

/**
 * A feature's `ordering` is not its position — resolve it to the index the scrubber counts in, so
 * a "build step" agrees with the playback readout.
 */
export function stepIndexMap(series: BuildupSeries): Map<number, number> {
	return new Map(series.steps.map((v, i) => [v, i]));
}
