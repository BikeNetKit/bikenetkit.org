import { expect, type Page } from '@playwright/test';

/**
 * Console and uncaught errors seen since the call. Returns a live array, so read it *after* the
 * navigation and the waits, not before.
 *
 * Deliberately not a blanket "no errors anywhere" net: a few are outside our control (an aborted
 * fetch on fast navigation, a devtools-only warning promoted to an error). Anything filtered here
 * has to be justified, or the assertion stops meaning anything.
 */
const IGNORED = [
	// Firing a navigation while a GeoJSON fetch is in flight aborts it. The app handles this — the
	// prefetch and the dataset loader both check for AbortError — but the browser still logs it.
	/net::ERR_ABORTED/,
	/The operation was aborted/,
	/Failed to load resource: net::ERR_ABORTED/
];

export function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	const record = (text: string) => {
		if (!IGNORED.some((re) => re.test(text))) errors.push(text);
	};
	page.on('console', (message) => {
		if (message.type() === 'error') record(message.text());
	});
	page.on('pageerror', (error) => record(`uncaught: ${error.message}`));
	return errors;
}

/**
 * Cities chosen for the shape of their coverage, not at random — the point of a sampled suite is
 * that the sample is argued for.
 */
export const SAMPLE = {
	/** The largest city in the catalogue: the heaviest payloads and the slowest draw. */
	large: 'london_gb',
	/**
	 * Ordinary, and the city most of the site's examples use. Covered by every tool except
	 * superblockify, whose export has no result for Copenhagen; a test
	 * that needs a superblockify map takes `large` instead.
	 */
	typical: 'copenhagen_dk',
	/** Covered by every tool *except* superblockify — one of the 32 gaps in the frozen export. */
	uncoveredBy: { tool: 'superblockify', city: 'rome_it' },
	/** SortBikeNet covers one city. */
	sortbikenet: 'paris_fr'
} as const;

export const TOOLS = [
	'growbikenet',
	'linkbikenet',
	'fixbikenet',
	'sortbikenet',
	'superblockify'
] as const;

/** The cities each tool's default map is sampled in. */
export function mapSampleCities(tool: (typeof TOOLS)[number]): string[] {
	return tool === 'sortbikenet' ? [SAMPLE.sortbikenet] : [SAMPLE.typical, SAMPLE.large];
}

/**
 * Routes that must render for a reader with no JavaScript story and no URL bar. Parameterised map
 * deep links are covered separately in map.e2e.ts.
 */
export const TOP_LEVEL_ROUTES = [
	'/',
	'/cities',
	'/cities/table',
	'/more-tools',
	'/legal',
	'/design',
	'/hero',
	...TOOLS.map((tool) => `/${tool}`),
	`/cities/${SAMPLE.typical}`
];

/**
 * Assert on the app's own state rather than on pixels. MapLibre does render in headless Chromium —
 * the screenshot generator depends on it — but a pixel assertion over a WebGL canvas is a flake
 * factory, and the thing actually worth knowing is "the data arrived and the layers went in".
 *
 * `MapLoadingNotice` is exactly that signal. It renders only on a genuinely empty map, carries the
 * failure copy when the fetch fails, and disappears when the network is drawn.
 *
 * Its headings are `uppercase` in CSS, so they reach rendered text as "COULD NOT LOAD". Matched
 * case-insensitively for that reason — a literal `'Could not load'` matches nothing, and the
 * assertion then passes against a page that never loaded.
 */
export const COULD_NOT_LOAD = /could not load/i;
export const FETCHING = /fetching the network/i;

export async function expectMapDrawn(page: Page) {
	await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
	await expect(page.getByText(COULD_NOT_LOAD)).toHaveCount(0);
	await expect(page.getByText(FETCHING)).toHaveCount(0, { timeout: 30_000 });
}
