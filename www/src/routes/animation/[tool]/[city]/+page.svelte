<script>
	import { onMount } from 'svelte';
	import Map from '$lib/components/Map.svelte';
	import { geojsonBounds } from '$lib/utils/bounds';
	import {
		DEFAULT_LINE_WIDTH_RANGE,
		FIT_BOUNDS_OPTIONS,
		SEED_CIRCLE_RADIUS
	} from '$lib/map-style/render-config.js';
	import { page } from '$app/state';

	let { data } = $props();

	// `size` is the square shorthand the GIF exporter uses; `width`/`height` override it for
	// non-square video frames.
	const size = $derived(Number(page.url.searchParams.get('size')) || 800);
	const width = $derived(Number(page.url.searchParams.get('width')) || size);
	const height = $derived(Number(page.url.searchParams.get('height')) || size);
	// `seeds` and `labels` are named after the reader-facing flags in `$lib/utils/view-params.js`,
	// but both are opt-out here where `seeds` is opt-in there: an export names what it wants left
	// out, and the callers are the capture scripts rather than a reader. Deliberately kept separate
	// from `view-params` — this route is not prerendered and carries frame params it knows nothing
	// about.
	const showSeeds = $derived(page.url.searchParams.get('seeds') !== '0');
	// Video exports are pure map + data layer; the GIF keeps basemap labels, so this stays opt-out.
	const showLabels = $derived(page.url.searchParams.get('labels') !== '0');
	// Opt-out, not off by default: the basemap is OSM/ODbL and every published frame needs the
	// credit. A caller that drops it here owes the attribution somewhere else.
	const showAttribution = $derived(page.url.searchParams.get('attribution') !== '0');
	const fitPadding = $derived(
		Number(page.url.searchParams.get('padding')) || FIT_BOUNDS_OPTIONS.padding
	);
	// A large frame fits the same bounds at a higher zoom, where the designed-for-screen line
	// weights read thin. `weight` scales them back up without touching the shared constants.
	const weight = $derived(Number(page.url.searchParams.get('weight')) || 1);

	const lineWidthRange = $derived(DEFAULT_LINE_WIDTH_RANGE.map((w) => w * weight));
	const seedRadius = $derived(SEED_CIRCLE_RADIUS * weight);

	// Frame the network itself, not the city bounding box: `Map`'s fitBounds padding is
	// then the only margin.
	const fitBounds = $derived(geojsonBounds(data.geojson, data.seeds) ?? data.bounds);

	// `frameOverride` is an index into `Map`'s frame space. Frame 0 is the starting condition
	// (existing network only), hence the `+ 1` on the reported total below. `steps` mirrors
	// `Map`'s own `ordered.steps` — same source, same dedupe, same sort — so `stepFor()` resolves
	// a frame index to the exact `ordering` threshold the layers will filter at.
	const steps = $derived(
		[
			...new Set(
				(data.geojson?.features ?? [])
					.map((f) => f.properties?.ordering)
					.filter((v) => typeof v === 'number')
			)
		].sort((a, b) => a - b)
	);
	const stepCount = $derived(steps.length);
	// The playhead's space: `steps` with the starting condition prepended, exactly as `Map` builds
	// its `frames.steps`.
	const frameSteps = $derived(stepCount ? [steps[0] - 1, ...steps] : []);

	let frame = $state(0);

	// MapLibre fires `idle` once the frame is fully painted — that is the capture signal.
	function handleIdle() {
		document.body.dataset.mapReady = 'true';
		document.body.dataset.frameReady = String(frame);
	}

	// Capture bridge for scripts/generate-gif.mjs and scripts/generate-video.mjs.
	onMount(() => {
		/** @type {Window & { __capture?: { total: () => number, setFrame: (n: number) => void, stepFor: (n: number) => number | null } }} */ (
			window
		).__capture = {
			total: () => stepCount + 1,
			setFrame: (n) => {
				delete document.body.dataset.frameReady;
				frame = n;
			},
			// Two frame indices that resolve to the same threshold render identical pixels. The
			// video exporter re-emits the previous screenshot for those instead of waiting on an
			// `idle` that a no-op step never fires.
			stepFor: (n) =>
				frameSteps.length ? frameSteps[Math.max(0, Math.min(n, frameSteps.length - 1))] : null
		};
	});
</script>

<svelte:head>
	<style>
		body {
			background: var(--color-paper) !important;
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
	</style>
</svelte:head>

<div style="width: {width}px; height: {height}px;">
	<Map
		geojson={data.geojson}
		seeds={data.seeds}
		{showSeeds}
		{showLabels}
		{showAttribution}
		{lineWidthRange}
		{seedRadius}
		{fitPadding}
		bounds={fitBounds}
		cityBoundary={data.cityBoundary}
		metricProperty={data.metricProperty}
		existingNetwork={data.existingNetwork}
		frameOverride={frame}
		constrainCamera={false}
		showControls={false}
		showLegend={false}
		showDebug={false}
		onidle={handleIdle}
	/>
</div>
