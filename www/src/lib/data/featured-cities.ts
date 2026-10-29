/**
 * Editorial picks: the cities each tool is shown off with when the reader's focus is the *tool* —
 * its landing page, the map's city menu, the "not available" callout and the landing hero.
 * When the focus is a *city* (city page, tool tabs, CityPanel) the recommendation flags apply
 * instead — the export's rec_table plus `SITE_RECOMMENDED`; see recommended.ts. Order is display order. Not derived from the export: it is site
 * content, and `pnpm check:coverage` fails if a pick loses its data.
 */
export const FEATURED_CITIES: Record<string, readonly string[]> = {
	superblockify: ['berlin_de', 'vienna_at', 'barcelona_es', 'warsaw_pl', 'malmo_se', 'ghent_be'],
	'growbikenet:from_bikenw': [
		'prague_cz',
		'rome_it',
		'podgorica_me',
		'radom_pl',
		'turin_it',
		'newcastleupontyne_gb'
	],
	'growbikenet:from_scratch': [
		'athens_gr',
		'kyiv_ua',
		'naples_it',
		'odessa_ua',
		'donetsk_ua',
		'pristina_rs'
	],
	linkbikenet: ['budapest_hu', 'dublin_ie', 'tirana_al', 'kecskemet_hu', 'lyon_fr', 'marseille_fr'],
	fixbikenet: [
		'aalborg_dk',
		'amsterdam_nl',
		'copenhagen_dk',
		'augsburg_de',
		'antwerp_be',
		'helsinki_fi'
	],
	sortbikenet: ['paris_fr']
};

/** Featured slugs for a tool (and, for GrowBikeNet, a variant), in display order. Tools with a
 *  single flavor ignore `variant`, including the synthetic `'default'` their datasets carry. */
export function featuredCities(tool: string, variant?: string): readonly string[] {
	return FEATURED_CITIES[`${tool}:${variant}`] ?? FEATURED_CITIES[tool] ?? [];
}
