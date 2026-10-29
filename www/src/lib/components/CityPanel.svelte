<script>
	import { resolve } from '$app/paths';
	import RecommendedStar from '$lib/components/ui/RecommendedStar.svelte';
	import { toolBySlug } from '$lib/data/tools';
	import { availableSlugs, recommendedSlugs, toolCityHref } from '$lib/data/city-tools';

	let { city, datasets, onclose } = $props();

	const available = $derived(new Set(availableSlugs(city, datasets)));
	const recommended = $derived(recommendedSlugs(city));

	const rows = $derived(
		[...new Set([...recommended, ...available])].map((slug) => ({
			slug,
			name: toolBySlug[slug]?.name ?? slug,
			isAvailable: available.has(slug),
			isRecommended: recommended.includes(slug)
		}))
	);

	const cityHref = $derived(resolve('/(app)/cities/[city]', { city: city.slug }));

	// The panel replaces the control that chose the city, so focus would otherwise fall to the page.
	// Re-runs on every new city: a dot click swaps the city without remounting the panel.
	/** @type {HTMLHeadingElement | null} */
	let heading = $state(null);
	$effect(() => {
		void city;
		heading?.focus({ preventScroll: true });
	});
</script>

<div class="flex flex-col">
	<div class="flex items-start justify-between gap-2 px-4 py-4">
		<h3
			bind:this={heading}
			tabindex="-1"
			class="font-display text-2xl font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
		>
			{city.name}
		</h3>
		<button
			type="button"
			onclick={onclose}
			aria-label="Close"
			class="-mt-1 -mr-1 rounded p-1 text-2xl leading-none text-brand-light transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
		>
			×
		</button>
	</div>
	<div class="mx-2 rounded bg-brand-subtle p-4">
		{#if rows.length > 0}
			<div class="mb-2 text-xs tracking-wider text-ink-weaker uppercase">
				Available tools and analyses
			</div>
			<ul class="flex flex-col gap-1">
				{#each rows as row (row.slug)}
					<li>
						{#if row.isAvailable}
							<a
								href={toolCityHref(row.slug, city, datasets)}
								class="button flex items-center gap-1.5 rounded py-1.5 text-sm text-brand-ink transition-colors hover:underline"
							>
								<span class="display-name">{row.name}</span>
								{#if row.isRecommended}
									<RecommendedStar cityName={city.name} />
								{/if}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-brand-light">No analyses available yet for this city.</p>
		{/if}
	</div>

	<a href={cityHref} class="p-4 text-sm font-semibold text-white hover:underline">
		City overview →
	</a>
</div>
