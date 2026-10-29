// Shared map-rendering constants. Tool-specific overrides (e.g. per-tool
// line-width ranges) live on the tool catalog — see
// `lineWidthRangeFor()` in `$lib/data/tools.ts`.

/** Default min/max line width in pixels (at zoom 12). */
export const DEFAULT_LINE_WIDTH_RANGE = [0.5, 3];

/** Allowed zoom range for the interactive map. */
export const MIN_ZOOM = 9;
export const MAX_ZOOM = 17;

/** Padding factor for the map's maxBounds pan/zoom-out envelope (×dataset span).
 *  Relaxed so the full dataset frames on any screen aspect ratio. */
export const MAX_BOUNDS_PAD = 1.0;

// Zoom-driven line-width scaling: thinner at overview, slightly larger at
// city zoom, much thicker at street level. Consumed by `withZoomScale()`.
// Format: [zoom, multiplier].
export const ZOOM_SCALE_STOPS = [
	[10, 0.66],
	[12, 1.0],
	[MAX_ZOOM, 3.5]
];

// First zoom at which each tier of city-quarter label appears. Protomaps' own `min_zoom` hint is
// 11 for every macrohood and 13 for every neighbourhood — both far too early for a map that opens
// framed on one city at z≈12, where a single tile carries ~76 subplace labels. Tiers are keyed off
// `population_rank`, the only real importance signal the `places` layer ships for subplaces: city
// districts score 8–9, every small named quarter scores 1.
export const SUBPLACE_ZOOM = {
	/** Boroughs and city districts — Centrum, Zuid, Oost. */
	district: 12,
	/** Named quarters — Jordaan, De Pijp, Zuidas. */
	quarter: 13,
	/** Small named neighbourhoods — Kattenburg, Wittenburg. */
	neighbourhood: 14
};

/** Motorway shields (A10, S116, N246) — badges, and the noisiest thing on a city-scale view. */
export const ROAD_SHIELD_MIN_ZOOM = 14;

/** Major road names (Ringweg-West, Gaasperdammerweg). Minor road names stay at 15. */
export const ROAD_LABEL_MIN_ZOOM = 12;

/** Bin count for legend histograms. */
export const HISTOGRAM_BIN_COUNT = 30;

/** Default options for `map.fitBounds()` calls. */
export const FIT_BOUNDS_OPTIONS = { padding: 40, speed: 2 };

/** Pixel ratio used when exporting the map to PNG — fixed so output is screen-independent. */
export const EXPORT_PIXEL_RATIO = 3;

/** Breathing-room margin around the city bounding box in the "full network" PNG export,
 *  as a fraction of the smaller bbox dimension. */
export const EXPORT_NETWORK_MARGIN = 0.03;

/** fitBounds padding for the interactive tool view, where the left panel column
 *  (`MapPanelStack`: left-4 + w-72 ≈ 304px) floats over the map. Reserves that gutter
 *  (plus breathing room) so the city centers in the visible area right of the panels.
 *  MapHost clamps this to the container on narrow viewports. */
export const PANEL_FIT_PADDING = { top: 40, right: 40, bottom: 40, left: 320 };

/** fitBounds padding on a compact viewport, where the panels have moved into the bottom sheet:
 *  no left gutter, but the playback dock and the sheet handle occupy the bottom edge. */
export const COMPACT_FIT_PADDING = { top: 24, right: 24, bottom: 120, left: 24 };

/** The map's left rail splits in two — control panels stay left, the readouts and the playbar move
 *  to the right edge — when the map is wide enough to spare the room and too short to stack both in
 *  one column. A wide *and tall* map keeps the single left column, so the familiar layout only gives
 *  way where it was actually cramped. Both are container measurements, never content ones, so the
 *  split cannot feed back into what it measures. */
export const RAIL_SPLIT_MIN_WIDTH = 900;
export const RAIL_SPLIT_MAX_HEIGHT = 760;

/** Floor for the derived highlight width below, and the flat-ink hover width in BuildupLayers. */
export const HIGHLIGHT_LINE_WIDTH = 4;

/** A highlight keeps the feature's own ramp color, so it has to read as thicker than the segment
 *  under it — and base widths differ per tool (fixbikenet tops out at 4px, superblockify edges at
 *  2). Scale off the tool's own widest line rather than a single constant. */
