import dataFiles from '$lib/data/data-files.json';
import { activeInteractiveTools, growBikeNetConfig } from '$lib/data/tools';
import { growBikeNetSuffixForVariant } from '$lib/data/tool-paths';
import { isExcludedDataset } from '$lib/data/excluded-datasets';
import type { Tool, ToolConfig } from '$lib/data/types';

export type Dataset = {
	city: string;
	metric: string;
	type: string;
	variant: string;
};

export type DatasetsByTool = Record<string, Dataset[]>;

const filesByTool: Record<string, string[]> = dataFiles;

function parseGrowBikeNetFilename(stem: string): Dataset | null {
	// A suffix-less filename encodes the `from_scratch` variant — the inverse of `variantSuffixFor`,
	// which maps `from_scratch` to an empty suffix. This is the filename scheme, independent of
	// which variant the UI shows first (`defaultVariant`).
	let variant = 'from_scratch';
	let rest = stem;
	for (const v of growBikeNetConfig.variants) {
		const s = growBikeNetSuffixForVariant(v);
		if (s && rest.endsWith(s)) {
			variant = v;
			rest = rest.slice(0, -s.length);
			break;
		}
	}
	for (const metric of growBikeNetConfig.metrics) {
		for (const type of growBikeNetConfig.types) {
			const suffix = `-${metric}-${type}`;
			if (rest.endsWith(suffix)) {
				return { city: rest.slice(0, -suffix.length), metric, type, variant };
			}
		}
	}
	return null;
}

function parseSimpleFilename(
	stem: string,
	metrics: readonly string[],
	types: readonly string[]
): Dataset | null {
	for (const metric of metrics) {
		for (const type of types) {
			const suffix = `-${metric}-${type}`;
			if (stem.endsWith(suffix)) {
				return {
					city: stem.slice(0, -suffix.length),
					metric,
					type,
					variant: 'default'
				};
			}
		}
	}
	return null;
}

/**
 * `{city}-{ordering}-network-{scenario}`. The per-scenario `existing` baselines are context, not
 * datasets. `real` ships once but is a view under every scenario that leaves something to build:
 * its waves up to the scenario's baseline are already there, the rest is growth. `from_2026`'s
 * baseline *is* the last wave, so nothing is left there.
 */
function parseSortBikeNetFilename(stem: string, config: ToolConfig): Dataset[] {
	for (const scenario of config.types) {
		const suffix = `-network-${scenario}`;
		if (!stem.endsWith(suffix)) continue;
		const rest = stem.slice(0, -suffix.length);
		for (const ordering of config.metrics) {
			if (!rest.endsWith(`-${ordering}`)) continue;
			const city = rest.slice(0, -ordering.length - 1);
			if (ordering !== 'real')
				return [{ city, metric: ordering, type: scenario, variant: 'default' }];
			return ['from_scratch', 'from_2021'].map((type) => ({
				city,
				metric: ordering,
				type,
				variant: 'default'
			}));
		}
	}
	return [];
}

// The build no longer ships www/data/ (served off-repo — see www/DEPLOY_DATA.md), so datasets are
// enumerated from the committed data-files.json manifest rather than a filesystem scan. `update-data`
// regenerates the manifest from the complete on-disk tree.
function parseToolFiles(tool: Tool): Dataset[] {
	const files = filesByTool[tool.slug] ?? [];
	const config = tool.config;
	const parser = (stem: string): Dataset[] => {
		if (!config) return [];
		if (tool.slug === 'sortbikenet') return parseSortBikeNetFilename(stem, config);
		const parsed =
			tool.slug === 'growbikenet'
				? parseGrowBikeNetFilename(stem)
				: parseSimpleFilename(stem, config.metrics, config.types);
		return parsed ? [parsed] : [];
	};

	return files
		.filter((f) => f.endsWith('.geojson'))
		.flatMap((f) => parser(f.replace('.geojson', '')))
		.filter((d) => !isExcludedDataset(tool.slug, d.city))
		.sort(
			(a, b) =>
				a.city.localeCompare(b.city) ||
				a.metric.localeCompare(b.metric) ||
				a.type.localeCompare(b.type) ||
				a.variant.localeCompare(b.variant)
		);
}

/**
 * Every dataset the site can show, per tool.
 *
 * This used to be the root `+layout.server.ts` load's return value, which SvelteKit then serialised
 * into *every* prerendered page — ~344 KB repeated across ~8,700 pages, in both `__data.json` and
 * the HTML, for a value derived entirely from a file that is already committed. As a plain module it
 * ships once in the JS bundle, hashed and cached, and the prerendered pages carry none of it.
 *
 * Computed eagerly at module load: parsing ~9,900 filenames is a few milliseconds, and every
 * consumer wants the whole structure.
 */
export const datasets: DatasetsByTool = Object.fromEntries(
	activeInteractiveTools.map((tool) => [tool.slug, parseToolFiles(tool)])
);

/**
 * Tools the manifest lists no datasets for. Checked per tool rather than for a wholly empty
 * manifest: a filtered `--tool` run rewrites the manifest from the complete www/data/ tree, but a
 * tool whose data never landed would otherwise build and deploy silently missing. Asserted by the
 * preflight in src/hooks.server.ts.
 */
export const emptyTools: string[] = Object.entries(datasets)
	.filter(([, d]) => d.length === 0)
	.map(([slug]) => slug);

/**
 * linkbikenet cities whose mandatory existing-network baseline is missing from the manifest.
 *
 * linkbikenet draws its proposed links on top of that baseline — without one the map has nothing to
 * show the gaps against, and the importer itself throws. Until the GeoJSON fetches moved off the
 * prerender this was caught incidentally, by the prerenderer 404ing on the fetch
 * (`svelte.config.js` deliberately scoped its tolerant branch to fixbikenet, 15 of whose 398 cities
 * legitimately ship without one). No prerender-time fetch survives, so it is asserted here instead.
 */
export const linkBikeNetCitiesMissingBaseline: string[] = (() => {
	const files = new Set(filesByTool['linkbikenet'] ?? []);
	return [...new Set((datasets['linkbikenet'] ?? []).map((d) => d.city))]
		.filter((city) => !files.has(`${city}-existing-network.geojson`))
		.sort();
})();
