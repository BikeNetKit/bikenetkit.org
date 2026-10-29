import {
	geojsonPathFor,
	existingNetworkPathFor,
	contextPointsPathFor,
	growBikeNetSeedPathFor,
	superblockBlocksPathFor
} from '$lib/data/tool-paths';
import { realFromBaseline } from '$lib/data/sortbikenet';

export type DatasetKey = {
	tool: string;
	city: string;
	metric: string;
	type: string;
	/** Only growbikenet has a variant axis; the others pass their synthetic `'default'`. */
	variant: string;
};

export type DatasetLayers = {
	geojson: GeoJSON.FeatureCollection | null;
	/** growbikenet: the metric-independent seed nodes. */
	seeds: GeoJSON.FeatureCollection | null;
	/** superblockify: per-block attributes; the map aggregates off the edges when absent. */
	blocks: GeoJSON.FeatureCollection | null;
	/** The contextual "existing bike network" baseline — see `wantsExistingNetwork`. */
	existingNetwork: GeoJSON.FeatureCollection | null;
	/** growbikenet rail/school focus: the stations or schools themselves, not the seeds. */
	context: GeoJSON.FeatureCollection | null;
};

/**
 * Which tools draw a separately-sourced existing-network baseline beneath their own layer.
 * growbikenet only under `from_bikenw`: `from_scratch` grows on a greenfield, so drawing the city's
 * existing network under it would misrepresent the scenario. sortbikenet ships one per scenario —
 * the network its plan starts from.
 *
 * The gate for every *map* route, shared by the interactive pages and the capture routes through
 * `fetchDatasetLayers`. Note that `$lib/export/network-svg-props` still applies its own narrower
 * rule to the SVG export (linkbikenet only), so an SVG can lack a baseline the map draws.
 */
export function wantsExistingNetwork(tool: string, variant: string): boolean {
	return (
		tool === 'fixbikenet' ||
		tool === 'linkbikenet' ||
		(tool === 'growbikenet' && variant === 'from_bikenw') ||
		tool === 'sortbikenet'
	);
}

const json = async (f: typeof fetch, url: string, signal?: AbortSignal) => {
	const res = await f(url, signal ? { signal } : undefined);
	return res.ok ? await res.json() : null;
};

type FetchOptions = {
	signal?: AbortSignal;
	/** superblockify's per-block attributes, read by the size filter and the block tooltip. */
	includeBlocks?: boolean;
	/** growbikenet's rail/school symbols — interactive map only. */
	includeContext?: boolean;
};

/**
 * Every layer a dataset needs, fetched in parallel from `PUBLIC_DATA_URL`.
 *
 * A missing file resolves to null rather than throwing: the layers are optional context in every
 * case except `geojson` itself, and the map degrades to the baseline rather than the page failing.
 */
export async function fetchDatasetLayers(
	f: typeof fetch,
	key: DatasetKey,
	{ signal, includeBlocks = true, includeContext = true }: FetchOptions = {}
): Promise<DatasetLayers> {
	const { tool, city, metric, type, variant } = key;
	const contextPath =
		tool === 'growbikenet' && includeContext ? contextPointsPathFor(city, type) : null;
	const [raw, seeds, blocks, existingNetwork, context] = await Promise.all([
		json(f, geojsonPathFor(tool, key), signal),
		tool === 'growbikenet' ? json(f, growBikeNetSeedPathFor(city, type, variant), signal) : null,
		tool === 'superblockify' && includeBlocks
			? json(f, superblockBlocksPathFor(city, metric), signal)
			: null,
		wantsExistingNetwork(tool, variant)
			? json(f, existingNetworkPathFor(tool, city, type), signal)
			: null,
		contextPath ? json(f, contextPath, signal) : null
	]);
	const geojson =
		tool === 'sortbikenet' && metric === 'real' && raw
			? realFromBaseline(raw, existingNetwork)
			: raw;
	return { geojson, seeds, blocks, existingNetwork, context };
}
