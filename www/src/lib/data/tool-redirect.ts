import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { citySlugs } from './cities';
import { defaultViewFor } from './tool-page-loader';
import { placeholderOnly } from './prerender-mode';
import type { Dataset } from '$lib/data/datasets';

/** GrowBikeNet is the only tool with a variant axis, so it is the only four-segment map route. */
const GROWBIKENET_ROUTE = '/(app)/(map)/growbikenet/[city]/[metric]/[type]/[variant]' as const;

type MapRoute =
	| typeof GROWBIKENET_ROUTE
	| '/(app)/(map)/fixbikenet/[city]/[metric]/[type]'
	| '/(app)/(map)/linkbikenet/[city]/[metric]/[type]'
	| '/(app)/(map)/superblockify/[city]/[metric]/[type]'
	| '/(app)/(map)/sortbikenet/[city]/[metric]/[type]';

/**
 * One `/<tool>/<city>` redirect stub per city. Skipped for `deploy:placeholder`: the prerenderer
 * *enqueues* a redirect's target, so without this guard the placeholder build would pull every map
 * page — and its GeoJSON — back into the crawl that `PLACEHOLDER_ONLY` exists to prevent.
 */
export function cityRedirectEntries() {
	if (placeholderOnly) return [];
	return citySlugs.map((city) => ({ city }));
}

/**
 * Sends `/<tool>/<city>` to that tool's default view for the city (`defaultViewFor`). Mirrors how
 * `buildToolPageData` picks its `cityOptions` hrefs, so every target is a page `entries()` already
 * prerenders.
 *
 * 302 rather than 301: the target follows data coverage, so a browser must not cache it forever.
 */
export function redirectToDefaultView(
	toolSlug: string,
	city: string,
	datasets: readonly Dataset[],
	route: MapRoute
): never {
	const { metric, type, variant } = defaultViewFor(
		toolSlug,
		city,
		datasets,
		route === GROWBIKENET_ROUTE
	);

	if (route === GROWBIKENET_ROUTE) {
		redirect(302, resolve(route, { city, metric, type, variant: variant ?? '' }));
	}
	redirect(302, resolve(route, { city, metric, type }));
}
