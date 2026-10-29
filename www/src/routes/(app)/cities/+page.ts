import { cities } from '$lib/data/cities';
import { datasets } from '$lib/data/datasets';

export const prerender = true;

export function load() {
	const growbikenetSlugs = new Set((datasets.growbikenet ?? []).map((d) => d.city));
	return {
		cities,
		growbikenetSlugs,
		meta: {
			title: 'Cities',
			description: `Bicycle-network analyses for ${cities.length} cities worldwide, across the BikeNetKit tools.`
		}
	};
}
