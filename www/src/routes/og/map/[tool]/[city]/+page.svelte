<script>
	import OgCityCard from '$lib/components/design/OgCityCard.svelte';
	import { toolBySlug } from '$lib/data/tools';
	import { cityBySlug } from '$lib/data/cities';
	import { datasets } from '$lib/data/datasets';
	import { defaultViewFor } from '$lib/data/tool-page-loader';
	import { screenshotFor } from '$lib/data/tool-paths';

	let { data } = $props();

	const tool = $derived(toolBySlug[data.tool]);
	const city = $derived(cityBySlug[data.city]);
	const toolDatasets = $derived(datasets[data.tool] ?? []);
	// The card shows the view the tool×city's pages name as canonical, so a shared link of any view
	// previews the one search engines index. An uncovered city has no card and renders nothing.
	const image = $derived(
		toolDatasets.some((d) => d.city === data.city)
			? screenshotFor(data.tool, {
					city: data.city,
					...defaultViewFor(data.tool, data.city, toolDatasets, data.tool === 'growbikenet')
				})
			: null
	);
</script>

<svelte:head>
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
	</style>
</svelte:head>

{#if tool && city && image}
	<OgCityCard
		cityName={city.name}
		country={city.country}
		{tool}
		caption={tool.shortDescription}
		{image}
	/>
{/if}
