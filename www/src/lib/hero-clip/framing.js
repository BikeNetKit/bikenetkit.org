// Where a --tight clip looks: the median vertex of the layer it reveals. The center of the city's
// bounding box often lands on a river, a coast or empty outskirts; the median sits where the most
// network is, and an outlying suburb cannot drag it away.

/** @param {number[]} values */
function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param {GeoJSON.Geometry | null} geometry @param {GeoJSON.Position[]} out */
function collectVertices(geometry, out) {
	if (!geometry) return;
	switch (geometry.type) {
		case 'LineString':
			out.push(...geometry.coordinates);
			break;
		case 'MultiLineString':
		case 'Polygon':
			for (const line of geometry.coordinates) out.push(...line);
			break;
		case 'MultiPolygon':
			for (const polygon of geometry.coordinates) for (const ring of polygon) out.push(...ring);
			break;
		case 'GeometryCollection':
			for (const g of geometry.geometries) collectVertices(g, out);
			break;
	}
}

/**
 * `[lon, lat]` of the median vertex over a collection's lines and polygons, or `null` when it has
 * none. Points are ignored: they are seeds and labels, not network.
 *
 * @param {GeoJSON.FeatureCollection | null | undefined} collection
 * @returns {[number, number] | null}
 */
export function dataFocus(collection) {
	/** @type {GeoJSON.Position[]} */
	const vertices = [];
	for (const f of collection?.features ?? []) collectVertices(f.geometry, vertices);
	if (vertices.length === 0) return null;
	return [median(vertices.map((v) => v[0])), median(vertices.map((v) => v[1]))];
}
