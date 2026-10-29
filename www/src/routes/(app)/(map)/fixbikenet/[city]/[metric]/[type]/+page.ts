import { cityBySlug } from '$lib/data/cities';
import { toolBySlug } from '$lib/data/tools';
import {
	buildToolPageData,
	listEntriesWithFallback,
	mapPageMeta,
	toolCoversCity
} from '$lib/data/tool-page-loader';
import { toolSwitchOptions } from '$lib/data/city-tools';
import { placeholderOnly } from '$lib/data/prerender-mode';
import { datasets } from '$lib/data/datasets';

const config = toolBySlug['fixbikenet'].config!;
const route = '/(app)/(map)/fixbikenet/[city]/[metric]/[type]' as const;

export function entries() {
	if (placeholderOnly) return [];
	return listEntriesWithFallback('fixbikenet', {
		metric: config.defaultMetric,
		type: config.defaultType
	});
}

export function load({ params }) {
	const { city, metric, type } = params;
	// Whether this tool has any dataset for the city, straight from the manifest. Drives the
	// layout's "not available here" callout, and gates the layout's client-side fetch so an
	// uncovered city never requests a file that does not exist.
	const covered = toolCoversCity(datasets.fixbikenet ?? [], city);
	const { metricOptions, typeOptions, cityOptions } = buildToolPageData({
		toolSlug: 'fixbikenet',
		axes: { metrics: config.metrics, types: config.types },
		params: { city, metric, type },
		datasets: datasets.fixbikenet ?? [],
		route
	});
	const toolOptions = toolSwitchOptions(city, datasets);

	return {
		covered,
		toolSlug: 'fixbikenet',
		city,
		metric,
		type,
		metricOptions,
		typeOptions,
		cityOptions,
		toolOptions,
		bounds: cityBySlug[city].bounds,
		meta: mapPageMeta({
			toolSlug: 'fixbikenet',
			route,
			params: { city, metric, type },
			datasets: datasets.fixbikenet ?? [],
			options: { metric: metricOptions, type: typeOptions },
			covered
		})
	};
}
