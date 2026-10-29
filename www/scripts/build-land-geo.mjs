#!/usr/bin/env node
// Regenerates the landing-page CitiesMap geometry from world-atlas (110m):
//   src/lib/data/land.geo.json    — dissolved land silhouette (fill)
//   src/lib/data/borders.geo.json — interior country borders (white dividing lines)
// The component projects these with a Europe-focused conic projection and clips
// the render to the viewport, so only Europe shows. Run with `pnpm build:geo`.
// Outputs are committed so the app needs no runtime geometry service.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoBounds } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WWW_ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(WWW_ROOT, 'src/lib/data');

const SOURCE = path.resolve(WWW_ROOT, 'node_modules/world-atlas/countries-110m.json');
const topo = JSON.parse(await readFile(SOURCE, 'utf8'));

// world-atlas 2.0.2 ships Natural Earth 4.1, whose *de facto* attribution puts Crimea inside
// Russia (643) — so the country mesh draws an international border across the Perekop isthmus.
// Most countries, and this project, recognise Crimea as Ukraine. Move the polygon into Ukraine
// (804) here in the topology rather than editing the rendered mesh: the arc it shares with
// mainland Ukraine then becomes *interior* to Ukraine, and the `(a, b) => a !== b` filter below
// drops it for free. The genuine eastern Russia–Ukraine land border is a different arc and is
// untouched, and `topo.objects.land` is a dissolved silhouette that needs no change at all.
const CRIMEA_BBOX = [32.3, 44.2, 36.7, 46.4];

function reattributeCrimea() {
	const geometries = topo.objects.countries.geometries;
	const russia = geometries.find((g) => g.id === '643');
	const ukraine = geometries.find((g) => g.id === '804');
	if (!russia || !ukraine)
		throw new Error('build:geo — expected country ids 643 (RU) and 804 (UA)');

	const inCrimea = (polygonArcs) => {
		const [[w, s], [e, n]] = geoBounds(feature(topo, { type: 'Polygon', arcs: polygonArcs }));
		return w >= CRIMEA_BBOX[0] && s >= CRIMEA_BBOX[1] && e <= CRIMEA_BBOX[2] && n <= CRIMEA_BBOX[3];
	};

	// Located by bounding box, never by index: the index is a property of one published build of
	// world-atlas. Throw on anything but exactly one match so a future source bump fails loudly
	// instead of silently restoring the border.
	const matches = russia.arcs.filter(inCrimea);
	if (matches.length !== 1) {
		throw new Error(`build:geo — expected exactly 1 Crimea polygon in RU, found ${matches.length}`);
	}
	russia.arcs = russia.arcs.filter((polygonArcs) => polygonArcs !== matches[0]);
	ukraine.arcs =
		ukraine.type === 'MultiPolygon' ? [...ukraine.arcs, matches[0]] : [ukraine.arcs, matches[0]];
	ukraine.type = 'MultiPolygon';
}

reattributeCrimea();

const land = feature(topo, topo.objects.land);
const landFC =
	land.type === 'FeatureCollection' ? land : { type: 'FeatureCollection', features: [land] };
const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);

await writeFile(path.resolve(DATA, 'land.geo.json'), JSON.stringify(landFC));
await writeFile(path.resolve(DATA, 'borders.geo.json'), JSON.stringify(borders));
console.log(`Wrote land.geo.json (${landFC.features.length} features) and borders.geo.json`);
