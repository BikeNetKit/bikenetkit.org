<script>
	import MapHost from './map-shell/MapHost.svelte';
	import StaticLayers from './map/StaticLayers.svelte';
	import { RAMP_COLORS } from '$lib/map-style/line-paint.js';
	import { DEFAULT_LINE_WIDTH_RANGE } from '$lib/map-style/render-config.js';
	import { geojsonBounds } from '$lib/utils/bounds';

	// Standalone wrapper: owns a `MapHost` and paints a single static metric layer into it. The
	// capture routes render this directly, so the prop signature is unchanged.
	let {
		geojson,
		existingNetwork = undefined,
		bounds = undefined,
		initialBounds = null,
		cityBoundary = null,
		showLabels = true,
		metricProperty,
		lineWidthRange = DEFAULT_LINE_WIDTH_RANGE,
		colors = RAMP_COLORS,
		showControls = true,
		// Collapsed-handle label for the compact bottom sheet — see the note in Map.svelte.
		sheetTitle = '',
		mapTitle = undefined,
		showLegend = true,
		showMetricLegend = true,
		onToggleLabels = undefined,
		// Frame the data extent rather than the city bounding box — resolved to the host's `bounds`
		// here so the host stays agnostic about which envelope it fits.
		fitToData = false,
		onidle = undefined
	} = $props();

	const dataBounds = $derived(geojsonBounds(geojson));
	const effectiveBounds = $derived(fitToData && dataBounds ? dataBounds : bounds);
</script>

<MapHost
	bounds={effectiveBounds}
	{initialBounds}
	{cityBoundary}
	{showLabels}
	{onToggleLabels}
	{showControls}
	{sheetTitle}
	{mapTitle}
	{onidle}
>
	<StaticLayers
		{geojson}
		{existingNetwork}
		{metricProperty}
		{lineWidthRange}
		{colors}
		{showLegend}
		{showMetricLegend}
	/>
</MapHost>
