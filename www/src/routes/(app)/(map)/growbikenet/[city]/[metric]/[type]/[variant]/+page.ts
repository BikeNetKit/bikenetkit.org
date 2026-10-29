import { cityBySlug } from '$lib/data/cities';
import { growBikeNetConfig } from '$lib/data/tools';
import {
	buildToolPageData,
	listEntriesWithFallback,
	mapPageMeta,
	toolCoversCity
} from '$lib/data/tool-page-loader';
import { toolSwitchOptions } from '$lib/data/city-tools';
import { growBikeNetVariantLabels } from '$lib/data/tool-paths';
import { placeholderOnly } from '$lib/data/prerender-mode';
import { datasets } from '$lib/data/datasets';

const config = growBikeNetConfig;
const route = '/(app)/(map)/growbikenet/[city]/[metric]/[type]/[variant]' as const;

export function entries() {
	if (placeholderOnly) return [];
	return listEntriesWithFallback('growbikenet', {
		metric: config.defaultMetric,
		type: config.defaultType,
		variant: config.defaultVariant
	}) as Array<{ city: string; metric: string; type: string; variant: string }>;
}

export function load({ params }) {
	const { city, metric, type, variant } = params;
	// Whether this tool has any dataset for the city, straight from the manifest. Drives the
	// layout's "not available here" callout, and gates the layout's client-side fetch so an
	// uncovered city never requests a file that does not exist.
	const covered = toolCoversCity(datasets.growbikenet ?? [], city);

	const { metricOptions, typeOptions, variantOptions, cityOptions } = buildToolPageData({
		toolSlug: 'growbikenet',
		axes: { metrics: config.metrics, types: config.types, variants: config.variants },
		params: { city, metric, type, variant },
		datasets: datasets.growbikenet ?? [],
		route,
		variantLabel: (v) => growBikeNetVariantLabels[v] ?? v
	});
	const toolOptions = toolSwitchOptions(city, datasets);

	return {
		covered,
		toolSlug: 'growbikenet',
		city,
		metric,
		type,
		variant,
		metricOptions,
		typeOptions,
		variantOptions,
		cityOptions,
		toolOptions,
		bounds: cityBySlug[city].bounds,
		meta: mapPageMeta({
			toolSlug: 'growbikenet',
			route,
			params: { city, metric, type, variant },
			datasets: datasets.growbikenet ?? [],
			options: { metric: metricOptions, type: typeOptions, variant: variantOptions },
			covered
		})
	};
}
