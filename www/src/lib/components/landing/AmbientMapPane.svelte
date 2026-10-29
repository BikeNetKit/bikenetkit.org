<script>
	import { onMount } from 'svelte';
	import { featureCollection } from '@turf/helpers';
	import { MapLibre, GeoJSONSource, LineLayer, FillLayer } from 'svelte-maplibre-gl';
	import { mapStyle } from '$lib/map-style/style.js';
	import { coreColors } from '$lib/colors.js';
	import {
		RAMP_COLORS,
		makeLinePaint,
		withZoomScale,
		ROUND_LINE_LAYOUT
	} from '$lib/map-style/line-paint.js';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import {
		EXISTING_NETWORK_LINE_WIDTH,
		EXISTING_NETWORK_OPACITY,
		PLAN_UNDERLAY_OPACITY
	} from '$lib/map-style/render-config.js';
	import { cityBySlug } from '$lib/data/cities';
	import {
		geojsonPathFor,
		existingNetworkPathFor,
		superblockBlocksPathFor
	} from '$lib/data/tool-paths';
	import { wantsExistingNetwork } from '$lib/data/dataset-layers';
	import { heroAdapterFor } from './hero-tools.js';
	import { realFromBaseline } from '$lib/data/sortbikenet';
	import { animateValue } from '$lib/utils/animation';
	import { waitForSourcesLoaded } from '$lib/utils/map-ready';
	import {
		blockSizeIndex,
		buildSuperblocks,
		classificationColorMatchExpression,
		defaultSizeRange,
		densityByClassification,
		hiddenBlockSet,
		sizeSelection
	} from '$lib/utils/superblocks';

	let {
		paneState = $bindable(),
		reducedMotion = false,
		paused = false,
		pageVisible = true,
		onMapReady
	} = $props();

	const PITCH = 50;
	const BUILD_MS = 3000;
	const ORBIT_SPEED = 3;
	const ZOOM_PUSH = 0.4;
	const ORBIT_MS = 3000;
	const ZOOM_SPEED = ZOOM_PUSH / ((BUILD_MS + ORBIT_MS) / 1000);
	// Ceiling on the creep above the city's fitted zoom; the last `ZOOM_EASE_RANGE` decelerates
	// into it rather than stopping dead. A normal cycle swaps before reaching the ease.
	const MAX_ZOOM_CREEP = 1.5;
	const ZOOM_EASE_RANGE = 0.5;
	// A hidden tab pauses rAF, so the first frame back would otherwise apply the whole absence.
	const MAX_FRAME_DT = 0.1;

	const ambientStyle = /** @type {import('maplibre-gl').StyleSpecification} */ ({
		...mapStyle,
		layers: mapStyle.layers.filter((l) => l.type !== 'symbol')
	});

	let map = $state();

	let orbitRaf;
	let cancelled = false;
	let playToken = 0;

	const adapter = $derived(heroAdapterFor(paneState.current?.combo?.tool));
	const mode = $derived(paneState.current?.mode ?? 'buildup');
	const metricProp = $derived(paneState.current?.metricProp ?? 'betweenness');
	const colors = $derived(paneState.current?.colors ?? RAMP_COLORS);

	const sortedValues = $derived(
		metricScale(paneState.current?.geojson, metricProp, adapter?.scaleFilter).sortedValues
	);

	const widthRange = $derived(
		adapter && paneState.current ? adapter.widthRange(paneState.current.combo) : undefined
	);

	// `paneState.frame` is an index into `steps`, not an `ordering` value — resolve it to the real
	// threshold the layer filters at. `-1` is the pre-build state, where nothing is drawn yet.
	const HIDE_ALL_FILTER = /** @type {import('maplibre-gl').FilterSpecification} */ ([
		'==',
		['literal', false],
		true
	]);

	const currentStep = $derived.by(() => {
		const steps = paneState.current?.steps;
		if (!steps?.length || paneState.frame < 0) return null;
		return steps[Math.min(paneState.frame, steps.length - 1)];
	});

	// The feature property the reveal filters on: `ordering` for build-up tools, a synthesized
	// `__revealRank` for the severity reveal (fixbikenet) and the superblock reveal (superblockify),
	// neither of which ship a native `ordering`.
	const revealProp = $derived(
		mode === 'severity' || mode === 'superblock' ? '__revealRank' : 'ordering'
	);

	const orderingFilter = $derived(
		currentStep === null
			? HIDE_ALL_FILTER
			: /** @type {import('maplibre-gl').FilterSpecification} */ ([
					'all',
					['==', ['typeof', ['get', revealProp]], 'number'],
					['<=', ['get', revealProp], currentStep]
				])
	);

	const isSuperblock = $derived(mode === 'superblock');

	const EXISTING_LAYER_ID = 'ambient-existing-line';

	const existingPaint = {
		'line-color': coreColors.existingNetwork,
		'line-width': withZoomScale(EXISTING_NETWORK_LINE_WIDTH),
		'line-opacity': EXISTING_NETWORK_OPACITY
	};

	const linePaint = $derived(makeLinePaint(sortedValues, metricProp, colors, widthRange));

	// The whole plan, unbuilt segments included, as the faint outline the build-up draws over — the
	// color and opacity of `planPaint` in BuildupLayers.svelte, at the baseline's heavier width.
	const planPaint = {
		'line-color': coreColors.ink,
		'line-width': withZoomScale(EXISTING_NETWORK_LINE_WIDTH),
		'line-opacity': PLAN_UNDERLAY_OPACITY
	};

	// Classifications present in the current combo's hulls, for the categorical color expression.
	// superblockify's edge files run up to 18.5 MB / 48k+ features per city — measured at up to
	// several seconds for MapLibre to tile under the hero's two-pane contention, well past both
	// paint-timeout budgets, which left a worker backlog that made the *next* 2-3 combos (on either
	// pane) render blank until it cleared. The hull polygons are a couple of orders of magnitude
	// smaller (hundreds of features, ~150ms to tile even for Berlin) and are all the ambient reveal
	// needs — so the hero never hands the raw edges to MapLibre at all (see `makeSuperblock`).
	const classifications = $derived.by(() => {
		if (!isSuperblock || !paneState.current?.hulls) return [];
		const found = paneState.current.hulls.features
			.map((f) => f.properties?.classification)
			.filter((c) => typeof c === 'string');
		return [...new Set(found)];
	});
	const categoricalColor = $derived(
		isSuperblock ? classificationColorMatchExpression(classifications) : undefined
	);

	// The hull fill is the only superblockify layer (no street-level lines — see above), so it reads
	// at a higher opacity than the subtle tint a line-based tool's context layer would use.
	const hullFillPaint = $derived(
		isSuperblock
			? /** @type {import('maplibre-gl').FillLayerSpecification['paint']} */ ({
					'fill-color': categoricalColor,
					'fill-opacity': 0.55
				})
			: undefined
	);

	const hullBoundaryPaint = $derived(
		isSuperblock
			? /** @type {import('maplibre-gl').LineLayerSpecification['paint']} */ ({
					'line-color': categoricalColor,
					'line-width': withZoomScale(1),
					'line-opacity': 0.9
				})
			: undefined
	);

	/** An optional context layer: a missing or malformed file degrades to null, never fails the combo. */
	async function fetchOptional(url) {
		try {
			const res = await fetch(url);
			return res.ok ? await res.json() : null;
		} catch {
			return null;
		}
	}

	// No coercion: `update-data` already writes these as numbers, and `Number(null)` is 0, which
	// would turn a feature with no `ordering` into build step 0.
	async function fetchCombo(combo) {
		const cfg = heroAdapterFor(combo.tool);
		if (!cfg) return null;
		try {
			// superblockify's `ltns` layer goes out alongside the edges rather than after them: it is
			// 40–590 KB against an edges file of up to 18 MB, so it is already in hand by the time the
			// hulls are built and costs the pane no extra wait.
			const [res, blockAttributes] = await Promise.all([
				fetch(geojsonPathFor(combo.tool, combo)),
				cfg.mode === 'superblock'
					? fetchOptional(superblockBlocksPathFor(combo.city, combo.metric))
					: null
			]);
			if (!res.ok) return null;
			const raw = await res.json();
			if (!raw?.features?.length) return null;

			// Every tool but superblockify ships the existing-network baseline as its own file
			// (sortbikenet one per scenario, hence the `type`; growbikenet only for `from_bikenw`, the
			// same gate the map page uses); a missing one degrades to no baseline rather than failing
			// the whole combo.
			const existingNetwork =
				cfg.existing === 'file' && wantsExistingNetwork(combo.tool, combo.variant)
					? await fetchOptional(existingNetworkPathFor(combo.tool, combo.city, combo.type))
					: null;

			// The as-built sequence covers the whole plan; fold the waves the scenario's baseline
			// already contains back into it, as `fetchDatasetLayers` does for the map page.
			const geojson =
				combo.tool === 'sortbikenet' && combo.metric === 'real'
					? realFromBaseline(raw, existingNetwork)
					: raw;

			return { combo, geojson, existingNetwork, blocks: blockAttributes };
		} catch {
			return null;
		}
	}

	// Build-up tools (growbikenet, linkbikenet): reveal features in ascending `ordering`. `ordering`
	// is 0-based but sparse (growbikenet leaves gaps), so `steps` maps index → the real value the
	// layer filters at, and `cumulativeLengths` is filled at that same index so the build-up and the
	// HUD readout cannot drift apart. `length_cumulative` is rebased onto the existing network.
	function makeBuildup(loaded) {
		const sortedByOrdering = loaded.geojson.features
			.filter((f) => typeof f.properties?.ordering === 'number')
			.sort((a, b) => a.properties.ordering - b.properties.ordering);
		const baselineLength = (loaded.existingNetwork?.features ?? []).reduce(
			(sum, f) => sum + (f.properties?.length ?? 0),
			0
		);
		const steps = [];
		const cumulativeLengths = [];
		for (const f of sortedByOrdering) {
			const v = f.properties.ordering;
			if (steps.length === 0 || steps[steps.length - 1] !== v) steps.push(v);
			cumulativeLengths[steps.length - 1] = baselineLength + (f.properties.length_cumulative ?? 0);
		}
		return { steps, cumulativeLengths, baselineLength };
	}

	// Severity tools (fixbikenet): no `ordering` ships, so synthesize a reveal rank by sorting the
	// features on their metric (most-severe first) and writing it back onto each feature. The reveal
	// filter then reads `__revealRank` exactly as the build-up path reads `ordering`. fixbikenet's gap
	// features carry only `path` + `benefit` (no `length`), so there is no cumulative-length series —
	// the HUD's LENGTH row is length-gated and simply doesn't render for this mode.
	function makeSeverity(loaded, cfg) {
		const m = cfg.metricProperty(loaded.combo);
		const ranked = loaded.geojson.features
			.filter((f) => Number.isFinite(f.properties?.[m]))
			.sort((a, b) =>
				cfg.revealDescending ? b.properties[m] - a.properties[m] : a.properties[m] - b.properties[m]
			);
		ranked.forEach((f, i) => {
			f.properties.__revealRank = i;
		});
		const steps = ranked.map((_, i) => i);
		return { steps, cumulativeLengths: [], baselineLength: 0 };
	}

	// Superblockify ships no `ordering`. Build hulls off the fetched edges and synthesize a reveal
	// rank by block density, most-populated first — the same order SuperblockLayers reveals in.
	//
	// The `ltns` layer is fetched alongside the edges rather than skipped, because both halves of
	// that order have to agree with the tool page: it carries the export's own block areas, which
	// the size window below filters on, and its own `population_density`, which ranks the reveal.
	// Aggregating either off the edges instead double-counts cells shared between two edges — a
	// median of exactly 2.00× the real area on copenhagen_dk, which would turn the 40 000 m² – 4 km²
	// window into an effective 0.02 – 2 km² one.
	//
	// The fetched edges are used only to compute the hulls — they are never handed to MapLibre as a
	// source. A city's superblockify edges file runs up to 18.5 MB / 48k+ features (Berlin); tiling
	// that under the hero's two-pane contention took several seconds in practice, which blew both
	// paint-timeout budgets and left a worker backlog that made the *next* 2-3 combos render blank
	// until it cleared (`geojson: null` below suppresses the `ambient-source` layer for this mode —
	// see `AmbientMapPane`'s template). The hulls alone are two orders of magnitude smaller and are
	// everything the ambient reveal needs.
	function makeSuperblock(loaded) {
		const blockAttributes = loaded.blocks;
		const blocks = buildSuperblocks(loaded.geojson, blockAttributes);
		const densityByClass = densityByClassification(blocks.hulls, blockAttributes);

		// The same default window the tool page opens on (`SuperblockLayers`): 40 000 m² – 4 km²,
		// clamped into the city's own extent. Without it the hero shows every partition superblockify
		// found, city-sized outliers included (copenhagen tops out at 101 km²), which blanket the map
		// and hide the block structure the reveal exists to show.
		const { sizeByClassification, extent } = blockSizeIndex(blocks.hulls, blockAttributes);
		const sizeFilter = extent ? sizeSelection(defaultSizeRange(extent), extent).filter : null;
		const hiddenBySize = hiddenBlockSet(sizeByClassification, sizeFilter);

		// Reveal off the hulls rather than `byClassification`, matching `SuperblockLayers`: a block
		// whose alpha shape does not close has no hull, and the hero draws nothing else — ranking it
		// would spend a build step on nothing and overstate the HUD's superblock count.
		// `buildSuperblocks` already drops SPARSE, so no separate guard is needed. The filtered
		// collection shares its feature objects with `blocks.hulls`, which never leaves this function —
		// so writing `__revealRank` in place below cannot leak a half-ranked hull to another caller.
		const hulls = featureCollection(
			blocks.hulls.features.filter((f) => !hiddenBySize.has(f.properties.classification))
		);
		const revealOrder = hulls.features
			.map((f) => f.properties.classification)
			.sort((a, b) => (densityByClass.get(b) ?? 0) - (densityByClass.get(a) ?? 0));
		const rankByClass = new Map(revealOrder.map((cls, i) => [cls, i]));

		for (const f of hulls.features) {
			f.properties.__revealRank = rankByClass.get(f.properties.classification);
		}

		return {
			steps: revealOrder.map((_, i) => i),
			cumulativeLengths: [],
			baselineLength: 0,
			hulls,
			geojson: null
		};
	}

	function makeCurrent(loaded) {
		const cfg = heroAdapterFor(loaded.combo.tool);
		const built =
			cfg.mode === 'severity'
				? makeSeverity(loaded, cfg)
				: cfg.mode === 'superblock'
					? makeSuperblock(loaded)
					: makeBuildup(loaded);
		return {
			combo: loaded.combo,
			mode: cfg.mode,
			metricProp: cfg.metricProperty(loaded.combo),
			colors: cfg.colors,
			geojson: built.geojson !== undefined ? built.geojson : loaded.geojson,
			existingNetwork: loaded.existingNetwork ?? null,
			hulls: built.hulls ?? null,
			steps: built.steps,
			cumulativeLengths: built.cumulativeLengths,
			baselineLength: built.baselineLength,
			total: built.steps.length,
			startBearing: Math.random() * 360
		};
	}

	function computeCameraFor(combo, startBearing) {
		if (!map) return null;
		const cityBounds = cityBySlug[combo.city]?.bounds;
		if (!cityBounds) return null;
		const cam = map.cameraForBounds(cityBounds, {
			pitch: reducedMotion ? 0 : PITCH,
			bearing: reducedMotion ? 0 : startBearing,
			padding: 40
		});
		if (!cam) return null;
		const c = cam.center;
		return {
			center: Array.isArray(c) ? c : [c.lng, c.lat],
			zoom: cam.zoom,
			bearing: cam.bearing ?? startBearing,
			pitch: reducedMotion ? 0 : PITCH
		};
	}

	export async function prepareCombo(
		combo,
		{ paintTimeoutMs = 6000, holdCameraDuringEntry = true } = {}
	) {
		const token = ++playToken;
		if (!combo) return null;
		const loaded = await fetchCombo(combo);
		if (cancelled || token !== playToken) return null;
		if (!loaded) return null;

		// A dataset with no ordered features has nothing to build — skip it so the caller retries.
		const next = makeCurrent(loaded);
		if (next.total === 0) return null;
		const cam = computeCameraFor(next.combo, next.startBearing);
		if (!cam) return null;

		paneState.current = next;
		paneState.frame = -1;
		paneState.bearing = cam.bearing;
		paneState.zoom = cam.zoom;
		paneState.baseZoom = cam.zoom;
		paneState.center = cam.center;
		// Cold start (the very first pane) holds the camera still until painted, so the reveal opens
		// on a calm frame. A swap's incoming pane is prepared behind the still-visible outgoing one —
		// freezing it here would kill the continuous orbit the cross-fade relies on to read as fluid,
		// so it goes straight to 'build' and keeps spinning through the paint wait, invisibly, before
		// the caller reveals it.
		paneState.phase = holdCameraDuringEntry ? 'enter' : 'build';

		map.jumpTo({ ...cam, zoom: cam.zoom + (paneState.zoomPullOffset ?? 0) });

		// Hold here — not on a clock — until the *dataset* layer(s) are in, deliberately not the
		// basemap: pmtiles can take seconds over a slow connection, and the network drawing is the
		// point of this hero, not the streets under it. The basemap keeps loading regardless and
		// fades into view under the lines as its own tiles arrive.
		const cfg = heroAdapterFor(next.combo.tool);
		// superblockify never mounts `ambient-source` (see `makeSuperblock`) — waiting on it here
		// would just burn the whole timeout every time, since it would never appear.
		const sourceIds = cfg?.mode === 'superblock' ? ['ambient-hulls'] : ['ambient-source'];
		if (cfg?.existing === 'file' && next.existingNetwork) sourceIds.push('ambient-existing');
		await waitForSourcesLoaded(map, sourceIds, {
			timeoutMs: paintTimeoutMs,
			isCancelled: () => cancelled || token !== playToken
		});
		if (cancelled || token !== playToken) return null;

		return { token, next };
	}

	export async function runBuild(prepared) {
		if (!prepared) return null;
		const { token, next } = prepared;
		if (cancelled || token !== playToken) return null;
		paneState.phase = 'build';
		if (reducedMotion) {
			paneState.frame = next.total - 1;
		} else {
			await animateValue({
				from: 0,
				to: next.total - 1,
				duration: BUILD_MS,
				isCancelled: () => cancelled || token !== playToken,
				onUpdate: (v) => {
					paneState.frame = Math.round(v);
				}
			});
		}
		if (cancelled || token !== playToken) return null;
		paneState.phase = 'orbit';
		return next;
	}

	function orbitLoop() {
		let last = performance.now();
		function tick(now) {
			const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
			last = now;
			const active = paneState.phase !== 'idle';
			const spinning = paneState.phase === 'build' || paneState.phase === 'orbit';
			if (active && !reducedMotion && !paused && pageVisible && map) {
				// Bearing/zoom creep only run once the build clock is live — a pane holding in
				// 'enter' shouldn't keep requesting fresh tiles from a moving camera. But the
				// cross-fade's push/pull `zoomPullOffset` swoop is a separate, externally driven
				// animation that must keep tracking here regardless of phase — otherwise it finishes
				// invisibly while the pane is held in 'enter', and the camera snaps to its resting
				// zoom the instant `spinning` turns true.
				if (spinning) {
					paneState.bearing = (paneState.bearing + ORBIT_SPEED * dt) % 360;
					const headroom = paneState.baseZoom + MAX_ZOOM_CREEP - paneState.zoom;
					paneState.zoom += ZOOM_SPEED * Math.min(1, Math.max(0, headroom) / ZOOM_EASE_RANGE) * dt;
					map.setBearing(paneState.bearing);
				}
				map.setZoom(paneState.zoom + (paneState.zoomPullOffset ?? 0));
			}
			orbitRaf = requestAnimationFrame(tick);
		}
		orbitRaf = requestAnimationFrame(tick);
	}

	onMount(() => {
		orbitLoop();
		return () => {
			cancelled = true;
			if (orbitRaf) cancelAnimationFrame(orbitRaf);
		};
	});
