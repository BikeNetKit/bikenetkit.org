/**
 * Confines basemap labels to the city under study.
 *
 * Every map on the site is framed on one city, but the basemap keeps labelling the region around
 * it — paris opened with 50 locality labels, almost all of them suburbs outside the city ("Porte
 * de …", Clichy, Pantin, Montreuil), and amsterdam with a ring of A/N/S motorway shields reaching
 * halfway to Utrecht. MapLibre's `within` filter drops a feature whose geometry falls outside a
 * GeoJSON polygon: a point-in-polygon test for label anchors, a fully-contained test for lines.
 *
 * The polygons come from `www/data/cities/<slug>-boundary.geojson` — pre-simplified to ~100 m
 * by `scripts/update-data.mjs`, because the filter is serialised into every tile-layout call.
 */
import { mapStyle } from './style.js';
import { multilineName } from './text-field.js';
import { fonts, theme } from './theme.js';

/**
 * Layers confined to the city polygon. Each one's filter in `layers.js` must be in expression
 * syntax: MapLibre reads `['all', <legacy filter>, …]` as a legacy filter throughout, and rejects
 * `within` as an unknown legacy operator.
 *
 * Road names are clipped too — Protomaps tags a large share of ordinary streets as `major_road`,
 * so leaving that layer unclipped left almost every surrounding street labelled. `within` is a
 * fully-contained test for lines, so a road crossing the boundary loses its name on the crossing
 * tile-segment; tiles fully inside still label their portion, so the city keeps its street names
 * while the surroundings go quiet.
 */
export const CLIPPED_LABEL_LAYERS = [
	'places_subplace',
	'places_locality',
	'roads_shields',
	'roads_labels_minor',
	'roads_labels_major',
	'address_label'
];

// A neighbour big enough to be worth naming anyway. Audited across all 39 cities over the envelope
// the map can actually pan to: of ~2 665 outside-boundary locality labels, 12 score 10 or more —
// Haarlem and Almere by amsterdam, Potsdam by berlin, Espoo and Vantaa by helsinki, Luton, Reading,
// Milton Keynes and Southend by london, Piraeus by athens, Alcalá de Henares and Móstoles by
// madrid. All real cities, all worth an anchor when the map is zoomed out. Every city keeps its own
// label regardless; that comes from `places_locality_capital`, which is never clipped.
const MAJOR_LOCALITY = ['>=', ['coalesce', ['get', 'population_rank'], 0], 10];

/**
 * Compose a layer's own filter with the boundary clip.
 *
 * @param {string} layerId
 * @param {import('maplibre-gl').FilterSpecification | undefined} baseFilter  the layer's unclipped filter
 * @param {GeoJSON.FeatureCollection | null} boundary
 * @returns {import('maplibre-gl').FilterSpecification | undefined}
 */
export function clippedFilter(layerId, baseFilter, boundary) {
	if (!boundary) return baseFilter;
	const inside = ['within', boundary];
	const keep = layerId === 'places_locality' ? ['any', inside, MAJOR_LOCALITY] : inside;
	return /** @type {import('maplibre-gl').FilterSpecification} */ (
		baseFilter ? ['all', baseFilter, keep] : keep
	);
}

// Resolved on first use rather than at module scope: `style.js` imports this module back for
// `makeMapStyle()`, and reading `mapStyle` while that import is still in flight would hit its TDZ.
let baseFilters = null;

function baseFilterFor(layerId) {
	baseFilters ??= Object.fromEntries(
		mapStyle.layers
			.filter((l) => CLIPPED_LABEL_LAYERS.includes(l.id))
			.map((l) => [l.id, 'filter' in l ? l.filter : undefined])
	);
	return baseFilters[layerId];
}

/**
 * The focus city — the one the map is framed on — draws bold + black; every other city recedes
 * to regular + grey. We can't key off `capital` (most catalog cities are not national capitals,
 * so a non-capital focus city renders through `places_locality`), and we can't key off the
 * boundary polygon alone: a modern municipality (e.g. Alkmaar) contains many villages, all inside
 * the polygon. So we match the label *by name* — the focus city name rides along on the boundary
 * as `boundary.cityName` (see `boundaries.ts`), guarded by `within` so a same-named place
 * elsewhere in view is unaffected. Both locality layers get the same treatment, applied by
 * `makeMapStyle()` at first render and `applyLabelClip()` on a later city change. With no boundary
 * (the generic published style) every city stays regular + grey.
 */
export const FOCUS_EMPHASIS_LAYERS = ['places_locality', 'places_locality_capital'];

const regularName = multilineName(fonts); // regular native-script lines
const boldName = multilineName({ ...fonts, regular: fonts.bold }); // bold native-script lines

/**
 * Expression that is true only for the focus city's own label: inside the boundary and its
 * displayed name (case-insensitive) equals the focus city name. Returns null when there is no
 * boundary or no name to match, so callers fall back to the plain regular styling.
 *
 * @param {import('$lib/data/boundaries').CityBoundary | null} boundary
 * @returns {any}
 */
function focusMatch(boundary) {
	const name = boundary?.cityName;
	if (!boundary || !name) return null;
	return [
		'all',
		['within', boundary],
		['==', ['downcase', ['coalesce', ['get', 'name:en'], ['get', 'name'], '']], name.toLowerCase()]
	];
}

/** @param {import('$lib/data/boundaries').CityBoundary | null} boundary */
export function focusTextField(boundary) {
	const match = focusMatch(boundary);
	return /** @type {import('maplibre-gl').ExpressionSpecification} */ (
		match ? ['case', match, boldName, regularName] : regularName
	);
}

/** @param {import('$lib/data/boundaries').CityBoundary | null} boundary */
export function focusTextFont(boundary) {
	const match = focusMatch(boundary);
	return /** @type {import('maplibre-gl').ExpressionSpecification} */ (
		match
			? ['case', match, ['literal', [fonts.bold]], ['literal', [fonts.regular]]]
			: ['literal', [fonts.regular]]
	);
}

/** @param {import('$lib/data/boundaries').CityBoundary | null} boundary */
export function focusTextColor(boundary) {
	const match = focusMatch(boundary);
	return /** @type {import('maplibre-gl').ExpressionSpecification} */ (
		match ? ['case', match, theme.city_label, theme.locality_label] : theme.locality_label
	);
}

/**
 * Re-clip a live map and re-apply the focus-city emphasis. Used when the boundary arrives or the
 * city changes under a component instance that already exists; a boundary already in hand at
 * construction is handled by `makeMapStyle()` instead.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {GeoJSON.FeatureCollection | null} boundary
 */
export function applyLabelClip(map, boundary) {
	// The interactive routes fetch the boundary in the browser, so this can be called before the
	// style has finished loading — `getLayer` returns undefined there and every set below would be
	// dropped silently. Defer as `setLabelVisibility` does. Calls queued this way run in order, so
	// a burst of city switches still settles on the last boundary.
	if (!map.isStyleLoaded()) {
		map.once('idle', () => applyLabelClip(map, boundary));
		return;
	}
	for (const id of CLIPPED_LABEL_LAYERS) {
		if (map.getLayer(id)) map.setFilter(id, clippedFilter(id, baseFilterFor(id), boundary));
	}
	for (const id of FOCUS_EMPHASIS_LAYERS) {
		if (!map.getLayer(id)) continue;
		map.setLayoutProperty(id, 'text-field', focusTextField(boundary));
		map.setLayoutProperty(id, 'text-font', focusTextFont(boundary));
		map.setPaintProperty(id, 'text-color', focusTextColor(boundary));
	}
}
