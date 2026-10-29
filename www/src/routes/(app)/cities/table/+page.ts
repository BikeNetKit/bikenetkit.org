import { cities } from '$lib/data/cities';
import { buildCoverageRows } from '$lib/data/coverage';
import { datasets } from '$lib/data/datasets';

export const prerender = true;

export function load() {
	return {
		rows: buildCoverageRows(cities, datasets),
		meta: {
			title: 'Tool coverage by city',
			description: 'Which BikeNetKit tool covers which city, at a glance.'
		}
	};
}
