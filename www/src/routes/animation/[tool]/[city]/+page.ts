import type { PageLoad } from './$types';
import { loadDataset } from '$lib/data/dataset-load';

export const prerender = false;
export const ssr = false;

// Seed nodes used to be fetched here, against a variant resolved as `?variant=` ?? 'from_scratch'
// while `loadDataset` resolved the result layer against the config default (`from_bikenw`) — so a
// URL without `?variant=` drew from_bikenw's network under from_scratch's seeds. Both capture
// scripts always pass the parameter, so no generated video or GIF was ever affected. The seeds now
// come from the shared `fetchDatasetLayers` on the same variant as the network they sit under.
export const load: PageLoad = (event) => loadDataset(event);
