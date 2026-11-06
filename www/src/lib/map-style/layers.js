/**
 * Parameterized basemap layers derived from Protomaps WHITE theme.
 *
 * Every color and font is injected via `colors` and `fonts` parameters,
 * making it easy to customize without touching layer structure.
 *
 * Derived from @protomaps/basemaps, Copyright 2019-2023 Protomaps LLC, Kelso Cartography,
 * BSD-3-Clause; full notice in ./LICENSE-protomaps.md.
 */
import { multilineName, countryName } from './text-field.js';
import { ROAD_LABEL_MIN_ZOOM, ROAD_SHIELD_MIN_ZOOM, SUBPLACE_ZOOM } from './render-config.js';

// The zoom at which a single subplace label is allowed to appear. Protomaps ships quarter features
// into tiles one to two zoom levels before they are meant to be drawn and expects the style to
// gate them; this is that gate, staggered by importance. See `SUBPLACE_ZOOM`.
const subplaceReveal = [
	'case',
	['>=', ['coalesce', ['get', 'population_rank'], 0], 8],
	SUBPLACE_ZOOM.district,
	['==', ['get', 'kind'], 'macrohood'],
	SUBPLACE_ZOOM.quarter,
	SUBPLACE_ZOOM.neighbourhood
];

/**
 * @param {string} source  Vector tile source name (e.g. 'protomaps')
 * @param {Record<string, string>} colors  Color values keyed by Flavor-compatible names
 * @param {{ regular: string, bold: string, italic: string, devanagari: string }} fonts
 * @returns {import('maplibre-gl').LayerSpecification[]}
 */
