// Web-Mercator-safe world ring (lat clamped to ±85 — ±90 is unrepresentable in EPSG:3857).
const WORLD_RING = [
	[-180, -85],
	[180, -85],
	[180, 85],
	[-180, 85],
	[-180, -85]
];

/**
 * Invert a city-boundary FeatureCollection (the *inside* of the city) into a single Polygon
 * covering everything *outside* it — the world ring as the exterior, each city part's exterior
 * ring as a hole. Fill this to tint the surroundings.
 *
 * Returns null when there is no usable geometry, so callers can skip the layer entirely.
 * @param {GeoJSON.FeatureCollection | null} fc
 * @returns {GeoJSON.Feature<GeoJSON.Polygon> | null}
 */
export function invertBoundary(fc) {
	const holes = [];
	for (const feature of fc?.features ?? []) {
		const g = feature?.geometry;
		if (!g) continue;
		if (g.type === 'Polygon') holes.push(g.coordinates[0]);
		else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) holes.push(poly[0]);
	}
	if (!holes.length) return null;
	return {
		type: 'Feature',
		properties: {},
		geometry: { type: 'Polygon', coordinates: [WORLD_RING, ...holes] }
	};
}