export const HIGHLIGHT_WIDTH_FACTOR = 1.6;

/** Extra width a selection carries over a hover, so a pinned pick still outranks a passing one. */
export const SELECTION_WIDTH_STEP = 1.5;

/** Visible ink outline per side (px at zoom 12); the casing layer is core + 2 × this. */
export const HIGHLIGHT_OUTLINE_INSET = 2;

/** Line width used for the existing-network baseline layer (≈65% of the former 2px,
 *  so it reads as background context beneath the proposed network). */
export const EXISTING_NETWORK_LINE_WIDTH = 1.305;

/** Opacity of the existing-network baseline. LinkBikeNet draws it fragmented at the lower value
 *  until a segment joins the largest connected component, then at full strength. */
export const EXISTING_NETWORK_OPACITY = 0.9;
export const EXISTING_NETWORK_FRAGMENTED_OPACITY = 0.55;

/** SortBikeNet's plan underlay. Kept at the baseline's earlier, fainter weight: it outlines the
 *  whole plan, and a heavier line would compete with the build-up drawn over it. */
export const PLAN_UNDERLAY_LINE_WIDTH = 0.87;

/** Opacity of the plan underlay — ink, so it only hints at the outline. */
export const PLAN_UNDERLAY_OPACITY = 0.15;

/** SuperBlockify: the translucent block fill, its street edges, the per-block outline drawn in
 *  density mode, and the ink outline of a hovered or pinned block (not zoom-scaled). */
export const SUPERBLOCK_HULL_OPACITY = 0.15;
export const SUPERBLOCK_EDGE_OPACITY = 0.85;
export const SUPERBLOCK_BOUNDARY_WIDTH = 1.75;
export const SUPERBLOCK_HOVER_WIDTH = 2;

/** City boundary: a faint brand wash over everything outside the city, and a thin brand outline.
 *  Neither is zoom-scaled. */
export const BOUNDARY_MASK_OPACITY = 0.05;
export const BOUNDARY_LINE_WIDTH = 1;
export const BOUNDARY_LINE_OPACITY = 0.5;

/** Default min/max circle radius in pixels (at zoom 12) for point-geometry datasets. */
export const DEFAULT_CIRCLE_RADIUS_RANGE = [0.5, 3];

/** Circle radius used for hover/highlight overlays. */
export const HIGHLIGHT_CIRCLE_RADIUS = 6;

/** Circle radius used for seed-point overlays. @type {number} */
export const SEED_CIRCLE_RADIUS = 2.5;

/** First zoom at which growbikenet's rail/school places are drawn as icons rather than dots. The
 *  icons are not decluttered, so below this a city's schools would be a texture; stations are
 *  sparse enough to show one step earlier. @type {Record<string, number>} */
export const CONTEXT_ICON_MIN_ZOOM = { rail: 13, school: 14 };

/** `icon-size` at the icon threshold and three zoom levels past it. */
export const CONTEXT_ICON_SIZE_RANGE = [0.85, 1.1];

/** Radius (px, at zoom 12) of the grey dots that stand in for the icons below their threshold. */
export const CONTEXT_DOT_RADIUS = 1.5;

/** Zoom band over which a line network crossfades to per-segment dot markers when
 *  `dotsWhenZoomedOut` is on: below the first zoom → dots only; above the second → lines only.
 *  City-dependent — tune so the overview clearly reads as dots and a selected spot as its segment. */
export const DOT_LINE_CROSSFADE = [13, 15];

/** Radius (px, at zoom 12) of the overview dot markers — sized to read larger than the hairline
 *  segments they stand in for. */
export const DOT_MARKER_RADIUS = 4.5;

/** Radius (px, at zoom 12) of a selected segment's overview dot — mirrors DOT_MARKER_RADIUS's role. */
export const SELECTION_DOT_RADIUS = 6;

/** Overview dot radii (px, at zoom 12) when a layer emphasizes its top-ranked features
 *  (`emphasizeTop`): the ranked few a step larger than DOT_MARKER_RADIUS, the rest a step smaller. */
export const DOT_MARKER_RADIUS_TOP = 6;
export const DOT_MARKER_RADIUS_REST = 3.5;

/** Text size (px, at zoom 12) of the rank numeral centered in an emphasized overview dot. */
export const DOT_RANK_TEXT_SIZE = 9;
