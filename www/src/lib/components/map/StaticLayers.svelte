<script>
	import { untrack } from 'svelte';
	import {
		getMapContext,
		GeoJSONSource,
		LineLayer,
		CircleLayer,
		SymbolLayer
	} from 'svelte-maplibre-gl';
	import { coreColors } from '$lib/colors.js';
	import {
		RAMP_COLORS,
		quantile,
		makeLinePaint,
		withZoomScale,
		ROUND_LINE_LAYOUT
	} from '$lib/map-style/line-paint.js';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { overlayBeforeId } from '$lib/map-style/style.js';
	import { fonts } from '$lib/map-style/theme.js';
	import {
		DEFAULT_CIRCLE_RADIUS_RANGE,
		DEFAULT_LINE_WIDTH_RANGE,
		DOT_LINE_CROSSFADE,
		DOT_MARKER_RADIUS,
		DOT_MARKER_RADIUS_REST,
		DOT_MARKER_RADIUS_TOP,
		DOT_RANK_TEXT_SIZE,
		EXISTING_NETWORK_LINE_WIDTH,
		EXISTING_NETWORK_OPACITY,
		HIGHLIGHT_CIRCLE_RADIUS,
		HIGHLIGHT_LINE_WIDTH,
		HIGHLIGHT_OUTLINE_INSET,
		HIGHLIGHT_WIDTH_FACTOR,
		SELECTION_WIDTH_STEP,
		SELECTION_DOT_RADIUS
	} from '$lib/map-style/render-config.js';
	import MapExistingChip from './MapExistingChip.svelte';
	import MapLegend from './MapLegend.svelte';
	import MapTooltip from './MapTooltip.svelte';
	import { cameraAnchor } from './tooltipAnchor.svelte.js';
	import { mapOverlayPortal } from '../map-shell/mapOverlay.js';

	const portalOverlay = mapOverlayPortal();
	const portalReadouts = mapOverlayPortal('readouts');

	let {
		geojson,
		existingNetwork = undefined,
		metricProperty,
		lineWidthRange = DEFAULT_LINE_WIDTH_RANGE,
		colors = RAMP_COLORS,
		showLegend = true,
		// Splits the metric ramp out of `showLegend`'s readout stack — see BuildupLayers.
		showMetricLegend = true,
		// Source/layer id namespace — unique per tool so incoming and outgoing pages never share ids
		// on the shared map during a client navigation. See BuildupLayers.
		idPrefix = 'static',
		// Presents the metric row as a 1–10 score in the tooltip — see MapTooltip. `metricLabel`
		// renames the row; `scoreRange` + `metricExtent` remap the value (log spread of the extent).
		metricLabel = null,
		scoreRange = null,
		metricExtent = null,
		// Array index of the one feature to force-highlight independently of hover/pin — used by the
		// fixbikenet top-spots tour. Lights the same highlight layer via feature-state.
		highlightId = null,
		// Line networks only: render one dot per segment at overview zoom, crossfading to the segments
		// as the reader zooms in (see DOT_LINE_CROSSFADE). Off for every other tool.
		dotsWhenZoomedOut = false,
		// With `dotsWhenZoomedOut`: how many top-ranked features get a larger overview dot with their
		// rank numbered in it, the rest a smaller one. `rankProperty` is the 0-based rank. 0 = off.
		emphasizeTop = 0,
		rankProperty = 'ordering',
		// Adds a persistent selection on top of the hover highlight: the click-pinned segment (and
		// `highlightId`) is drawn a step thicker over the same ink casing — used by fixbikenet's
		// top-spots tour. Off → a pick reads as a hover, as every other tool does.
		selectable = false,
		// Selection is *controlled* when `selectable` is set: a click on the metric layer reports
		// the feature id here (or null when the reader clicks off the network), and the page decides
		// what is selected by feeding it back as `highlightId`. Keeping one owner is what stops the
		// map highlight and the top-spots table from drifting apart.
		onSelect = undefined
	} = $props();

	const COLORS = $derived(colors);

	const HOVERED = /** @type {import('maplibre-gl').ExpressionSpecification} */ ([
		'boolean',
		['feature-state', 'hover'],
		false
	]);
	const SELECTED = /** @type {import('maplibre-gl').ExpressionSpecification} */ ([
		'boolean',
		['feature-state', 'selected'],
		false
	]);

	const mapCtx = getMapContext();
	const map = $derived(mapCtx.map);

	const SOURCE_ID = $derived(`${idPrefix}-geojson`);
	const METRIC_LINE_LAYER_ID = $derived(`${idPrefix}-metric-line`);
	const METRIC_CIRCLE_LAYER_ID = $derived(`${idPrefix}-metric-circle`);
	const HIGHLIGHT_LAYER_ID = $derived(`${idPrefix}-highlight`);
	const HIGHLIGHT_OUTLINE_LAYER_ID = $derived(`${idPrefix}-highlight-outline`);
	const SELECTION_OUTLINE_LAYER_ID = $derived(`${idPrefix}-selection-outline`);
	const SELECTION_LAYER_ID = $derived(`${idPrefix}-selection`);
	const SELECTION_DOT_LAYER_ID = $derived(`${idPrefix}-selection-dot`);
	const EXISTING_SOURCE_ID = $derived(`${idPrefix}-existing-src`);
	const EXISTING_LAYER_ID = $derived(`${idPrefix}-existing`);
	const DOT_SOURCE_ID = $derived(`${idPrefix}-dots`);
	const DOT_LAYER_ID = $derived(`${idPrefix}-metric-dots`);
	const RANK_LABEL_LAYER_ID = $derived(`${idPrefix}-rank-labels`);

	// Contextual baseline: the existing bike network, drawn beneath the metric layer.
	// Recolors on hover (matching growbikenet) and is rendered thinner than the
	// proposed network so it reads as background context.
	const existingPaint = /** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ ({
		'line-color': ['case', HOVERED, coreColors.existingNetworkHover, coreColors.existingNetwork],
		'line-width': withZoomScale(EXISTING_NETWORK_LINE_WIDTH),
		'line-opacity': EXISTING_NETWORK_OPACITY
	});
	// Anchored on the ground rather than on the cursor's pixel, so the box stays on its feature
	// through a pan or a zoom — `anchor` below turns it back into container pixels.
	/** @type {{ lngLat: import('maplibre-gl').LngLat, properties: Record<string, unknown>, kind: string } | null} */
	let tooltip = $state(null);

	const anchorAt = cameraAnchor(() => map);
	// `null` once the anchored point leaves the map: the feature it describes is off-screen too, so
	// the tooltip hides rather than clamping to an edge that points at nothing.
	const anchor = $derived.by(() => {
		const t = tooltip;
		return t ? anchorAt((m) => m.project(t.lngLat)) : null;
	});

	// Hover/pin track both the source and the feature id so the metric layer and the
	// (separately-sourced) existing-network layer can each be highlighted.
	/** @type {{ source: string, id: number | undefined } | null} */
	let hovered = $state(null);
	/** @type {{ source: string, id: number | undefined } | null} */
	let pinned = $state(null);

	function setFeatureHover(ref, on) {
		if (ref && map) map.setFeatureState({ source: ref.source, id: ref.id }, { hover: on });
	}

	// Both the line source and the dot source (see dotData below) assign the array index as their
	// feature id, so one id lights the segment in either representation.
	function paintSelection(id, on) {
		if (id == null || !map) return;
		for (const src of [SOURCE_ID, DOT_SOURCE_ID]) {
			if (map.getSource(src)) map.setFeatureState({ source: src, id }, { selected: on });
		}
	}

	const geometryKind = $derived.by(() => {
		const f = geojson?.features?.[0];
		if (!f) return null;
		const t = f.geometry?.type;
		if (t === 'Point' || t === 'MultiPoint') return 'point';
		return 'line';
	});

	const scale = $derived(metricScale(geojson, metricProperty));
	const sortedValues = $derived(scale.sortedValues);
	const histogram = $derived(scale.histogram);

	const linePaint = $derived(makeLinePaint(sortedValues, metricProperty, COLORS, lineWidthRange));

	const circlePaint = $derived.by(() => {
		const base = makeLinePaint(sortedValues, metricProperty, COLORS);
		const [minRadius, maxRadius] = DEFAULT_CIRCLE_RADIUS_RANGE;
		const stops = sortedValues.length
			? Array.from({ length: COLORS.length }, (_, i) => {
					const p = i / (COLORS.length - 1);
					return {
						input: quantile(sortedValues, p),
						color: COLORS[i],
						radius: minRadius + p * (maxRadius - minRadius)
					};
				}).filter((s, i, arr) => i === 0 || s.input > arr[i - 1].input)
			: [];
		if (stops.length < 2) {
			return {
				'circle-color': COLORS[COLORS.length - 1],
				'circle-radius': withZoomScale(maxRadius),
				'circle-opacity': 0.9,
				'circle-stroke-width': 0
			};
		}
		return {
			'circle-color': base['line-color'],
			'circle-radius': withZoomScale([
				'interpolate',
				['linear'],
				['get', metricProperty],
				...stops.flatMap((s) => [s.input, s.radius])
			]),
			'circle-opacity': 0.9,
			'circle-stroke-width': 0
		};
	});

	const legend = $derived(scale.legend);

	// A highlighted feature keeps its own ramp color rather than being overwritten with flat ink, so
	// the color expression is lifted straight out of the paint of the layer underneath — the two can
	// never drift. Only the color slot is read; the width range baked into `linePaint` is irrelevant.
	const highlightLineColor = $derived(
		/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<string>} */ (
			linePaint['line-color']
		)
	);
	const highlightCircleColor = $derived(
		/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<string>} */ (
			circlePaint['circle-color']
		)
	);

	// Widths are derived, not constant: keeping the ramp color means the highlight only reads as a
	// highlight if it out-thickens whatever the tool's own ramp draws, and that top width is
	// per-tool. HIGHLIGHT_LINE_WIDTH is the floor for hairline networks.
	const highlightWidth = $derived(
		Math.max(HIGHLIGHT_LINE_WIDTH, lineWidthRange[1] * HIGHLIGHT_WIDTH_FACTOR)
	);
	const selectionWidth = $derived(highlightWidth + SELECTION_WIDTH_STEP);
	const casing = (w) => w + 2 * HIGHLIGHT_OUTLINE_INSET;

	// One dot per line segment, placed at its middle vertex and carrying the segment's properties so
	// the same tooltip/score works at overview zoom. Explicit `id` == the line source's feature-state
	// id (the array index generateId assigns), so a highlight set on the line lights the right dot too.
	const dotData = $derived.by(() => {
		if (!dotsWhenZoomedOut || geometryKind !== 'line' || !geojson) return null;
		const features = geojson.features
			.map((f, idx) => {
				const coords = f.geometry?.coordinates ?? [];
				const mid = coords[Math.floor(coords.length / 2)];
				if (!Array.isArray(mid)) return null;
				return {
					type: 'Feature',
					id: idx,
					geometry: { type: 'Point', coordinates: mid },
					properties: f.properties
				};
			})
			.filter(Boolean);
		return /** @type {GeoJSON.FeatureCollection} */ ({ type: 'FeatureCollection', features });
	});

	// Crossfade the line network out and the dots in across DOT_LINE_CROSSFADE as the reader zooms.
	const [DOT_ZOOM_LO, DOT_ZOOM_HI] = DOT_LINE_CROSSFADE;
	const metricLineOpacity = $derived(
		/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<number>} */ (
			dotsWhenZoomedOut
				? ['interpolate', ['linear'], ['zoom'], DOT_ZOOM_LO, 0, DOT_ZOOM_HI, 1]
				: (linePaint['line-opacity'] ?? 1)
		)
	);
	// One crossfade drives fill, outline and rank numeral together, so all three fade out as one.
	const dotOpacity =
		/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<number>} */ ([
			'interpolate',
			['linear'],
			['zoom'],
			DOT_ZOOM_LO,
			0.9,
			DOT_ZOOM_HI,
			0
		]);
	// A feature without a rank never counts as top: `has` guards the comparison.
	const isTop = $derived(
		/** @type {import('maplibre-gl').ExpressionSpecification} */ ([
			'all',
			['has', rankProperty],
			['<', ['get', rankProperty], emphasizeTop]
		])
	);
	const dotRadius = $derived(
		emphasizeTop > 0
			? ['case', isTop, DOT_MARKER_RADIUS_TOP, DOT_MARKER_RADIUS_REST]
			: DOT_MARKER_RADIUS
	);
	// The selected dot keeps its step over the dot it covers, whatever that dot's size.
	const selectionDotRadius = $derived(
		emphasizeTop > 0
			? ['+', dotRadius, SELECTION_DOT_RADIUS - DOT_MARKER_RADIUS]
			: SELECTION_DOT_RADIUS
	);
	const dotPaint = $derived.by(() => {
		const base = makeLinePaint(sortedValues, metricProperty, COLORS);
		return {
			'circle-color': base['line-color'],
			'circle-radius': withZoomScale(dotRadius),
			'circle-opacity': dotOpacity,
			'circle-stroke-width': 1,
			'circle-stroke-color': coreColors.paperWhite,
			'circle-stroke-opacity': dotOpacity
		};
	});

	// The selected dot's own crossfade: visible while zoomed out, gone once the line takes over.
	// Zoom interpolation must stay outermost — MapLibre rejects `['zoom']` nested inside a `['case']`
	// — so the crossfade wraps the selection test rather than the other way round.
	const selectionDotOpacity =
		/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<number>} */ ([
			'interpolate',
			['linear'],
			['zoom'],
			DOT_ZOOM_LO,
			['case', SELECTED, 1, 0],
			DOT_ZOOM_HI,
			0
		]);

	// Force-highlight the tour's selected feature via feature-state, clearing the previous one. Keyed
	// on `geojson` too so it re-applies once the source has loaded. Shares the `hover` state the
	// pointer uses, so a consumer without `selectable` still gets the hover highlight; `selectable`
	// consumers additionally get the thicker `selected` state via `paintSelection`.
	let externalHighlight = null;
	let externalSelection = null;
	$effect(() => {
		if (!map) return;
		void geojson;
		if (externalHighlight != null && externalHighlight !== highlightId) {
			if (map.getSource(SOURCE_ID)) {
				map.setFeatureState({ source: SOURCE_ID, id: externalHighlight }, { hover: false });
			}
			externalHighlight = null;
		}
		if (highlightId != null && map.getSource(SOURCE_ID)) {
			map.setFeatureState({ source: SOURCE_ID, id: highlightId }, { hover: true });
			externalHighlight = highlightId;
		}
		if (selectable) {
			// A selection made in the panel leaves a tooltip pinned to whatever was clicked before it;
			// unpin so the tooltip never describes a different feature than the one lit up. The pin can
			// come from either the line source or the dot source (same array-index ids — see dotData) so
			// both count as "still describing the selected feature".
			const pin = untrack(() => pinned);
			const pinMatchesSelection =
				pin && (pin.source === SOURCE_ID || pin.source === DOT_SOURCE_ID) && pin.id === highlightId;
			if (pin && !pinMatchesSelection) {
				setFeatureHover(pin, false);
				pinned = null;
				hovered = null;
				tooltip = null;
			}
			if (externalSelection != null && externalSelection !== highlightId) {
				paintSelection(externalSelection, false);
				externalSelection = null;
			}
			if (highlightId != null) {
				paintSelection(highlightId, true);
				externalSelection = highlightId;
			}
		}
	});

	function handleMouseMove(e, source, kind) {
		if (pinned != null) return;
		if (!map || !e.features?.length) return;
		map.getCanvas().style.cursor = 'pointer';
		const feature = e.features[0];
		if (hovered && (hovered.source !== source || hovered.id !== feature.id)) {
			setFeatureHover(hovered, false);
		}
		hovered = { source, id: feature.id };
		setFeatureHover(hovered, true);
		tooltip = { lngLat: e.lngLat, properties: feature.properties, kind };
	}

	function handleMouseLeave() {
		if (pinned != null || !map) return;
		map.getCanvas().style.cursor = '';
		if (hovered) {
			setFeatureHover(hovered, false);
			hovered = null;
		}
		tooltip = null;
	}

	function handleLayerClick(e, source, kind) {
		if (!e.features?.length) return;
		const feature = e.features[0];
		if (hovered && (hovered.source !== source || hovered.id !== feature.id)) {
			setFeatureHover(hovered, false);
		}
		hovered = { source, id: feature.id };
		pinned = { source, id: feature.id };
		setFeatureHover(hovered, true);
		// Only the metric layer/dots carry the array-index ids the selection paints by — a click on the
		// (separately-sourced) existing-network baseline still pins its tooltip but isn't selected.
		if (selectable && kind === 'metric') onSelect?.(feature.id);
		tooltip = { lngLat: e.lngLat, properties: feature.properties, kind };
	}

	function handleMapClick(e) {
		if (!map) return;
		// Nothing pinned and nothing selected → nothing to clear.
		if (pinned == null && highlightId == null) return;
		const layerId = geometryKind === 'point' ? METRIC_CIRCLE_LAYER_ID : METRIC_LINE_LAYER_ID;
		const layers = [
			layerId,
			...(dotData ? [DOT_LAYER_ID] : []),
			...(existingNetwork ? [EXISTING_LAYER_ID] : [])
		].filter((id) => map.getLayer(id));
		const hits = map.queryRenderedFeatures(e.point, { layers });
		if (hits.length > 0) return;
		setFeatureHover(pinned, false);
		pinned = null;
		hovered = null;
		tooltip = null;
		if (selectable) onSelect?.(null);
	}

	// The map-level deselect click and the shared cursor are registered imperatively — see
	// BuildupLayers: the host owns the `<MapLibre>`, so a layer set hands both back on teardown.
	$effect(() => {
		if (!map) return;
		const m = map;
		m.on('click', handleMapClick);
		return () => {
			m.off('click', handleMapClick);
			m.getCanvas().style.cursor = '';
		};
	});
