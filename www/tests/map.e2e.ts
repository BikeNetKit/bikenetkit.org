import { test, expect, type Page } from '@playwright/test';
import {
	COULD_NOT_LOAD,
	collectErrors,
	expectMapDrawn,
	FETCHING,
	mapSampleCities,
	SAMPLE,
	TOOLS
} from './helpers';

test.describe('each tool draws its default map', () => {
	for (const tool of TOOLS) {
		for (const city of mapSampleCities(tool)) {
			test(`${tool} / ${city}`, async ({ page }) => {
				const errors = collectErrors(page);
				// The bare /tool/city stub redirects to the tool's default metric/type/variant, so
				// this covers the redirect stubs as well as the map.
				await page.goto(`/${tool}/${city}`);
				await expectMapDrawn(page);
				expect(errors, `console errors on /${tool}/${city}`).toEqual([]);
			});
		}
	}
});

test.describe('each metric panel explains how its number is calculated', () => {
	for (const tool of TOOLS) {
		test(tool, async ({ page }) => {
			// The typical city has no superblockify result (see `SAMPLE`), and an uncovered city
			// renders the "not available" notice with no metric panel to ask about.
			const city =
				tool === 'superblockify'
					? SAMPLE.large
					: tool === 'sortbikenet'
						? SAMPLE.sortbikenet
						: SAMPLE.typical;
			await page.goto(`/${tool}/${city}`);
			// The GrowBikeNet and LinkBikeNet legend cards mount only once the data is in.
			await expectMapDrawn(page);

			const trigger = page.getByRole('button', { name: /how is this calculated/i });
			await trigger.click();
			// The popover is a dialog named by its heading, which is `uppercase` in CSS — hence the
			// case-insensitive match (see the note at the top of this file).
			const dialog = page.getByRole('dialog', { name: /calculated/i });
			await expect(dialog).toBeVisible();
			await expect(dialog.getByRole('link', { name: /faq/i })).toHaveAttribute(
				'href',
				/faq\.bikenetkit\.org/
			);

			await page.keyboard.press('Escape');
			await expect(dialog).toHaveCount(0);
			await expect(trigger).toBeFocused();
		});
	}
});

test('a city a tool does not cover explains itself instead of drawing nothing', async ({
	page
}) => {
	const { tool, city } = SAMPLE.uncoveredBy;
	await page.goto(`/${tool}/${city}`);

	// The permanent state, decided from the manifest — not the transient loading one.
	await expect(page.getByText(/not available/i).first()).toBeVisible();
	await expect(page.getByText(FETCHING)).toHaveCount(0);
	// And it has to offer a way on, which is the whole reason this is a page and not an error.
	await expect(page.locator('a').filter({ hasText: /\w/ }).first()).toBeVisible();

	// It is a callout on the tab the reader just picked: its caret sits under that tab's centre.
	// The heading is `uppercase` in CSS, hence the case-insensitive name.
	const notice = page.getByRole('region', { name: /not available/i });
	await expect(notice).toBeVisible();
	const centreX = (box: { x: number; width: number } | null) => {
		if (!box) throw new Error('not laid out');
		return box.x + box.width / 2;
	};
	const tab = page.locator('[data-tool-anchor]:visible');
	const caret = notice.locator(':scope > span[aria-hidden="true"]');
	await expect
		.poll(async () =>
			Math.abs(centreX(await caret.boundingBox()) - centreX(await tab.boundingBox()))
		)
		.toBeLessThanOrEqual(2);
});

test("a tool's tab says it has no results here before the reader clicks it", async ({ page }) => {
	const { tool, city } = SAMPLE.uncoveredBy;
	await page.goto(`/growbikenet/${city}`);
	await expectMapDrawn(page);

	const tab = page.getByRole('navigation', { name: 'Tools' }).getByRole('link', {
		name: new RegExp(tool, 'i')
	});
	// Read on focus by a screen reader, independent of the visual tooltip.
	await expect(tab).toHaveAccessibleName(/no results for/i);

	await tab.hover();
	const tip = page.locator('[data-tool-tip]');
	await expect(tip).toBeVisible();
	await expect(tip).toContainText(/no results for/i);

	await page.mouse.move(10, 400);
	await expect(tip).toHaveCount(0);
});

