import { test } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import {
	SCALE,
	VIEWPORT,
	activeInteractiveTools,
	cities,
	combosFor,
	dataFile,
	outName,
	queryFor
} from './export-matrix';

test.use({ deviceScaleFactor: SCALE });

for (const tool of activeInteractiveTools) {
	for (const city of cities) {
		for (const combo of combosFor(tool)) {
			const dataPath = dataFile(tool.slug, city.slug, combo);
			if (dataPath && !existsSync(dataPath)) continue;

			const label = [combo.metric, combo.type, combo.variant].filter(Boolean).join('/');
			const testName = label
				? `screenshot ${tool.slug}/${city.slug} ${label}`
				: `screenshot ${tool.slug}/${city.slug}`;

			test(testName, async ({ page }) => {
				await page.setViewportSize({ width: VIEWPORT, height: VIEWPORT });

				await page.goto(`/screenshot/${tool.slug}/${city.slug}?${queryFor(VIEWPORT, combo)}`, {
					waitUntil: 'networkidle'
				});

				await page.waitForSelector('body[data-map-ready="true"]', {
					timeout: 30000
				});

				await page.waitForTimeout(1000);

				const outDir = resolve('screenshots', tool.slug);
				mkdirSync(outDir, { recursive: true });

				const buffer = await page.screenshot({
					type: 'png',
					clip: { x: 0, y: 0, width: VIEWPORT, height: VIEWPORT }
				});

				await sharp(buffer)
					.webp({ quality: 85, smartSubsample: true })
					.toFile(resolve(outDir, outName(tool.slug, city.slug, combo)));
			});
		}
	}
}