</script>

<MapLibre
	class="h-full w-full"
	autoloadGlobalCss={false}
	style={ambientStyle}
	center={[0, 51]}
	zoom={5}
	pitch={reducedMotion ? 0 : PITCH}
	bearing={0}
	attributionControl={false}
	interactive={false}
	bind:map
	onload={() => onMapReady?.()}
>
	{#if isSuperblock && paneState.current?.hulls}
		<GeoJSONSource id="ambient-hulls" data={paneState.current.hulls}>
			<FillLayer paint={hullFillPaint} filter={orderingFilter} />
			<LineLayer layout={ROUND_LINE_LAYOUT} paint={hullBoundaryPaint} filter={orderingFilter} />
		</GeoJSONSource>
	{/if}
	{#if paneState.current?.existingNetwork}
		<GeoJSONSource id="ambient-existing" data={paneState.current.existingNetwork}>
			<LineLayer id={EXISTING_LAYER_ID} layout={ROUND_LINE_LAYOUT} paint={existingPaint} />
		</GeoJSONSource>
	{/if}
	{#if paneState.current?.geojson}
		<GeoJSONSource id="ambient-source" data={paneState.current.geojson}>
			{#if adapter?.planUnderlay}
				<!-- Below the baseline, which is declared first; `beforeId` only while it exists, since
				     a missing baseline file leaves no layer to sit under. -->
				<LineLayer
					layout={ROUND_LINE_LAYOUT}
					beforeId={paneState.current.existingNetwork ? EXISTING_LAYER_ID : undefined}
					paint={planPaint}
				/>
			{/if}
			<LineLayer
				layout={{ ...ROUND_LINE_LAYOUT, 'line-sort-key': ['get', metricProp] }}
				paint={linePaint}
				filter={orderingFilter}
			/>
		</GeoJSONSource>
	{/if}
</MapLibre>
