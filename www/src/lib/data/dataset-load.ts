import { toolBySlug, growBikeNetConfig } from '$lib/data/tools';
import { fetchDatasetLayers } from '$lib/data/dataset-layers';
import { loadCityBoundary } from '$lib/data/boundaries';
import { cityBySlug } from '$lib/data/cities';
import { metricPropertyFor } from '$lib/data/metric-properties';
import type { GrowBikeNetConfig } from '$lib/data/types';

type DatasetLoadArgs = {
	// metric/type/variant may arrive as path params (the /embed and tool-page routes) or as query
	// params (the /screenshot capture route); path params win, then query, then the config default.
	params: { tool: string; city: string; metric?: string; type?: string; variant?: string };
	fetch: typeof fetch;
	url: URL;
};

/**
 * The capture and embed routes' dataset load: /embed, /screenshot and /animation. All three are
 * `ssr = false`, so this always runs in the browser.
 *
 * The interactive map routes do *not* use this — they prerender their shell and fetch the same
 * layers from the client through `$lib/data/active-dataset`. Both paths share
 * `fetchDatasetLayers`, so the layer set and the existing-network gate cannot drift apart.
 */
export async function loadDataset({ params, fetch, url }: DatasetLoadArgs) {
	const { tool, city } = params;
	const config = toolBySlug[tool]?.config ?? growBikeNetConfig;
	const metric = params.metric ?? url.searchParams.get('metric') ?? config.defaultMetric;
	const type = params.type ?? url.searchParams.get('type') ?? config.defaultType;
	const variant =
		params.variant ??
		url.searchParams.get('variant') ??
		(config as GrowBikeNetConfig).defaultVariant ??
		'from_scratch';

	const [layers, cityBoundary] = await Promise.all([
		// The `-ltns` layer is fetched here too: the size filter has to read superblockify's own
		// block areas, or a capture would hide different blocks than the tool page.
		// `includeContext: false`: the rail/school symbols are interactive-map context only.
		fetchDatasetLayers(fetch, { tool, city, metric, type, variant }, { includeContext: false }),
		loadCityBoundary(fetch, city)
	]);

	return {
		...layers,
		city,
		tool,
		metric,
		type,
		variant,
		metricProperty: metricPropertyFor(tool, metric, type),
		bounds: cityBySlug[city].bounds,
		cityBoundary
	};
}
