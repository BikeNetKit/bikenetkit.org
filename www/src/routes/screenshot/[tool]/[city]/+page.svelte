<script>
	import Map from '$lib/components/Map.svelte';
	import MapStatic from '$lib/components/MapStatic.svelte';
	import MapSuperblocks from '$lib/components/MapSuperblocks.svelte';
	import { fitToDataFor, lineWidthRangeFor } from '$lib/data/tools';
	import { page } from '$app/state';
	import { sortBikeNetLayerProps } from '$lib/data/sortbikenet';

	let { data } = $props();

	// Mirrors VIEWPORT in tests/export-matrix.ts, which captures at deviceScaleFactor 2.
	const size = $derived(Number(page.url.searchParams.get('size')) || 540);

	function markReady() {
		document.body.setAttribute('data-map-ready', 'true');
	}

	$effect(() => {
		const timer = setTimeout(markReady, 5000);
		return () => clearTimeout(timer);
	});

	const isOrdered = $derived(
		data.tool === 'growbikenet' || data.tool === 'linkbikenet' || data.tool === 'sortbikenet'
	);
	const sortBikeNetProps = $derived(
		data.tool === 'sortbikenet' ? sortBikeNetLayerProps(data.geojson) : {}
	);
	const isLinkBikeNet = $derived(data.tool === 'linkbikenet');
	const isSuperblockEdges = $derived(data.tool === 'superblockify' && data.type === 'edges');
	const lineWidthRange = $derived(lineWidthRangeFor(data.tool, data.type));
	const fitToData = $derived(fitToDataFor(data.tool));
</script>

<svelte:head>
	<style>
		body {
			background: var(--color-paper) !important;
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
		/* The capture renders at deviceScaleFactor > 1; shrink the credit back so it keeps the pixel
		   size it has in a 1080-CSS-px capture (SIZE in tests/export-matrix.ts) instead of spreading
		   into the thumbnail circle. */
		.maplibregl-ctrl-bottom-right {
			zoom: var(--credit-zoom, 1);
		}
	</style>
</svelte:head>

<div style="width: {size}px; height: {size}px; --credit-zoom: {size / 1080};">
	{#if isOrdered}
		<Map
			geojson={data.geojson}
			bounds={data.bounds}
			cityBoundary={data.cityBoundary}
			showLabels={false}
			metricProperty={data.metricProperty}
			existingNetwork={data.existingNetwork}
			lccStepProperty={isLinkBikeNet ? `lcc_step_${data.metric}` : null}
			{...sortBikeNetProps}
			showControls={false}
			showLegend={false}
			onidle={markReady}
		/>
	{:else if isSuperblockEdges}
		<MapSuperblocks
			geojson={data.geojson}
			blockAttributes={data.blocks}
			bounds={data.bounds}
			cityBoundary={data.cityBoundary}
			showLabels={false}
			metricProperty={data.metricProperty}
			{lineWidthRange}
			showControls={false}
			showLegend={false}
			onidle={markReady}
		/>
	{:else}
		<MapStatic
			geojson={data.geojson}
			existingNetwork={data.existingNetwork}
			bounds={data.bounds}
			cityBoundary={data.cityBoundary}
			showLabels={false}
			metricProperty={data.metricProperty}
			{lineWidthRange}
			{fitToData}
			showControls={false}
			showLegend={false}
			onidle={markReady}
		/>
	{/if}
</div>