test('a failed data fetch says so rather than leaving a blank map', async ({ page }) => {
	// The data host being unreachable is the single most likely runtime failure for a site with a
	// separate data origin, and it must not present as an empty city.
	//
	// Matched on the pathname, not as `**/data/**`: against a dev server that glob also catches
	// Vite's own module URLs under `/src/lib/data/`, so the app's JavaScript gets aborted and the
	// test "passes" against a page that never booted.
	await page.route(
		(url) => url.pathname.startsWith('/data/') || url.pathname.endsWith('.geojson'),
		(route) => route.abort()
	);
	await page.goto(`/growbikenet/${SAMPLE.typical}`);

	// `.first()`: the notice has both a heading and a body line, so a text match resolves to two.
	await expect(page.getByText(COULD_NOT_LOAD).first()).toBeVisible({ timeout: 30_000 });
	// The basemap still draws — the reader gets an oriented map plus an explanation, not a void.
	await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
});

test('sortbikenet offers the as-built order only where something is left to build', async ({
	page
}) => {
	const errors = collectErrors(page);
	// Every ordering sits in one dropdown; its menu only exists while open.
	const openOrderings = () => page.getByRole('button', { name: /^Ordering:/ }).click();

	await page.goto(`/sortbikenet/${SAMPLE.sortbikenet}/betweenness/from_2021`);
	await expectMapDrawn(page);
	await openOrderings();
	await expect(page.getByRole('link', { name: 'As built' })).toHaveAttribute(
		'href',
		/\/real\/from_2021$/
	);
	// The two orderings that beat the as-built order on area covered and directness are starred.
	await expect(page.getByRole('link', { name: /beats the as-built order/i })).toHaveCount(2);
	await page.keyboard.press('Escape');
	// Wait for the menu to unmount: its starred items say "area covered" too.
	await expect(page.getByRole('link', { name: 'As built' })).toHaveCount(0);
	// The HUD tracks the area each ordering reaches; its label is `uppercase` in CSS.
	await expect(page.getByText(/area covered/i)).toBeVisible();

	// The 2026 network *is* the last construction wave, so there is no as-built view from there.
	await page.goto(`/sortbikenet/${SAMPLE.sortbikenet}/betweenness/from_2026`);
	await expectMapDrawn(page);
	await openOrderings();
	await expect(page.getByText('As built', { exact: true })).toHaveAttribute(
		'aria-disabled',
		'true'
	);

	expect(errors).toEqual([]);
});

