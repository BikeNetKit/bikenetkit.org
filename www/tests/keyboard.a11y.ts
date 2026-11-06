import { test, expect, type Page } from '@playwright/test';
import { expectMapDrawn, SAMPLE } from './helpers';

const MAP = `/growbikenet/${SAMPLE.typical}`;

const focusedName = (page: Page) =>
	page.evaluate(() => {
		const el = document.activeElement;
		return el ? (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() : '';
	});

test('the first Tab reaches a skip link that moves focus into main', async ({ page }) => {
	await page.goto('/');
	await page.keyboard.press('Tab');
	const skip = page.getByRole('link', { name: 'Skip to content' });
	await expect(skip).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('main#main')).toBeFocused();
});

test('every route family has a main landmark for the skip link to land on', async ({ page }) => {
	for (const route of ['/', '/cities', MAP, `/embed/growbikenet/${SAMPLE.typical}`, '/legal']) {
		await page.goto(route);
		await expect(page.locator('main#main'), route).toHaveCount(1);
	}
});

test('the landing city dots are not tab stops; the search field is the keyboard path', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.locator('svg [tabindex="0"]')).toHaveCount(0);
	await page.getByRole('button', { name: /intro video/i }).focus();
	const search = page.getByRole('textbox', { name: 'Search for a city' });
	for (let i = 0; i < 4 && !(await search.evaluate((el) => el === document.activeElement)); i++) {
		await page.keyboard.press('Tab');
	}
	await expect(search).toBeFocused();
});

test('choosing a city moves focus to its panel, and closing it returns to the search', async ({
	page
}) => {
	await page.goto('/');
	const search = page.getByRole('textbox', { name: 'Search for a city' });
	// Retried because a fill before hydration is wiped; the status line is the hydrated signal.
	await expect(async () => {
		await search.fill('copenhagen');
		await expect(page.getByRole('status').filter({ hasText: '1 city found' })).toHaveCount(1, {
			timeout: 1_000
		});
	}).toPass();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'Copenhagen', level: 3 })).toBeFocused();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(search).toBeFocused();
});

test('on a map page the panels come before the map in the tab order', async ({ page }) => {
	await page.goto(MAP);
	await expectMapDrawn(page);
	// The panels are portalled into the rail after hydration.
	await expect(page.getByRole('heading', { level: 2, name: 'GrowBikeNet' })).toBeVisible();
	const railFirst = await page.evaluate(() => {
		const heading = document.querySelector('h2 a[href="/growbikenet"]');
		const canvas = document.querySelector('canvas.maplibregl-canvas');
		return (
			!!heading &&
			!!canvas &&
			!!(heading.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING)
		);
	});
	expect(railFirst).toBe(true);
});

test('the map canvas is named for the tool and city', async ({ page }) => {
	await page.goto(MAP);
	await expectMapDrawn(page);
	await expect(
		page.getByRole('region', { name: 'GrowBikeNet results for Copenhagen' })
	).toHaveCount(1);
});

test('the step button at the end of playback stays focusable', async ({ page }) => {
	await page.goto(MAP);
	await expectMapDrawn(page);
	const slider = page.getByRole('slider', { name: 'Playback frame' });
	await expect(slider).toHaveValue((await slider.getAttribute('max')) ?? '');
	const max = Number(await slider.getAttribute('max'));
	await expect(slider).toHaveAttribute('aria-valuetext', `Step ${max} of ${max}`);
	const next = page.getByRole('button', { name: 'Next step' });
	await page.getByRole('button', { name: 'Previous step' }).focus();
	await page.keyboard.press('Tab');
	await expect(next).toBeFocused();
	await expect(next).toHaveAttribute('aria-disabled', 'true');
	await page.keyboard.press('Enter');
	await expect(next).toBeFocused();
});

test('the city picker returns focus to its trigger on Escape', async ({ page }) => {
	await page.goto(MAP);
	await expectMapDrawn(page);
	const trigger = page.getByRole('button', { name: /change city/i });
	await expect(trigger).toContainText('Copenhagen');
	await trigger.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('textbox', { name: 'Filter cities' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
});

test('switching an option keeps focus on it and marks it current', async ({ page }) => {
	await page.goto(MAP);
	await expectMapDrawn(page);
	const group = page.getByRole('group', { name: 'Focus' });
	await expect(group.getByRole('link', { name: 'Area coverage' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const rail = group.getByRole('link', { name: 'Rail' });
	await rail.focus();
	await page.keyboard.press('Enter');
	await expect(rail).toHaveAttribute('aria-current', 'page');
	await expect(rail).toBeFocused();
	expect(await focusedName(page)).toBe('Rail');
	await expect(page.getByRole('status').filter({ hasText: /^Focus: Rail\./ })).toHaveCount(1);
});

test.describe('the hero animation', () => {
	test('stands still under reduced motion', async ({ page }) => {
		await page.goto('/');
		const frame = page.getByText(/FRAME \d+/);
		await expect(frame).toBeAttached({ timeout: 20_000 });
		await page.waitForTimeout(1_000);
		const before = await frame.textContent();
		await page.waitForTimeout(3_000);
		expect(await frame.textContent()).toBe(before);
	});

	test('is hidden from assistive technology', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('region', { name: 'Map' })).toHaveCount(0);
	});
});

test('the InfoPanel offers the table to keyboard users, and focus comes back to it', async ({
	page
}) => {
	await page.goto(MAP);
	await expectMapDrawn(page);
	const entry = page.getByRole('region', { name: 'Map panels' }).getByRole('button', {
		name: 'View as table'
	});
	// Off-screen until focused, like a skip link, so it is never an invisible tab stop.
	await page.getByRole('link', { name: 'More info' }).focus();
	await page.keyboard.press('Tab');
	await expect(entry).toBeFocused();
	expect((await entry.boundingBox())?.width ?? 0).toBeGreaterThan(20);

	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
			true
		);
	}
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(entry).toBeFocused();
});
