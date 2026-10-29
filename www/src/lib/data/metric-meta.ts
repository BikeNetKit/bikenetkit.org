import { format } from 'd3-format';
import { humanizeLabel } from '$lib/utils/formatters';

export type MetricMeta = {
	label: string;
	unit?: string;
	format: (v: number) => string;
	transform?: (v: number) => number;
};

const fmt = (spec: string) => format(spec);

const metersInt = fmt(',.0f');
const kmOneDecimal = fmt(',.1f');

/** The bare number for a length in meters, rendered in the given unit. */
function lengthValueIn(meters: number, unit: 'm' | 'km'): string {
	if (unit === 'm') return metersInt(meters);
	const km = meters / 1000;
	return km < 10 ? kmOneDecimal(km) : String(Math.round(km));
}

/** Format a length in meters: < 1 km → meters (integer), ≥ 1 km → km (1 decimal). */
function formatLengthMeters(meters: number): string {
	if (!Number.isFinite(meters)) return String(meters);
	const unit = meters < 1000 ? 'm' : 'km';
	return `${lengthValueIn(meters, unit)} ${unit}`;
}

/**
 * Two lengths meant to be read as a sum ("878 + 100 km"). Both halves share one unit — picked
 * from the total, so a small delta next to a big baseline never flips to meters mid-expression.
 */
export function formatLengthPair(
	baseM: number,
	deltaM: number
): { base: string; delta: string; unit: string } {
	const unit = baseM + deltaM < 1000 ? 'm' : 'km';
	return {
		base: lengthValueIn(baseM, unit),
		delta: lengthValueIn(deltaM, unit),
		unit
	};
}

