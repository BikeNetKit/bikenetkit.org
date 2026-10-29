import type { ServerInit } from '@sveltejs/kit';
import { emptyTools, linkBikeNetCitiesMissingBaseline } from '$lib/data/datasets';

// Build-time preflight against the committed data-files.json manifest. Runs once per server: at the
// beginning of the prerender, and on the first request to `pnpm dev`/`pnpm preview`.
//
// It used to be the root layout's `load`. A layout server load, even one that returns nothing,
// makes the client fetch `<path>/__data.json` before rendering any route beneath it, and the
// client-only routes (/embed, /screenshot, /animation) have no such file on a static host — so
// they all rendered the 404 page. Keep server loads off the root layout.
export const init: ServerInit = () => {
	if (emptyTools.length > 0) {
		throw new Error(
			`data-files.json lists no datasets for: ${emptyTools.join(', ')}. Repopulate the data and ` +
				'regenerate the manifest with:\n' +
				'  pnpm pull-data   # rsyncs the latest server export (all tools) and transforms it'
		);
	}
	// Was enforced incidentally by the prerenderer 404ing on the fetch; the map pages no longer
	// fetch at build time, so the invariant is asserted against the manifest instead.
	if (linkBikeNetCitiesMissingBaseline.length > 0) {
		const cities = linkBikeNetCitiesMissingBaseline;
		throw new Error(
			`linkbikenet is missing its mandatory existing-network baseline for ${cities.length} ` +
				`city/cities: ${cities.slice(0, 10).join(', ')}${cities.length > 10 ? ', …' : ''}.\n` +
				'Its proposed links are drawn on top of that baseline, so the map would render blank. ' +
				'Re-export those cities, then:\n' +
				'  pnpm pull-data'
		);
	}
};
