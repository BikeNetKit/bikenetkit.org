import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import { tools } from './export-matrix';

// Open Graph's expected card size. Mirrors CANVAS.og in src/lib/design/banner.js.
const OG = { width: 1200, height: 630 };

// The project itself, the collected static-tools page, then one card per interactive tool.
// Coming-soon tools are included: the run is cheap and the image is then already there when the
// page lands. The static tools have no card of their own — they're anchored sections of
// /more-tools, which shares that one card.
const NAMES = [
	'bikenetkit',
	'more-tools',
	...tools.filter((tool) => tool.category === 'interactive').map((tool) => tool.slug)
];

for (const name of NAMES) {
	test(`og ${name}`, async ({ page }) => {
		await page.setViewportSize(OG);
		await page.goto(`/og/${name}`, { waitUntil: 'networkidle' });

		// Set once the brand font is parsed and the artwork has decoded. An unknown name
		// never sets it, so a typo in NAMES fails here instead of writing a blank card.
		await page.waitForSelector('body[data-og-ready="true"]', { timeout: 30000 });

		const shot = await page.screenshot({ clip: { x: 0, y: 0, ...OG } });

		const outDir = resolve('static/og');
		mkdirSync(outDir, { recursive: true });
		writeFileSync(
			resolve(outDir, `${name}.png`),
			await sharp(shot).png({ palette: true }).toBuffer()
		);
	});
}
