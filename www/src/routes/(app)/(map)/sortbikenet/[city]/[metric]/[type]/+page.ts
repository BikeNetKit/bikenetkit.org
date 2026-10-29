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

const config = toolBySlug['sortbikenet'].config!;
const route = '/(app)/(map)/sortbikenet/[city]/[metric]/[type]' as const;

export function entries() {
	if (placeholderOnly) return [];
	return listEntriesWithFallback('sortbikenet', {
		metric: config.defaultMetric,
		type: config.defaultType
	});
}

export function load({ params }) {
	const { city, metric, type } = params;
	const covered = toolCoversCity(datasets.sortbikenet ?? [], city);

	const { metricOptions, typeOptions, cityOptions } = buildToolPageData({
		toolSlug: 'sortbikenet',
		axes: { metrics: config.metrics, types: config.types },
		params: { city, metric, type },
		datasets: datasets.sortbikenet ?? [],
		route
	});
	const toolOptions = toolSwitchOptions(city, datasets);

	return {
		covered,
		toolSlug: 'sortbikenet',
		city,
		metric,
		type,
		metricOptions,
		typeOptions,
		cityOptions,
		toolOptions,
		bounds: cityBySlug[city].bounds,
		meta: mapPageMeta({
			toolSlug: 'sortbikenet',
			route,
			params: { city, metric, type },
			datasets: datasets.sortbikenet ?? [],
			options: { metric: metricOptions, type: typeOptions },
			covered
		})
	};
}
