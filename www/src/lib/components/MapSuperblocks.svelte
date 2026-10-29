<script>
	import MapHost from './map-shell/MapHost.svelte';
	import SuperblockLayers from './map/SuperblockLayers.svelte';
	import { DEFAULT_LINE_WIDTH_RANGE } from '$lib/map-style/render-config.js';

	// Standalone wrapper: owns a `MapHost` and paints the superblock hulls/edges into it. The
	// capture routes render this directly, so the prop signature is unchanged.
	let {
		geojson,
		blockAttributes = null,
		bounds = undefined,
		initialBounds = null,
		cityBoundary = null,
		showLabels = true,
		metric = undefined,
		metricProperty,
		lineWidthRange = DEFAULT_LINE_WIDTH_RANGE,
		showControls = true,
		// Collapsed-handle label for the compact bottom sheet — see the note in Map.svelte.
		sheetTitle = '',
		mapTitle = undefined,
		showLegend = true,
		onToggleLabels = undefined,
		sizeRange = $bindable(null),
		onSizeIndex = undefined,
		showSizeFilter = true,
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
	{onidle}
>
	<SuperblockLayers
		{geojson}
		{blockAttributes}
		{metric}
		{metricProperty}
		{lineWidthRange}
		{showLegend}
		bind:sizeRange
		{onSizeIndex}
		{showSizeFilter}
		interactive={false}
	/>
</MapHost>
