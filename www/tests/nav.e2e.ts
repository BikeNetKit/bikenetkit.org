import { test, expect } from '@playwright/test';
import { collectErrors, SAMPLE, TOOLS } from './helpers';
import { featuredCities } from '../src/lib/data/featured-cities';

/** The page's own search field. The app shell's sidebar carries a second one, so this is scoped to
 *  `main` rather than picked by placeholder. Both are plain text inputs, not `type=search`. */
const searchBox = (page: import('@playwright/test').Page) => page.locator('main input').first();

test('city search finds a city and navigates to it', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/cities');

	await searchBox(page).fill('copenhag');

	const link = page.locator(`a[href*="${SAMPLE.typical}"]`).first();
	await expect(link).toBeVisible();
	await link.click();

	await expect(page).toHaveURL(new RegExp(SAMPLE.typical));
	await expect(page.locator('h1')).toContainText(/copenhagen/i);
	expect(errors).toEqual([]);
});

test('search matches a country, not just a city name', async ({ page }) => {
	// Country names and codes are searchable, not just city names — among other things so the two
	// Brests are tellable apart.
	//
	// The field offers *suggestions*; it does not filter the A–Z grid below it. So the contract is
	// asserted as a delta rather than by reaching into the dropdown's markup: a country query adds
	// that country's cities to the page and adds nothing from anywhere else.
	await page.goto('/cities');
	const danish = page.locator('main a[href*="_dk"]');
	const french = page.locator('main a[href*="_fr"]');
	const danishBefore = await danish.count();
	const frenchBefore = await french.count();

	await searchBox(page).fill('denmark');

	await expect(danish).not.toHaveCount(danishBefore);
	await expect(french).toHaveCount(frenchBefore);
});

test('search finds a city typed without its umlaut', async ({ page }) => {
	// "Gütersloh" is unreachable from an ordinary keyboard unless the search folds diacritics, and
	// a German reader is as likely to type the "ue" transliteration as the bare "u". Both have to
	// land on the same city, as does the umlaut itself.
	//
	// A delta again, for the reason above *and* a sharper one: the A–Z grid already links this city
	// once, so asserting the link is merely visible would pass against a search field that matches
	// nothing at all. The exhaustive per-city sweep is `pnpm check:search`.
	await page.goto('/cities');
	const link = page.locator('main a[href*="gutersloh_de"]');
	const inGrid = await link.count();

	for (const typed of ['gutersloh', 'guetersloh', 'Gütersloh']) {
		await searchBox(page).fill(typed);
		await expect(link, `typed "${typed}"`).toHaveCount(inGrid + 1);
	}
});

test('the coverage table links cells through to a map that draws', async ({ page }) => {
	await page.goto('/cities/table');
	await expect(page.locator('th').first()).toBeVisible();
	// Three states since the freeze: recommended, available, not available. A fourth entry means
	// the retired "recommended — data coming" category crept back.
	await expect(page.getByRole('list', { name: 'Legend' }).getByRole('listitem')).toHaveCount(3);

	// Any marked cell — the point is that a mark means a page, not just a tick.
	const cell = page.locator('td a').first();
	await expect(cell).toBeVisible();
	await cell.click();

	await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
	await expect(page.getByText(/could not load/i)).toHaveCount(0);
});

/** The city slug each link points at, in DOM order — hrefs are `/<tool>/<city>/…`. */
const citySlugsOf = (links: import('@playwright/test').Locator) =>
	links.evaluateAll((as) => as.map((a) => a.getAttribute('href')?.split('/')[2] ?? ''));

test("a tool's landing page shows its featured cities, in editorial order", async ({ page }) => {
	await page.goto('/fixbikenet');
	const teasers = page.locator('main .grid a[href*="/fixbikenet/"]');
	await expect(teasers).toHaveCount(6);
	expect(await citySlugsOf(teasers)).toEqual([...featuredCities('fixbikenet')]);
});

test('GrowBikeNet features one group per variant, each linking to its own variant', async ({
	page
}) => {
	await page.goto('/growbikenet');
	// Headings are `uppercase` in CSS, so match case-insensitively.
	const existing = page.getByRole('heading', { name: /^from existing$/i });
	const scratch = page.getByRole('heading', { name: /^from scratch$/i });
	await expect(existing).toBeVisible();
	await expect(scratch).toBeVisible();

	const scratchTeasers = page.locator('main h3:has-text("from scratch") + .grid a');
	await expect(scratchTeasers).toHaveCount(6);
	await expect(scratchTeasers.first()).toHaveAttribute('href', /\/from_scratch$/);
	expect(await citySlugsOf(scratchTeasers)).toEqual([
		...featuredCities('growbikenet', 'from_scratch')
	]);
});

