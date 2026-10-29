import { resolve } from '$app/paths';
import { cities, citySlugs } from './cities';
import { toolBySlug } from './tools';
import type { GrowBikeNetConfig } from './types';
import { humanizeLabel } from '../utils/formatters';
import { bestMatchForCity } from '../utils/city-fallback';
import { featuredCities } from './featured-cities';
import { type DatasetIdent } from './tool-paths';
import { datasets, type Dataset } from '$lib/data/datasets';
import { axisTitle, optionLabel } from './control-copy';
import { mapMeta } from './meta';

/** One row of the toolbar's city menu — see `cityOptions` in `buildToolPageData`. */
export type CityOption = {
	slug: string;
	name: string;
	country?: string;
	countryCode?: string;
	href: string;
	available: boolean;
	/** Position in this tool+variant's featured list; absent when the city is not featured. */
	featured?: number;
};

type Axes = {
	metrics: readonly string[];
	types: readonly string[];
	variants?: readonly string[];
};

/**
 * Every prerendered entry for a tool: the datasets that exist, plus one default-parameter entry
 * per city the tool does not cover. The uncovered ones render the "not available here" state —
 * the toolbar links every tool/city pair, so every pair has to resolve to a page rather than a 404.
 *
 * Enumerated from the committed manifest, not from a `readdir` of `www/data/`. The filesystem
 * scan this replaces returned `[]` whenever the directory was absent, so a clean clone — a fresh
 * checkout, say — quietly prerendered only the ~403 fallback pages per tool instead of the real
 * combinations, and the route set depended on whether the machine happened to hold the data.
 *
 * `defaults.variant` is what distinguishes the two route shapes: growbikenet's four-segment route
 * takes a variant, the other three tools' do not. Their datasets carry a synthetic `'default'`
 * variant that must not leak into route params.
 */
export function listEntriesWithFallback(
	toolSlug: string,
	defaults: { metric: string; type: string; variant?: string }
): DatasetIdent[] {
	const withVariant = defaults.variant !== undefined;
	const existing = (datasets[toolSlug] ?? []).map(({ city, metric, type, variant }) =>
		withVariant ? { city, metric, type, variant } : { city, metric, type }
	);
	const covered = new Set(existing.map((entry) => entry.city));
	const missing = citySlugs
		.filter((slug) => !covered.has(slug))
		.map((city) => ({ city, ...defaults }));
	return [...existing, ...missing];
}

/**
 * Whether a tool has any dataset for a city. The fallback pages `listEntriesWithFallback`
 * prerenders for uncovered cities must skip their data fetches — the geojson does not exist,
 * and the prerender crawler treats a 404 on a fetched static asset as a fatal build error.
 */
export function toolCoversCity(datasets: readonly Dataset[], city: string): boolean {
	return datasets.some((d) => d.city === city);
}

/**
 * The route params a tool falls back to for a city it has no data for — and the preference
 * `defaultViewFor` starts from.
 */
function defaultParamsFor(
	toolSlug: string,
	withVariant: boolean
): { metric: string; type: string; variant?: string } {
	const cfg = toolBySlug[toolSlug]?.config;
	const params: { metric: string; type: string; variant?: string } = {
		metric: cfg?.defaultMetric ?? '',
		type: cfg?.defaultType ?? ''
	};
	// Only GrowBikeNet has a variant axis, and only its config carries the default.
	if (withVariant) params.variant = (cfg as GrowBikeNetConfig | undefined)?.defaultVariant ?? '';
	return params;
}

/**
 * The view `/<tool>/<city>` lands on: the config defaults where the data allows, otherwise the
 * closest dataset the city has. Also the canonical every other view of that tool×city points to,
 * so the redirect stubs and the canonicals cannot disagree.
 */
export function defaultViewFor(
	toolSlug: string,
	city: string,
	datasets: readonly Dataset[],
	withVariant: boolean
): { metric: string; type: string; variant?: string } {
	const defaults = defaultParamsFor(toolSlug, withVariant);
	const match = bestMatchForCity(datasets, city, defaults);
	return {
		metric: match?.metric ?? defaults.metric,
		type: match?.type ?? defaults.type,
		...(withVariant && { variant: match?.variant ?? defaults.variant ?? '' })
	};
}

type AxisOption = { value: string; label: string };
type ViewParams = { city: string; metric: string; type: string; variant?: string };
type ViewOptions = { metric: AxisOption[]; type: AxisOption[]; variant?: AxisOption[] };

export const AXIS_FALLBACK_TITLES: Record<string, string> = {
	metric: 'Metric',
	type: 'Type',
	variant: 'Variant'
};

/**
 * One axis option in words for a sentence, not a pill: a loader label set on purpose (`given`, such
 * as LinkBikeNet's strategy names) beats the panel's short label ("L2C"), which beats the raw value.
 */
