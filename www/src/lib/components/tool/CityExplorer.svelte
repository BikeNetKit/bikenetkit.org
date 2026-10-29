<script>
	import { cityBySlug } from '$lib/data/cities';
	import CitySearch from '$lib/components/CitySearch.svelte';
	import CityTeaser from '$lib/components/CityTeaser.svelte';
	import { userLocation } from '$lib/state/userLocation.svelte';

	/**
	 * @typedef {{ label?: string, slugs: readonly string[], href: (slug: string) => string,
	 *   screenshot: (slug: string) => string, alt?: (cityName: string) => string }} TeaserGroup
	 */
	/** @type {{ cities: import('$lib/data/types').City[], cityHref: (city: { slug: string }) => string, groups: TeaserGroup[] }} */
	let { cities, cityHref, groups } = $props();
</script>

<hr class="mt-16! border-brand/30!" />

<div class="mt-10">
	<div class="grid gap-8 sm:grid-cols-3 sm:items-center lg:gap-x-16">
		<div class="sm:col-span-2">
			<h2 class="text-lg font-semibold text-brand">Explore tool results</h2>
			<p class="mt-2 text-sm text-ink-alt">
				Pick one of the featured cities below, or search among the {cities.length} available cities for
				this tool in the search bar <span class="sm:hidden">below</span><span
					class="hidden sm:inline">on the right</span
				>!
			</p>
		</div>
		<!-- Desktop only: a normal grid item beside the heading. Below `sm` a second instance takes
		     over (below) — this row is exactly as tall as the heading, which leaves a sticky child no
		     room to travel, so we don't fight that here; two instances, CSS-gated, same pattern as
		     ToolTabs/ToolSelect. -->
		<div class="hidden sm:col-span-1 sm:block">
			<CitySearch {cities} href={cityHref} />
		</div>
	</div>

	<!-- Mobile only, and a direct sibling of the teaser grid below rather than nested in the row
	     above — that's what gives it room to actually stick: `position: sticky` is bounded by its
	     own parent's height, and this parent also holds the (much taller) teaser grid. `bg-paper`
	     covers teasers scrolling underneath. -->
	<div class="sticky top-0 z-10 -mx-6 mt-6 bg-paper px-6 py-2 sm:hidden">
		<CitySearch {cities} href={cityHref} />
	</div>

	{#each groups as group, i (group.label ?? i)}
		{#if group.label}
			<h3
				class="{i === 0
					? 'mt-12'
					: 'mt-16'} text-xs font-semibold tracking-wider text-ink-alt-weaker uppercase"
			>
				{group.label}
			</h3>
		{/if}
		<div class="{group.label ? 'mt-6' : 'mt-12'} grid grid-cols-2 gap-8 sm:grid-cols-3">
			{#each group.slugs as slug (slug)}
				{@const name = cityBySlug[slug]?.name ?? slug}
				<CityTeaser
					href={group.href(slug)}
					image={group.screenshot(slug)}
					alt={group.alt?.(name) ?? `${name} bike network`}
					label={name}
					sublabel={cityBySlug[slug]?.country}
					highlight={slug === userLocation.homeCitySlug}
				/>
			{/each}
		</div>
	{/each}
</div>
