import { test, expect } from '@playwright/test';
import { expectMapDrawn, SAMPLE } from './helpers';

// Partial matches: a node added later does not break these, a role or name removed or renamed
// does. Regenerate with `pnpm check:a11y --update-snapshots` and read the diff before committing.

test('landing page landmarks and search', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('main')).toMatchAriaSnapshot();
});

test('coverage table header and first row', async ({ page }) => {
	await page.goto('/cities/table');
	await expect(page.locator('table thead')).toMatchAriaSnapshot();
	await expect(page.locator('table tbody tr').first()).toMatchAriaSnapshot();
});

test('tool page panels', async ({ page }) => {
	await page.goto(`/growbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);
	// The panels are portalled into the rail after hydration.
	await expect(page.getByRole('heading', { level: 2, name: 'GrowBikeNet' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Map panels' })).toMatchAriaSnapshot();
});

test('"View as table" dialog', async ({ page }) => {
	await page.goto(`/growbikenet/${SAMPLE.typical}`);
	await expectMapDrawn(page);
	await page.locator('.maplibregl-ctrl-bottom-right').getByTitle('View as table').click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog).toMatchAriaSnapshot(`
    - dialog "GrowBikeNet results for Copenhagen":
      - heading "GrowBikeNet results for Copenhagen" [level=2]
      - button "Close"
      - text: /Starting from \\d+ km of existing bike network, GrowBikeNet adds \\d+ km of new network/
      - heading "How the network builds up" [level=3]
      - group "How the network builds up":
        - table "New network built at each step of GrowBikeNet in Copenhagen":
          - rowgroup:
            - row "Step Newly built Share of new length Whole network":
              - columnheader "Step"
              - columnheader "Newly built"
              - columnheader "Share of new length"
              - columnheader "Whole network"
          - rowgroup:
            - row /^Start /:
              - rowheader "Start"
      - heading "The 10 most important new segments" [level=3]
      - group "The 10 most important new segments":
        - table /new segments that matter most/:
          - rowgroup:
            - row "Rank Importance Build step Length From the city midpoint"
  `);
});
