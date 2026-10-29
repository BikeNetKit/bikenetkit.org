import { base } from '$app/paths';
import type { City } from './types';
import type { Dataset, DatasetsByTool } from '$lib/data/datasets';
import { RECOMMENDED_FLAGS } from './recommended';
import { activeInteractiveTools, toolBySlug, growBikeNetConfig } from './tools';
import { cityBySlug } from './cities';

export function cityCenter(city: City): [number, number] {
	const [[minLon, minLat], [maxLon, maxLat]] = city.bounds;
	return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

export function availableSlugs(city: City, datasets: DatasetsByTool): string[] {
	return activeInteractiveTools
		.map((tool) => tool.slug)
		.filter((slug) => datasets[slug]?.some((d) => d.city === city.slug));
}

export function recommendedSlugs(city: City): string[] {
	const rec = city.recommended;
	if (!rec) return [];
	return activeInteractiveTools
		.map((tool) => tool.slug)
		.filter((slug) => {
			const flag = RECOMMENDED_FLAGS[slug];
			return flag !== undefined && rec[flag];
		});
}

// `variant` pins the GrowBikeNet flavor; without it GrowBikeNet falls back to its default variant
// and every other tool ignores the axis.
export function pickDataset(
	slug: string,
	city: City,
	datasets: DatasetsByTool,
	variant?: string
): Dataset | undefined {
	const all = (datasets[slug]?.filter((d) => d.city === city.slug) ?? []).filter(
		(d) => variant === undefined || d.variant === variant
	);
	if (all.length === 0) return undefined;
	const cfg = toolBySlug[slug]?.config;
	if (cfg) {
		const wanted =
			variant ?? (slug === 'growbikenet' ? growBikeNetConfig.defaultVariant : undefined);
		const preferred = all.find(
			(d) =>
				d.metric === cfg.defaultMetric &&
				d.type === cfg.defaultType &&
				(wanted === undefined || d.variant === wanted)
		);
		if (preferred) return preferred;
	}
	return all[0];
}

export function toolCityHref(
	slug: string,
	city: City,
	datasets: DatasetsByTool,
	variant?: string
): string {
	const d = pickDataset(slug, city, datasets, variant);
	// No dataset: the tool's default parameters. That combination is prerendered for every city
	// (see `listEntriesWithFallback`) and renders the "not available here" state, so the toolbar
	// can offer every tool for every city instead of dead-ending on a disabled tab.
	if (!d) {
		const cfg = toolBySlug[slug]?.config;
		if (!cfg) return `${base}/${slug}`;
		const tail =
			slug === 'growbikenet'
				? `/${cfg.defaultMetric}/${cfg.defaultType}/${growBikeNetConfig.defaultVariant}`
				: `/${cfg.defaultMetric}/${cfg.defaultType}`;
		return `${base}/${slug}/${city.slug}${tail}`;
	}
	if (slug === 'growbikenet') {
		return `${base}/${slug}/${city.slug}/${d.metric}/${d.type}/${d.variant}`;
	}
	return `${base}/${slug}/${city.slug}/${d.metric}/${d.type}`;
}

export type ToolSwitchOption = {
	slug: string;
	name: string;
	/** Carried through so `<ToolName>` in the switcher splits a name the same way the rest of the
	 *  site does — see `Tool.nameParts`. */
	nameParts?: string[];
	available: boolean;
	recommended: boolean;
	href: string;
};

// Options for the tool switcher: change tool, keep the city. Tools without data for the city keep
// an href — the page they land on says so and suggests cities that do have it — and carry
// `available: false` so the UI can mark them.
export function toolSwitchOptions(citySlug: string, datasets: DatasetsByTool): ToolSwitchOption[] {
	const city = cityBySlug[citySlug];
	const recommended = new Set(city ? recommendedSlugs(city) : []);
	return activeInteractiveTools.map((tool) => {
		const available = !!datasets[tool.slug]?.some((d) => d.city === citySlug);
		return {
			slug: tool.slug,
			name: tool.name,
			nameParts: tool.nameParts,
			available,
			recommended: recommended.has(tool.slug),
			href: city ? toolCityHref(tool.slug, city, datasets) : `${base}/${tool.slug}`
		};
	});
}
