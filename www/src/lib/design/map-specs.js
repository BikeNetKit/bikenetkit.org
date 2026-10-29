import { mapStyle, overlayBeforeId } from '$lib/map-style/style.js';
import { BASE_PALETTE, theme } from '$lib/map-style/theme.js';
import {
	RAMP_COLORS,
	computeRampStops,
	rampColorsFor,
	zoomScale
} from '$lib/map-style/line-paint.js';
import { lineWidthRangeFor } from '$lib/data/tools';
import { SORTBIKENET_RAMP } from '$lib/data/sortbikenet';
import { FIXBIKENET_RAMP } from '$lib/data/fixbikenet';

/** @param {string} hex */
const normalizeHex = (hex) => {
	const h = hex.replace('#', '').toLowerCase();
	return h.length === 3 ? [...h].map((c) => c + c).join('') : h;
};

// Tested in this order (labels before roads, so `roads_label_minor` is a label); shown in
// DISPLAY_ORDER, bottom of the stack first.
/** @type {[string, (key: string) => boolean][]} */
const PALETTE_GROUPS = [
	['Labels', (k) => k.includes('label')],
	['Tunnels', (k) => k.startsWith('tunnel_')],
	['Bridges', (k) => k.startsWith('bridges_')],
	['Water', (k) => k === 'water'],
	['Boundaries', (k) => k === 'boundaries'],
	['Buildings', (k) => k === 'buildings' || k === 'pier'],
	[
		'Roads & rail',
		(k) => /^(other|minor|link|major|highway|railway)/.test(k) || k.endsWith('_casing')
	],
	['Ground & landuse', () => true]
];

const DISPLAY_ORDER = [
	'Ground & landuse',
	'Water',
	'Buildings',
	'Roads & rail',
	'Tunnels',
	'Bridges',
	'Boundaries',
	'Labels'
];

/**
 * The basemap palette as the style paints it, grouped for display. `overridden` marks the keys
 * `theme.js` changes from the Protomaps base, compared as colors rather than as strings.
 */
export function basemapPaletteGroups() {
	/** @type {Map<string, { key: string, value: string, overridden: boolean }[]>} */
	const groups = new Map(PALETTE_GROUPS.map(([name]) => [name, []]));
	for (const [key, value] of Object.entries(theme)) {
		const name = (PALETTE_GROUPS.find(([, test]) => test(key)) ?? PALETTE_GROUPS[0])[0];
		const base = BASE_PALETTE[/** @type {keyof typeof BASE_PALETTE} */ (key)];
		groups.get(name)?.push({ key, value, overridden: normalizeHex(value) !== normalizeHex(base) });
	}
	return DISPLAY_ORDER.map((name) => /** @type {const} */ ([name, groups.get(name) ?? []]))
		.filter(([, entries]) => entries.length > 0)
		.map(([name, entries]) => ({ name, entries }));
}

/**
 * The basemap's layers cut into the three bands the overlays sit between: ground (earth, landuse,
 * water), the street network (tunnels, roads, rail, boundaries, bridges) and the labels. The
 * overlays go in at the start of the label band, `overlayBeforeId()`.
 */
export function basemapLayerBands() {
	const ids = mapStyle.layers.map((l) => l.id);
	const roadsStart = ids.findIndex((id) => id.startsWith('roads_tunnels'));
	const labelsStart = ids.indexOf(overlayBeforeId());
	return [
		{ name: 'Ground', ids: ids.slice(0, roadsStart) },
		{ name: 'Street network', ids: ids.slice(roadsStart, labelsStart) },
		{ name: 'Labels', ids: ids.slice(labelsStart) }
	];
}

/**
 * The data overlays, bottom to top. Each is inserted beneath `overlayBeforeId()`, so the
 * declaration order inside a component is its drawing order. The city boundary (MapHost) mounts
 * with the style, before any tool's layer set, which draws over it.
 */
