import { formatMetric } from '$lib/data/metric-meta';
import { geojsonBounds } from '$lib/utils/bounds';
import { distanceKm, type Point } from '$lib/utils/geo';

/** A table this short is read whole; a longer one is sampled down to about this many rows. */
const MAX_ROWS = 12;
const SHARE_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/**
 * The frames worth a row in a progress table: all of them when there are few, otherwise the start,
 * the first frame to reach each tenth of the total, and the end. Sampled on `values` — kilometers
 * built, or blocks counted — rather than on the frame index, because that is the axis the HUD
 * plots: a run of cheap short links should not take up half the table.
 */
export function sampleByShare(values: number[]): number[] {
	const n = values.length;
	if (n <= MAX_ROWS) return values.map((_, i) => i);
	const total = values[n - 1];
	const picked = new Set([0, n - 1]);
	for (const share of SHARE_STEPS) {
		const i = values.findIndex((v) => v >= share * total);
		if (i >= 0) picked.add(i);
	}
	return [...picked].sort((a, b) => a - b);
}

export function featureCenter(feature: GeoJSON.Feature): Point | null {
	const bounds = geojsonBounds({ type: 'FeatureCollection', features: [feature] });
	if (!bounds) return null;
	const [[minX, minY], [maxX, maxY]] = bounds;
	return [(minX + maxX) / 2, (minY + maxY) / 2];
}

const COMPASS = [
	'north',
	'northeast',
	'east',
	'southeast',
	'south',
	'southwest',
	'west',
	'northwest'
];
const AT_MIDPOINT_KM = 0.25;

/**
 * Where a feature lies, in words, for rows that have no street name: "2.3 km northeast" of the
 * city's midpoint. Straight-line, and the bearing is read off an equirectangular projection at the
 * midpoint's latitude — plenty for one of eight compass words at city scale.
 */
export function relativeLocation(point: Point | null, center: Point | null): string {
	if (!point || !center) return '–';
	const km = distanceKm(center, point);
	if (km < AT_MIDPOINT_KM) return 'At the midpoint';
	const dx = (point[0] - center[0]) * Math.cos((center[1] * Math.PI) / 180);
	const dy = point[1] - center[1];
	const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
	return `${formatMetric('length', km * 1000)} ${COMPASS[Math.round(bearing / 45) % 8]}`;
}

export function formatShare(share: number, digits = 0): string {
	if (!Number.isFinite(share)) return '–';
	return `${(share * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

export function formatCount(n: number): string {
	return n.toLocaleString('en-US');
}
