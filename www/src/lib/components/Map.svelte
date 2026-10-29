<script>
	import MapHost from './map-shell/MapHost.svelte';
	import BuildupLayers from './map/BuildupLayers.svelte';
	import {
		DEFAULT_LINE_WIDTH_RANGE,
		FIT_BOUNDS_OPTIONS,
		SEED_CIRCLE_RADIUS
	} from '$lib/map-style/render-config.js';

	// Standalone wrapper: owns a `MapHost` and paints the growbikenet/linkbikenet build-up into it.
	// The capture routes (`/screenshot`, `/animation`) render this directly, so the prop signature
	// is unchanged. The tool pages instead share one host in the `(map)` layout and render
	// `BuildupLayers` on its own.
	let {
		geojson,
		seeds = null,
		showSeeds = true,
		bounds = undefined,
		initialBounds = null,
		cityBoundary = null,
		showLabels = true,
		metricProperty = 'betweenness',
		existingNetwork = null,
		lccStepProperty = null,
		existingStyle = undefined,
		lccShareProperty = null,
		rampColors = undefined,
		planUnderlay = false,
		qualityProperty = null,
		qualityBaseline = null,
		showControls = true,
		// Collapsed-handle label for the compact bottom sheet. Forwarded rather than left to
		// `MapHost`'s default: `/embed` mounts the sheet (only the capture routes turn it off), so
		// without this the one route that renders this wrapper on a phone gets a blank handle.
		sheetTitle = '',
		mapTitle = undefined,
		showLegend = true,
		showMetricLegend = true,
		onToggleLabels = undefined,
		showDebug = true,
		showAttribution = true,
		lineWidthRange = DEFAULT_LINE_WIDTH_RANGE,
		seedRadius = SEED_CIRCLE_RADIUS,
		fitPadding = FIT_BOUNDS_OPTIONS.padding,
		constrainCamera = true,
		frameOverride = undefined,
		onidle = undefined
	} = $props();
</script>

<MapHost
	{bounds}
	{initialBounds}
	{cityBoundary}
	{showLabels}
	{onToggleLabels}
	{showControls}
	{sheetTitle}
	{mapTitle}
	{showAttribution}
	{showDebug}
	{constrainCamera}
	{fitPadding}
	{onidle}
>
	<BuildupLayers
		{geojson}
		{seeds}
		{showSeeds}
		{metricProperty}
		{existingNetwork}
		{lccStepProperty}
		{existingStyle}
		{lccShareProperty}
		{rampColors}
		{planUnderlay}
		{qualityProperty}
		{qualityBaseline}
		{showLegend}
		{showMetricLegend}
		{lineWidthRange}
		{seedRadius}
		{frameOverride}
	/>
</MapHost>
