<script>
	import { resolve } from '$app/paths';
	import { toolBySlug } from '$lib/data/tools';
	import { screenshotFor } from '$lib/data/tool-paths';
	import { cityBySlug } from '$lib/data/cities';
	import ToolHeader from '$lib/components/tool/ToolHeader.svelte';
	import CityExplorer from '$lib/components/tool/CityExplorer.svelte';
	import { datasets } from '$lib/data/datasets';
	import { featuredCities } from '$lib/data/featured-cities';

	const tool = toolBySlug['linkbikenet'];
	const config = /** @type {import('$lib/data/types').ToolConfig} */ (tool.config);

	const dataCitySet = $derived(new Set((datasets.linkbikenet ?? []).map((d) => d.city)));

	const citiesWithData = $derived([...dataCitySet].map((slug) => cityBySlug[slug]).filter(Boolean));

	const cityHref = (city) =>
		resolve('/(app)/(map)/linkbikenet/[city]/[metric]/[type]', {
			city: city.slug,
			metric: config.defaultMetric,
			type: config.defaultType
		});

	const cityScreenshot = (slug) =>
		screenshotFor('linkbikenet', {
			city: slug,
			metric: config.defaultMetric,
			type: config.defaultType
		});

	const groups = $derived([
		{
			slugs: featuredCities('linkbikenet').filter((s) => dataCitySet.has(s)),
			href: (slug) => cityHref({ slug }),
			screenshot: cityScreenshot,
			alt: (name) => `${name} bike network connected by LinkBikeNet`
		}
	]);
</script>

<ToolHeader {tool} />

<CityExplorer cities={citiesWithData} {cityHref} {groups} />
