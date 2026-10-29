import { RAMP_COLORS, rampColorsFor } from '$lib/map-style/line-paint.js';
import { lineWidthRangeFor } from '$lib/data/tools';
import { linkBikeNetStrategyLabels } from '$lib/data/tool-paths';
import { featuredCities } from '$lib/data/featured-cities';
import { metricPropertyFor } from '$lib/data/metric-properties';
import { SORTBIKENET_RAMP } from '$lib/data/sortbikenet';
import { FIXBIKENET_RAMP } from '$lib/data/fixbikenet';
import { optionLabel } from '$lib/data/control-copy';

// SortBikeNet's hero views: ground truth and two orderings that read well at a glance. `random` is
// the null model, not something to show off, and `from_2026` grows only a third of the plan on top
// of a baseline that already holds the rest.
const HERO_SBN_ORDERINGS = ['real', 'betweenness', 'coverage'];
const HERO_SBN_SCENARIOS = ['from_scratch', 'from_2021'];

// Per-tool config for the ambient hero animation. Only tools listed here enter the rotation.
//
// mode:
//   'buildup'    — reveal features in ascending `ordering` (growbikenet, linkbikenet)
//   'severity'   — reveal features by a synthesized rank on a metric, most-severe first (fixbikenet)
//   'superblock' — reveal hull polygons only by a synthesized density rank, most-dense block first
//                  (superblockify), restricted to the same default size window the tool page opens
//                  on (`defaultSizeRange`) — the edges never reach MapLibre, see `makeSuperblock`
// existing:
//   'file'     — baseline is a separate <city>-existing-network.geojson, fetched where
//                `wantsExistingNetwork` asks for one (growbikenet: `from_bikenw` only)
//   'none'     — no baseline layer at all (superblockify draws hulls only, no street context)
//
// Optional:
//   combos       — which of the tool's datasets the hero may pick; all of them when absent
//   airTime      — 'half' takes the tool's turn on every other pass of the round-robin only
//   scaleFilter  — which features the color ramp's scale is built from (`metricScale`'s `include`)
//   planUnderlay — draw the whole file as a faint outline under the build-up, as the tool page does
//   buildVerb    — the HUD's status-line verb, in place of the mode's own
export const heroTools = {
	growbikenet: {
		mode: 'buildup',
		existing: 'file',
		colors: RAMP_COLORS,
		metricProperty: (c) => c.metric,
		widthRange: (c) => lineWidthRangeFor('growbikenet', c.type),
		label: 'growbikenet',
		metricLabel: (c) => c.metric
	},
	linkbikenet: {
		mode: 'buildup',
		existing: 'file',
		colors: rampColorsFor('lcc_gain'),
		metricProperty: () => 'lcc_gain',
		widthRange: (c) => lineWidthRangeFor('linkbikenet', c.type),
		label: 'linkbikenet',
		metricLabel: (c) => linkBikeNetStrategyLabels[c.metric] ?? c.metric
	},
	fixbikenet: {
		mode: 'severity',
		existing: 'file',
		colors: FIXBIKENET_RAMP,
		metricProperty: () => 'benefit',
		revealDescending: true,
		widthRange: (c) => lineWidthRangeFor('fixbikenet', c.type),
		label: 'fixbikenet',
		metricLabel: () => 'gap severity'
	},
	superblockify: {
		mode: 'superblock',
		existing: 'none', // hull-only rendering has no street layer to draw a baseline under
		colors: null, // unused — color is categorical (classificationColorMatchExpression), not a ramp
		// metricProperty/widthRange are unused too (no edge LineLayer mounts for this mode) but stay
		// defined — every adapter is called unconditionally the same way regardless of mode.
		metricProperty: (c) => metricPropertyFor('superblockify', c.metric, c.type),
		widthRange: (c) => lineWidthRangeFor('superblockify', c.type),
		label: 'superblockify',
		metricLabel: (c) => (c.metric === 'residential' ? 'residential betweenness' : 'betweenness')
	},
	sortbikenet: {
		mode: 'buildup',
		existing: 'file', // one baseline per scenario — see `existingNetworkPathFor`
		colors: SORTBIKENET_RAMP,
		metricProperty: () => 'length_cumulative',
		// The plan's unbuilt segments, and the waves `realFromBaseline` folds into the baseline, carry
		// no `ordering` — the map page keeps them out of the scale the same way.
		scaleFilter: (f) => f.properties?.ordering != null,
		widthRange: () => lineWidthRangeFor('sortbikenet'),
		planUnderlay: true,
		// One city: an equal turn would put Paris on screen every fifth slot.
		airTime: 'half',
		combos: (c) => HERO_SBN_ORDERINGS.includes(c.metric) && HERO_SBN_SCENARIOS.includes(c.type),
		label: 'sortbikenet',
		metricLabel: (c) => optionLabel('sortbikenet', 'metric', c.metric),
		buildVerb: 'sorting the plan'
	}
};

export const heroToolSlugs = Object.keys(heroTools);

export function heroAdapterFor(tool) {
	return heroTools[tool] ?? null;
}

const isFeatured = (combo) => featuredCities(combo.tool, combo.variant).includes(combo.city);

/**
 * The hero's combo pool: every dataset of every hero tool, tagged with its tool, restricted to the
 * tool's own `combos` and its featured cities (featured-cities.ts; for GrowBikeNet, per variant).
 *
 * Falls back per tool: a tool with no featured combos in the current manifest contributes its
 * unfiltered ones rather than dropping out of the rotation.
 *
 * @param {import('$lib/data/datasets').DatasetsByTool} datasets
 */
export function heroCombos(datasets) {
	return heroToolSlugs.flatMap((tool) => {
		const inHero = heroTools[tool].combos ?? (() => true);
		const all = (datasets[tool] ?? []).filter(inHero).map((d) => ({ ...d, tool }));
		const featured = all.filter(isFeatured);
		return featured.length > 0 ? featured : all;
	});
}
