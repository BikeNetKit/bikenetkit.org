<script>
	import Map from '$lib/components/Map.svelte';
	import MapStatic from '$lib/components/MapStatic.svelte';
	import MapSuperblocks from '$lib/components/MapSuperblocks.svelte';
	import { fitToDataFor, lineWidthRangeFor, toolBySlug } from '$lib/data/tools';
	import { sortBikeNetLayerProps } from '$lib/data/sortbikenet';
	import { cityBySlug } from '$lib/data/cities';

	// Chromeless, interactive map for <iframe> embedding (docs.bikenetkit.org, partner pages). Same
	// data model as the tool pages, without the sidebar shell. See DOCS_MAP_INTEGRATION.md (Tier 3).
	// Unlike /screenshot (which is capture-only: no controls, labels off, fixed pixel size), this
	// keeps the map interactive and fills the iframe viewport.
	let { data } = $props();

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
	// Titles the compact bottom sheet's handle. Optional chain, unlike the `(map)` layout's
	// unguarded lookup: there the slug comes from the tool catalog, here it is a raw URL param and
	// an unknown one must render an untitled handle rather than throw.
	const sheetTitle = $derived(toolBySlug[data.tool]?.name ?? '');
	const mapTitle = $derived(
		`${sheetTitle || data.tool} results for ${cityBySlug[data.city]?.name ?? data.city}`
	);
</script>

<svelte:head>
	<style>
		body {
			background: var(--color-paper);
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
	</style>
</svelte:head>

<main id="main" tabindex="-1" style="width: 100vw; height: 100vh;" class="focus:outline-none">
	{#if isOrdered}
		<Map
			geojson={data.geojson}
			bounds={data.bounds}
			initialBounds={data.initialBounds}
			cityBoundary={data.cityBoundary}
			metricProperty={data.metricProperty}
			existingNetwork={data.existingNetwork}
			lccStepProperty={isLinkBikeNet ? `lcc_step_${data.metric}` : null}
			{...sortBikeNetProps}
			{sheetTitle}
			{mapTitle}
		/>
	{:else if isSuperblockEdges}
		<MapSuperblocks
			geojson={data.geojson}
			blockAttributes={data.blocks}
			bounds={data.bounds}
			initialBounds={data.initialBounds}
			cityBoundary={data.cityBoundary}
			metricProperty={data.metricProperty}
			{lineWidthRange}
			{sheetTitle}
			{mapTitle}
		/>
	{:else}
		<MapStatic
			geojson={data.geojson}
			existingNetwork={data.existingNetwork}
			bounds={data.bounds}
			initialBounds={data.initialBounds}
			cityBoundary={data.cityBoundary}
			metricProperty={data.metricProperty}
			{lineWidthRange}
			{fitToData}
			{sheetTitle}
			{mapTitle}
		/>
	{/if}
</main>
