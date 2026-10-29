/**
 * Build a reveal index for a "show every feature whose `property` is <= threshold" playhead.
 *
 * The ids are the feature's position in `features`, which is exactly what a `GeoJSONSource` with
 * `generateId` assigns — so the returned ids address the same features `setFeatureState` does.
 * Sorted by value, so advancing the threshold reveals a contiguous run and the delta between two
 * playhead positions is a slice rather than a scan.
 *
 * @param {{ properties?: Record<string, unknown> | null }[]} features
 * @param {string} property
 * @returns {{ ids: number[], values: number[] }}
 */
export function buildRevealIndex(features, property) {
	/** @type {{ id: number, value: number }[]} */
	const entries = [];
	for (let i = 0; i < features.length; i++) {
		const value = features[i]?.properties?.[property];
		if (typeof value === 'number') entries.push({ id: i, value });
	}
	entries.sort((a, b) => a.value - b.value);
	return { ids: entries.map((e) => e.id), values: entries.map((e) => e.value) };
}

/**
 * How many of `values` (ascending) are at or below `threshold` — i.e. how far into the index the
 * playhead has reached. Binary search: the playhead can jump thousands of steps in one scrub.
 * @param {number[]} values
 * @param {number | null} threshold
 */
export function countAtOrBelow(values, threshold) {
	if (threshold === null) return 0;
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (values[mid] <= threshold) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}
