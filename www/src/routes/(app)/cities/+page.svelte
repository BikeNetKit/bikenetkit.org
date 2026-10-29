<script>
	import { resolve } from '$app/paths';
	import { growBikeNetConfig } from '$lib/data/tools';
	import { screenshotFor } from '$lib/data/tool-paths';
	import CitySearch from '$lib/components/CitySearch.svelte';
	import CityTeaser from '$lib/components/CityTeaser.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';

	let { data } = $props();

	const cityHref = (city) => resolve('/(app)/cities/[city]', { city: city.slug });

	const viewOptions = [
		{ value: 'grid', label: 'Grid' },
		{ value: 'table', label: 'Table' }
	];
	const viewHref = (value) => (value === 'grid' ? resolve('/cities') : resolve('/cities/table'));

	const gbnDefaultScreenshot = (citySlug) =>
		screenshotFor('growbikenet', {
			city: citySlug,
			metric: growBikeNetConfig.defaultMetric,
			type: growBikeNetConfig.defaultType,
			variant: growBikeNetConfig.defaultVariant
		});
</script>

<div class="h-full overflow-y-auto">
	<div class="mx-auto w-full max-w-5xl px-6 pt-12 pb-16">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<h1 class="display-name text-4xl text-brand">Cities</h1>
			<SegmentedControl
				options={viewOptions}
				active="grid"
				hrefFor={viewHref}
				ariaLabel="City view"
			/>
		</div>

		<p class="mt-8 max-w-2xl text-ink">
			Explore bike network analyses across {data.cities.length} European cities. Pick a city to see all
			the tools and analysis variants available for it.
		</p>

		<h2 class="mt-10 text-sm font-medium text-brand">Browse cities</h2>

		<CitySearch cities={data.cities} href={cityHref} class="mt-2 mb-8" />

		<div
			class="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5"
		>
			{#each data.cities as city (city.slug)}
				<CityTeaser
					href={cityHref(city)}
					image={data.growbikenetSlugs.has(city.slug) ? gbnDefaultScreenshot(city.slug) : undefined}
					alt="{city.name} bike network"
					label={city.name}
					sublabel={city.country}
					size="sm"
				/>
			{/each}
		</div>
	</div>
</div>
