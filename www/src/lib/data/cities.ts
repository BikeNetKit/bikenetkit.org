import type { City, CityRecommended } from './types';
import citiesData from './cities.json';
import { SITE_RECOMMENDED } from './recommended';

const siteFlags = Object.entries(SITE_RECOMMENDED) as [keyof CityRecommended, string[]][];

export const cities = (citiesData as City[]).map((city) => {
	const flags = siteFlags.filter(([, slugs]) => slugs.includes(city.slug));
	if (flags.length === 0) return city;
	return {
		...city,
		recommended: {
			...city.recommended,
			...Object.fromEntries(flags.map(([flag]) => [flag, true]))
		} as CityRecommended
	};
});

export const citySlugs = cities.map((c) => c.slug);

export const cityBySlug = Object.fromEntries(cities.map((c) => [c.slug, c])) as Record<
	string,
	City
>;
