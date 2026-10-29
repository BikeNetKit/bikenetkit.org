import { dataUrl } from '$lib/data/data-base';
import contextPoints from '$lib/data/context-points.json';

export type DatasetIdent = {
	city: string;
	metric: string;
	type: string;
	variant?: string;
};

function variantSuffixFor(toolSlug: string, variant: string | undefined): string {
	if (toolSlug !== 'growbikenet' || !variant) return '';
	return variant === 'from_bikenw' ? '-from_bikenw' : '';
}

/**
 * The stem that names a *view*, and therefore its screenshot. SortBikeNet's files carry a constant
 * `network` layer between ordering and scenario, and its route drops it: the ordering is the
 * `metric`, the scenario the `type`.
 */
export function dataFilenameFor(toolSlug: string, dataset: DatasetIdent): string {
	const { city, metric, type, variant } = dataset;
	if (toolSlug === 'sortbikenet') return `${city}-${metric}-network-${type}`;
	return `${city}-${metric}-${type}${variantSuffixFor(toolSlug, variant)}`;
}

/**
 * SortBikeNet's as-built sequence ships once, under `from_2021`, and covers the whole plan — a
 * scenario only decides where reading it starts. So two views share one file.
 */
export const SORTBIKENET_REAL_SCENARIO = 'from_2021';

export function screenshotFor(
	toolSlug: string,
	dataset: DatasetIdent,
	ext: 'webp' | 'png' = 'webp'
): string {
	// Served off-repo alongside the GeoJSON (see www/DEPLOY_DATA.md); `dataUrl` only rewrites the
	// `/data` prefix, so a `/screenshots/...` path passes through to `${PUBLIC_DATA_URL}/screenshots/...`.
	return dataUrl(`/screenshots/${toolSlug}/${dataFilenameFor(toolSlug, dataset)}.${ext}`);
}

export function geojsonPathFor(toolSlug: string, dataset: DatasetIdent): string {
	const file =
		toolSlug === 'sortbikenet' && dataset.metric === 'real'
			? { ...dataset, type: SORTBIKENET_REAL_SCENARIO }
			: dataset;
	return dataUrl(`/data/${toolSlug}/${dataFilenameFor(toolSlug, file)}.geojson`);
}

/**
 * Path to a city's contextual "existing bike network" baseline layer. SortBikeNet ships one per
 * scenario — the network the plan starts from — so it takes the scenario (its route `type`).
 */
export function existingNetworkPathFor(toolSlug: string, city: string, type?: string): string {
	const scenario = toolSlug === 'sortbikenet' && type ? `-${type}` : '';
	return dataUrl(`/data/${toolSlug}/${city}-existing-network${scenario}.geojson`);
}

/** Path to superblockify's `ltns` layer — one row of block attributes per superblock. */
export function superblockBlocksPathFor(city: string, metric: string): string {
	return dataUrl(`/data/superblockify/${city}-${metric}-ltns.geojson`);
}

/** Path to a growbikenet seed layer (the metric-independent grid/rail nodes for a variant). */
export function growBikeNetSeedPathFor(city: string, type: string, variant: string): string {
	return dataUrl(
		`/data/growbikenet/${city}-${type}${growBikeNetSuffixForVariant(variant)}.geojson`
	);
}

const contextCities: Record<string, Set<string>> = Object.fromEntries(
	Object.entries(contextPoints).map(([kind, cities]) => [kind, new Set(cities)])
);

/**
 * Path to the places behind a growbikenet focus mode — rail stations or schools, from an OSM
 * extract outside the tool export (`pnpm import:context`). Null for a focus with no such layer
 * (`grid`) or a city the extract does not cover, so neither costs a request.
 */
export function contextPointsPathFor(city: string, type: string): string | null {
	return contextCities[type]?.has(city) ? dataUrl(`/data/context/${type}/${city}.geojson`) : null;
}

export function growBikeNetSuffixForVariant(variant: string): string {
	return variantSuffixFor('growbikenet', variant);
}

export const growBikeNetVariantLabels: Record<string, string> = {
	from_scratch: 'from scratch',
	from_bikenw: 'from existing'
};

/** Growth strategies for linkbikenet — the `metric` axis of its route. */
export const linkBikeNetStrategyLabels: Record<string, string> = {
	largest: 'Largest',
	closest: 'Closest',
	largest_closest: 'Largest+closest'
};
