import { test, expect } from '@playwright/test';
import { SAMPLE } from './helpers';

/**
 * `/legal#privacy` and `/legal#storage` make factual claims to visitors about what this site does:
 * no cookies, nothing loaded from a third party, and exactly one localStorage key. Those are the
 * claims that let the site ship without a consent banner, and the argument collapses the moment any
 * analytics script, embed or CDN font is added.
 *
 * `pnpm check:build-output` proves no third-party origin is *referenced* in the build. This proves
 * none is *contacted* at runtime, which is the check www/README.md describes as definitive and used
 * to leave as a manual devtools procedure.
 *
 * The server-side half of the notice — truncated IPs in the access log, 14-day retention — cannot
 * be checked from here. See `pnpm check:privacy`.
 */

/** Our own origins. Everything else is a finding, including a CDN that looks innocuous. */
const OWN_HOSTS = [/^localhost$/, /^127\.0\.0\.1$/, /(^|\.)bikenetkit\.org$/];
const isOwn = (host: string) => OWN_HOSTS.some((re) => re.test(host));

/**
 * `blob:` and `data:` are same-origin by construction and reach no network — MapLibre starts its
 * workers from blob URLs. They parse to an empty hostname, so they have to be skipped explicitly
 * or every map page looks like it contacted a stranger.
 */
const REACHES_NETWORK = (url: string) => url.startsWith('http:') || url.startsWith('https:');

/** The one key the notice discloses, in `src/lib/state/userLocation.svelte.js`. */
const ALLOWED_STORAGE_KEYS = ['bnk:home-city'];

/**
 * SvelteKit's client router writes these for scroll restoration and back-navigation state. They
 * are first-party, functional, and gone when the tab closes — no consent question — but `/legal`
 * presents a closed list of what the browser holds, so they are named there too.
 */
const ALLOWED_SESSION_KEYS = ['sveltekit:snapshot', 'sveltekit:scroll'];

const ROUTES = ['/', '/cities', `/cities/${SAMPLE.typical}`, '/legal', '/more-tools'];

test('no request leaves our own origins', async ({ page }) => {
	const foreign = new Set<string>();
	page.on('request', (request) => {
		const url = request.url();
		if (!REACHES_NETWORK(url)) return;
		const host = new URL(url).hostname;
		if (!isOwn(host)) foreign.add(host);
	});

	for (const route of ROUTES) {
		await page.goto(route);
		await page.waitForLoadState('networkidle');
	}
	// A map page is the interesting one: it pulls tiles and GeoJSON, which is where a third-party
	// host would most plausibly creep back in.
	await page.goto(`/growbikenet/${SAMPLE.typical}`);
	await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
	await page.waitForLoadState('networkidle');

	expect([...foreign], 'third-party hosts contacted at runtime').toEqual([]);
});

test('no cookies are set, and only the disclosed storage key is written', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	// Exercise the one feature that stores anything — picking a home city.
	await page.goto(`/cities/${SAMPLE.typical}`);
	await page.waitForLoadState('networkidle');

	expect(await page.context().cookies(), 'cookies set').toEqual([]);

	const keys = await page.evaluate(() => Object.keys(window.localStorage));
	const undisclosed = keys.filter((key) => !ALLOWED_STORAGE_KEYS.includes(key));
	expect(undisclosed, 'localStorage keys not disclosed on /legal').toEqual([]);

	const session = await page.evaluate(() => Object.keys(window.sessionStorage));
	const undisclosedSession = session.filter((key) => !ALLOWED_SESSION_KEYS.includes(key));
	expect(undisclosedSession, 'sessionStorage keys not disclosed on /legal').toEqual([]);
});
