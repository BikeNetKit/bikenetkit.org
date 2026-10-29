<script>
	import { untrack } from 'svelte';
	import { getMapContext, LineLayer, FillLayer } from 'svelte-maplibre-gl';
	import { coreColors } from '$lib/colors.js';
	import {
		computeRampStops,
		quantile,
		RAMP_COLORS,
		withZoomScale,
		ROUND_LINE_LAYOUT
	} from '$lib/map-style/line-paint.js';
	import { overlayBeforeId } from '$lib/map-style/style.js';
	import {
		DEFAULT_LINE_WIDTH_RANGE,
		SUPERBLOCK_BOUNDARY_WIDTH,
		SUPERBLOCK_EDGE_OPACITY,
		SUPERBLOCK_HOVER_WIDTH,
		SUPERBLOCK_HULL_OPACITY
	} from '$lib/map-style/render-config.js';
	import { formatMetric, labelFor } from '$lib/data/metric-meta';
	import {
		blockLabel,
		blockSizeIndex,
		buildSuperblocks,
		categoryOtherColor,
		classificationColorMatchExpression,
		defaultSizeRange,
		densityByClassification,
		isSparseClassification,
		edgeIdsByBlock,
		hiddenBlockSet,
		hiddenWithReveal,
		sizeSelection
	} from '$lib/utils/superblocks';
	import { formatBlockArea } from '$lib/utils/formatters';
	import { animateValue } from '$lib/utils/animation';
	import { claimIntro } from '$lib/utils/intro-animation';
	import { timeThrottled } from '$lib/utils/throttle.svelte.js';
	import MapTooltipRow from './MapTooltipRow.svelte';
	import MapTooltipShell from './MapTooltipShell.svelte';
	import { cameraAnchor } from './tooltipAnchor.svelte.js';
	import SuperblockSizeFilter from './SuperblockSizeFilter.svelte';
	import PlaybackControl from '../PlaybackControl.svelte';
	import { mapOverlayPortal, mapOverlaySize } from '../map-shell/mapOverlay.js';
	import { afterCameraSettles, getCameraFlight } from '../map-shell/cameraFlight.js';
	import { reducedMotion } from '$lib/state/motion.svelte.js';

	const portalOverlay = mapOverlayPortal();
	const portalReadouts = mapOverlayPortal('readouts');
	const portalPlayback = mapOverlayPortal('playback');
	const overlaySize = mapOverlaySize();
	const cameraFlight = getCameraFlight();

	let {
		geojson,
		// superblockify's `ltns` layer: one row of block attributes per superblock. Optional —
		// `buildSuperblocks` aggregates them off the edges when it is absent.
		blockAttributes = null,
		metric = undefined,
		metricProperty,
		lineWidthRange = DEFAULT_LINE_WIDTH_RANGE,
		showLegend = true,
		// The size selection, in log10 km². Bindable so the tool page can render the filter as one
		// of its control panels: the index it reads is derived from a 17 MB source that only this
		// component holds, so the state has to come out rather than the data going in twice.
		sizeRange = $bindable(null),
		// Everything `SuperblockSizeFilter` needs besides the range, pushed out for the same reason.
		onSizeIndex = undefined,
		// The block-level density extent, pushed out so the page can render a legend that matches the
		// ramp — the density map only exists in here (it falls back to the hulls, which only this
		// component builds).
		onDensityIndex = undefined,
		// The tool page renders the size filter as a control panel instead — see the page.
		showSizeFilter = true,
		// Expert toggle: shade streets and hulls by population density (a sequential ramp) instead of
		// by superblock (categorical). Line width still encodes the width metric either way.
		colorByDensity = false,
		// Live tool vs static capture. `MapSuperblocks` (the screenshot wrapper) passes `false`, which
		// skips the density build-up so a capture is deterministic rather than a mid-tween reveal.
		interactive = true,
		// Source/layer id namespace, like the other layer sets. Only superblockify mounts this today,
		// so a default suffices, but keeping it per-tool keeps the shared map collision-safe if a
		// second consumer ever appears.
		idPrefix = 'sb',
		// Identity of the arrival this build-up belongs to — `introKeyFor(tool, city)`. The intro
		// plays once per key; later dataset changes under the same key (a classification switch, or
		// returning to this tool in this city) settle straight at the finished network. Undefined
		// means always play — the capture wrapper passes none.
		introKey = undefined
	} = $props();

	const mapCtx = getMapContext();
	const map = $derived(mapCtx.map);

	const SOURCE_EDGES = $derived(`${idPrefix}-edges`);
	// One source for all three hull layers. They used to have one each, which cost three deep
	// clones, three worker uploads and three tilings of the same polygons, and made every
	// hide/reveal write the same feature state three times. Paint order is decided by layer order,
	// not source order, so the split bought nothing.
	const SOURCE_HULLS = $derived(`${idPrefix}-hulls`);
	const EDGE_LAYER_ID = $derived(`${idPrefix}-edge`);
	const HULL_LAYER_ID = $derived(`${idPrefix}-hull`);

	const blocks = $derived(buildSuperblocks(geojson, blockAttributes));

	// --- Sources -------------------------------------------------------------------------------
	// Both sources are registered through the map context rather than `<GeoJSONSource>`, for two
	// reasons.
	//
	// Cost: `RawSource` passes its spec through `$state.snapshot()`, and Svelte's snapshot
	// deep-clones every plain object and array it is handed. On an 18.9 MB FeatureCollection that
	// was ~740 ms of main-thread time spent building a copy MapLibre then re-serialises into its
	// worker anyway. `mapCtx.addSource` is the same call the wrapper ends up making, minus the
	// snapshot, and still registers the id so a future `setStyle` would carry the source over.
	//
	// Lifetime: a `<GeoJSONSource>` lives and dies with the `{#if}` around it, and its layers are
	// torn down in markup order — so the hull source was being removed while the outline layer
	// still referenced it ("Source sb-hulls cannot be removed while layer sb-hull-outline is using
	// it"), leaving a stale source that the next mount collided with. Registering here gives both
	// sources the component's lifetime instead, and the layers become plain `{#if}`-free children
	// that come and go over a stable source. An empty FeatureCollection renders nothing, so a
	// dataset with no hulls needs no guard.
	//
	// In the component body rather than an `$effect`: `RawLayer` calls `addLayer` during its own
	// initialisation, so an effect would run too late and a layer would be added against a source
	// that does not exist yet. Both paths go through `waitForStyleLoaded`, which preserves order.
	const EMPTY_FC = /** @type {GeoJSON.FeatureCollection} */ ({
		type: 'FeatureCollection',
		features: []
	});

	// `untrack` throughout because these reads are deliberately init-time: the sources are created
	// once, and `idPrefix` is a fixed namespace rather than something that changes under a mounted
	// component. The data is kept current by the effects below.
	let appliedEdgeData = untrack(() => geojson) ?? EMPTY_FC;
	let appliedHullData = untrack(() => blocks.hulls);
	mapCtx.addSource(
		untrack(() => SOURCE_HULLS),
		{ type: 'geojson', data: appliedHullData }
	);
	mapCtx.addSource(
		untrack(() => SOURCE_EDGES),
		{ type: 'geojson', data: appliedEdgeData, generateId: true }
	);

	/** @param {string} id @param {GeoJSON.FeatureCollection} data */
	const setSourceData = (id, data) =>
		/** @type {import('maplibre-gl').GeoJSONSource | undefined} */ (map?.getSource(id))?.setData(
			data
		);

	$effect(() => {
		const data = geojson ?? EMPTY_FC;
		if (data === appliedEdgeData) return;
		appliedEdgeData = data;
		setSourceData(SOURCE_EDGES, data);
	});

	$effect(() => {
		const data = blocks.hulls;
		if (data === appliedHullData) return;
		appliedHullData = data;
		setSourceData(SOURCE_HULLS, data);
	});

	// Safe despite being declared above the layers in the template: a component's own `$effect`
	// cleanups always run after those of the children it renders, so every `removeLayer` has
	// already happened by the time these fire. Removing a source still in use throws.
	$effect(() => () => {
		mapCtx.removeSource(SOURCE_EDGES);
		mapCtx.removeSource(SOURCE_HULLS);
	});

	// The algorithm's own block count. Hull construction can drop a block whose alpha shape does
	// not close, so the hull count would undercount what superblockify actually found.
	const blockCount = $derived(blockAttributes?.features?.length ?? blocks.hulls.features.length);

	const classifications = $derived([...blocks.byClassification.keys()]);

	const colorExpr = $derived(classificationColorMatchExpression(classifications));

	// --- Size filter -------------------------------------------------------------------------
	// Blocks are hidden through feature state, not a layer filter: a filter change makes MapLibre
	// re-parse the source's tiles on the worker and they land one at a time, so a 17 MB city visibly
	// emptied in batches over ~350 ms. Feature state writes paint arrays on the main thread — the
	// whole selection changes in a single frame.
	const sizeIndex = $derived(blockSizeIndex(blocks.hulls, blockAttributes));
	const sizeByClassification = $derived(sizeIndex.sizeByClassification);
	const sizes = $derived(sizeIndex.sizes);
	const extent = $derived(sizeIndex.extent);
	const edgeIds = $derived(edgeIdsByBlock(geojson));
	const hullIdByBlock = $derived(
		new Map(blocks.hulls.features.map((f) => [f.properties.classification, f.id]))
	);

	// `[loLog, hiLog]`, owned here and bound into the legend panel. Re-seeded to the default window
	// whenever the extent changes — i.e. on city/metric navigation — so the handles always sit in
	// the range of the city on screen rather than the previous one's. Captures seed the same window,
	// so a thumbnail shows the map its tool page opens on.
	let seededExtentKey = null;
	$effect(() => {
		if (!extent) return;
		const key = `${extent.min},${extent.max}`;
		if (key === seededExtentKey) return;
		seededExtentKey = key;
		sizeRange = defaultSizeRange(extent);
	});

	/** The selected range back in km², or null while the whole extent is selected. */
	const sizeFilter = $derived(sizeSelection(sizeRange, extent).filter);

	// --- Density build-up animation ----------------------------------------------------------
	// Superblocks are revealed one at a time, most densely populated first. A not-yet-revealed block
	// is folded into `hiddenBlocks` below, so the same feature-state machinery that drives the size
	// filter drives the reveal — no per-frame tile re-parse.
	const densityByClass = $derived(densityByClassification(blocks.hulls, blockAttributes));

	/** Blocks the size filter hides. The base of the hidden set, and excluded from the reveal. */
	const hiddenBySize = $derived(hiddenBlockSet(sizeByClassification, sizeFilter));

	/** Drawable, in-filter blocks, densest first — the reveal order. */
	const revealOrder = $derived.by(() =>
		[...hullIdByBlock.keys()]
			.filter((cls) => !hiddenBySize.has(cls))
			.sort((a, b) => (densityByClass.get(b) ?? 0) - (densityByClass.get(a) ?? 0))
	);

	const PLAYBACK_MS = 12_000;
	const BUILD_MS = 1500;
	// How often the map's feature state is allowed to update during playback/scrubbing — see
	// `timeThrottled` below.
	const THROTTLE_MS = 50;

	// frame 0 = nothing revealed … total - 1 = everything revealed (the scrubber's space).
	const total = $derived(revealOrder.length + 1);
	let frame = $state(0);
	const revealCount = $derived(Math.max(0, Math.min(frame, revealOrder.length)));

	/** The size-hidden blocks plus the ones the playhead has not reached yet. */
	const hiddenBlocks = $derived(hiddenWithReveal(hiddenBySize, revealOrder, revealCount));

	// What the map's feature state actually applies. On a large city, writing `setFeatureState` for
	// every block that crosses the reveal threshold can take longer than the playhead takes to reach
	// the next one (playback, a fast drag, a held arrow key); throttling to one apply every
	// `THROTTLE_MS` coalesces those into the latest selection instead of working through a backlog
	// of stale ones. Hit-testing and the tooltip stay off `hiddenBlocks` directly and remain
	// responsive.
	const throttledHidden = timeThrottled(() => hiddenBlocks, THROTTLE_MS);

	let isPlaying = $state(false);
	let building = $state(false);
	let rafId = null;
	let playStart = 0;
	let playFrom = 0;
	let buildToken = 0;

	function play() {
		if (total < 2) return;
		playFrom = frame >= total - 1 ? 0 : frame;
		frame = playFrom;
		playStart = performance.now();
		isPlaying = true;
		rafId = requestAnimationFrame(tick);
	}

	function pause() {
		isPlaying = false;
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function tick() {
		if (!isPlaying) return;
		const totalFrames = total - 1;
		const frac = playFrom / totalFrames + (performance.now() - playStart) / PLAYBACK_MS;
		if (frac >= 1) {
			frame = totalFrames;
			isPlaying = false;
			rafId = null;
			return;
		}
		frame = Math.round(frac * totalFrames);
		rafId = requestAnimationFrame(tick);
	}

	$effect(() => () => {
		if (rafId) cancelAnimationFrame(rafId);
	});

	// Reset and replay on dataset identity (city/metric navigation), not on the camera or a filter
	// drag: a same-city tool switch leaves the bounds untouched but still has to rebuild.
	let animatedDataset = null;
	$effect(() => {
		const dataset = geojson;
		// Static captures never build up: the `revealKey` effect settles the playhead at full.
		if (!interactive) return;
		if (dataset === animatedDataset) return;
		animatedDataset = dataset;
		pause();
		const token = ++buildToken;
		if (!claimIntro(introKey)) {
			building = false;
			// `total` derives from `revealOrder`, which the size filter also reshapes; read it
			// untracked so the reveal count never becomes a dependency of the dataset effect.
			frame = untrack(() => total - 1);
			return;
		}
		frame = 0;
		building = true;
		const run = () => {
			if (token !== buildToken) return;
			if (reducedMotion.current) {
				frame = total - 1;
				building = false;
				return;
			}
			animateValue({
				from: 0,
				to: total - 1,
				duration: BUILD_MS,
				isCancelled: () => token !== buildToken,
				onUpdate: (v) => (frame = Math.round(v))
			}).then(() => {
				if (token === buildToken) building = false;
			});
		};
		afterCameraSettles(cameraFlight, map, () => {
			if (token !== buildToken) return;
			run();
		});
	});

	// A size-filter change reshapes `revealOrder`; snap a settled playhead to the new full selection
	// so widening the filter never leaves the newly-eligible blocks stuck hidden. Skipped while a
	// build-up or playback is running, so it cannot fight the reveal.
	let revealKey = null;
	$effect(() => {
		const key = revealOrder.length;
		if (key === revealKey) return;
		revealKey = key;
		if (!isPlaying && !building) frame = total - 1;
	});

	// Only the difference is written each time, so dragging a handle one step touches the few blocks
	// that actually crossed it rather than every feature in the city.
	let appliedHidden = hiddenBlockSet(new Map(), null);
	let appliedTo = null;
	$effect(() => {
		// Read every reactive dependency before the guard: an effect only subscribes to what it
		// actually reads on a given run, so bailing out first would unsubscribe from
		// `throttledHidden.current` and the filter would never reach the map again.
		const next = throttledHidden.current;
		const dataset = geojson;
		if (!map || !map.getSource(SOURCE_EDGES) || !map.getSource(SOURCE_HULLS)) return;
		// Feature state is keyed by id and survives `setData`, so a new city would inherit the
		// previous one's hidden ids. Drop everything whenever the dataset changes.
		if (appliedTo !== dataset) {
			if (appliedTo) {
				map.removeFeatureState({ source: SOURCE_EDGES });
				map.removeFeatureState({ source: SOURCE_HULLS });
			}
			appliedTo = dataset;
			appliedHidden = hiddenBlockSet(new Map(), null);
		}
		for (const classification of appliedHidden) {
			if (!next.has(classification)) setBlockHidden(classification, false);
		}
		for (const classification of next) {
			if (!appliedHidden.has(classification)) setBlockHidden(classification, true);
		}
		appliedHidden = next;
	});

	function setBlockHidden(classification, out) {
		if (!map) return;
		const hullId = hullIdByBlock.get(classification);
		if (hullId !== undefined) map.setFeatureState({ source: SOURCE_HULLS, id: hullId }, { out });
		for (const id of edgeIds.get(classification) ?? []) {
			map.setFeatureState({ source: SOURCE_EDGES, id }, { out });
		}
	}

	/** Hidden features still hit-test, so every pointer handler filters its hits through this. */
	function isBlockVisible(classification) {
		return typeof classification === 'string' && !hiddenBlocks.has(classification);
	}

	const visibleCount = $derived(
		sizeFilter
			? sizes.filter((km2) => km2 >= sizeFilter[0] && km2 <= sizeFilter[1]).length
			: blockCount
	);

	// Pushed out rather than re-derived by the parent: the index falls back to the hulls when a
	// city ships no `ltns` layer, and the hulls only exist in here — a page computing its own
	// index off `blockAttributes` would silently disagree with the map about which blocks exist.
	$effect(() => {
		onSizeIndex?.(extent ? { sizes, extent, visibleCount, totalCount: blockCount } : null);
	});

	$effect(() => {
		const values = [...densityByClass.values()].filter((v) => Number.isFinite(v));
		onDensityIndex?.(values.length ? { min: Math.min(...values), max: Math.max(...values) } : null);
	});

	const [minWidth, maxWidth] = $derived(lineWidthRange ?? DEFAULT_LINE_WIDTH_RANGE);

	const sortedMetricValues = $derived.by(() => {
		if (!geojson?.features?.length || !metricProperty) return [];
		return geojson.features
			.map((f) => f.properties?.[metricProperty])
			.filter((v) => typeof v === 'number' && Number.isFinite(v))
			.sort((a, b) => a - b);
	});

	const widthExpr = $derived.by(() => {
		const finite = sortedMetricValues;
		if (finite.length === 0 || !metricProperty) return (minWidth + maxWidth) / 2;
		const stops = Array.from({ length: 4 }, (_, i) => {
			const p = i / 3;
			return { input: quantile(finite, p), width: minWidth + p * (maxWidth - minWidth) };
		}).filter((s, i, arr) => i === 0 || s.input > arr[i - 1].input);
		if (stops.length < 2) return (minWidth + maxWidth) / 2;
		return [
			'interpolate',
			['linear'],
			['get', metricProperty],
			...stops.flatMap((s) => [s.input, s.width])
		];
	});

	// `out` is written per feature by the size filter; the expression itself never changes, so a
	// selection change costs a paint-array update rather than a re-parse of the source.
	const HIDDEN = ['boolean', ['feature-state', 'out'], false];

	const otherColor = $derived(categoryOtherColor());

	// --- Color-by-density mode ---------------------------------------------------------------
	// The ramp's stops always come from block-level density (the `ltns` layer / hulls), so the
	// legend, the hull fill, and the street coloring all agree on the same distribution. Edges keep
	// their own per-cell `population`/`area` (m²) as the interpolate input — density = pop/area·1e6
	// in people/km² — for finer street-by-street texture, just mapped through the shared block ramp.
	const blockDensityStops = $derived(
		computeRampStops(
			[...densityByClass.values()].filter((v) => Number.isFinite(v)).sort((a, b) => a - b),
			RAMP_COLORS
		)
	);
	const densityExpr = [
		'case',
		['>', ['get', 'area'], 0],
		['*', 1e6, ['/', ['get', 'population'], ['get', 'area']]],
		0
	];
	const edgeDensityColor = $derived(
		blockDensityStops.length >= 2
			? [
					'interpolate',
					['linear'],
					densityExpr,
					...blockDensityStops.flatMap((s) => [s.input, s.color])
				]
			: RAMP_COLORS[RAMP_COLORS.length - 1]
	);

	const hullDensityColor = $derived(
		blockDensityStops.length >= 2
			? [
					'interpolate',
					['linear'],
					['get', 'density'],
					...blockDensityStops.flatMap((s) => [s.input, s.color])
				]
			: RAMP_COLORS[RAMP_COLORS.length - 1]
	);

	const edgeColor = $derived(colorByDensity ? edgeDensityColor : colorExpr);
	const hullColor = $derived(colorByDensity ? hullDensityColor : colorExpr);

	// In density mode the categorical fill no longer separates neighbouring blocks, so give every
	// superblock a persistent boundary to keep the structure legible. Off in categorical mode (color
	// already does the separating); hidden blocks (size filter / reveal) keep their outline off too.
	const hullFillPaint = $derived(
		// @ts-expect-error hand-built maplibre expressions; not statically checkable against the spec
		/** @type {import('maplibre-gl').FillLayerSpecification['paint']} */ ({
			'fill-color': hullColor,
			'fill-opacity': ['case', HIDDEN, 0, SUPERBLOCK_HULL_OPACITY]
		})
	);

	const hullBoundaryPaint = $derived(
		// @ts-expect-error hand-built maplibre expression; not statically checkable against the spec
		/** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ ({
			'line-color': hullDensityColor,
			'line-width': SUPERBLOCK_BOUNDARY_WIDTH,
			'line-opacity': ['case', HIDDEN, 0, colorByDensity ? 1 : 0]
		})
	);

	// A filtered-out block loses its color, not its streets: they fall back to the neutral tone
	// SPARSE streets already use, so a narrow range hides superblocks rather than emptying the
	// city. The hull still goes (see the fill layer) — that one *is* the superblock.
	const edgePaint = $derived(
		// @ts-expect-error hand-built maplibre expression; not statically checkable against the spec
		/** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ ({
			'line-color': ['case', HIDDEN, otherColor, edgeColor],
			'line-width': withZoomScale(widthExpr),
			'line-opacity': SUPERBLOCK_EDGE_OPACITY
		})
	);

	/** @type {string | null} */
	let hoveredClass = $state(null);
	/** @type {string | null} */
	let pinnedClass = $state(null);
	const activeClass = $derived(pinnedClass ?? hoveredClass);

	const highlightFilter = $derived(
		/** @type {import('maplibre-gl').FilterSpecification} */ ([
			'==',
			['get', 'classification'],
			activeClass ?? '__none__'
		])
	);

	/** @type {{ classification: string, props: import('$lib/utils/superblocks').BlockProps } | null} */
	let tooltip = $state(null);
	// The pinned hull's ring, reprojected on every camera frame by `projectHullTop`. Deliberately
	// plain rather than `$state`: a concave hull runs to hundreds of coordinate pairs that Svelte's
	// deep proxy would wrap one by one, for a value nothing renders. It is written in the same
	// breath as `tooltip`, which *is* reactive, so the derived below still re-runs.
	/** @type {number[][] | null} */
	let tooltipRing = null;

	const anchorAt = cameraAnchor(() => map);
	// The anchor sits at the top-centre of the hull's *screen* bbox, so it has to be recomputed per
	// frame rather than frozen: a fixed ground point would drift into the block's interior as the
	// hull grows under a zoom.
	const anchor = $derived(tooltip ? anchorAt(projectHullTop) : null);

	/** @param {import('maplibre-gl').Map} m */
	function projectHullTop(m) {
		if (!tooltipRing) return null;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		for (const [lng, lat] of tooltipRing) {
			const p = m.project([lng, lat]);
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
		}
		return { x: (minX + maxX) / 2, y: minY };
	}

	function clearTooltip() {
		tooltip = null;
		tooltipRing = null;
	}

	// A block hidden by the size filter or not yet revealed must not keep its outline and tooltip.
	$effect(() => {
		if (activeClass && hiddenBlocks.has(activeClass)) {
			pinnedClass = null;
			hoveredClass = null;
			clearTooltip();
		}
	});

	function handleHullMove(e) {
		if (pinnedClass != null) return;
		if (!e.features?.length) return;
		const cls = e.features[0].properties?.classification;
		if (isSparseClassification(cls) || !isBlockVisible(cls) || !map) return;
		map.getCanvas().style.cursor = 'pointer';
		hoveredClass = cls;
		setTooltip(cls);
	}

	function handleLeave() {
		if (pinnedClass != null || !map) return;
		map.getCanvas().style.cursor = '';
		hoveredClass = null;
		clearTooltip();
	}

	function handleClick(e) {
		if (!e.features?.length) return;
		const cls = e.features[0].properties?.classification;
		if (isSparseClassification(cls) || !isBlockVisible(cls)) return;
		hoveredClass = cls;
		pinnedClass = cls;
		setTooltip(cls);
	}

	function handleMapClick(e) {
		if (pinnedClass == null || !map) return;
		const hits = map
			.queryRenderedFeatures(e.point, { layers: [HULL_LAYER_ID] })
			.filter((f) => isBlockVisible(f.properties?.classification));
		if (hits.length > 0) return;
		pinnedClass = null;
		hoveredClass = null;
		clearTooltip();
	}

	// See BuildupLayers: the host owns the `<MapLibre>`, so the map-level deselect click and the
	// shared cursor are registered imperatively and handed back on teardown.
	$effect(() => {
		if (!map) return;
		const m = map;
		m.on('click', handleMapClick);
		return () => {
			m.off('click', handleMapClick);
			m.getCanvas().style.cursor = '';
		};
	});

	// Caches the ring so the O(blocks) lookup happens once per pin rather than once per camera
	// frame — Berlin has 1307 of them.
	function setTooltip(cls) {
		const hull = blocks.hulls.features.find((f) => f.properties.classification === cls);
		if (!hull) return;
		tooltipRing = hull.geometry.coordinates[0];
		tooltip = { classification: cls, props: hull.properties };
	}
</script>

<!-- Both sources are registered in the script above, not here — see the note there. Layer order is
     what decides paint order, and `beforeId` inserts each layer immediately before the overlay, so
     these four mount bottom-to-top as: hull fill, streets, superblock boundary, hover outline. -->
<FillLayer
	id={HULL_LAYER_ID}
	source={SOURCE_HULLS}
	beforeId={overlayBeforeId()}
	paint={hullFillPaint}
	onmousemove={handleHullMove}
	onmouseleave={handleLeave}
	onclick={handleClick}
/>

<LineLayer
	id={EDGE_LAYER_ID}
	source={SOURCE_EDGES}
	layout={ROUND_LINE_LAYOUT}
	beforeId={overlayBeforeId()}
	paint={edgePaint}
/>

<!-- Added after the streets, so it paints above them — the whole point is a persistent,
     unbroken boundary between adjacent superblocks. -->
<LineLayer
	id="{HULL_LAYER_ID}-boundary"
	source={SOURCE_HULLS}
	layout={ROUND_LINE_LAYOUT}
	beforeId={overlayBeforeId()}
	paint={hullBoundaryPaint}
/>

<!-- No `beforeId`, so it is appended at the very top of the style: the hover/pinned outline has to
     read above everything, including the boundary. -->
<LineLayer
	id="{HULL_LAYER_ID}-outline"
	source={SOURCE_HULLS}
	layout={ROUND_LINE_LAYOUT}
	filter={highlightFilter}
	paint={{
		'line-color': coreColors.ink,
		'line-width': SUPERBLOCK_HOVER_WIDTH,
		'line-opacity': 1
	}}
/>

<!-- Overlay DOM, portalled to MapHost's shared overlay layer — see BuildupLayers. -->
<div {@attach portalOverlay} class="pointer-events-none absolute inset-0">
	{#if tooltip && anchor}
		<MapTooltipShell
			x={anchor.x}
			y={anchor.y}
			offset={12}
			containerWidth={overlaySize().width}
			containerHeight={overlaySize().height}
		>
			<div class="text-2xs font-semibold tracking-wider text-ink uppercase">
				{blockLabel(metric ?? metricProperty ?? '', tooltip.classification)}
			</div>
			<MapTooltipRow label="Street length" value={formatMetric('length', tooltip.props.lengthM)} />
			<MapTooltipRow label="Street segments" value={tooltip.props.edgeCount} />
			<MapTooltipRow label="Area" value={formatBlockArea(tooltip.props.areaKm2)} />
			{#if tooltip.props.population > 0}
				<MapTooltipRow
					label={labelFor('population')}
					value={formatMetric('population', tooltip.props.population)}
					emphasis
				/>
			{/if}
			{#if tooltip.props.density > 0}
				<MapTooltipRow
					label={labelFor('population_density')}
					value={formatMetric('population_density', tooltip.props.density)}
				/>
			{/if}
		</MapTooltipShell>
	{/if}
</div>

{#if showLegend && extent}
	{#if showSizeFilter && sizeRange}
		<div {@attach portalReadouts} class="pointer-events-none flex w-full flex-col gap-2">
			<SuperblockSizeFilter
				bind:range={sizeRange}
				{sizes}
				{extent}
				{visibleCount}
				totalCount={blockCount}
				width="w-full"
			/>
		</div>
	{/if}

	<!-- Its own rail slot, so the scrubber survives a short map — see BuildupLayers. -->
	<div {@attach portalPlayback} class="pointer-events-none w-full">
		<PlaybackControl
			bind:frame
			bind:isPlaying
			onplay={play}
			onpause={pause}
			onscrub={pause}
			playbackMs={PLAYBACK_MS}
			{total}
		/>
	</div>
{/if}
