import type { PageLoad } from './$types';
import { loadDataset } from '$lib/data/dataset-load';
import { parseBbox } from '$lib/utils/bbox-param';
import { toolBySlug } from '$lib/data/tools';
import { cityBySlug } from '$lib/data/cities';

// Client-only interactive map for <iframe> embedding, mirroring the tool-page URL shape:
// /embed/<tool>/<city>/<metric>/<type>/<variant> (trailing segments optional → config defaults).
// `?bbox=minLon,minLat,maxLon,maxLat` opens it on that box instead of the whole city.
// See DOCS_MAP_INTEGRATION.md (Tier 3).
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async (event) => {
	const { tool, city } = event.params;
	const toolName = toolBySlug[tool]?.name ?? tool;
	const cityName = cityBySlug[city]?.name ?? city;
	return {
		...(await loadDataset(event)),
		initialBounds: parseBbox(event.url.searchParams.get('bbox')),
		// The iframe's own document title, which a screen reader announces on entering the frame.
		// Never indexed: an embed is the map page's content inside someone else's page.
		meta: { title: `${toolName} · ${cityName}`, noindex: true }
	};
};