export function makeLayers(source, colors, fonts) {
	const name = multilineName(fonts);

	// City (locality) labels default to regular weight + grey here. The one exception — the focus
	// city the map is framed on — is emphasised bold + black at render time, keyed off the city
	// boundary polygon (`focusText*` in `label-clip.js`, injected by `makeMapStyle()` and
	// `applyLabelClip()`). We can't key it off `capital` because most catalog cities are not
	// national capitals, so a non-capital focus city renders through `places_locality`; only the
	// boundary reliably identifies the focus city. With no boundary (the generic published style)
	// every city stays regular + grey.
	const localityFont = ['literal', [fonts.regular]];

	return /** @type {import('maplibre-gl').LayerSpecification[]} */ ([
		// ── Background & Earth ──────────────────────────────────────────
		{
			id: 'background',
			type: 'background',
			paint: { 'background-color': colors.background }
		},
		{
			id: 'earth',
			type: 'fill',
			filter: ['==', '$type', 'Polygon'],
			source,
			'source-layer': 'earth',
			paint: { 'fill-color': colors.earth }
		},

		// ── Landuse ─────────────────────────────────────────────────────
		{
			id: 'landuse_park',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: [
				'in',
				'kind',
				'national_park',
				'park',
				'cemetery',
				'protected_area',
				'nature_reserve',
				'forest',
				'golf_course',
				'wood',
				'scrub',
				'grassland',
				'grass',
				'glacier',
				'sand',
				'military',
				'naval_base',
				'airfield'
			],
			paint: {
				'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 11, 1],
				'fill-color': [
					'case',
					[
						'in',
						['get', 'kind'],
						[
							'literal',
							[
								'national_park',
								'park',
								'cemetery',
								'protected_area',
								'nature_reserve',
								'forest',
								'golf_course'
							]
						]
					],
					colors.park_a,
					['==', ['get', 'kind'], 'wood'],
					colors.wood_a,
					['in', ['get', 'kind'], ['literal', ['scrub', 'grassland', 'grass']]],
					colors.scrub_a,
					['==', ['get', 'kind'], 'glacier'],
					colors.glacier,
					['==', ['get', 'kind'], 'sand'],
					colors.sand,
					['in', ['get', 'kind'], ['literal', ['military', 'naval_base', 'airfield']]],
					colors.military,
					colors.earth
				]
			}
		},
		{
			id: 'landuse_urban_green',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['in', 'kind', 'allotments', 'village_green', 'playground'],
			paint: { 'fill-color': colors.park_a, 'fill-opacity': 0.7 }
		},
		{
			id: 'landuse_hospital',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['==', 'kind', 'hospital'],
			paint: { 'fill-color': colors.hospital }
		},
		{
			id: 'landuse_industrial',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['==', 'kind', 'industrial'],
			paint: { 'fill-color': colors.industrial }
		},
		{
			id: 'landuse_school',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['in', 'kind', 'school', 'university', 'college'],
			paint: { 'fill-color': colors.school }
		},
		{
			id: 'landuse_beach',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['in', 'kind', 'beach'],
			paint: { 'fill-color': colors.beach }
		},
		{
			id: 'landuse_zoo',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['in', 'kind', 'zoo'],
			paint: { 'fill-color': colors.zoo }
		},
		{
			id: 'landuse_aerodrome',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['in', 'kind', 'aerodrome'],
			paint: { 'fill-color': colors.aerodrome }
		},

		// ── Runways ─────────────────────────────────────────────────────
		{
			id: 'roads_runway',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['==', 'kind_detail', 'runway'],
			paint: {
				'line-color': colors.runway,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, 0, 12, 4, 18, 30]
			}
		},
		{
			id: 'roads_taxiway',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 13,
			filter: ['==', 'kind_detail', 'taxiway'],
			paint: {
				'line-color': colors.runway,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 15, 6]
			}
		},
		{
			id: 'landuse_runway',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['any', ['in', 'kind', 'runway', 'taxiway']],
			paint: { 'fill-color': colors.runway }
		},

		// ── Water ───────────────────────────────────────────────────────
		{
			id: 'water',
			type: 'fill',
			filter: ['==', '$type', 'Polygon'],
			source,
			'source-layer': 'water',
			paint: { 'fill-color': colors.water }
		},
		{
			id: 'water_stream',
			type: 'line',
			source,
			'source-layer': 'water',
			minzoom: 14,
			filter: ['in', 'kind', 'stream'],
			paint: { 'line-color': colors.water, 'line-width': 0.5 }
		},
		{
			id: 'water_river',
			type: 'line',
			source,
			'source-layer': 'water',
			minzoom: 9,
			filter: ['in', 'kind', 'river'],
			paint: {
				'line-color': colors.water,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 0, 9.5, 1, 18, 12]
			}
		},

		// ── Pedestrian & Pier ───────────────────────────────────────────
		{
			id: 'landuse_pedestrian',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['in', 'kind', 'pedestrian', 'dam'],
			paint: { 'fill-color': colors.pedestrian }
		},
		{
			id: 'landuse_pier',
			type: 'fill',
			source,
			'source-layer': 'landuse',
			filter: ['==', 'kind', 'pier'],
			paint: { 'fill-color': colors.pier }
		},

		// ── Tunnels (casing) ────────────────────────────────────────────
		{
			id: 'roads_tunnels_other_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['in', 'kind', 'other', 'path']],
			paint: {
				'line-color': colors.tunnel_other_casing,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0, 20, 7]
			}
		},
		{
			id: 'roads_tunnels_minor_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['==', 'kind', 'minor_road']],
			paint: {
				'line-color': colors.tunnel_minor_casing,
				'line-dasharray': [3, 2],
				'line-gap-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					11,
					0,
					12.5,
					0.5,
					15,
					2,
					18,
					11
				],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0, 12.5, 1]
			}
		},
		{
			id: 'roads_tunnels_link_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['has', 'is_link']],
			paint: {
				'line-color': colors.tunnel_link_casing,
				'line-dasharray': [3, 2],
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 18, 11],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0, 12.5, 1]
			}
		},
		{
			id: 'roads_tunnels_major_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['!has', 'is_bridge'], ['==', 'kind', 'major_road']],
			paint: {
				'line-color': colors.tunnel_major_casing,
				'line-dasharray': [3, 2],
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 0.5, 18, 13],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 0, 9.5, 1]
			}
		},
		{
			id: 'roads_tunnels_highway_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: [
				'all',
				['has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'highway'],
				['!has', 'is_link']
			],
			paint: {
				'line-color': colors.tunnel_highway_casing,
				'line-dasharray': [6, 0.5],
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0, 3.5, 0.5, 18, 15],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 1, 20, 15]
			}
		},

		// ── Tunnels (fill) ──────────────────────────────────────────────
		{
			id: 'roads_tunnels_other',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['in', 'kind', 'other', 'path']],
			paint: {
				'line-color': colors.tunnel_other,
				'line-dasharray': [4.5, 0.5],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0, 20, 7]
			}
		},
		{
			id: 'roads_tunnels_minor',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['==', 'kind', 'minor_road']],
			paint: {
				'line-color': colors.tunnel_minor,
				'line-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					11,
					0,
					12.5,
					0.5,
					15,
					2,
					18,
					11
				]
			}
		},
		{
			id: 'roads_tunnels_link',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['has', 'is_link']],
			paint: {
				'line-color': colors.tunnel_link,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 18, 11]
			}
		},
		{
			id: 'roads_tunnels_major',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_tunnel'], ['==', 'kind', 'major_road']],
			paint: {
				'line-color': colors.tunnel_major,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 0, 12, 1.6, 15, 3, 18, 13]
			}
		},
		{
			id: 'roads_tunnels_highway',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: [
				'all',
				['has', 'is_tunnel'],
				['==', ['get', 'kind'], 'highway'],
				['!', ['has', 'is_link']]
			],
			paint: {
				'line-color': colors.tunnel_highway,
				'line-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					3,
					0,
					6,
					1.1,
					12,
					1.6,
					15,
					5,
					18,
					15
				]
			}
		},

		// ── Buildings ───────────────────────────────────────────────────
		{
			id: 'buildings',
			type: 'fill',
			source,
			'source-layer': 'buildings',
			filter: ['in', 'kind', 'building', 'building_part'],
			paint: { 'fill-color': colors.buildings, 'fill-opacity': 0.5 }
		},

		// ── Roads (pier) ────────────────────────────────────────────────
		{
			id: 'roads_pier',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['==', 'kind_detail', 'pier'],
			paint: {
				'line-color': colors.pier,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0, 12.5, 0.5, 20, 16]
			}
		},

		// ── Roads (casing) ──────────────────────────────────────────────
		{
			id: 'roads_minor_service_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 13,
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'minor_road'],
				['==', 'kind_detail', 'service']
			],
			paint: {
				'line-color': colors.minor_service_casing,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 18, 8],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 0.8]
			}
		},
		{
			id: 'roads_minor_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'minor_road'],
				['!=', 'kind_detail', 'service']
			],
			paint: {
				'line-color': colors.minor_casing,
				'line-gap-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					11,
					0,
					12.5,
					0.5,
					15,
					2,
					18,
					11
				],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0, 12.5, 1]
			}
		},
		{
			id: 'roads_link_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 13,
			filter: ['has', 'is_link'],
			paint: {
				'line-color': colors.link_casing,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 18, 11],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1.5]
			}
		},
		{
			id: 'roads_major_casing_late',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['!has', 'is_tunnel'], ['!has', 'is_bridge'], ['==', 'kind', 'major_road']],
			paint: {
				'line-color': colors.major_casing_late,
				'line-gap-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					6,
					0,
					12,
					1.6,
					15,
					3,
					18,
					13
				],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 0, 9.5, 1]
			}
		},
		{
			id: 'roads_highway_casing_late',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'highway'],
				['!has', 'is_link']
			],
			paint: {
				'line-color': colors.highway_casing_late,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0, 3.5, 0.5, 18, 15],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 1, 20, 15]
			}
		},

		// ── Roads (fill) ────────────────────────────────────────────────
		{
			id: 'roads_other',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['in', 'kind', 'other', 'path'],
				['!=', 'kind_detail', 'pier']
			],
			paint: {
				'line-color': colors.other,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0.5, 20, 12]
			}
		},
		{
			id: 'roads_link',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['has', 'is_link'],
			paint: {
				'line-color': colors.link,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 18, 11]
			}
		},
		{
			id: 'roads_minor_service',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'minor_road'],
				['==', 'kind_detail', 'service']
			],
			paint: {
				'line-color': colors.minor_service,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 18, 8]
			}
		},
		{
			id: 'roads_minor',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'minor_road'],
				['!=', 'kind_detail', 'service']
			],
			paint: {
				'line-color': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					11,
					colors.minor_a,
					16,
					colors.minor_b
				],
				'line-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					11,
					0,
					12.5,
					0.5,
					15,
					2,
					18,
					11
				]
			}
		},
		{
			id: 'roads_major_casing_early',
			type: 'line',
			source,
			'source-layer': 'roads',
			maxzoom: 12,
			filter: ['all', ['!has', 'is_tunnel'], ['!has', 'is_bridge'], ['==', 'kind', 'major_road']],
			paint: {
				'line-color': colors.major_casing_early,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 0.5, 18, 13],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 0, 9.5, 1]
			}
		},
		{
			id: 'roads_major',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['!has', 'is_tunnel'], ['!has', 'is_bridge'], ['==', 'kind', 'major_road']],
			paint: {
				'line-color': colors.major,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 0, 12, 1.6, 15, 3, 18, 13]
			}
		},
		{
			id: 'roads_highway_casing_early',
			type: 'line',
			source,
			'source-layer': 'roads',
			maxzoom: 12,
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'highway'],
				['!has', 'is_link']
			],
			paint: {
				'line-color': colors.highway_casing_early,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0, 3.5, 0.5, 18, 15],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 1]
			}
		},
		{
			id: 'roads_highway',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: [
				'all',
				['!has', 'is_tunnel'],
				['!has', 'is_bridge'],
				['==', 'kind', 'highway'],
				['!has', 'is_link']
			],
			paint: {
				'line-color': colors.highway,
				'line-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					3,
					0,
					6,
					1.1,
					12,
					1.6,
					15,
					5,
					18,
					15
				]
			}
		},

		// ── Rail ────────────────────────────────────────────────────────
		{
			id: 'roads_rail',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['==', 'kind', 'rail'],
			paint: {
				'line-dasharray': [0.3, 0.75],
				'line-opacity': 0.5,
				'line-color': colors.railway,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0, 6, 0.15, 18, 9]
			}
		},

		// ── Boundaries ──────────────────────────────────────────────────
		{
			id: 'boundaries_country',
			type: 'line',
			source,
			'source-layer': 'boundaries',
			filter: ['<=', 'kind_detail', 2],
			paint: {
				'line-color': colors.boundaries,
				'line-width': 0.7,
				'line-dasharray': ['step', ['zoom'], ['literal', [2, 0]], 4, ['literal', [2, 1]]]
			}
		},
		{
			id: 'boundaries',
			type: 'line',
			source,
			'source-layer': 'boundaries',
			filter: ['>', 'kind_detail', 2],
			paint: {
				'line-color': colors.boundaries,
				'line-width': 0.4,
				'line-dasharray': ['step', ['zoom'], ['literal', [2, 0]], 4, ['literal', [2, 1]]]
			}
		},

		// ── Bridges (casing) ────────────────────────────────────────────
		{
			id: 'roads_bridges_other_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['in', 'kind', 'other', 'path']],
			paint: {
				'line-color': colors.bridges_other_casing,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0, 20, 7]
			}
		},
		{
			id: 'roads_bridges_link_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['has', 'is_link']],
			paint: {
				'line-color': colors.bridges_link_casing,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 18, 11],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0, 12.5, 1.5]
			}
		},
		{
			id: 'roads_bridges_minor_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['==', 'kind', 'minor_road']],
			paint: {
				'line-color': colors.bridges_minor_casing,
				'line-gap-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					11,
					0,
					12.5,
					0.5,
					15,
					2,
					18,
					11
				],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 0.8]
			}
		},
		{
			id: 'roads_bridges_major_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['==', 'kind', 'major_road']],
			paint: {
				'line-color': colors.bridges_major_casing,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 0.5, 18, 10],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 0, 9.5, 1.5]
			}
		},

		// ── Bridges (fill) ──────────────────────────────────────────────
		{
			id: 'roads_bridges_other',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['in', 'kind', 'other', 'path']],
			paint: {
				'line-color': colors.bridges_other,
				'line-dasharray': [2, 1],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0, 20, 7]
			}
		},
		{
			id: 'roads_bridges_minor',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['==', 'kind', 'minor_road']],
			paint: {
				'line-color': colors.bridges_minor,
				'line-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					11,
					0,
					12.5,
					0.5,
					15,
					2,
					18,
					11
				]
			}
		},
		{
			id: 'roads_bridges_link',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['has', 'is_link']],
			paint: {
				'line-color': colors.bridges_link,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 18, 11]
			}
		},
		{
			id: 'roads_bridges_major',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['==', 'kind', 'major_road']],
			paint: {
				'line-color': colors.bridges_major,
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 0, 12, 1.6, 15, 3, 18, 13]
			}
		},
		{
			id: 'roads_bridges_highway_casing',
			type: 'line',
			source,
			'source-layer': 'roads',
			minzoom: 12,
			filter: ['all', ['has', 'is_bridge'], ['==', 'kind', 'highway'], ['!has', 'is_link']],
			paint: {
				'line-color': colors.bridges_highway_casing,
				'line-gap-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0, 3.5, 0.5, 18, 15],
				'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 1, 20, 15]
			}
		},
		{
			id: 'roads_bridges_highway',
			type: 'line',
			source,
			'source-layer': 'roads',
			filter: ['all', ['has', 'is_bridge'], ['==', 'kind', 'highway'], ['!has', 'is_link']],
			paint: {
				'line-color': colors.bridges_highway,
				'line-width': [
					'interpolate',
					['exponential', 1.6],
					['zoom'],
					3,
					0,
					6,
					1.1,
					12,
					1.6,
					15,
					5,
					18,
					15
				]
			}
		},

		// ── Labels ──────────────────────────────────────────────────────
		{
			id: 'address_label',
			type: 'symbol',
			source,
			'source-layer': 'buildings',
			minzoom: 18,
			filter: ['==', ['get', 'kind'], 'address'],
			layout: {
				'symbol-placement': 'point',
				'text-font': [fonts.italic],
				'text-field': ['get', 'addr_housenumber'],
				'text-size': 12
			},
			paint: {
				'text-color': colors.address_label,
				'text-halo-color': colors.address_label_halo,
				'text-halo-width': 1
			}
		},
		{
			id: 'water_waterway_label',
			type: 'symbol',
			source,
			'source-layer': 'water',
			minzoom: 13,
			filter: ['in', 'kind', 'river', 'stream'],
			layout: {
				'symbol-placement': 'line',
				'text-font': [fonts.italic],
				'text-field': name,
				'text-size': 12,
				'text-letter-spacing': 0.2
			},
			paint: {
				'text-color': colors.ocean_label,
				'text-halo-color': colors.water,
				'text-halo-width': 1
			}
		},
		{
			id: 'roads_oneway',
			type: 'symbol',
			source,
			'source-layer': 'roads',
			minzoom: 16,
			filter: ['==', ['get', 'oneway'], 'yes'],
			layout: {
				'symbol-placement': 'line',
				'icon-image': 'arrow',
				'icon-rotate': 90,
				'symbol-spacing': 100
			}
		},
		{
			id: 'roads_labels_minor',
			type: 'symbol',
			source,
			'source-layer': 'roads',
			minzoom: 15,
			filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'other', 'path']]],
			layout: {
				'symbol-sort-key': ['get', 'min_zoom'],
				'symbol-placement': 'line',
				'text-font': [fonts.regular],
				'text-field': name,
				'text-size': 12
			},
			paint: {
				'text-color': colors.roads_label_minor,
				'text-halo-color': colors.roads_label_minor_halo,
				'text-halo-width': 1.5
			}
		},
		{
			id: 'water_label_ocean',
			type: 'symbol',
			source,
			'source-layer': 'water',
			filter: ['in', 'kind', 'sea', 'ocean', 'bay', 'strait', 'fjord'],
			layout: {
				'text-font': [fonts.italic],
				'text-field': name,
				'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 12],
				'text-letter-spacing': 0.1,
				'text-max-width': 9,
				'text-transform': 'uppercase'
			},
			paint: {
				'text-color': colors.ocean_label,
				'text-halo-width': 1,
				'text-halo-color': colors.water
			}
		},
		{
			id: 'earth_label_islands',
			type: 'symbol',
			source,
			'source-layer': 'earth',
			filter: ['in', 'kind', 'island'],
			layout: {
				'text-font': [fonts.italic],
				'text-field': name,
				'text-size': 10,
				'text-letter-spacing': 0.1,
				'text-max-width': 8
			},
			paint: {
				'text-color': colors.subplace_label,
				'text-halo-color': colors.subplace_label_halo,
				'text-halo-width': 1
			}
		},
		{
			id: 'water_label_lakes',
			type: 'symbol',
			source,
			'source-layer': 'water',
			filter: ['in', 'kind', 'lake', 'water'],
			layout: {
				'text-font': [fonts.italic],
				'text-field': name,
				'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 12, 10, 12],
				'text-letter-spacing': 0.1,
				'text-max-width': 9
			},
			paint: {
				'text-color': colors.ocean_label,
				'text-halo-color': colors.water,
				'text-halo-width': 1
			}
		},
		{
			id: 'roads_shields',
			type: 'symbol',
			source,
			'source-layer': 'roads',
			minzoom: ROAD_SHIELD_MIN_ZOOM,
			filter: [
				'all',
				['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]],
				['has', 'shield_text'],
				['<=', ['length', ['get', 'shield_text']], 5]
			],
			layout: {
				'icon-image': [
					'match',
					['get', 'network'],
					'US:I',
					['concat', 'US:I-', ['length', ['get', 'shield_text']], 'char'],
					'NL:S-road',
					['concat', 'NL:S-road-', ['length', ['get', 'shield_text']], 'char'],
					['concat', 'generic_shield-', ['length', ['get', 'shield_text']], 'char']
				],
				'text-field': ['get', 'shield_text'],
				'text-font': [fonts.bold],
				'text-size': 8,
				'icon-size': 0.8,
				'symbol-placement': 'line',
				'icon-rotation-alignment': 'viewport',
				'text-rotation-alignment': 'viewport'
			},
			paint: {
				'text-color': colors.roads_label_major,
				'text-halo-color': colors.earth,
				'text-halo-width': 2
			}
		},
		{
			id: 'roads_labels_major',
			type: 'symbol',
			source,
			'source-layer': 'roads',
			minzoom: ROAD_LABEL_MIN_ZOOM,
			filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]],
			layout: {
				'symbol-sort-key': ['get', 'min_zoom'],
				'symbol-placement': 'line',
				'text-font': [fonts.regular],
				'text-field': name,
				'text-size': 12
			},
			paint: {
				'text-color': colors.roads_label_major,
				'text-halo-color': colors.roads_label_major_halo,
				'text-halo-width': 1.5
			}
		},
		{
			id: 'places_subplace',
			type: 'symbol',
			source,
			'source-layer': 'places',
			minzoom: SUBPLACE_ZOOM.district,
			// Expression syntax throughout — a legacy `['in', 'kind', …]` cannot be `all`-composed
			// with the zoom gate below.
			filter: [
				'all',
				['in', ['get', 'kind'], ['literal', ['neighbourhood', 'macrohood']]],
				['>=', ['zoom'], subplaceReveal]
			],
			layout: {
				'symbol-sort-key': ['case', ['has', 'sort_key'], ['get', 'sort_key'], ['get', 'min_zoom']],
				'text-field': name,
				'text-font': [fonts.regular],
				'text-max-width': 7,
				'text-letter-spacing': 0.1,
				// Anchored on the first tier's reveal zoom, so retuning `SUBPLACE_ZOOM` cannot leave the
				// ramps starting below anything that renders.
				'text-padding': [
					'interpolate',
					['linear'],
					['zoom'],
					SUBPLACE_ZOOM.district,
					18,
					SUBPLACE_ZOOM.district + 3,
					20
				],
				'text-size': [
					'interpolate',
					['exponential', 1.2],
					['zoom'],
					SUBPLACE_ZOOM.district,
					10,
					SUBPLACE_ZOOM.district + 3,
					13,
					18,
					20
				],
				'text-transform': 'uppercase'
			},
			paint: {
				'text-color': colors.subplace_label,
				'text-halo-color': colors.subplace_label_halo,
				'text-halo-width': 2
			}
		},
		{
			id: 'places_region',
			type: 'symbol',
			source,
			'source-layer': 'places',
			filter: ['==', 'kind', 'region'],
			layout: {
				'symbol-sort-key': ['get', 'sort_key'],
				'text-field': ['step', ['zoom'], ['coalesce', ['get', 'ref:en'], ['get', 'ref']], 6, name],
				'text-font': [fonts.regular],
				'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 7, 16],
				'text-radial-offset': 0.2,
				'text-anchor': 'center',
				'text-transform': 'uppercase'
			},
			paint: {
				'text-color': colors.state_label,
				'text-halo-color': colors.state_label_halo,
				'text-halo-width': 1
			}
		},
		{
			id: 'places_locality',
			type: 'symbol',
			source,
			'source-layer': 'places',
			// Same defect as `places_subplace` had, in the sibling layer: the tile ships a `min_zoom`
			// hint and the style ignored it, so london drew 46 wharves, gates and estates at z12 that
			// Protomaps marks as z13-and-up. Honour the hint rather than invent a threshold — capitals
			// come from `places_locality_capital` below, so a city never loses its own name to this.
			// Expression syntax throughout so `label-clip.js` can `all`-compose the boundary clip on.
			filter: [
				'all',
				['==', ['get', 'kind'], 'locality'],
				// Capitals render through `places_locality_capital` only, so a capital focus city
				// isn't drawn twice once the two layers can differ in weight/colour.
				['!=', ['get', 'capital'], 'yes'],
				['>=', ['zoom'], ['coalesce', ['get', 'min_zoom'], 0]]
			],
			layout: {
				'icon-image': [
					'step',
					['zoom'],
					['case', ['==', ['get', 'capital'], 'yes'], 'capital', 'townspot'],
					8,
					''
				],
				'icon-size': 0.7,
				'text-field': name,
				'text-font': localityFont,
				'symbol-sort-key': ['case', ['has', 'sort_key'], ['get', 'sort_key'], ['get', 'min_zoom']],
				'text-padding': ['interpolate', ['linear'], ['zoom'], 5, 3, 8, 7, 12, 11],
				'text-size': [
					'interpolate',
					['linear'],
					['zoom'],
					2,
					[
						'case',
						['<', ['get', 'population_rank'], 13],
						8,
						['>=', ['get', 'population_rank'], 13],
						13,
						0
					],
					4,
					[
						'case',
						['<', ['get', 'population_rank'], 13],
						10,
						['>=', ['get', 'population_rank'], 13],
						15,
						0
					],
					6,
					[
						'case',
						['<', ['get', 'population_rank'], 12],
						11,
						['>=', ['get', 'population_rank'], 12],
						17,
						0
					],
					8,
					[
						'case',
						['<', ['get', 'population_rank'], 11],
						11,
						['>=', ['get', 'population_rank'], 11],
						18,
						0
					],
					10,
					[
						'case',
						['<', ['get', 'population_rank'], 9],
						12,
						['>=', ['get', 'population_rank'], 9],
						20,
						0
					],
					15,
					[
						'case',
						['<', ['get', 'population_rank'], 8],
						12,
						['>=', ['get', 'population_rank'], 8],
						22,
						0
					]
				],
				'icon-padding': ['interpolate', ['linear'], ['zoom'], 0, 0, 8, 4, 10, 8, 12, 6, 22, 2],
				'text-justify': 'auto',
				'text-variable-anchor': [
					'step',
					['zoom'],
					['literal', ['bottom', 'left', 'right', 'top']],
					8,
					['literal', ['center']]
				],
				'text-radial-offset': 0.3
			},
			paint: {
				'text-color': colors.locality_label,
				'text-halo-color': colors.locality_label_halo,
				'text-halo-width': 1
			}
		},
		{
			id: 'places_locality_capital',
			type: 'symbol',
			source,
			'source-layer': 'places',
			filter: ['==', 'capital', 'yes'],
			layout: {
				'icon-image': [
					'step',
					['zoom'],
					['case', ['==', ['get', 'capital'], 'yes'], 'capital', 'townspot'],
					8,
					''
				],
				'icon-size': 0.7,
				'text-field': name,
				'text-font': localityFont,
				'symbol-sort-key': ['case', ['has', 'sort_key'], ['get', 'sort_key'], ['get', 'min_zoom']],
				'text-padding': ['interpolate', ['linear'], ['zoom'], 5, 3, 8, 7, 12, 11],
				'text-size': [
					'interpolate',
					['linear'],
					['zoom'],
					2,
					[
						'case',
						['<', ['get', 'population_rank'], 13],
						8,
						['>=', ['get', 'population_rank'], 13],
						13,
						0
					],
					4,
					[
						'case',
						['<', ['get', 'population_rank'], 13],
						10,
						['>=', ['get', 'population_rank'], 13],
						15,
						0
					],
					6,
					[
						'case',
						['<', ['get', 'population_rank'], 12],
						11,
						['>=', ['get', 'population_rank'], 12],
						17,
						0
					],
					8,
					[
						'case',
						['<', ['get', 'population_rank'], 11],
						11,
						['>=', ['get', 'population_rank'], 11],
						18,
						0
					],
					10,
					[
						'case',
						['<', ['get', 'population_rank'], 9],
						12,
						['>=', ['get', 'population_rank'], 9],
						20,
						0
					],
					15,
					[
						'case',
						['<', ['get', 'population_rank'], 8],
						12,
						['>=', ['get', 'population_rank'], 8],
						22,
						0
					]
				],
				'icon-padding': ['interpolate', ['linear'], ['zoom'], 0, 0, 8, 4, 10, 8, 12, 6, 22, 2],
				'text-justify': 'auto',
				'text-variable-anchor': [
					'step',
					['zoom'],
					['literal', ['bottom', 'left', 'right', 'top']],
					8,
					['literal', ['center']]
				],
				'text-radial-offset': 0.3
			},
			paint: {
				'text-color': colors.locality_label,
				'text-halo-color': colors.city_label_halo,
				'text-halo-width': 1
			}
		},

		{
			id: 'places_country',
			type: 'symbol',
			source,
			'source-layer': 'places',
			filter: ['==', 'kind', 'country'],
			layout: {
				'symbol-sort-key': ['case', ['has', 'sort_key'], ['get', 'sort_key'], ['get', 'min_zoom']],
				'text-field': countryName(),
				'text-font': [fonts.bold],
				'text-size': [
					'interpolate',
					['linear'],
					['zoom'],
					2,
					[
						'case',
						['<', ['get', 'population_rank'], 10],
						8,
						['>=', ['get', 'population_rank'], 10],
						12,
						0
					],
					6,
					[
						'case',
						['<', ['get', 'population_rank'], 8],
						10,
						['>=', ['get', 'population_rank'], 8],
						18,
						0
					],
					8,
					[
						'case',
						['<', ['get', 'population_rank'], 7],
						11,
						['>=', ['get', 'population_rank'], 7],
						20,
						0
					]
				],
				'icon-padding': ['interpolate', ['linear'], ['zoom'], 0, 2, 14, 2, 16, 20, 17, 2, 22, 2],
				'text-transform': 'uppercase'
			},
			paint: {
				'text-color': colors.country_label,
				'text-halo-color': colors.earth,
				'text-halo-width': 1
			}
		}
	]);
}
