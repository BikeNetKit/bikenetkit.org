// Ad-hoc: report which basemap labels render at each zoom, for tuning SUBPLACE_ZOOM and the
// boundary clip. Usage: node scripts/probe-labels.mjs <path> [zooms…]
import { chromium } from '@playwright/test';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5199';
const [, , routePath = '/growbikenet/amsterdam_nl/betweenness/grid/from_scratch', ...zoomArgs] =
	process.argv;
const zooms = zoomArgs.length ? zoomArgs.map(Number) : [11, 12, 13, 14, 15];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(`${BASE}${routePath}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__map?.isStyleLoaded(), null, { timeout: 60_000 });

for (const z of zooms) {
	const out = await page.evaluate(async (zoom) => {
		const map = window.__map;
		map.setZoom(zoom);
		await new Promise((r) => map.once('idle', r));
		const read = (layer) =>
			map.getLayer(layer)
				? map.queryRenderedFeatures({ layers: [layer] }).map((f) => f.properties)
				: [];
		const fmt = (p) => `${p.name}(${p.kind_detail}/${p.population_rank})`;
		return {
			zoom: map.getZoom(),
			subplace: read('places_subplace').map(fmt),
			locality: read('places_locality').map(fmt),
			capital: read('places_locality_capital').map(fmt),
			shields: [...new Set(read('roads_shields').map((p) => p.shield_text))]
		};
	}, z);
	console.log(
		`\nz${z}  subplace=${out.subplace.length}  locality=${out.locality.length}  capital=${out.capital.length}`
	);
	if (out.subplace.length) console.log('  subplace:', out.subplace.join(', '));
	if (out.locality.length) console.log('  locality:', out.locality.join(', '));
	if (out.capital.length) console.log('  capital: ', out.capital.join(', '));
	console.log(`  shields (${out.shields.length}):`, out.shields.join(', ') || '—');
}

console.log(errors.length ? `\nconsole issues:\n  ${errors.join('\n  ')}` : '\nno console issues');
await browser.close();
