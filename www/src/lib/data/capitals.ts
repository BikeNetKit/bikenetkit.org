import type { City } from './types';

/**
 * National capitals, keyed by ISO country code → the catalog slug of that country's capital.
 *
 * The export's `meta/cities.csv` has no capital column, so this cannot live in `cities.json`
 * (which `pnpm update-data` regenerates wholesale). Keyed on slug rather than name because two
 * entries carry diacritics (`Chișinău`, `Reykjavík`) and names are not stable identifiers.
 *
 * Covers all 38 countries present in the catalog as of the 2026-09 export. If a new country
 * appears, add its capital here — `assertCapitalCoverage()` flags the gap in dev.
 */
export const CAPITAL_SLUG_BY_COUNTRY: Record<string, string> = {
	AD: 'andorralavella_ad',
	AL: 'tirana_al',
	AT: 'vienna_at',
	BA: 'sarajevo_ba',
	BE: 'brussels_be',
	BG: 'sofia_bg',
	BY: 'minsk_by',
	CH: 'bern_ch',
	CZ: 'prague_cz',
	DE: 'berlin_de',
	DK: 'copenhagen_dk',
	EE: 'tallinn_ee',
	ES: 'madrid_es',
	FI: 'helsinki_fi',
	FR: 'paris_fr',
	GB: 'london_gb',
	GR: 'athens_gr',
	HR: 'zagreb_hr',
	HU: 'budapest_hu',
	IE: 'dublin_ie',
	IS: 'reykjavik_is',
	IT: 'rome_it',
	LT: 'vilnius_lt',
	LU: 'luxembourg_lu',
	LV: 'riga_lv',
	MD: 'chisinau_md',
	ME: 'podgorica_me',
	MK: 'skopje_mk',
	NL: 'amsterdam_nl',
	NO: 'oslo_no',
	PL: 'warsaw_pl',
	PT: 'lisbon_pt',
	RO: 'bucharest_ro',
	RS: 'belgrade_rs',
	SE: 'stockholm_se',
	SI: 'ljubljana_si',
	SK: 'bratislava_sk',
	UA: 'kyiv_ua'
};

const capitalSlugs = new Set(Object.values(CAPITAL_SLUG_BY_COUNTRY));

export function isCapital(city: City): boolean {
	return capitalSlugs.has(city.slug);
}

/**
 * Dev-only sanity check: warns about countries in the catalog whose capital is missing from the
 * table, and about table entries whose slug is not in the catalog. Both fail silently otherwise —
 * a new country would simply render with no capital marked. Warns rather than throws: a missing
 * capital degrades to an ordinary dot, which is not worth breaking a page over.
 */
export function assertCapitalCoverage(cities: City[]): void {
	if (!import.meta.env.DEV) return;
	const slugs = new Set(cities.map((c) => c.slug));
	const codes = new Set(
		cities.map((c) => c.countryCode).filter((cc): cc is string => typeof cc === 'string')
	);
	const uncovered = [...codes].filter((cc) => !CAPITAL_SLUG_BY_COUNTRY[cc]);
	const dangling = Object.entries(CAPITAL_SLUG_BY_COUNTRY)
		.filter(([, slug]) => !slugs.has(slug))
		.map(([cc, slug]) => `${cc}:${slug}`);
	if (uncovered.length) console.warn('[capitals] no capital listed for', uncovered.join(', '));
	if (dangling.length) console.warn('[capitals] capital slug not in catalog:', dangling.join(', '));
}
