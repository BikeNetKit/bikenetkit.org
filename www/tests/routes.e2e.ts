import { test, expect } from '@playwright/test';
import { collectErrors, TOP_LEVEL_ROUTES } from './helpers';

test.describe('every route renders', () => {
	for (const route of TOP_LEVEL_ROUTES) {
		test(`${route} has a heading and no console errors`, async ({ page }) => {
			const errors = collectErrors(page);
			const response = await page.goto(route);

			expect(response?.status(), `${route} should be 200`).toBe(200);
			// One h1, and it has words in it. The cheapest possible test for "the page rendered
			// something" that still fails on an empty shell.
			await expect(page.locator('h1')).toHaveCount(1);
			expect((await page.locator('h1').innerText()).trim().length).toBeGreaterThan(0);

			await page.waitForLoadState('networkidle');
			expect(errors, `console errors on ${route}`).toEqual([]);
		});
	}
});

test('an unknown URL renders the branded 404, not a blank page', async ({ page }) => {
	const response = await page.goto('/this-route-does-not-exist');
	expect(response?.status()).toBe(404);
	// The error page carries the wordmark and a way back, which is the whole reason it exists
	// rather than the framework default.
	await expect(page.getByRole('link', { name: /bike ?net ?kit/i }).first()).toBeVisible();
	await expect(page.getByText('404')).toBeVisible();
});

test('robots.txt and sitemap.xml are served and point at each other', async ({ request }) => {
	const robots = await request.get('/robots.txt');
	expect(robots.status()).toBe(200);
	const robotsBody = await robots.text();
	expect(robotsBody).toContain('Sitemap:');

	const sitemap = await request.get('/sitemap.xml');
	expect(sitemap.status()).toBe(200);
	const sitemapBody = await sitemap.text();
	expect(sitemapBody).toContain('<urlset');
	// The city pages are the bulk of the sitemap; a sitemap with only the landing page in it is
	// the failure mode worth catching.
	expect(sitemapBody.match(/<url>/g)?.length ?? 0).toBeGreaterThan(100);
});

test('a map view is served with a heading and points search engines at its default view', async ({
	request
}) => {
	// The raw HTML, as a crawler that runs no JavaScript gets it: the panels only appear once the
	// map has loaded, so the heading and summary have to be in the server-rendered page.
	const variant = await (
		await request.get('/growbikenet/copenhagen_dk/closeness/rail/from_scratch')
	).text();
	expect(variant).toMatch(/<h1[^>]*>GrowBikeNet in Copenhagen<\/h1>/);
	expect(variant).toContain(
		'<link rel="canonical" href="https://bikenetkit.org/growbikenet/copenhagen_dk/betweenness/grid/from_bikenw"/>'
	);
	expect(variant).not.toContain('name="robots"');

	// A city the tool has no data for is the "not available" page, which is kept out of the index.
	const uncovered = await (
		await request.get('/sortbikenet/aachen_de/betweenness/from_2021')
	).text();
	expect(uncovered).toContain('<meta name="robots" content="noindex"/>');
});