export const OVERLAY_STACK = [
	{
		id: 'city-boundary-mask-fill',
		source: 'MapHost',
		tools: 'all',
		paint: 'brand fill outside the city, BOUNDARY_MASK_OPACITY'
	},
	{
		id: 'city-boundary-line',
		source: 'MapHost',
		tools: 'all',
		paint: 'brand line, BOUNDARY_LINE_WIDTH at BOUNDARY_LINE_OPACITY'
	},
	{
		id: '…-context-dots, …-context-symbols',
		source: 'BuildupLayers',
		tools: 'GrowBikeNet (rail, school)',
		paint: 'theme.address_label grey; icons from CONTEXT_ICON_MIN_ZOOM'
	},
	{
		id: '…-plan',
		source: 'BuildupLayers',
		tools: 'SortBikeNet',
		paint: 'ink line, PLAN_UNDERLAY_LINE_WIDTH at PLAN_UNDERLAY_OPACITY'
	},
	{
		id: '…-existing',
		source: 'BuildupLayers, StaticLayers',
		tools: 'GrowBikeNet (from_bikenw), LinkBikeNet, FixBikeNet, SortBikeNet',
		paint: 'existingNetwork line, EXISTING_NETWORK_LINE_WIDTH at EXISTING_NETWORK_OPACITY'
	},
	{
		id: '…-hulls',
		source: 'SuperblockLayers',
		tools: 'SuperBlockify',
		paint: 'category-* fill (hashed), SUPERBLOCK_HULL_OPACITY'
	},
	{
		id: '…-metric, …-edges',
		source: 'all three',
		tools: 'all',
		paint: 'ramp line at quantile stops, width per tool, zoom-scaled'
	},
	{
		id: '…-hulls-boundary',
		source: 'SuperblockLayers',
		tools: 'SuperBlockify (density mode)',
		paint: 'density-ramp line, SUPERBLOCK_BOUNDARY_WIDTH'
	},
	{
		id: '…-highlight-outline, …-highlight',
		source: 'BuildupLayers, StaticLayers',
		tools: 'all but SuperBlockify',
		paint: 'StaticLayers: ink casing + own ramp color; BuildupLayers: flat ink, no casing'
	},
	{
		id: '…-selection-outline, …-selection',
		source: 'StaticLayers',
		tools: 'FixBikeNet',
		paint: 'as hover, SELECTION_WIDTH_STEP wider'
	},
	{
		id: '…-metric-dots, …-rank-labels',
		source: 'StaticLayers',
		tools: 'FixBikeNet',
		paint: 'ramp dots with white stroke, below DOT_LINE_CROSSFADE'
	},
	{
		id: '…-seeds-dots',
		source: 'BuildupLayers',
		tools: 'GrowBikeNet',
		paint: 'ink dots with white stroke, SEED_CIRCLE_RADIUS'
	}
];

/** The one overlay drawn above the labels: it has no `beforeId`, so it lands on top. */
export const ABOVE_LABELS = {
	id: '…-hulls-outline',
	source: 'SuperblockLayers',
	tools: 'SuperBlockify',
	paint: 'ink line, SUPERBLOCK_HOVER_WIDTH'
};

/** The zooms the specimens sample `ZOOM_SCALE_STOPS` at. */
export const ZOOM_SAMPLES = [10, 12, 14, 17].map((zoom) => ({ zoom, scale: zoomScale(zoom) }));

const TOOL_RAMPS = [
	{ tool: 'growbikenet', name: 'GrowBikeNet', colors: RAMP_COLORS, ramp: 'RAMP_COLORS' },
	{
		tool: 'linkbikenet',
		name: 'LinkBikeNet',
		colors: rampColorsFor('lcc_gain'),
		ramp: "rampColorsFor('lcc_gain')"
	},
	{ tool: 'fixbikenet', name: 'FixBikeNet', colors: FIXBIKENET_RAMP, ramp: 'FIXBIKENET_RAMP' },
	{ tool: 'sortbikenet', name: 'SortBikeNet', colors: SORTBIKENET_RAMP, ramp: 'SORTBIKENET_RAMP' },
	{
		tool: 'superblockify',
		type: 'edges',
		name: 'SuperBlockify, density',
		colors: RAMP_COLORS,
		ramp: 'RAMP_COLORS'
	}
];

/** Evenly spaced stand-in values, so the quantile stops land on the ramp's colors exactly. */
const UNIT_SERIES = Array.from({ length: 101 }, (_, i) => i / 100);

/** Each tool's metric line at z12: the ramp's color and width at every stop. */
export function toolRampSpecimens() {
	return TOOL_RAMPS.map(({ tool, type, name, colors, ramp }) => {
		const widthRange = lineWidthRangeFor(tool, type);
		return {
			tool,
			name,
			ramp,
			widthRange,
			stops: computeRampStops(UNIT_SERIES, colors, widthRange)
		};
	});
}