test("the map's city menu leads with the tool's featured cities", async ({ page }) => {
	await page.goto(`/fixbikenet/${SAMPLE.large}`);
	const trigger = page.getByRole('button', { name: /^Change city:/ });
	const heading = page.getByText(/^featured cities$/i);
	// It opens on hover; retried because a hover before hydration does nothing.
	await expect(async () => {
		await page.mouse.move(0, 0);
		await trigger.hover();
		await expect(heading).toBeVisible({ timeout: 1000 });
	}).toPass();

	const menu = page.locator('[data-popover-content]');
	const first = menu.locator('a').filter({ hasText: /\w/ });
	expect((await citySlugsOf(first)).slice(0, 6)).toEqual([...featuredCities('fixbikenet')]);
});

test("the not-available callout suggests the tool's featured cities", async ({ page }) => {
	const { tool, city } = SAMPLE.uncoveredBy;
	await page.goto(`/${tool}/${city}`);
	const links = page.getByRole('region', { name: /not available/i }).locator('a');
	await expect(links).toHaveCount(6);
	expect(await citySlugsOf(links)).toEqual([...featuredCities(tool)]);
});

test('a city page reaches its tool maps', async ({ page }) => {
	await page.goto(`/cities/${SAMPLE.typical}`);

	const toTool = page.locator('a[href*="/growbikenet/"]').first();
	await expect(toTool).toBeVisible();
	await toTool.click();

	await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
	await expect(page.getByText(/could not load/i)).toHaveCount(0);
});

test('the sidebar reaches every tool', async ({ page }) => {
	// From a tool page: the shell's sidebar has a Tools/Cities switch, and a *city* page opens it
	// on Cities.
	await page.goto('/growbikenet');
	for (const slug of TOOLS) {
		await expect(
			page.locator(`nav a[href$="/${slug}"]`).first(),
			`sidebar link to ${slug}`
		).toBeAttached();
	}
	const order = await page
		.locator('nav a')
		.evaluateAll(
			(links, slugs) =>
				links
					.map((a) => a.getAttribute('href')?.split('/').pop() ?? '')
					.filter((slug) => slugs.includes(slug)),
			[...TOOLS] as string[]
		);
	expect(order, 'sidebar tool order').toEqual([...TOOLS]);
	// One link to the page that lists the static tools, not one per tool.
	await expect(page.locator('nav a[href$="/more-tools"]')).toHaveCount(1);
	await expect(page.locator('nav a[href*="/more-tools#"]')).toHaveCount(0);
});

test('legal and the feedback address are reachable from inside the app shell', async ({ page }) => {
	// The site footer renders on the landing page only, so without these the links would be
	// unreachable from every tool and city page.
	await page.goto(`/cities/${SAMPLE.typical}`);
	await expect(page.locator('a[href$="/legal"]').first()).toBeAttached();
	await expect(page.locator('a[href^="mailto:"]').first()).toBeAttached();
});

test('the footer links a downloadable press kit', async ({ page, request }) => {
	await page.goto('/');
	const link = page.locator('footer a[download]', { hasText: /press kit/i });
	await expect(link).toHaveAttribute('href', '/media/bikenetkit-press-kit.zip');
	const res = await request.get('/media/bikenetkit-press-kit.zip');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('zip');
});

test.describe('last-deployed note in Berlin', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test("reads in the reader's timezone once hydrated, with UTC kept in the title", async ({
		page
	}) => {
		const errors = collectErrors(page);
		await page.goto('/');
		const time = page.locator('footer time');
		await expect(time).toHaveText(/ at \d{1,2}:\d{2}\s[AP]M GMT\+[12]$/);
		await expect(time).toHaveAttribute('title', / at \d{1,2}:\d{2}\s[AP]M UTC$/);
		expect(errors).toEqual([]);
	});
});

test.describe('last-deployed note in UTC', () => {
	test.use({ timezoneId: 'UTC' });

	test('reads in UTC', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('footer time')).toHaveText(/ at \d{1,2}:\d{2}\s[AP]M UTC$/);
	});
});

test('last-deployed note is prerendered in UTC for readers without JavaScript', async ({
	request
}) => {
	const html = await (await request.get('/')).text();
	expect(html).toMatch(/<time[^>]*> ?\w{3} \d{1,2}, \d{4} at \d{1,2}:\d{2}\s[AP]M UTC ?<\/time>/);
});
