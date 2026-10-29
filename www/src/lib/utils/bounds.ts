import type { FeatureCollection, Geometry, Position } from 'geojson';

export type LngLatBoundsArray = [[number, number], [number, number]];

// Extent of one or more feature collections, or null if none carry coordinates.
export function geojsonBounds(
	...collections: (FeatureCollection | null | undefined)[]
): LngLatBoundsArray | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	const walk = (c: Position) => {
		if (c[0] < minX) minX = c[0];
		if (c[1] < minY) minY = c[1];
		if (c[0] > maxX) maxX = c[0];
		if (c[1] > maxY) maxY = c[1];
	};

	const visit = (geom: Geometry | null) => {
		if (!geom) return;
		if (geom.type === 'GeometryCollection') {
			geom.geometries.forEach(visit);
		} else if (geom.type === 'Point') {
			walk(geom.coordinates);
		} else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
			geom.coordinates.forEach(walk);
		} else if (geom.type === 'MultiLineString' || geom.type === 'Polygon') {
			geom.coordinates.forEach((r) => r.forEach(walk));
		} else if (geom.type === 'MultiPolygon') {
			geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(walk)));
		}
	};

	for (const collection of collections) {
		for (const f of collection?.features ?? []) visit(f.geometry);
	}

	if (!Number.isFinite(minX)) return null;
	return [
		[minX, minY],
		[maxX, maxY]
	];
}

export function padBounds(bounds: LngLatBoundsArray, factor = 0.3): LngLatBoundsArray {
	const [[w, s], [e, n]] = bounds;
	const dx = (e - w) * factor;
	const dy = (n - s) * factor;
	return [
		[w - dx, s - dy],
		[e + dx, n + dy]
	];
}
