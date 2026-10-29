import { cities } from '$lib/data/cities';
import { datasets } from '$lib/data/datasets';

export const prerender = true;

export function load() {
	const gbnSlugs = new Set((datasets.growbikenet ?? []).map((d) => d.city));
	const fbnSlugs = new Set((datasets.fixbikenet ?? []).map((d) => d.city));
	const featuredGbnCities = cities
		.filter((c) => c.recommended?.gbn && gbnSlugs.has(c.slug))
		.slice(0, 3);
	const featuredFbnCities = cities
		.filter((c) => c.recommended?.fbn && fbnSlugs.has(c.slug))
		.slice(0, 3);
	return { featuredGbnCities, featuredFbnCities };
}