</script>

{#if existingNetwork}
	<GeoJSONSource id={EXISTING_SOURCE_ID} data={existingNetwork} generateId>
		<LineLayer
			id={EXISTING_LAYER_ID}
			layout={ROUND_LINE_LAYOUT}
			beforeId={overlayBeforeId()}
			paint={existingPaint}
			onmousemove={(e) => handleMouseMove(e, EXISTING_SOURCE_ID, 'existing')}
			onmouseleave={handleMouseLeave}
			onclick={(e) => handleLayerClick(e, EXISTING_SOURCE_ID, 'existing')}
		/>
	</GeoJSONSource>
{/if}

{#if geojson}
	<GeoJSONSource id={SOURCE_ID} data={geojson} generateId>
		{#if geometryKind === 'point'}
			<CircleLayer
				id={METRIC_CIRCLE_LAYER_ID}
				layout={{ 'circle-sort-key': ['get', metricProperty] }}
				beforeId={overlayBeforeId()}
				paint={circlePaint}
				onmousemove={(e) => handleMouseMove(e, SOURCE_ID, 'metric')}
				onmouseleave={handleMouseLeave}
				onclick={(e) => handleLayerClick(e, SOURCE_ID, 'metric')}
			/>
			<!-- Hover: the point's own ramp color, enlarged, ringed in ink so pale values still
			     separate from the paper basemap. -->
			<CircleLayer
				id={HIGHLIGHT_LAYER_ID}
				beforeId={overlayBeforeId()}
				paint={{
					'circle-radius': withZoomScale(HIGHLIGHT_CIRCLE_RADIUS),
					'circle-color': highlightCircleColor,
					'circle-opacity': ['case', HOVERED, 1, 0],
					'circle-stroke-width': withZoomScale(HIGHLIGHT_OUTLINE_INSET),
					'circle-stroke-color': coreColors.ink,
					'circle-stroke-opacity': ['case', HOVERED, 1, 0]
				}}
			/>
		{:else}
			<LineLayer
				id={METRIC_LINE_LAYER_ID}
				layout={{ ...ROUND_LINE_LAYOUT, 'line-sort-key': ['get', metricProperty] }}
				beforeId={overlayBeforeId()}
				paint={{ ...linePaint, 'line-opacity': metricLineOpacity }}
				onmousemove={(e) => handleMouseMove(e, SOURCE_ID, 'metric')}
				onmouseleave={handleMouseLeave}
				onclick={(e) => handleLayerClick(e, SOURCE_ID, 'metric')}
			/>
			<!-- Casing first, color core second — MapLibre inserts each layer immediately before
			     `beforeId`, so the later one stacks on top. Both states are drawn the same way; a
			     selection is simply wider, so it still outranks a hover underneath it. -->
			<LineLayer
				id={HIGHLIGHT_OUTLINE_LAYER_ID}
				layout={ROUND_LINE_LAYOUT}
				beforeId={overlayBeforeId()}
				paint={{
					'line-color': coreColors.ink,
					'line-width': withZoomScale(casing(highlightWidth)),
					'line-opacity': ['case', HOVERED, 1, 0]
				}}
			/>
			<LineLayer
				id={HIGHLIGHT_LAYER_ID}
				layout={ROUND_LINE_LAYOUT}
				beforeId={overlayBeforeId()}
				paint={{
					'line-color': highlightLineColor,
					'line-width': withZoomScale(highlightWidth),
					'line-opacity': ['case', HOVERED, 1, 0]
				}}
			/>
			{#if selectable}
				<LineLayer
					id={SELECTION_OUTLINE_LAYER_ID}
					layout={ROUND_LINE_LAYOUT}
					beforeId={overlayBeforeId()}
					paint={{
						'line-color': coreColors.ink,
						'line-width': withZoomScale(casing(selectionWidth)),
						'line-opacity': ['case', SELECTED, 1, 0]
					}}
				/>
				<LineLayer
					id={SELECTION_LAYER_ID}
					layout={ROUND_LINE_LAYOUT}
					beforeId={overlayBeforeId()}
					paint={{
						'line-color': highlightLineColor,
						'line-width': withZoomScale(selectionWidth),
						'line-opacity': ['case', SELECTED, 1, 0]
					}}
				/>
			{/if}
		{/if}
	</GeoJSONSource>
{/if}

{#if dotData}
	<GeoJSONSource id={DOT_SOURCE_ID} data={dotData}>
		<CircleLayer
			id={DOT_LAYER_ID}
			layout={{ 'circle-sort-key': ['get', metricProperty] }}
			beforeId={overlayBeforeId()}
			paint={dotPaint}
			onmousemove={(e) => handleMouseMove(e, DOT_SOURCE_ID, 'metric')}
			onmouseleave={handleMouseLeave}
			onclick={(e) => handleLayerClick(e, DOT_SOURCE_ID, 'metric')}
		/>
		{#if selectable}
			<CircleLayer
				id={SELECTION_DOT_LAYER_ID}
				beforeId={overlayBeforeId()}
				paint={{
					'circle-radius': withZoomScale(selectionDotRadius),
					'circle-color': highlightLineColor,
					'circle-stroke-width': withZoomScale(HIGHLIGHT_OUTLINE_INSET),
					'circle-stroke-color': coreColors.ink,
					'circle-opacity': selectionDotOpacity,
					'circle-stroke-opacity': selectionDotOpacity
				}}
			/>
		{/if}
		{#if emphasizeTop > 0}
			<SymbolLayer
				id={RANK_LABEL_LAYER_ID}
				beforeId={overlayBeforeId()}
				filter={isTop}
				layout={{
					'text-field': ['to-string', ['+', ['get', rankProperty], 1]],
					'text-font': [fonts.bold],
					'text-size': withZoomScale(DOT_RANK_TEXT_SIZE),
					'text-allow-overlap': true,
					'text-ignore-placement': true
				}}
				paint={{
					'text-color': coreColors.paperWhite,
					'text-halo-color': coreColors.ink,
					'text-halo-width': 0.5,
					'text-halo-blur': 0.5,
					'text-opacity': dotOpacity
				}}
			/>
		{/if}
	</GeoJSONSource>
{/if}

<!-- Overlay DOM, portalled to MapHost's shared overlay layer — see BuildupLayers. -->
<div {@attach portalOverlay} class="pointer-events-none absolute inset-0">
	{#if tooltip && anchor}
		<MapTooltip
			{tooltip}
			x={anchor.x}
			y={anchor.y}
			{metricProperty}
			{histogram}
			colors={COLORS}
			{metricLabel}
			{scoreRange}
			{metricExtent}
		/>
	{/if}
</div>

{#if showLegend && (legend || existingNetwork)}
	<div {@attach portalReadouts} class="pointer-events-none flex flex-col gap-2">
		{#if existingNetwork}
			<MapExistingChip color={coreColors.existingNetwork} />
		{/if}
		{#if legend && showMetricLegend}
			<MapLegend {metricProperty} {histogram} {legend} colors={COLORS} />
		{/if}
	</div>
{/if}
