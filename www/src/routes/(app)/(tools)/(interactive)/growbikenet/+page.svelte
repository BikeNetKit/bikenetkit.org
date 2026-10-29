<script>
	import { resolve } from '$app/paths';
	import { toolBySlug, growBikeNetConfig } from '$lib/data/tools';
	import { screenshotFor, growBikeNetVariantLabels } from '$lib/data/tool-paths';
	import { cityBySlug } from '$lib/data/cities';
	import ToolHeader from '$lib/components/tool/ToolHeader.svelte';
	import CityExplorer from '$lib/components/tool/CityExplorer.svelte';
	import { datasets } from '$lib/data/datasets';
	import { featuredCities } from '$lib/data/featured-cities';

	const tool = toolBySlug['growbikenet'];

	// Default variant first: it is what a city's map opens on.
	const VARIANT_ORDER = ['from_bikenw', 'from_scratch'];

	const citiesWithData = $derived(
		[...new Set((datasets.growbikenet ?? []).map((d) => d.city))]
			.map((slug) => cityBySlug[slug])
			.filter(Boolean)
	);

	const datasetFor = (slug, variant = growBikeNetConfig.defaultVariant) => ({
		city: slug,
		metric: growBikeNetConfig.defaultMetric,
		type: growBikeNetConfig.defaultType,
		variant
	});

	const mapHref = (dataset) =>
		resolve('/(app)/(map)/growbikenet/[city]/[metric]/[type]/[variant]', dataset);

	const cityHref = (city) => mapHref(datasetFor(city.slug));

	const groups = $derived(
		VARIANT_ORDER.map((variant) => {
			const covered = new Set(
				(datasets.growbikenet ?? []).filter((d) => d.variant === variant).map((d) => d.city)
			);
			return {
				label: growBikeNetVariantLabels[variant],
				slugs: featuredCities('growbikenet', variant).filter((s) => covered.has(s)),
				href: (slug) => mapHref(datasetFor(slug, variant)),
				screenshot: (slug) => screenshotFor('growbikenet', datasetFor(slug, variant))
			};
		})
	);
</script>

<ToolHeader {tool} />

<CityExplorer cities={citiesWithData} {cityHref} {groups} />