export const METRIC_META: Record<string, MetricMeta> = {
	betweenness: { label: 'Betweenness centrality', format: fmt('.3f') },
	closeness: { label: 'Closeness centrality', format: fmt('.2r') },
	length: { label: 'Length', format: formatLengthMeters },
	// FixBikeNet is the only tool whose features carry one. It is the street the missing link runs
	// along, and "Street" says that where the bare column name did not — the row rendered as "NAME".
	//
	// Only `label` is live here: `streetLabel` below intercepts every `name` value before it could
	// reach `formatMetric`, so this `format` is unreachable. It stays because `MetricMeta` requires
	// the field — do not trust it as the formatter for this property.
	name: { label: 'Street', format: (v) => String(v) },
	length_cumulative: { label: 'Built', format: formatLengthMeters },
	total_coverage: {
		label: 'Area covered',
		unit: 'km²',
		format: fmt(',.1f'),
		transform: (v) => v / 1e6
	},
	lcc_share: {
		label: 'Network connected',
		unit: '%',
		format: fmt(',.1f'),
		transform: (v) => v * 100
	},
	lcc_gain: {
		label: 'Connectivity gain',
		format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`,
		transform: (v) => v * 100
	},
	edge_betweenness_linear: { label: 'Edge betweenness (linear)', format: fmt('.3f') },
	edge_betweenness_linear_restricted: {
		label: 'Edge betweenness, restricted',
		format: fmt('.3f')
	},
	node_betweenness_linear: { label: 'Node betweenness', format: fmt('.3f') },
	node_betweenness_linear_restricted: {
		label: 'Node betweenness, restricted',
		format: fmt('.3f')
	},
	edge_betweenness_normal: { label: 'Edge betweenness', format: fmt('.3f') },
	edge_betweenness_length: { label: 'Edge betweenness (length)', format: fmt('.3f') },
	betweenness_percentile: { label: 'Betweenness percentile', unit: '%', format: fmt(',.0f') },
	population: { label: 'Population', format: fmt(',.0f') },
	population_density: { label: 'Population density', unit: '/km²', format: fmt(',.0f') },
	area: { label: 'Area', unit: 'm²', format: fmt(',.0f') },
	travel_time: { label: 'Travel time', unit: 's', format: fmt(',.1f') },
	travel_time_restricted: { label: 'Travel time, restricted', unit: 's', format: fmt(',.1f') },
	bearing: { label: 'Bearing', unit: '°', format: fmt(',.0f') },
	speed_kph: { label: 'Speed', unit: 'km/h', format: fmt(',.0f') },
	street_count: { label: 'Street count', format: fmt(',.0f') }
};

export function formatMetric(id: string, raw: number): string {
	const meta = METRIC_META[id];
	if (!meta) return Number.isFinite(raw) ? raw.toFixed(2) : String(raw);
	const v = meta.transform ? meta.transform(raw) : raw;
	return meta.unit ? `${meta.format(v)} ${meta.unit}` : meta.format(v);
}

/** What the export writes where a way has no name. Both appear in the frozen 2026-09-15 data. */
const NO_STREET_NAME = new Set(['', 'n/a']);

/**
 * The street a FixBikeNet gap runs along, as a reader-facing label — or `null` where the export has
 * no name for it. Deliberately not a `METRIC_META.format`: every entry there takes a number, and
 * this is the one property whose raw value is a string or a list of them.
 *
 * All four shapes below are real in the frozen export, so none of the branches is defensive:
 *   "Soerser Weg"                   → "Soerser Weg"
 *   ["Fortius", "Citius", "Altius"] → "Fortius, Citius, Altius"   merged parallel ways
 *   ["", "Jadranski most"]          → "Jadranski most"            blank members dropped
 *   "n/a"                           → null                       659 features across 271 cities
 *
 * A fifth shape only exists on the way back out of MapLibre: a GeoJSON source serializes array
 * properties, so a feature read off a map event carries `'["A","B"]'` as a string. The tooltip
 * is fed exactly those, hence the parse — the Top 5 panel reads the raw file and never sees it.
 */
export function streetLabel(raw: string | string[] | null | undefined): string | null {
	const parts = nameParts(raw)
		.filter((v): v is string => typeof v === 'string')
		.map((v) => v.trim())
		.filter((v) => !NO_STREET_NAME.has(v.toLowerCase()));
	return parts.length ? parts.join(', ') : null;
}

function nameParts(raw: string | string[] | null | undefined): (string | null | undefined)[] {
	if (typeof raw === 'string' && raw.startsWith('[')) {
		try {
			const parsed: string[] = JSON.parse(raw);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// A street literally named "[…": fall through and show it verbatim.
		}
	}
	return Array.isArray(raw) ? raw : [raw];
}

/**
 * A metric read as "baseline + surplus", the way `formatLengthPair` reads a length — but driven
 * by the metric's own formatter and unit, so a share renders as "9.5 + 90.5 %".
 *
 * `sign` is carried separately rather than folded into `delta` because not every metric grows
 * monotonically: `lcc_share` dips when a new link fails to merge into the largest component and
 * only grows the denominator, and "9.5 + -0.1 %" is not a readable number.
 *
 * Only meaningful where `transform` is linear — every one of them is a ×100 rescale today —
 * since otherwise `transform(delta)` is not the delta of the transformed values.
 */
export function formatMetricPair(
	id: string,
	base: number,
	delta: number
): { base: string; delta: string; unit: string; sign: '+' | '−' } {
	const sign = delta < 0 ? '−' : '+';
	// Lengths pick their unit from the total rather than from the metric — keep that special case.
	if (id === 'length' || id === 'length_cumulative') {
		return { ...formatLengthPair(base, Math.abs(delta)), sign };
	}
	const meta = METRIC_META[id];
	const transform = meta?.transform ?? ((v: number) => v);
	const formatValue = meta?.format ?? ((v: number) => String(v));
	return {
		base: formatValue(transform(base)),
		delta: formatValue(Math.abs(transform(delta))),
		unit: meta?.unit ?? '',
		sign
	};
}

export function labelFor(id: string): string {
	return METRIC_META[id]?.label ?? humanizeLabel(id);
}
