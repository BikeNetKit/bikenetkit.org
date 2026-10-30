// node --test src/lib/hero-clip/framing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataFocus } from './framing.js';

/**
 * @param {...GeoJSON.Geometry} geometries
 * @returns {GeoJSON.FeatureCollection}
 */
const fc = (...geometries) => ({
	type: 'FeatureCollection',
	features: geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry }))
});

test('median vertex over lines and polygons, not swayed by an outlier', () => {
	const focus = dataFocus(
		fc(
			{
				type: 'LineString',
				coordinates: [
					[0, 0],
					[1, 1],
					[2, 2]
				]
			},
			{
				type: 'Polygon',
				coordinates: [
					[
						[1, 1],
						[2, 1],
						[1, 2],
						[1, 1]
					]
				]
			},
			{
				type: 'LineString',
				coordinates: [
					[100, 50],
					[101, 51]
				]
			}
		)
	);
	assert.deepEqual(focus, [1, 1]);
});

test('points are ignored, and an empty collection has no focus', () => {
	assert.equal(dataFocus(fc({ type: 'Point', coordinates: [5, 5] })), null);
	assert.equal(dataFocus(fc()), null);
	assert.equal(dataFocus(null), null);
});
