<script>
	import { tick } from 'svelte';
	import CitiesMap from '../lib/components/CitiesMap.svelte';

	import { interactiveTools } from '$lib/data/tools';
	import { news, sponsors, stats, team } from '$lib/data/landing';

	import { resolve } from '$app/paths';
	import CitySearch from '$lib/components/CitySearch.svelte';
	import CityPanel from '$lib/components/CityPanel.svelte';
	import { cities } from '$lib/data/cities';

	import ToolShowcase from '$lib/components/landing/ToolShowcase.svelte';
	// import FeaturedCitiesStrip from '$lib/components/landing/FeaturedCitiesStrip.svelte';
	import HeroSection from '$lib/components/landing/HeroSection.svelte';
	import InfoGrid from '$lib/components/landing/InfoGrid.svelte';
	import ProblemSolutionExplainer from '$lib/components/landing/ProblemSolutionExplainer.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';

	import { env } from '$env/dynamic/public';
	import PlaceholderLanding from '$lib/components/landing/PlaceholderLanding.svelte';
	import { heroCombos } from '$lib/components/landing/hero-tools.js';
	import { datasets } from '$lib/data/datasets';
	import { compact } from '$lib/state/viewport.svelte.js';

	// No `data` prop: the dataset catalog is imported directly now, and the only other load value
	// (`featuredGbnCities`/`featuredFbnCities`, still returned by +page.server.ts) is referenced
	// exclusively by the commented-out example rows below — restore `let { data } = $props()`
	// alongside them.

	// Temporary "coming soon" placeholder. Set PUBLIC_LANDING_PLACEHOLDER=true to show it;
	// flip to false (or remove) at launch to reveal the full landing below.
	const showPlaceholder = env.PUBLIC_LANDING_PLACEHOLDER === 'true';

	let selectedCity = $state(null);
	/** @type {{ locate: () => void, focus: () => void } | null} */
	let citySearch = $state(null);

	// Closing the panel brings the search back in its place; focus goes with it rather than to the
	// page, which is where it would land once the focused Close button unmounts.
	async function closeCityPanel() {
		selectedCity = null;
		await tick();
		citySearch?.focus();
	}

	const heroDatasets = $derived(heroCombos(datasets));

	// const growBikeNetExamples = $derived(toolExamplesFor('growbikenet', data.featuredGbnCities));
	// const fixBikeNetExamples = $derived(toolExamplesFor('fixbikenet', data.featuredFbnCities));
</script>

{#if showPlaceholder}
	<PlaceholderLanding datasets={heroDatasets} />
{:else}
	<div class="flex min-h-screen flex-col bg-brand-subtle">
		<main
			id="main"
			tabindex="-1"
			class="mx-auto flex w-full max-w-page flex-1 flex-col gap-2 p-0 pb-2 focus:outline-none"
		>
			<div class="p-2">
				<HeroSection datasets={heroDatasets} />
			</div>
			<ProblemSolutionExplainer />

			<div class="grid xl:grid-cols-2">
				<div class="flex flex-col">
					<h2 class=" px-4 pt-6 text-sm font-light tracking-wider text-ink-alt-weaker uppercase">
						Cities
					</h2>
					<div class="relative">
						<!-- `aspect-4/3` gives the map usable height on a phone; `min-h-150` replaces the
						     arbitrary `min-h-[600px]` (Tailwind v4 spacing scale, 150 × 0.25rem = 600px — a
						     scale value, not an arbitrary one).

						     `m-2` is the page's gutter, not a value picked for the map: `HeroSection`'s
						     wrapper above is `p-2`, `ToolShowcase` beside it is `p-2`, `InfoGrid` below is
						     `px-2`, and `main` itself is `gap-2`. This was `m-4`, which left the map panel
						     indented 8px further than every other block on the page. `mt-4` mirrors that
						     same neighbour's `pt-4`: `ToolShowcase` is `p-2 pt-4`, so its cards clear the
						     column heading by 16px and the map has to do the same to start level with them. -->
						<div
							class="relative m-2 mt-4 aspect-4/3 overflow-hidden rounded bg-base-teal-lightest md:aspect-2/1 xl:aspect-auto xl:min-h-150 xl:grow"
						>
							<CitiesMap
								{cities}
								selected={selectedCity}
								onselect={(c) => (selectedCity = c)}
								insetLeft={compact.current ? 0 : 320}
							/>
						</div>
						<!-- Below `md` the panel is a normal block under the map, so it takes the map's own
						     `2` gutter; from `md` up it floats over the map, positioned against the `relative`
						     wrapper above since it's a sibling of the map div rather than nested inside it.
						     That wrapper has no margin, so each offset is the map's own margin on that side
						     plus the 16px the floating panel sits inside the map: `mt-8` = the map's `mt-4`
						     + 16, and `ml-6` = the map's `m-2` + 16. They can't be one `m-*` value because
						     the map's top and side margins differ. The legend carries the matching
						     `bottom-4 left-4` inside the map, so its left edge is flush with this one. -->
						<section
							class="mx-2 mb-2 rounded-md bg-brand shadow-lg md:absolute md:inset-auto md:top-0 md:left-0 md:mt-8 md:ml-6 md:w-72"
						>
							{#if selectedCity}
								<CityPanel city={selectedCity} {datasets} onclose={closeCityPanel} />
							{:else}
								<div
									class="flex flex-col items-start gap-6 px-6 py-6 sm:items-center sm:justify-between"
								>
									<div>
										<h3 class="font-display text-3xl font-bold text-brand-vivid-light">
											<span class="italic">Which tool is right for</span>
											<span class="text-white">your</span>
											<span class="italic">city?</span>
										</h3>
										<CitySearch
											bind:this={citySearch}
											{cities}
											onselect={(c) => (selectedCity = c)}
											class="mt-8"
										/>
										<p class="mt-3 max-w-md text-sm text-brand-light">
											Search by name in the field above,
											<button
												type="button"
												onclick={() => citySearch?.locate()}
												class="cursor-pointer align-baseline font-semibold text-white hover:underline focus-visible:outline-paper-white"
											>
												find a nearby city,
											</button>
											or
											<a
												href={resolve('/cities')}
												class="font-semibold text-white hover:underline focus-visible:outline-paper-white"
											>
												browse all cities
											</a>.
										</p>
									</div>
								</div>
							{/if}
						</section>
					</div>
				</div>
				<div class="flex flex-col">
					<h2 class="px-4 pt-6 text-sm font-light tracking-wider text-ink-alt-weaker uppercase">
						Tools
					</h2>
					<ToolShowcase interactive={interactiveTools} />
				</div>

				<!-- <h2 class="px-4 pt-6 text-sm font-light tracking-wider text-ink-alt-weaker uppercase">
			Featured bike networks
		</h2>
		<div class="flex flex-col gap-12 py-12">
			<FeaturedCitiesStrip examples={growBikeNetExamples} />
			<FeaturedCitiesStrip examples={fixBikeNetExamples} />
		</div> -->
			</div>
			<h2 class="px-4 pt-6 text-sm font-light tracking-wider text-ink-alt-weaker uppercase">
				Stats and Info
			</h2>
			<InfoGrid {stats} {news} {team} {sponsors} />
		</main>
		<!-- Outside `main`, so it is the page's contentinfo landmark rather than part of the content. -->
		<div class="mx-auto w-full max-w-page pb-4">
			<SiteFooter />
		</div>
	</div>
{/if}
