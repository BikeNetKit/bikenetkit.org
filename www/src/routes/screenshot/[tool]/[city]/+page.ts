import type { PageLoad } from './$types';
import { loadDataset } from '$lib/data/dataset-load';

export const prerender = false;
export const ssr = false;

export const load: PageLoad = async (event) => ({
	...(await loadDataset(event)),
	meta: { title: 'Screenshot' }
});
