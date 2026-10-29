<script>
	import { resolve } from '$app/paths';
	import { toolBySlug } from '$lib/data/tools';
	import { screenshotFor } from '$lib/data/tool-paths';
	import { optionLabel } from '$lib/data/control-copy';
	import ToolHeader from '$lib/components/tool/ToolHeader.svelte';
	import CityTeaser from '$lib/components/CityTeaser.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { datasets } from '$lib/data/datasets';
	import { cityBySlug } from '$lib/data/cities';
	import { sortBikeNetStar } from '$lib/data/sortbikenet';
	import { PARIS_EN_SELLE_URL } from '$lib/site.js';

	const tool = toolBySlug['sortbikenet'];
	const config = /** @type {import('$lib/data/types').ToolConfig} */ (tool.config);

	// One city, so the explorer is indexed by the two axes instead: a tab per starting point, a
	// thumbnail per ordering, each opening the map on that view. The as-built order leads — it is
	// what every model ordering is measured against.
	const orderings = ['real', ...config.metrics.filter((m) => m !== 'real')];
	const scenarioOptions = config.types.map((type) => ({
		value: type,
		label: optionLabel('sortbikenet', 'type', type)
	}));
	let scenario = $state(config.defaultType);
	const views = $derived(
		orderings
			.map((metric) =>
				(datasets.sortbikenet ?? []).find((d) => d.metric === metric && d.type === scenario)
			)
			.filter((d) => d !== undefined)
	);

	const viewHref = (d) =>
		resolve('/(app)/(map)/sortbikenet/[city]/[metric]/[type]', {
			city: d.city,
			metric: d.metric,
			type: d.type
		});
</script>

<ToolHeader {tool} />

<hr class="mt-16! border-brand/30!" />

<section class="mt-10">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h2 class="text-lg font-semibold text-brand">Explore orderings</h2>
		<SegmentedControl
			options={scenarioOptions}
			active={scenario}
			onSelect={(v) => (scenario = v)}
			ariaLabel="Starting point"
		/>
	</div>
	<p class="mt-2 max-w-prose text-ink-alt">
		SortBikeNet needs a city's complete bike network plan and the dates on which each part of it was
		built, so only Paris is shown at this time. The as-built order is based on data from
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
		<a href={PARIS_EN_SELLE_URL} target="_blank" rel="noopener noreferrer" class="link relative"
			>Paris en Selle<span class="sr-only"> (opens in new tab)</span></a
		>, a Paris cycling advocacy group. Starred orderings beat the as-built order on both area
		reached and directness, the two yardsticks the research weighs against each other.
	</p>
	<div class="mt-8 grid grid-cols-2 gap-8 sm:grid-cols-4">
		{#each views as view (view.metric)}
			<CityTeaser
				href={viewHref(view)}
				image={screenshotFor('sortbikenet', view)}
				alt={`${cityBySlug[view.city]?.name ?? view.city} bike network plan, built in ${optionLabel('sortbikenet', 'metric', view.metric)} order`}
				label={optionLabel('sortbikenet', 'metric', view.metric)}
				star={sortBikeNetStar(view.metric)}
			/>
		{/each}
	</div>
</section>
