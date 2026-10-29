import { error } from '@sveltejs/kit';
import { cityBySlug, citySlugs } from '$lib/data/cities';
import { placeholderOnly } from '$lib/data/prerender-mode';
import { datasets } from '$lib/data/datasets';
import { activeInteractiveTools } from '$lib/data/tools';
import { RECOMMENDED_FLAGS } from '$lib/data/recommended';
import { cityMeta } from '$lib/data/meta';

export const prerender = true;

export function entries() {
	if (placeholderOnly) return [];
	return citySlugs.map((city) => ({ city }));
}

export function load({ params }) {
	const city = cityBySlug[params.city];
	if (!city) throw error(404, 'Unknown city');
	const cityDatasetsByTool: Record<string, { metric: string; type: string; variant: string }[]> =
		{};
	for (const [slug, all] of Object.entries(datasets)) {
		cityDatasetsByTool[slug] = all.filter((d) => d.city === params.city);
	}
	const coveringTools = activeInteractiveTools
		.filter((tool) => (cityDatasetsByTool[tool.slug] ?? []).length > 0)
		.map((tool) => {
			const flag = RECOMMENDED_FLAGS[tool.slug];
			return {
				slug: tool.slug,
				name: tool.name,
				recommended: !!flag && city.recommended?.[flag] === true
			};
		});
	return {
		city,
		cityDatasetsByTool,
		coveringTools,
		meta: cityMeta(
			city,
			coveringTools.map((t) => t.name)
		)
	};
}