test("fixbikenet's top-spots table names the street each gap runs along", async ({ page }) => {
	// copenhagen_dk's top five cover both branches of the row, and the names come from the
	// FixBikeNet 0.9.1 export, so they are safe to assert on literally: #1 is Knippelsbro, and one
	// of the others is the export's "n/a" placeholder for an unnamed way.
	await page.goto(`/fixbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);

	// Only the spot rows carry `aria-current` — Prev/Next/Reset below them do not.
	const rows = page.locator('button[aria-current]');
	await expect(rows).toHaveCount(5);
	await expect(rows.first()).toContainText('Knippelsbro');
	await expect(rows.getByText('Unnamed street')).toBeVisible();
	// The placeholder must never reach the reader verbatim — the whole point of `streetLabel`.
	await expect(page.getByText(/^n\/a$/)).toHaveCount(0);
});

test("fixbikenet's top-spots tour continues past the fifth spot", async ({ page }) => {
	// Three cities, picked for the *size* of their gap network, which is what makes the whole rule
	// provable in a handful of clicks rather than fifty: kramatorsk_ua ships exactly 6 gaps and
	// rijeka_hr exactly 5, so one of them has a sixth spot to reach and the other does not. The
	// counts are those of the FixBikeNet 0.9.1 export; a re-import can change them (0.9.1 moved
	// luhansk_ua from 6 to 22), so re-pick the cities if this test starts failing after one.
	//
	// The other way into the overflow row — clicking a gap outside the top five on the map — is not
	// covered here: it needs a click at a specific pixel of a WebGL canvas, which this suite
	// deliberately never does. It is verified by hand.
	const rows = page.locator('button[aria-current]');
	const next = page.getByRole('button', { name: 'Next' });

	// Six gaps: Next must survive the fifth row and then stop at the genuinely last one.
	await page.goto('/fixbikenet/kramatorsk_ua');
	await expectMapDrawn(page);
	await expect(rows).toHaveCount(5);

	for (let i = 0; i < 5; i++) await next.click();
	await expect(next).toBeEnabled();
	await next.click();
	await expect(rows).toHaveCount(6);
	await expect(rows.last()).toContainText('#6');
	await expect(next).toBeDisabled();

	// Five gaps: the fifth row *is* the last spot, so Next is dead there and no sixth row exists.
	await page.goto('/fixbikenet/rijeka_hr');
	await expectMapDrawn(page);
	for (let i = 0; i < 5; i++) await next.click();
	await expect(rows).toHaveCount(5);
	await expect(next).toBeDisabled();

	// Fifty gaps: stepping on *replaces* the overflow row rather than growing the list.
	await page.goto(`/fixbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);
	for (let i = 0; i < 6; i++) await next.click();
	await expect(rows).toHaveCount(6);
	await expect(rows.last()).toContainText('#6');
	await next.click();
	await expect(rows).toHaveCount(6);
	await expect(rows.last()).toContainText('#7');

	// Entering the tour cold lands inside the visible table, not on the last gap in the city.
	await page.goto(`/fixbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);
	await page.getByRole('button', { name: 'Prev' }).click();
	await expect(rows).toHaveCount(5);
	await expect(rows.last()).toHaveAttribute('aria-current', 'true');
});

/**
 * Pins a tooltip by clicking a feature, and returns the page coordinates it was pinned at.
 *
 * Hitting a line on a WebGL canvas can't be a fixed coordinate — the framing depends on the
 * viewport — so this sweeps until the hover tooltip appears and clicks there. Sweeping the middle
 * band only: the rail and the attribution credit sit over the edges.
 */
async function pinATooltip(page: Page) {
	const canvas = page.locator('canvas.maplibregl-canvas').first();
	const tooltip = page.getByTestId('map-tooltip');
	const box = (await canvas.boundingBox())!;

	for (let fy = 0.3; fy <= 0.75; fy += 0.07) {
		for (let fx = 0.35; fx <= 0.85; fx += 0.05) {
			const x = box.x + box.width * fx;
			const y = box.y + box.height * fy;
			await page.mouse.move(x, y);
			if ((await tooltip.count()) === 0) continue;
			await page.mouse.click(x, y);
			await expect(tooltip).toBeVisible();
			return { x, y };
		}
	}
	throw new Error('no feature found to pin a tooltip on');
}

test('a pinned tooltip rides the map instead of staying where the cursor was', async ({ page }) => {
	// The anchor is a ground position re-projected each camera frame, so a pan has to carry the box
	// with it. Asserted on the tool that pins the simplest tooltip; the anchor is shared code.
	await page.goto(`/fixbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);

	await pinATooltip(page);
	const tooltip = page.getByTestId('map-tooltip');
	const before = (await tooltip.boundingBox())!;

	// MapLibre's keyboard handler pans a fixed 100px per arrow press, so the map content — and the
	// tooltip with it — moves 100px the other way.
	await page.locator('canvas.maplibregl-canvas').first().focus();
	await page.keyboard.press('ArrowRight');
	await expect
		.poll(async () => Math.round((await tooltip.boundingBox())!.x))
		.toBeCloseTo(Math.round(before.x) - 100, -1);

	await page.keyboard.press('ArrowLeft');
	await expect
		.poll(async () => Math.round((await tooltip.boundingBox())!.x))
		.toBeCloseTo(Math.round(before.x), -1);
});

