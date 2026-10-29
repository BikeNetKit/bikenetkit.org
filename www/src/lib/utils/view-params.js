/**
 * View toggles that live in the query string.
 *
 * Seed points and basemap labels are part of what a reader is looking at, so a view stays linkable
 * and bookmarkable, and back/forward steps through it. Only non-default values appear in the URL,
 * so the common case keeps a clean address.
 *
 * No load function reads the query string, so `setViewFlag` only moves the URL — it never refetches
 * a dataset.
 *
 * **Never read during SSR.** These routes are prerendered, and SvelteKit throws on
 * `url.searchParams` on a prerendered page — there is no one request to bake in. The prerendered
 * HTML therefore shows the defaults, and the client picks the real value up on hydration.
 */
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/state';

/** Every flag, and the value that is left out of the URL. */
const DEFAULTS = {
	labels: true,
	seeds: true,
	colorby: false
};

/**
 * @param {keyof typeof DEFAULTS} name
 * @returns {boolean}
 */
export function viewFlag(name) {
	if (!browser) return DEFAULTS[name];
	const raw = page.url.searchParams.get(name);
	return raw === null ? DEFAULTS[name] : raw === '1';
}

/**
 * The query string carrying every non-default flag, ready to append to an href — so the segmented
 * controls keep the current view when they switch metric, type or variant.
 *
 * @returns {string} `''`, or `?…`
 */
export function viewSearch() {
	if (!browser) return '';
	const params = new URLSearchParams();
	for (const name of /** @type {(keyof typeof DEFAULTS)[]} */ (Object.keys(DEFAULTS))) {
		const value = viewFlag(name);
		if (value !== DEFAULTS[name]) params.set(name, value ? '1' : '0');
	}
	const search = params.toString();
	return search ? `?${search}` : '';
}

/**
 * @param {keyof typeof DEFAULTS} name
 * @param {boolean} value
 */
export function setViewFlag(name, value) {
	const url = new URL(page.url);
	if (value === DEFAULTS[name]) url.searchParams.delete(name);
	else url.searchParams.set(name, value ? '1' : '0');
	goto(`${url.pathname}${url.search}`, { noScroll: true, keepFocus: true });
}