export function axisOptionWords(
	toolSlug: string,
	axis: string,
	value: string,
	given?: string
): string {
	const custom = given !== undefined && given !== humanizeLabel(value) ? given : undefined;
	const short = optionLabel(toolSlug, axis, value);
	const text = custom ?? (short !== value ? short : humanizeLabel(value));
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The view a map page shows, in words, one entry per axis: for the page title and description, and
 * for the summary a crawler or screen reader gets before the map has loaded. An axis with a single
 * option says nothing about the view, so it is left out.
 */
export function mapViewLabels(
	toolSlug: string,
	params: ViewParams,
	options: ViewOptions
): { title: string; label: string }[] {
	return (['metric', 'type', 'variant'] as const).flatMap((axis) => {
		const value = params[axis];
		const opts = options[axis];
		if (value === undefined || !opts || opts.length < 2) return [];
		const given = opts.find((o) => o.value === value)?.label;
		return [
			{
				title: axisTitle(toolSlug, axis, AXIS_FALLBACK_TITLES[axis]),
				label: axisOptionWords(toolSlug, axis, value, given)
			}
		];
	});
}

/**
 * Head metadata for one map view: titled by the view, canonical on the tool×city default view,
 * and kept out of the index when the tool has no data for the city.
 */
export function mapPageMeta({
	toolSlug,
	route,
	params,
	datasets,
	options,
	covered
}: {
	toolSlug: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	route: any;
	params: ViewParams;
	datasets: readonly Dataset[];
	options: ViewOptions;
	covered: boolean;
}) {
	const { city, metric, type, variant } = params;
	const withVariant = variant !== undefined;
	const view = defaultViewFor(toolSlug, city, datasets, withVariant);
	const isDefault =
		view.metric === metric && view.type === type && (!withVariant || view.variant === variant);
	return mapMeta({
		toolSlug,
		city,
		view: mapViewLabels(toolSlug, params, options).map((v) => v.label),
		isDefault,
		canonical: resolve(route, { city, ...view }),
		covered
	});
}

type LoaderArgs = {
	toolSlug: string;
	axes: Axes;
	params: { city: string; metric: string; type: string; variant?: string };
	datasets: readonly Dataset[];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	route: any;
	variantLabel?: (variant: string) => string;
	metricLabel?: (metric: string) => string;
};

export function buildToolPageData({
	toolSlug,
	axes,
	params,
	datasets,
	route,
	variantLabel,
	metricLabel
}: LoaderArgs) {
	const { city, metric, type, variant } = params;

	const cityDatasets = datasets.filter((d) => d.city === city);
	const matchesVariant = (d: Dataset) => variant === undefined || d.variant === variant;

	const metricsForCurrent = new Set(
		cityDatasets.filter((d) => d.type === type && matchesVariant(d)).map((d) => d.metric)
	);
	const typesForCurrent = new Set(
		cityDatasets.filter((d) => d.metric === metric && matchesVariant(d)).map((d) => d.type)
	);

	// Every axis option, not just the ones the current city has: the control shows the whole axis so
	// it reads complete, and marks what this city cannot show as unavailable (the segmented control
	// renders those disabled) rather than dropping them — mirroring how `cityOptions` treats the city
	// menu below.
	const metricOptions = axes.metrics.map((m) => ({
		value: m,
		label: metricLabel?.(m) ?? humanizeLabel(m),
		available: metricsForCurrent.has(m)
	}));

	const typeOptions = axes.types.map((t) => ({
		value: t,
		label: humanizeLabel(t),
		available: typesForCurrent.has(t)
	}));

	let variantOptions: { value: string; label: string; available: boolean }[] | undefined;
	if (axes.variants) {
		const variantsForCurrent = new Set(
			cityDatasets.filter((d) => d.metric === metric && d.type === type).map((d) => d.variant)
		);
		variantOptions = axes.variants.map((v) => ({
			value: v,
			label: variantLabel?.(v) ?? v,
			available: variantsForCurrent.has(v)
		}));
	}

	const citiesWithData = new Set(datasets.map((d) => d.city));
	const featured = featuredCities(toolSlug, variant);
	const baseParams: Record<string, string> =
		variant === undefined ? { metric, type } : { metric, type, variant };

	// Every city in the catalog, not just the covered ones: the city menu offers the whole list and
	// marks what this tool cannot show, rather than hiding it and leaving the reader to wonder.
	// A dataset city with no catalog entry (a retired slug whose geojson is still on disk) has no
	// name or bounds to navigate to, so `cities` — the catalog — is the source of the list.
	const cityOptions: CityOption[] = cities
		.map((cityRecord) => {
			const slug = cityRecord.slug;
			const available = citiesWithData.has(slug);
			const match = available ? bestMatchForCity(datasets, slug, baseParams) : undefined;
			const matchParams = match
				? variant === undefined
					? { city: match.city, metric: match.metric, type: match.type }
					: {
							city: match.city,
							metric: match.metric,
							type: match.type,
							variant: match.variant
						}
				: // No data: the default parameters, which is the combination `entries()`
					// prerenders for exactly this case.
					{ city: slug, ...defaultParamsFor(toolSlug, variant !== undefined) };
			const rank = featured.indexOf(slug);
			return {
				slug,
				name: cityRecord.name,
				country: cityRecord.country,
				countryCode: cityRecord.countryCode,
				href: resolve(route, matchParams),
				available,
				...(rank >= 0 && { featured: rank })
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	return { metricOptions, typeOptions, variantOptions, cityOptions };
}
