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
	import { theme } from '$lib/map-style/theme.js';
	import {
		RAMP_COLORS,
		rampColorsFor,
		makeLinePaint,
		withZoomScale,
		ROUND_LINE_LAYOUT
	} from '$lib/map-style/line-paint.js';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { formatMetric } from '$lib/data/metric-meta';
	import {
		buildupSeries,
		buildupFrames,
		existingNetworkLength,
		stepIndexMap
	} from '$lib/data/buildup-series';
	import { animateValue } from '$lib/utils/animation';
	import { claimIntro } from '$lib/utils/intro-animation';
	import { timeThrottled } from '$lib/utils/throttle.svelte.js';
	import { buildRevealIndex, countAtOrBelow } from '$lib/utils/threshold-reveal.js';
	import { overlayBeforeId } from '$lib/map-style/style.js';
	import {
		DEFAULT_LINE_WIDTH_RANGE,
		EXISTING_NETWORK_LINE_WIDTH,
		EXISTING_NETWORK_OPACITY,
		EXISTING_NETWORK_FRAGMENTED_OPACITY,
		PLAN_UNDERLAY_LINE_WIDTH,
		PLAN_UNDERLAY_OPACITY,
		HIGHLIGHT_LINE_WIDTH,
		SEED_CIRCLE_RADIUS,
		CONTEXT_DOT_RADIUS,
		CONTEXT_ICON_MIN_ZOOM,
		CONTEXT_ICON_SIZE_RANGE
	} from '$lib/map-style/render-config.js';
	import {
		CONTEXT_ICON_KINDS,
		CONTEXT_ICON_PIXEL_RATIO,
		contextIconId,
		renderContextIcon
	} from '$lib/map-style/context-icons.js';
	import PlaybackControl from '../PlaybackControl.svelte';
	import MapExistingChip from './MapExistingChip.svelte';
	import MapHUD from './MapHUD.svelte';
	import MapLegend from './MapLegend.svelte';
	import MapTooltip from './MapTooltip.svelte';
	import MapTooltipShell from './MapTooltipShell.svelte';
	import { seedPointCopy } from '$lib/data/control-copy';
	import { cameraAnchor } from './tooltipAnchor.svelte.js';
	import { mapOverlayPortal, mapOverlaySize } from '../map-shell/mapOverlay.js';
	import { afterCameraSettles, getCameraFlight } from '../map-shell/cameraFlight.js';
	import { reducedMotion } from '$lib/state/motion.svelte.js';

	const portalOverlay = mapOverlayPortal();
	const overlaySize = mapOverlaySize();
	const portalReadouts = mapOverlayPortal('readouts');
	const portalPlayback = mapOverlayPortal('playback');
	const cameraFlight = getCameraFlight();

	let {
		geojson,
		seeds = null,
		showSeeds = true,
		// growbikenet's rail/school focus: the stations or schools themselves, drawn as grey symbols
		// beneath the network. Shown and hidden together with the seeds (`showSeeds`).
		contextPoints = null,
		contextKind = null,
		metricProperty = 'betweenness',
		// Optional separately-sourced baseline. linkbikenet ships it as its own file so the three
		// strategy views can share one download; growbikenet did merge it into `geojson` (as
		// features without `ordering`) until the 2026-09 export split it out the same way, and
		// passes it here for `from_bikenw`. Older growbikenet data still carries the merged form,
		// which keeps working — a baseline with no `ordering` renders as flat context either way.
		existingNetwork = null,
		// Feature property on `existingNetwork` holding the step at which each segment first
		// joined the largest connected component. When set, the baseline recolors with the
		// playhead instead of rendering as flat context.
		lccStepProperty = null,
		// How the baseline is drawn. SortBikeNet passes a heavier, lighter one — see
		// `sortBikeNetLayerProps`.
		existingStyle = {
			width: EXISTING_NETWORK_LINE_WIDTH,
			color: coreColors.existingNetwork,
			hoverColor: coreColors.existingNetworkHover
		},
		// Feature property on `geojson` holding the running share of the network in the
		// largest connected component. When set, a second HUD card tracks it.
		lccShareProperty = null,
		// Feature property on `geojson` holding a running network-quality total after each step
		// (sortbikenet's `total_coverage`). When set, a HUD card tracks it against km built; it
		// stays hidden for a dataset that does not carry the property.
		qualityProperty = null,
		// The quality total before the first step, when the caller knows it. Otherwise the starting
		// frame borrows the first step's value — see `frames`.
		qualityBaseline = null,
		// Draws the whole plan — every feature of `geojson`, built or not — as a faint underlay, so
		// the build-up grows into a visible outline rather than out of nothing.
		planUnderlay = false,
		showLegend = true,
		// Splits the metric ramp out of `showLegend`'s readout stack: the tool pages render it
		// inside the control panel that switches the metric, and turn it off here.
		showMetricLegend = true,
		// Draw the metric distribution as a histogram in the tooltip. Off where a plain marked ramp
		// reads cleaner (linkbikenet), matching its standalone legend.
		showHistogram = true,
		// Line weight and seed size are prop-driven for the same reason they are on the host: an
		// export fits the same bounds into a much larger frame, which lands at a higher zoom.
		lineWidthRange = DEFAULT_LINE_WIDTH_RANGE,
		// The metric ramp, low value to high. sortbikenet runs it dark-to-light so the segments an
		// ordering builds first are the ones that stand out. Unset, the metric picks its own
		// (`rampColorsFor`).
		rampColors = null,
		seedRadius = SEED_CIRCLE_RADIUS,
		// When set, the reveal playhead is driven from outside (frame-by-frame GIF export) and the
		// component's own build-up tween and dataset-change reset are skipped.
		frameOverride = undefined,
		// Source/layer id namespace. Must be unique per tool: growbikenet and linkbikenet both render
		// this component, and on a client navigation Svelte mounts the incoming page's layers before
		// tearing down the outgoing one — same ids on the shared map would collide.
		idPrefix = 'buildup',
		// Presents the tooltip's metric as a plain-language score (growbikenet shows centrality as a
		// 1–10 importance score). Forwarded to MapTooltip; null leaves the raw measurement.
		metricLabel = null,
		metricScoreRange = null,
		// Identity of the arrival this build-up belongs to — `introKeyFor(tool, city)`. The intro
		// plays once per key; later dataset changes under the same key (a metric/type/variant
		// switch, or returning to this tool in this city) settle straight at the finished network.
		// Undefined means always play — the capture wrappers pass none.
		introKey = undefined,
		// How the playhead carries across a dataset change under the same intro key (a mode
		// switch). 'fraction' keeps relative progress. 'length' matches the kilometres already
		// built — growbikenet's modes are alternative growth orders of the same city, so "40 km
		// built" means the same thing in each; linkbikenet's strategies finish at very different
		// totals, so relative progress is the one that transfers.
		carryPlayhead = 'fraction'
	} = $props();

	const mapCtx = getMapContext();
	const map = $derived(mapCtx.map);

	const PLAYBACK_MS = 12_000;
	const BUILD_MS = 1500;
	// How often the map's own paint is allowed to update during playback/scrubbing — see
	// `timeThrottled` below.
	const THROTTLE_MS = 50;

	// See `buildupSeries` and `buildupFrames` for the two index spaces: build steps, and the
	// playhead's frames with the starting condition prepended.
	const ordered = $derived(buildupSeries(geojson, { lccShareProperty, qualityProperty }));
	const frames = $derived(buildupFrames(ordered, qualityBaseline));

	const total = $derived(frames.steps.length);
	let frame = $state(untrack(() => Math.max(0, frames.steps.length - 1)));
	// `frame` stays the scrubber's own state; `activeFrame` is what the layers render.
	const activeFrame = $derived(frameOverride ?? frame);
	// The `ordering` threshold the layers filter at. Clamped because `activeFrame` can exceed
	// the new bounds while a dataset change settles, and while an export drives it externally.
	const currentStep = $derived(
		frames.steps.length
			? frames.steps[Math.max(0, Math.min(activeFrame, frames.steps.length - 1))]
			: null
	);
	// What the map's own layers paint at. On a large city, one paint update (a `setPaintProperty`
	// pass across many features) can itself take longer than an animation frame to process, so
	// this only advances at most once every `THROTTLE_MS` — see `timeThrottled`. The scrubber, HUD
	// cards and tooltip stay off `activeFrame`/`currentStep` directly and remain instantly
	// responsive; only the map paint below reads this. The export path drives `frameOverride`
	// frame-by-frame and needs the exact step it asked for, so it bypasses the throttle entirely.
	const throttledStep = timeThrottled(() => currentStep, THROTTLE_MS);
	const renderStep = $derived(frameOverride != null ? currentStep : throttledStep.current);
	let isPlaying = $state(false);
	let rafId = null;
	let playStart = 0;
	let playFrom = 0;
	let buildToken = 0;

	// Reset and replay on dataset identity, not on the camera: with a shared host a same-city tool
	// switch leaves the bounds — and so the fit — untouched, but the network still has to rebuild.
	let animatedDataset = null;
	$effect(() => {
		const dataset = geojson;
		if (frameOverride != null) return;
		if (dataset === animatedDataset) return;
		const previousDataset = animatedDataset;
		animatedDataset = dataset;

		isPlaying = false;
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}

		const token = ++buildToken;
		if (!total) {
			frame = 0;
			return;
		}
		// Only the first dataset under an intro key builds up. A mode switch inside the same city and
		// tool keeps the reader's place instead: their position carries over (by built length or by
		// relative progress — see `carriedFrame`) so the comparison holds still.
		if (!claimIntro(introKey)) {
			const snapshot = playheadSnapshot;
			frame = snapshot && snapshot.dataset === previousDataset ? carriedFrame(snapshot) : total - 1;
			return;
		}
		// Park the playhead on frame 0: the proposed network is hidden, the existing one stays as
		// context — which is where the build-up starts. Wait out an in-flight camera flight (a city
		// change) so the reveal reads against the settled frame.
		frame = 0;
		afterCameraSettles(cameraFlight, map, () => {
			if (token !== buildToken) return;
			startBuildUp(token);
		});
	});

	// What the playhead reads right now, tagged with the dataset it belongs to. The dataset effect
	// above runs before this one on the flush where `geojson` changes (effects run in creation
	// order), so it still sees the outgoing dataset's position when it reads `playheadSnapshot` —
	// the tag is the guard that makes that explicit rather than load-bearing.
	/** @type {{ dataset: object | null, fraction: number, builtM: number } | null} */
	let playheadSnapshot = null;
	$effect(() => {
		const denom = Math.max(1, total - 1);
		playheadSnapshot = {
			dataset: geojson,
			fraction: frame / denom,
			builtM: (frames.cumulative[seriesIndex] ?? 0) - ordered.baselineM
		};
	});

	/**
	 * The frame in the current dataset that best preserves the reader's position across a mode
	 * switch.
	 * @param {{ fraction: number, builtM: number }} snapshot
	 */
	function carriedFrame(snapshot) {
		const last = Math.max(0, total - 1);
		if (carryPlayhead === 'length') {
			// `frames.cumulative` is monotone, so the first step that reaches the carried length is
			// the nearest one at or past it. Falls through to `last` for a shorter network.
			for (let i = 0; i <= last; i++) {
				if (frames.cumulative[i] - ordered.baselineM >= snapshot.builtM) return i;
			}
			return last;
		}
		return Math.max(0, Math.min(last, Math.round(snapshot.fraction * last)));
	}

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
		const elapsed = performance.now() - playStart;
		const totalFrames = total - 1;
		const fromFrac = playFrom / totalFrames;
		const frac = fromFrac + elapsed / PLAYBACK_MS;
		if (frac >= 1) {
			frame = totalFrames;
			isPlaying = false;
			rafId = null;
			return;
		}
		frame = Math.round(frac * totalFrames);
		rafId = requestAnimationFrame(tick);
	}

	$effect(() => {
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
		};
	});

	// Never changes with the playhead — only whether a feature could ever carry the metric at all.
	const hasOrderingFilter = /** @type {import('maplibre-gl').FilterSpecification} */ ([
		'==',
		['typeof', ['get', 'ordering']],
		'number'
	]);
	// The playhead's reveal condition, and the reason it reads `feature-state` rather than
	// comparing `['get', 'ordering']` to the current step: an expression carrying the step as a
	// literal is a *different expression* every time the playhead moves, so MapLibre has to
	// re-evaluate it for every feature in the source and rebuild the layer's paint buffers. On
	// London (10 346 features) one such update measures ~650 ms to settle — five times longer than
	// the playhead takes to ask for the next one, so they pile up and keep draining long after
	// playback stops. Held constant and driven by feature state instead, only the features that
	// actually crossed the threshold are touched (~25× cheaper for a playback-sized step), and the
	// expression itself is never reassigned. Same trade-off as `HIDDEN` in SuperblockLayers.
	const REVEALED = /** @type {import('maplibre-gl').ExpressionSpecification} */ ([
		'boolean',
		['feature-state', 'revealed'],
		false
	]);
	const existingNetworkFilter = /** @type {import('maplibre-gl').FilterSpecification} */ ([
		'!=',
		['typeof', ['get', 'ordering']],
		'number'
	]);

	// Feature ids ordered by the value the playhead thresholds on, so advancing it reveals a
	// contiguous run and only the crossing features have to be written. Ids are array positions —
	// what `generateId` assigns on both sources below.
	const revealIndex = $derived(buildRevealIndex(geojson?.features ?? [], 'ordering'));
	const connectedIndex = $derived(
		lccStepProperty
			? buildRevealIndex(
					existingNetwork?.features ?? geojson?.features ?? [],
					// The baseline's own step column, e.g. `lcc_step_largest`.
					lccStepProperty
				)
			: { ids: [], values: [] }
	);

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

	// A seed dot's own tooltip: what the seed is, per focus. Separate from `tooltip` because the
	// seeds source carries no feature ids or properties to highlight, and anchored on the dot itself
	// rather than on the pointer.
	/** @type {{ lngLat: [number, number] } | null} */
	let seedTooltip = $state(null);
	const seedText = $derived(seedPointCopy(contextKind ?? ''));
	const seedAnchor = $derived.by(() => {
		const t = seedTooltip;
		return t ? anchorAt((m) => m.project(t.lngLat)) : null;
	});

	/** @param {import('maplibre-gl').MapLayerMouseEvent} e */
	function showSeedTooltip(e) {
		const geometry = e.features?.[0]?.geometry;
		if (pinned != null || !map || geometry?.type !== 'Point') return;
		map.getCanvas().style.cursor = 'pointer';
		const [lng, lat] = geometry.coordinates;
		seedTooltip = { lngLat: [lng, lat] };
	}

	function hideSeedTooltip() {
		if (!map || !seedTooltip) return;
		if (!hovered) map.getCanvas().style.cursor = '';
		seedTooltip = null;
	}

	// Hover/pin track both source and feature id, so the metric layer and a
	// separately-sourced existing network can each be highlighted.
	/** @type {{ source: string, id: number | undefined } | null} */
	let hovered = $state(null);
	/** @type {{ source: string, id: number | undefined } | null} */
	let pinned = $state(null);

	const SOURCE_ID = $derived(`${idPrefix}-geojson`);
	const EXISTING_SOURCE_ID = $derived(`${idPrefix}-existing-src`);
	const METRIC_LAYER_ID = $derived(`${idPrefix}-metric`);
	const EXISTING_LAYER_ID = $derived(`${idPrefix}-existing`);
	// The no-baseline fallback draws the same role off `geojson`'s unordered features, under its own
	// id: a variant switch mounts the separate-source branch before it tears this one down, and with a
	// shared id MapLibre refused the incoming layer and the outgoing teardown then removed it.
	const INLINE_EXISTING_LAYER_ID = $derived(`${idPrefix}-existing-inline`);
	const existingLayerId = $derived(existingNetwork ? EXISTING_LAYER_ID : INLINE_EXISTING_LAYER_ID);
	const HIGHLIGHT_LAYER_ID = $derived(`${idPrefix}-highlight`);
	const PLAN_LAYER_ID = $derived(`${idPrefix}-plan`);
	const SEEDS_SOURCE_ID = $derived(`${idPrefix}-seeds`);
	// Named so `lowestOwnLayerId` finds the seed layer by its `${idPrefix}-` prefix.
	const SEEDS_LAYER_ID = $derived(`${idPrefix}-seeds-dots`);
	const CONTEXT_SOURCE_ID = $derived(`${idPrefix}-context`);
	const CONTEXT_LAYER_ID = $derived(`${idPrefix}-context-symbols`);
	const CONTEXT_DOTS_LAYER_ID = $derived(`${idPrefix}-context-dots`);
	const contextIconMinZoom = $derived(CONTEXT_ICON_MIN_ZOOM[contextKind ?? ''] ?? 14);

	// Read once, when the symbol layer mounts — the style's layer list is not reactive.
	const lowestOwnLayerId = () =>
		map
			?.getStyle()
			?.layers.find(
				(l) =>
					l.id !== CONTEXT_LAYER_ID &&
					l.id !== CONTEXT_DOTS_LAYER_ID &&
					l.id.startsWith(`${idPrefix}-`)
			)?.id ?? overlayBeforeId();

	// Read when the layer mounts. On a first load the build-up isn't on the map yet and
	// `overlayBeforeId()` stacks correctly; on a remount (from scratch → from existing) it is, and the
	// baseline has to slot in beneath it rather than over the network grown on top of it.
	const existingBeforeId = () =>
		map?.getLayer(METRIC_LAYER_ID) ? METRIC_LAYER_ID : overlayBeforeId();

	// Every kind's icon is registered once, up front, so a focus switch only changes the layer's
	// `icon-image`. Not svelte-maplibre-gl's <Image>: on an id change it removes the old image and
	// then calls `updateImage` on the new, never-added id, so a direct school → rail switch drew
	// nothing.
	let contextIconsReady = $state(false);
	$effect(() => {
		if (!map) return;
		mapCtx.waitForStyleLoaded((m) => {
			for (const kind of CONTEXT_ICON_KINDS) {
				const id = contextIconId(kind);
				const image = m.hasImage(id) ? null : renderContextIcon(kind);
				if (image) m.addImage(id, image, { pixelRatio: CONTEXT_ICON_PIXEL_RATIO });
			}
			contextIconsReady = true;
		});
	});

	// Bumped when a source the reveal needs isn't on the map yet, to re-run the appliers below once
	// the style has finished loading (svelte-maplibre-gl defers `addSource` until then).
	let sourceRetry = $state(0);

	/**
	 * Writes one feature-state flag as a *diff*: only the features between the last applied playhead
	 * position and the new one are touched, so a playback-sized step costs a few hundred writes
	 * instead of a re-evaluation across the whole city. State is keyed by id and survives `setData`,
	 * so it is dropped wholesale whenever the dataset changes.
	 * @param {string} stateKey
	 */
	function createRevealApplier(stateKey) {
		let appliedCount = 0;
		/** @type {unknown} */
		let appliedDataset = null;
		/**
		 * @param {string} sourceId
		 * @param {{ ids: number[], values: number[] }} index
		 * @param {number | null} threshold
		 * @param {unknown} dataset
		 */
		return (sourceId, index, threshold, dataset) => {
			if (!map) return;
			const m = map;
			if (!m.getSource(sourceId)) {
				m.once('styledata', () => sourceRetry++);
				return;
			}
			if (appliedDataset !== dataset) {
				if (appliedDataset) m.removeFeatureState({ source: sourceId });
				appliedDataset = dataset;
				appliedCount = 0;
			}
			const target = countAtOrBelow(index.values, threshold);
			if (target === appliedCount) return;
			const rising = target > appliedCount;
			const from = rising ? appliedCount : target;
			const to = rising ? target : appliedCount;
			for (let i = from; i < to; i++) {
				m.setFeatureState({ source: sourceId, id: index.ids[i] }, { [stateKey]: rising });
			}
			appliedCount = target;
		};
	}

	const applyRevealed = createRevealApplier('revealed');
	const applyConnected = createRevealApplier('connected');

	$effect(() => {
		// Every dependency is read before any guard inside the applier — an effect only subscribes
		// to what it actually reads on a given run.
		const args = /** @type {const} */ ([SOURCE_ID, revealIndex, renderStep, geojson]);
		void sourceRetry;
		applyRevealed(...args);
	});

	$effect(() => {
		const source = existingNetwork ? EXISTING_SOURCE_ID : SOURCE_ID;
		const args = /** @type {const} */ ([
			source,
			connectedIndex,
			renderStep,
			existingNetwork ?? geojson
		]);
		void sourceRetry;
		if (!lccStepProperty) return;
		applyConnected(...args);
	});

	function setFeatureHover(ref, on) {
		if (ref && map) map.setFeatureState({ source: ref.source, id: ref.id }, { hover: on });
	}

	function sameRef(a, b) {
		return a && b && a.source === b.source && a.id === b.id;
	}

	// The metric layer no longer excludes not-yet-revealed features via `filter` (see
	// `hasOrderingFilter`/`REVEALED`), so they still hit-test even at `line-opacity: 0`. Every
	// pointer handler below filters its hits through this — mirrors `isBlockVisible` in
	// SuperblockLayers, same trade-off.
	function isRevealed(properties) {
		const value = properties?.ordering;
		return typeof value === 'number' && renderStep !== null && value <= renderStep;
	}

	function moveHover(e, source, kind) {
		if (pinned != null) return;
		if (!map || !e.features?.length) return;
		const feature = e.features[0];
		if (kind === 'metric' && !isRevealed(feature.properties)) {
			handleMouseLeave();
			return;
		}
		map.getCanvas().style.cursor = 'pointer';

		const ref = { source, id: feature.id };
		if (!sameRef(hovered, ref)) setFeatureHover(hovered, false);
		hovered = ref;
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

	function pinClick(e, source, kind) {
		if (!e.features?.length) return;
		const feature = e.features[0];
		if (kind === 'metric' && !isRevealed(feature.properties)) return;
		const ref = { source, id: feature.id };
		if (!sameRef(hovered, ref)) setFeatureHover(hovered, false);
		hovered = ref;
		pinned = ref;
		setFeatureHover(hovered, true);
		tooltip = { lngLat: e.lngLat, properties: feature.properties, kind };
	}

	function handleMapClick(e) {
		// A tap on a seed opens its tooltip (touch has no hover); a tap anywhere else closes it.
		if (seedTooltip && map?.getLayer(SEEDS_LAYER_ID)) {
			const onSeed = map.queryRenderedFeatures(e.point, { layers: [SEEDS_LAYER_ID] }).length > 0;
			if (!onSeed) seedTooltip = null;
		}
		if (pinned == null || !map) return;
		const layers = [METRIC_LAYER_ID, EXISTING_LAYER_ID, INLINE_EXISTING_LAYER_ID].filter((id) =>
			map.getLayer(id)
		);
		const hits = layers.length
			? map
					.queryRenderedFeatures(e.point, { layers })
					.filter((f) => f.layer.id !== METRIC_LAYER_ID || isRevealed(f.properties))
			: [];
		if (hits.length > 0) return;
		setFeatureHover(pinned, false);
		pinned = null;
		hovered = null;
		tooltip = null;
	}

	// The map-level deselect click and the shared cursor are registered imperatively: the host owns
	// the `<MapLibre>`, so a layer set reaches its interactions through the shared instance and
	// hands them back on teardown — the next tool must not inherit a pinned selection or a pointer.
	$effect(() => {
		if (!map) return;
		const m = map;
		m.on('click', handleMapClick);
		return () => {
			m.off('click', handleMapClick);
			m.getCanvas().style.cursor = '';
		};
	});

	// Only the features the playhead builds carry the metric — the existing-network baseline is
	// context, and folding it in would skew every quantile the ramp is cut at.
	const scale = $derived(
		metricScale(geojson, metricProperty, (f) => f.properties?.ordering != null)
	);
	const sortedValues = $derived(scale.sortedValues);
	const histogram = $derived(scale.histogram);
	const metricRamp = $derived(rampColors ?? rampColorsFor(metricProperty));

	const sortKey = $derived(
		/** @type {import('maplibre-gl').ExpressionSpecification} */ (['get', metricProperty])
	);

	// `line-opacity` overrides `makeLinePaint`'s constant 1 with the playhead's reveal — see
	// `REVEALED`. Nothing here moves with the playhead, so MapLibre is never handed a new
	// expression mid-playback; only the feature state underneath it changes.
	const linePaint = $derived(
		/** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ ({
			...makeLinePaint(sortedValues, metricProperty, metricRamp, lineWidthRange),
			'line-opacity': ['case', REVEALED, 1, 0],
			'line-opacity-transition': { duration: 0 }
		})
	);

	const highlightPaint = /** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ ({
		'line-color': coreColors.ink,
		'line-width': withZoomScale(HIGHLIGHT_LINE_WIDTH),
		'line-opacity': [
			'case',
			['all', ['boolean', ['feature-state', 'hover'], false], REVEALED],
			1,
			0
		],
		'line-opacity-transition': { duration: 0 }
	});

	// Segments carrying no step value never join the largest component, so they stay fragmented for
	// the whole run. `-1` marks segments connected before anything is built. Driven by feature
	// state for the same reason as `REVEALED` — the threshold moves with the playhead.
	const CONNECTED = /** @type {import('maplibre-gl').ExpressionSpecification} */ ([
		'boolean',
		['feature-state', 'connected'],
		false
	]);

	const existingPaint = $derived(
		/** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ (
			lccStepProperty
				? {
						'line-color': [
							'case',
							['boolean', ['feature-state', 'hover'], false],
							existingStyle.hoverColor,
							CONNECTED,
							coreColors.existingNetworkConnected,
							existingStyle.color
						],
						'line-width': withZoomScale(existingStyle.width),
						'line-opacity': ['case', CONNECTED, 1, EXISTING_NETWORK_FRAGMENTED_OPACITY],
						'line-color-transition': { duration: 0 },
						'line-opacity-transition': { duration: 0 }
					}
				: {
						'line-color': [
							'case',
							['boolean', ['feature-state', 'hover'], false],
							existingStyle.hoverColor,
							existingStyle.color
						],
						'line-width': withZoomScale(existingStyle.width),
						'line-opacity': EXISTING_NETWORK_OPACITY
					}
		)
	);

	const planPaint = /** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ ({
		'line-color': coreColors.ink,
		'line-width': withZoomScale(PLAN_UNDERLAY_LINE_WIDTH),
		'line-opacity': PLAN_UNDERLAY_OPACITY
	});

	const CHART_W = 100;
	const CHART_H = 24;

	// Evenly spaced points — for a series whose x *is* the step index.
	const toPts = (values, max) => {
		const denom = Math.max(1, values.length - 1);
		return values
			.map((v, i) => `${(i / denom) * CHART_W},${CHART_H - (max ? v / max : 0) * CHART_H}`)
			.join(' ');
	};

	// Explicit x — for a series plotted against a cost axis rather than a step axis.
	const toPtsXY = (xs, ys, xMax, yMax) =>
		xs
			.map(
				(x, i) =>
					`${(xMax ? x / xMax : 0) * CHART_W},${CHART_H - (yMax ? ys[i] / yMax : 0) * CHART_H}`
			)
			.join(' ');

	const existingLengthM = $derived(
		existingNetworkLength(geojson, existingNetwork, ordered.baselineM)
	);

	// Plotted as existing + newly built, so the curve grows out of the baseline band rather
	// than starting mid-height (growbikenet) or ignoring the baseline entirely (linkbikenet).
	const cumulativeSeries = $derived.by(() => {
		if (!frames.cumulative.length) return null;
		const values = frames.cumulative.map((v) => existingLengthM + (v - ordered.baselineM));
		const max = values[values.length - 1];
		return { values, max, pts: toPts(values, max), basePct: max ? existingLengthM / max : 0 };
	});

	// Clamped like `currentStep`, so a transiently out-of-range playhead reads the last step
	// rather than dropping the HUD card to zero.
	const seriesIndex = $derived(Math.max(0, Math.min(activeFrame, frames.steps.length - 1)));

	const currentCumulative = $derived(
		cumulativeSeries ? (cumulativeSeries.values[seriesIndex] ?? 0) : 0
	);

	// Fixed 0–100% y-axis rather than data max: the share is a fraction of the whole network,
	// and it is not monotone — adding a link that does not merge into the largest component
	// grows the denominator and dips the curve.
	//
	// x is kilometres built, not the step index. `largest` adds few, very long links first, so on
	// a step axis it looks like the strategy that connects the network fastest — while in fact it
	// buys the least connectivity per kilometre and needs the most kilometres to finish (258 km
	// against 168 km in Budapest). The axis has to carry the cost, or the chart says the opposite
	// of what the data does.
	const lccSeries = $derived.by(() => {
		if (!lccShareProperty) return null;
		const values = frames.lccShare;
		if (!values.length) return null;
		const builtM = frames.cumulative.map((v) => v - ordered.baselineM);
		const xMaxM = builtM[builtM.length - 1] || 1;
		return { values, max: 1, xValues: builtM, xMaxM, pts: toPtsXY(builtM, values, xMaxM, 1) };
	});

	// The playhead's x on the length axis — nonlinear against the step-indexed scrubber by
	// design: it races through a run of cheap short links and crawls across an expensive one.
	const lccMarkerPct = $derived(
		lccSeries ? (lccSeries.xValues[seriesIndex] ?? 0) / lccSeries.xMaxM : 0
	);

	const currentLccShare = $derived(lccSeries ? (lccSeries.values[seriesIndex] ?? 0) : 0);

	// Against km built, like `lccSeries`, so switching ordering compares the same spend.
	const qualitySeries = $derived.by(() => {
		const quality = frames.quality;
		if (!qualityProperty || !quality.length || quality.some((v) => typeof v !== 'number')) {
			return null;
		}
		const values = /** @type {number[]} */ (quality);
		const builtM = frames.cumulative.map((v) => v - ordered.baselineM);
		const xMaxM = builtM[builtM.length - 1] || 1;
		const max = Math.max(...values);
		return {
			values,
			max,
			xValues: builtM,
			xMaxM,
			basePct: max ? values[0] / max : 0,
			pts: toPtsXY(builtM, values, xMaxM, max)
		};
	});

	const qualityMarkerPct = $derived(
		qualitySeries ? (qualitySeries.xValues[seriesIndex] ?? 0) / qualitySeries.xMaxM : 0
	);

	const currentQuality = $derived(qualitySeries ? (qualitySeries.values[seriesIndex] ?? 0) : 0);

	// The tooltip's denominator: newly built only, so its ratio reads in the same space as the
	// "878 + 100 km" numerator above it.
	const totalNewLengthM = $derived(
		cumulativeSeries ? cumulativeSeries.max - existingLengthM : null
	);
	// Build steps, not features: this is the tooltip's denominator and its numerator is a step
	// index, so it has to be the same space the scrubber counts in.
	const totalOrderedCount = $derived(ordered.steps.length);
	const stepIndexByOrdering = $derived(stepIndexMap(ordered));

	const hasExistingNetwork = $derived(existingLengthM > 0);

	const legend = $derived(scale.legend);

	function startBuildUp(token) {
		if (token !== buildToken) return;
		if (!total) return;
		const lastFrame = Math.max(0, total - 1);
		if (reducedMotion.current) {
			frame = lastFrame;
			return;
		}
		animateValue({
			from: 0,
			to: lastFrame,
			duration: BUILD_MS,
			isCancelled: () => token !== buildToken,
			onUpdate: (v) => (frame = Math.round(v))
		});
	}
</script>

<!-- The bottom-most of this component's layers: the stations and schools are orientation, so the
     network and the seed dots draw over them. First in the template so an initial mount lands
     beneath everything mounted after it; a later remount (grid → school) is inserted beneath the
     layers already on the map. -->
{#if contextPoints && contextKind && contextIconsReady && showSeeds}
	<GeoJSONSource id={CONTEXT_SOURCE_ID} data={contextPoints}>
		<!-- Below the icon threshold each place is a small grey dot, so the set stays visible at the
		     overview without the undecluttered icons turning into a texture. -->
		<CircleLayer
			id={CONTEXT_DOTS_LAYER_ID}
			beforeId={lowestOwnLayerId()}
			maxzoom={contextIconMinZoom}
			paint={{
				'circle-radius': withZoomScale(CONTEXT_DOT_RADIUS),
				'circle-color': theme.address_label
			}}
		/>
		<SymbolLayer
			id={CONTEXT_LAYER_ID}
			beforeId={lowestOwnLayerId()}
			minzoom={contextIconMinZoom}
			layout={{
				'icon-image': contextIconId(contextKind),
				'icon-size':
					/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<number>} */ ([
						'interpolate',
						['linear'],
						['zoom'],
						contextIconMinZoom,
						CONTEXT_ICON_SIZE_RANGE[0],
						contextIconMinZoom + 3,
						CONTEXT_ICON_SIZE_RANGE[1]
					]),
				'icon-allow-overlap': true,
				'icon-ignore-placement': true
			}}
		/>
	</GeoJSONSource>
{/if}

{#if existingNetwork}
	<GeoJSONSource id={EXISTING_SOURCE_ID} data={existingNetwork} generateId>
		<LineLayer
			id={EXISTING_LAYER_ID}
			layout={ROUND_LINE_LAYOUT}
			beforeId={existingBeforeId()}
			paint={existingPaint}
			onmousemove={(e) => moveHover(e, EXISTING_SOURCE_ID, 'existing')}
			onmouseleave={handleMouseLeave}
			onclick={(e) => pinClick(e, EXISTING_SOURCE_ID, 'existing')}
		/>
	</GeoJSONSource>
{/if}

{#if geojson}
	<GeoJSONSource id={SOURCE_ID} data={geojson} generateId>
		{#if !existingNetwork}
			<LineLayer
				id={INLINE_EXISTING_LAYER_ID}
				layout={ROUND_LINE_LAYOUT}
				beforeId={existingBeforeId()}
				filter={existingNetworkFilter}
				paint={existingPaint}
				onmousemove={(e) => moveHover(e, SOURCE_ID, 'existing')}
				onmouseleave={handleMouseLeave}
				onclick={(e) => pinClick(e, SOURCE_ID, 'existing')}
			/>
		{/if}
		{#if planUnderlay}
			<!-- Below the baseline: the existing network and the build-up both draw over the plan. After
			     the inline baseline in the template, so the layer it slots under is already there. -->
			<LineLayer
				id={PLAN_LAYER_ID}
				layout={ROUND_LINE_LAYOUT}
				beforeId={existingLayerId}
				paint={planPaint}
			/>
		{/if}
		<LineLayer
			id={METRIC_LAYER_ID}
			layout={{ ...ROUND_LINE_LAYOUT, 'line-sort-key': sortKey }}
			paint={linePaint}
			filter={hasOrderingFilter}
			beforeId={overlayBeforeId()}
			onmousemove={(e) => moveHover(e, SOURCE_ID, 'metric')}
			onmouseleave={handleMouseLeave}
			onclick={(e) => pinClick(e, SOURCE_ID, 'metric')}
		/>
		<LineLayer
			id={HIGHLIGHT_LAYER_ID}
			layout={ROUND_LINE_LAYOUT}
			beforeId={overlayBeforeId()}
			filter={hasOrderingFilter}
			paint={highlightPaint}
		/>
	</GeoJSONSource>
{/if}

{#if seeds && showSeeds}
	<GeoJSONSource id={SEEDS_SOURCE_ID} data={seeds}>
		<CircleLayer
			id={SEEDS_LAYER_ID}
			beforeId={overlayBeforeId()}
			onmousemove={showSeedTooltip}
			onmouseleave={hideSeedTooltip}
			onclick={showSeedTooltip}
			paint={{
				'circle-radius': withZoomScale(seedRadius),
				'circle-color': coreColors.ink,
				'circle-stroke-color': coreColors.paperWhite,
				'circle-opacity': 1,
				'circle-stroke-width': withZoomScale(seedRadius / 3)
			}}
		/>
	</GeoJSONSource>
{/if}

<!-- Overlay DOM, portalled to MapHost's shared overlay layer (a sibling of the map) so it inherits
     the app font instead of `.maplibregl-map`'s. The MapLibre sources/layers above stay put. The
     tooltip goes to the overlay itself — it positions against the map — while the readouts and the
     playback bar go to slots of the host's left rail, which owns their place in the column. -->
<div {@attach portalOverlay} class="pointer-events-none absolute inset-0">
	{#if seedTooltip && seedAnchor && seedText && seeds && showSeeds}
		<MapTooltipShell
			x={seedAnchor.x}
			y={seedAnchor.y}
			offset={10}
			containerWidth={overlaySize().width}
			containerHeight={overlaySize().height}
		>
			<div class="text-2xs font-semibold tracking-wider text-ink uppercase">Seed point</div>
			<p class="text-xs text-ink">{seedText}</p>
		</MapTooltipShell>
	{:else if tooltip && anchor}
		<MapTooltip
			{tooltip}
			x={anchor.x}
			y={anchor.y}
			{metricProperty}
			{histogram}
			colors={metricRamp}
			{totalNewLengthM}
			{totalOrderedCount}
			{stepIndexByOrdering}
			{lccStepProperty}
			{existingLengthM}
			cumulativeBaselineM={ordered.baselineM}
			{metricLabel}
			scoreRange={metricScoreRange}
			metricExtent={legend}
			{showHistogram}
		/>
	{/if}
</div>

{#if showLegend}
	<!-- The map's own readout column — the existing-network chip, the HUD cards and the metric
		     ramp — in the rail's `readouts` slot, directly above the playback bar below. A fixed
		     `w-72` with `w-full` cards keeps every panel the same width as the control panels. -->
	<div {@attach portalReadouts} class="pointer-events-none flex w-full flex-col gap-2">
		{#if hasExistingNetwork}
			<MapExistingChip
				width="w-full"
				color={existingStyle.color}
				connectedColor={lccStepProperty ? coreColors.existingNetworkConnected : null}
			/>
		{/if}
		{#if lccSeries}
			<MapHUD
				width="w-full"
				metricId={lccShareProperty}
				series={lccSeries}
				currentValue={currentLccShare}
				frame={activeFrame}
				{total}
				chartW={CHART_W}
				chartH={CHART_H}
				fillColor={coreColors.existingNetworkConnected}
				valueColor={coreColors.existingNetworkConnected}
				baseValue={ordered.baselineShare}
				basePct={ordered.baselineShare}
				baseColor={coreColors.existingNetwork}
				markerPct={lccMarkerPct}
				axisLabels={['0 km', `${formatMetric('length_cumulative', lccSeries.xMaxM)} built`]}
			/>
		{/if}
		{#if qualitySeries}
			<MapHUD
				width="w-full"
				metricId={qualityProperty}
				series={qualitySeries}
				currentValue={currentQuality}
				frame={activeFrame}
				{total}
				chartW={CHART_W}
				chartH={CHART_H}
				fillColor={RAMP_COLORS[3]}
				baseValue={qualitySeries.values[0]}
				basePct={qualitySeries.basePct}
				baseColor={existingStyle.color}
				markerPct={qualityMarkerPct}
				axisLabels={['0 km', `${formatMetric('length_cumulative', qualitySeries.xMaxM)} built`]}
			/>
		{/if}
		{#if cumulativeSeries}
			<MapHUD
				width="w-full"
				series={cumulativeSeries}
				currentValue={currentCumulative}
				frame={activeFrame}
				{total}
				chartW={CHART_W}
				chartH={CHART_H}
				fillColor={RAMP_COLORS[2]}
				baseValue={existingLengthM}
				basePct={cumulativeSeries.basePct}
				baseColor={existingStyle.color}
				axisLabels={['step 0', `step ${Math.max(0, total - 1)}`]}
			/>
		{/if}
		{#if legend && showMetricLegend}
			<MapLegend width="w-full" {metricProperty} {histogram} {legend} colors={metricRamp} />
		{/if}
	</div>

	<!-- Its own rail slot rather than the last card of the column above: the slot never shrinks,
		     so the scrubber stays reachable however short the map gets. -->
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
