import { matchKeys, matchesFolded } from './text-fold';

export interface SearchableCity {
	name: string;
	country?: string;
	countryCode?: string;
}

export interface CitySearchResult<T> {
	/** Uppercased code, when the query is exactly a country code present in `items`. */
	countryCode: string | null;
	/** That country's display name, for the results header. */
	countryName: string | null;
	/** What the surface lists. */
	matches: T[];
	/** Cities whose *name* matches those two letters — only ever populated in country mode,
	 *  so a surface can offer "…or 8 cities named 'be'" as an escape hatch. */
	nameMatches: T[];
}

/**
 * Match cities by name, by country name, or — for an exact two-letter query — by country code.
 *
 * Matching is diacritic- and punctuation-insensitive on both sides (see `text-fold.ts`), so
 * "gutersloh", "guetersloh" and "Gütersloh" are one query, and so are "saint etienne" and
 * "Saint-Étienne".
 *
 * Generic over the shape because the two search surfaces hold different records: `CitySearch` gets
 * the full catalog entries, `CitySelect` the flattened `cityOptions` rows from `tool-page-loader`.
 */
export function searchCities<T extends SearchableCity>(
	items: readonly T[],
	query: string
): CitySearchResult<T> {
	const queryKeys = matchKeys(query);
	// The plain key, which is also what the country-code test below reads: "ö" folds to a 1-char
	// plain key and a 2-char transliterated one, and only the former is a candidate country code.
	const q = queryKeys[0];
	if (!q) return { countryCode: null, countryName: null, matches: [], nameMatches: [] };

	const byName = (c: T) => matchesFolded(c.name, queryKeys);

	// A two-letter query that *is* a country code we cover means the country, not a name fragment —
	// that is what clicking a chip produces, and what makes "DK" useful. Two letters that match no
	// covered country fall through to normal matching, so a per-tool subset never dead-ends. The
	// fold drops separators before the count, so "d.k." and "d k" reach Denmark too.
	if (q.length === 2) {
		const inCountry = items.filter((c) => c.countryCode?.toLowerCase() === q);
		if (inCountry.length > 0) {
			return {
				countryCode: q.toUpperCase(),
				countryName: inCountry[0].country ?? q.toUpperCase(),
				matches: inCountry,
				// The same two letters often start city names too (BE → Berlin, Belgrade): kept aside
				// so the surface can offer them rather than silently hiding them.
				nameMatches: items.filter(byName)
			};
		}
	}

	return {
		countryCode: null,
		countryName: null,
		matches: items.filter(
			(c) => byName(c) || (c.country ? matchesFolded(c.country, queryKeys) : false)
		),
		nameMatches: []
	};
}
