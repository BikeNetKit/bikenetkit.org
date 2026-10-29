import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectMapDrawn, SAMPLE } from './helpers';

const MAP_CITY = {
	growbikenet: SAMPLE.typical,
	linkbikenet: SAMPLE.typical,
	fixbikenet: SAMPLE.typical,
	sortbikenet: SAMPLE.sortbikenet,
	superblockify: SAMPLE.large
};

const ROUTES = [
	'/',
	'/cities',
	'/cities/table',
	`/cities/${SAMPLE.typical}`,
	'/growbikenet',
	'/more-tools',
	'/legal',
	...Object.entries(MAP_CITY).map(([tool, city]) => `/${tool}/${city}`),
	`/${SAMPLE.uncoveredBy.tool}/${SAMPLE.uncoveredBy.city}`,
	`/embed/growbikenet/${SAMPLE.typical}`,
	'/this-route-does-not-exist'
];

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const isMap = (route: string) =>
	/^\/(embed\/)?(grow|link|fix|sort)bikenet\/|^\/superblockify\//.test(route);

for (const route of ROUTES) {
	test(`axe ${route}`, async ({ page }) => {
		test.setTimeout(route === '/cities/table' ? 240_000 : 60_000);
		await page.goto(route);
		if (isMap(route) && route !== `/${SAMPLE.uncoveredBy.tool}/${SAMPLE.uncoveredBy.city}`) {
			await expectMapDrawn(page);
		}
		const axe = () => {
			const builder = new AxeBuilder({ page });
			// The coverage table is 412 rows of identical markup, ~3000 focusable cells; the first 20
			// stand for the rest, and the whole table outlasts the timeout under parallel workers.
			return route === '/cities/table' ? builder.exclude('tbody tr:nth-child(n+21)') : builder;
		};
		const { violations } = await axe().withTags(WCAG_AA).disableRules(['color-contrast']).analyze();
		expect(
			violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
		).toEqual([]);

		// Contrast is report-only: the token change is a design decision still open. Flip this
		// to an assertion once it lands.
		const contrast = await axe().withRules(['color-contrast']).analyze();
		const nodes = contrast.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
		if (nodes.length) {
			test.info().annotations.push({ type: 'contrast', description: nodes.join(' | ') });
		}
	});
}

for (const route of [`/growbikenet/${SAMPLE.typical}`, `/superblockify/${SAMPLE.large}`]) {
	test(`axe "View as table" dialog on ${route}`, async ({ page }) => {
		await page.goto(route);
		await expectMapDrawn(page);
		await page.locator('.maplibregl-ctrl-bottom-right').getByTitle('View as table').click();
		await expect(page.getByRole('dialog')).toBeVisible();
		const { violations } = await new AxeBuilder({ page })
			.include('[role="dialog"]')
			.withTags(WCAG_AA)
			.disableRules(['color-contrast'])
			.analyze();
		expect(
			violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
		).toEqual([]);
	});
}