test('a tooltip whose anchor leaves the map hides, and comes back with it', async ({ page }) => {
	await page.goto(`/fixbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);

	const pin = await pinATooltip(page);
	const tooltip = page.getByTestId('map-tooltip');
	const canvas = page.locator('canvas.maplibregl-canvas').first();

	// Zoom in on the pin before panning away from it. At the city's default framing the `maxBounds`
	// envelope clamps a pan long before the anchor reaches an edge; close in, the viewport is small
	// enough within that envelope that a few 100px steps carry the anchor off the map.
	await page.mouse.move(pin.x, pin.y);
	for (let i = 0; i < 8; i++) {
		await page.mouse.wheel(0, -400);
		await page.waitForTimeout(150);
	}
	await expect(tooltip).toBeVisible();

	await canvas.focus();
	for (let i = 0; i < 20 && (await tooltip.count()) > 0; i++) {
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(200);
	}
	await expect(tooltip).toHaveCount(0);

	// The pin survives going off-screen — hiding the box must not discard the reader's selection.
	for (let i = 0; i < 20 && (await tooltip.count()) === 0; i++) {
		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(200);
	}
	await expect(tooltip).toBeVisible();
});

test('arrow keys pan a focused map without moving the playhead', async ({ page }) => {
	// MapLibre handles arrows on its canvas, and the event bubbles on. The playbar used to listen on
	// `window` and step on the same press, so both surfaces acted at once.
	await page.goto(`/growbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);

	// The intro build-up drives the playhead from 0 to the last frame on its own; wait it out, or
	// it overwrites whatever the keys do.
	const slider = page.getByRole('slider', { name: 'Playback frame' });
	const start = Number(await slider.getAttribute('max'));
	expect(start).toBeGreaterThan(0);
	await expect(slider).toHaveValue(String(start), { timeout: 15_000 });
	const pause = page.getByRole('button', { name: 'Pause' });

	await page.locator('canvas.maplibregl-canvas').first().focus();
	await page.keyboard.press('ArrowLeft');
	await expect(slider).toHaveValue(String(start));

	// Inside the bar, the arrows are the playbar's.
	await page.getByRole('button', { name: 'Previous step' }).focus();
	await page.keyboard.press('ArrowLeft');
	await expect(slider).toHaveValue(String(start - 1));

	// With nothing focused, they are nobody's: there is no window-wide shortcut any more.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('ArrowLeft');
	await expect(slider).toHaveValue(String(start - 1));

	// Space stays page-wide, map focused or not — MapLibre gives it no meaning. Rewound first: a
	// play-through from one frame short of the end is over before Pause could be seen.
	await slider.focus();
	await page.keyboard.press('Home');
	await expect(slider).toHaveValue('0');
	await page.locator('canvas.maplibregl-canvas').first().focus();
	await page.keyboard.press(' ');
	await expect(pause).toBeVisible();
});

