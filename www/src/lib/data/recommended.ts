import type { CityRecommended } from './types';

export const RECOMMENDED_FLAGS: Record<string, keyof CityRecommended> = {
	growbikenet: 'gbn',
	linkbikenet: 'lbn',
	fixbikenet: 'fbn',
	sortbikenet: 'sbn',
	superblockify: 'sb'
};

/** Recommendations the export cannot make: `rec_table.csv` has no SortBikeNet column, and its one
 *  city is its recommendation. Applied when `cities.ts` loads `cities.json`, not in `update-data`,
 *  so a re-import cannot drop them. */
export const SITE_RECOMMENDED: Partial<Record<keyof CityRecommended, string[]>> = {
	sbn: ['paris_fr']
};
