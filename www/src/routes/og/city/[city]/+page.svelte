<script>
	import OgCityCard from '$lib/components/design/OgCityCard.svelte';
	import { activeInteractiveTools } from '$lib/data/tools';
	import { cityBySlug } from '$lib/data/cities';
	import { datasets } from '$lib/data/datasets';
	import { RECOMMENDED_FLAGS } from '$lib/data/recommended';
	import { defaultViewFor } from '$lib/data/tool-page-loader';
	import { screenshotFor } from '$lib/data/tool-paths';
	import { joinList } from '$lib/utils/formatters';

	let { data } = $props();

	const city = $derived(cityBySlug[data.city]);
	const covering = $derived(
		activeInteractiveTools.filter((tool) =>
			(datasets[tool.slug] ?? []).some((d) => d.city === data.city)
		)
	);
	// The picture is the first tool recommended for the city, else the first that covers it.
	const pictured = $derived(
		covering.find((tool) => {
			const flag = RECOMMENDED_FLAGS[tool.slug];
			return !!flag && city?.recommended?.[flag] === true;
		}) ?? covering[0]
	);
	const image = $derived(
		pictured
			? screenshotFor(pictured.slug, {
					city: data.city,
					...defaultViewFor(
						pictured.slug,
						data.city,
						datasets[pictured.slug] ?? [],
						pictured.slug === 'growbikenet'
					)
				})
			: null
	);
	const caption = $derived(
		covering.length > 3
			? `Bicycle-network analyses from ${covering.length} BikeNetKit tools`
			: `Bicycle-network analyses from ${joinList(covering.map((t) => t.name))}`
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

{#if city && image}
	<OgCityCard cityName={city.name} country={city.country} {caption} {image} />
{/if}