test('the basemap credit rests as a button and opens on click', async ({ page }) => {
	// MapLibre mounts its attribution control compact but *open*, and `MapHost` closes it by removing
	// a vendor class. Asserting on the reader-visible outcome rather than on that class, so the test
	// still means something if MapLibre renames it — but it does fail on a rename, which is the point.
	await page.goto(`/fixbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);

	const credit = page.locator('.maplibregl-ctrl-attrib').first();
	const inner = credit.locator('.maplibregl-ctrl-attrib-inner');
	const button = credit.locator('summary');
	await expect(credit).toBeVisible();
	await expect(inner).toBeHidden();

	// The ⓘ shares the control stack's vertical axis, closed and open: the open pill grows to the
	// left, and the button stays pinned to its right edge.
	const centreX = async (locator: typeof button) => {
		const box = await locator.boundingBox();
		if (!box) throw new Error('not laid out');
		return box.x + box.width / 2;
	};
	const axis = await centreX(page.locator('.maplibregl-ctrl-zoom-in').first());
	expect(Math.abs((await centreX(button)) - axis)).toBeLessThanOrEqual(0.5);

	await button.click();
	await expect(inner).toBeVisible();
	expect(Math.abs((await centreX(button)) - axis)).toBeLessThanOrEqual(0.5);
	await expect(inner.getByRole('link', { name: /OpenStreetMap/i })).toBeVisible();
	// The credit is also the only route to /legal on this view, which has no sidebar and no footer.
	await expect(inner.getByRole('link', { name: /Privacy/i })).toHaveAttribute('href', '/legal');
});

test('a deep link with view flags resolves cold', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto(`/growbikenet/${SAMPLE.typical}/betweenness/grid/from_scratch?labels=0&seeds=0`);
	await expectMapDrawn(page);
	// The flags survive the load rather than being normalised away, which is what makes a view
	// linkable at all.
	expect(new URL(page.url()).search).toContain('labels=0');
	expect(new URL(page.url()).search).toContain('seeds=0');
	expect(errors).toEqual([]);
});

test('the settings menu carries the basemap label toggle', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto(`/fixbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);
	await page.getByRole('button', { name: 'Map settings' }).click();
	const labels = page.getByRole('group', { name: 'Map labels' });
	await expect(labels.getByRole('button', { name: 'Show' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await labels.getByRole('button', { name: 'Hide' }).click();
	await expect(page).toHaveURL(/labels=0/);
	await expect(labels.getByRole('button', { name: 'Hide' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	expect(errors).toEqual([]);
});

test('the reset button sits under the zoom buttons, where the compass was', async ({ page }) => {
	await page.goto(`/growbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);
	await expect(page.locator('.maplibregl-ctrl-compass')).toHaveCount(0);
	const reset = page.getByRole('button', { name: 'Reset map view' });
	await expect(reset).toBeDisabled();
	await page.getByRole('button', { name: 'Zoom in' }).click();
	await expect(reset).toBeEnabled();
	await reset.click();
	await expect(reset).toBeDisabled({ timeout: 10_000 });

	// Rotation alone enables it, and the reset levels the map again. Dev-only handle.
	type DevWindow = Window & { __map?: import('maplibre-gl').Map };
	const hasMap = await page.evaluate(() => !!(window as DevWindow).__map);
	test.skip(!hasMap, 'window.__map is a dev-server-only handle');
	await page.evaluate(() => (window as DevWindow).__map?.setBearing(30));
	await expect(reset).toBeEnabled();
	await reset.click();
	await expect(reset).toBeDisabled({ timeout: 10_000 });
	const bearing = await page.evaluate(() => (window as DevWindow).__map?.getBearing() ?? 0);
	expect(Math.abs(bearing)).toBeLessThan(0.5);
});

test.describe('the "Take action!" links', () => {
	test('the toolbar button lists external links for the city', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto(`/growbikenet/${SAMPLE.typical}`);
		await expectMapDrawn(page);
		await page.getByRole('button', { name: /^Take action in / }).click();
		const links = page.locator('[data-popover-content] a');
		await expect(links.first()).toBeVisible();
		for (const link of await links.all()) {
			await expect(link).toHaveAttribute('target', '_blank');
			await expect(link).toHaveAttribute('href', /^https?:\/\//);
		}
		expect(errors).toEqual([]);
	});

	test('a city the research excluded gets no button', async ({ page }) => {
		await page.goto('/linkbikenet/minsk_by');
		await expect(page.getByRole('button', { name: /^Change city:/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Take action in / })).toHaveCount(0);
	});

	test('the city page lists them too', async ({ page }) => {
		await page.goto(`/cities/${SAMPLE.typical}`);
		const section = page.getByRole('region', { name: /^Take action in / });
		await expect(section).toBeVisible();
		expect(await section.getByRole('link').count()).toBeGreaterThan(0);
	});
});

test('seed points are on by default, and the toggle names what the seeds are', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto(`/growbikenet/${SAMPLE.typical}/betweenness/rail/from_scratch`);
	await expectMapDrawn(page);
	const seeds = page.getByLabel('show rail stations');
	await expect(seeds).toBeChecked();
	await seeds.uncheck();
	await expect(page).toHaveURL(/seeds=0/);
	expect(errors).toEqual([]);
});

test('GrowBikeNet redraws the existing network after a round-trip through from scratch', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto(`/growbikenet/${SAMPLE.typical}/betweenness/grid/from_bikenw`);
	await expectMapDrawn(page);
	for (const [label, variant] of [
		['from scratch', 'from_scratch'],
		['from existing', 'from_bikenw']
	]) {
		await page.getByRole('button', { name: 'Map settings' }).click();
		await page.getByRole('link', { name: label, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/${variant}(\\?|$)`));
		await expectMapDrawn(page);
		await page.keyboard.press('Escape');
	}
	// MapLibre logs a refused duplicate layer id to the console, so this holds without `__map` too.
	expect(errors).toEqual([]);

	type DevWindow = Window & { __map?: import('maplibre-gl').Map };
	const hasMap = await page.evaluate(() => !!(window as DevWindow).__map);
	test.skip(!hasMap, 'window.__map is a dev-server-only handle');
	await expect
		.poll(() =>
			page.evaluate(() => !!(window as DevWindow).__map?.getLayer('growbikenet-existing'))
		)
		.toBe(true);
	// Beneath the build-up, not drawn over it.
	const order = await page.evaluate(
		() => (window as DevWindow).__map?.getStyle().layers.map((l) => l.id) ?? []
	);
	expect(order.indexOf('growbikenet-existing')).toBeLessThan(order.indexOf('growbikenet-metric'));
});

type Bbox = [number, number, number, number];

// `window.__map` is a dev-only handle (MapDebugOverlay), so the framing assertions only run
// against a dev server; the link and the error assertions run everywhere.
async function mapBounds(page: Page): Promise<Bbox | null> {
	return page.evaluate(() => {
		const map = (window as Window & { __map?: import('maplibre-gl').Map }).__map;
		return map ? (map.getBounds().toArray().flat() as Bbox) : null;
	});
}

test('"Embed this view" opens the embed on the box the reader was looking at', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto(`/growbikenet/${SAMPLE.typical}/betweenness/grid/from_scratch`);
	await expectMapDrawn(page);

	await page.getByRole('button', { name: 'Export this map' }).click();
	const href = await page.getByRole('link', { name: 'Embed this view' }).getAttribute('href');
	expect(href).toMatch(
		new RegExp(`^/embed/growbikenet/${SAMPLE.typical}/betweenness/grid/from_scratch\\?bbox=`)
	);
	const bbox = new URL(href!, page.url()).searchParams.get('bbox')!.split(',').map(Number);
	expect(bbox).toHaveLength(4);
	expect(bbox[0]).toBeLessThan(bbox[2]);
	expect(bbox[1]).toBeLessThan(bbox[3]);

	await page.goto(href!);
	await expectMapDrawn(page);
	const shown = await mapBounds(page);
	if (shown) {
		// The embed pads its fit, so it shows at least the box — and not a whole region around it.
		const [w, s, e, n] = bbox;
		expect(shown[0]).toBeLessThanOrEqual(w);
		expect(shown[1]).toBeLessThanOrEqual(s);
		expect(shown[2]).toBeGreaterThanOrEqual(e);
		expect(shown[3]).toBeGreaterThanOrEqual(n);
		expect(shown[2] - shown[0]).toBeLessThan((e - w) * 3);
	}
	expect(errors).toEqual([]);
});

// /embed is client-only, so a static host serves it from the 404.html shell and has no
// `__data.json` for it. Any server load above the route 404s there while dev and preview answer it.
test('an embed boots on a static host, which has no __data.json for it', async ({ page }) => {
	const errors = collectErrors(page);
	const dataRequests: string[] = [];
	await page.route(
		(url) => url.pathname.endsWith('/__data.json'),
		(route) => {
			dataRequests.push(route.request().url());
			return route.fulfill({ status: 404, body: 'Not Found' });
		}
	);
	await page.goto(`/embed/growbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);
	expect(dataRequests).toEqual([]);
	expect(errors).toEqual([]);
});

test('an embed with a malformed bbox falls back to the whole city', async ({ page }) => {
	const errors = collectErrors(page);
	const base = `/embed/growbikenet/${SAMPLE.typical}`;
	await page.goto(base);
	await expectMapDrawn(page);
	const city = await mapBounds(page);

	for (const bad of ['garbage', '12.6,55.7,12.5,55.6', '1,2,3']) {
		await page.goto(`${base}?bbox=${bad}`);
		await expectMapDrawn(page);
		const shown = await mapBounds(page);
		if (city && shown) {
			shown.forEach((v, i) => expect(v).toBeCloseTo(city[i], 3));
		}
	}
	expect(errors).toEqual([]);
});

test.describe('"View as table" gives the map as text', () => {
	const openTable = async (page: Page) => {
		await page.locator('.maplibregl-ctrl-bottom-right').getByTitle('View as table').click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		return dialog;
	};

	const EXPECTED_TABLES: Record<string, { path: string; tables: number }> = {
		growbikenet: { path: `/growbikenet/${SAMPLE.typical}`, tables: 2 },
		linkbikenet: { path: `/linkbikenet/${SAMPLE.typical}`, tables: 2 },
		fixbikenet: { path: `/fixbikenet/${SAMPLE.typical}`, tables: 1 },
		sortbikenet: { path: `/sortbikenet/${SAMPLE.sortbikenet}`, tables: 2 },
		superblockify: { path: `/superblockify/${SAMPLE.large}`, tables: 2 }
	};

	for (const [tool, { path, tables }] of Object.entries(EXPECTED_TABLES)) {
		test(tool, async ({ page }) => {
			const errors = collectErrors(page);
			await page.goto(path);
			await expectMapDrawn(page);
			const dialog = await openTable(page);
			await expect(dialog).toHaveAccessibleName(/results for/i);
			await expect(dialog.getByRole('table')).toHaveCount(tables);
			for (const table of await dialog.getByRole('table').all()) {
				expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(2);
			}
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			await expect(
				page.locator('.maplibregl-ctrl-bottom-right').getByTitle('View as table')
			).toBeFocused();
			expect(errors, `console errors on ${path}`).toEqual([]);
		});
	}

	test('fixbikenet lists every gap by street', async ({ page }) => {
		await page.goto(`/fixbikenet/${SAMPLE.typical}`);
		await expectMapDrawn(page);
		const rows = (await openTable(page)).locator('tbody tr');
		await expect(rows).toHaveCount(50);
		await expect(rows.first()).toContainText('Knippelsbro');
		await expect(rows.getByText('Unnamed street').first()).toBeVisible();
		await expect(rows.getByText(/^n\/a$/)).toHaveCount(0);
	});

	test('an empty result says so instead of drawing empty tables', async ({ page }) => {
		// The export no longer ships a zero-feature result (the 2026-10-26 import emptied the
		// `check-datasets` list), so the empty state is staged: only the result file is answered
		// empty, and the seeds, existing network and boundary still load for real.
		// Matched by filename: served same-origin under `/data/` by dev and preview servers, but from
		// the data host's root in a deployed build, so an exact `/data/...` pathname would never fire
		// against production and the test would quietly see the real result.
		const result = `/growbikenet/${SAMPLE.typical}-betweenness-grid-from_bikenw.geojson`;
		await page.route(
			(url) => url.pathname.endsWith(result),
			(route) => route.fulfill({ json: { type: 'FeatureCollection', features: [] } })
		);
		await page.goto(`/growbikenet/${SAMPLE.typical}/betweenness/grid/from_bikenw`);
		await expectMapDrawn(page);
		const dialog = await openTable(page);
		await expect(dialog).toContainText(/contains no new segments/i);
		await expect(dialog.getByRole('table')).toHaveCount(0);
	});

	test('a city the tool does not cover gets a sentence, not a table', async ({ page }) => {
		const { tool, city } = SAMPLE.uncoveredBy;
		await page.goto(`/${tool}/${city}`);
		await expect(page.locator('.maplibregl-ctrl-bottom-right')).toBeVisible();
		const dialog = await openTable(page);
		await expect(dialog).toContainText(/has no results for/i);
		await expect(dialog.getByRole('table')).toHaveCount(0);
	});
});
