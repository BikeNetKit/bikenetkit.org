import { cityBySlug } from '$lib/data/cities';
import { toolBySlug } from '$lib/data/tools';
import { metricPropertyFor } from '$lib/data/metric-properties';
import {
	buildToolPageData,
	listEntriesWithFallback,
	mapPageMeta,
	toolCoversCity
} from '$lib/data/tool-page-loader';
import { toolSwitchOptions } from '$lib/data/city-tools';
import { placeholderOnly } from '$lib/data/prerender-mode';
import { datasets } from '$lib/data/datasets';

const config = toolBySlug['superblockify'].config!;
const route = '/(app)/(map)/superblockify/[city]/[metric]/[type]' as const;

export function entries() {
	if (placeholderOnly) return [];
	return listEntriesWithFallback('superblockify', {
		metric: config.defaultMetric,
		type: config.defaultType
	});
}

export function load({ params }) {
	const { city, metric, type } = params;
	// Whether this tool has any dataset for the city, straight from the manifest. Drives the
	// layout's "not available here" callout, and gates the layout's client-side fetch so an
	// uncovered city never requests a file that does not exist.
	const covered = toolCoversCity(datasets.superblockify ?? [], city);
	const { metricOptions, typeOptions, cityOptions } = buildToolPageData({
		toolSlug: 'superblockify',
		axes: { metrics: config.metrics, types: config.types },
		params: { city, metric, type },
		datasets: datasets.superblockify ?? [],
		route
	});
	const toolOptions = toolSwitchOptions(city, datasets);

	return {
		covered,
		toolSlug: 'superblockify',
		city,
		metric,
		type,
		metricOptions,
		typeOptions,
		cityOptions,
		toolOptions,
		metricProperty: metricPropertyFor('superblockify', metric, type),
		bounds: cityBySlug[city].bounds,
		meta: mapPageMeta({
			toolSlug: 'superblockify',
			route,
			params: { city, metric, type },
			datasets: datasets.superblockify ?? [],
			options: { metric: metricOptions, type: typeOptions },
			covered
		})
	};
}
