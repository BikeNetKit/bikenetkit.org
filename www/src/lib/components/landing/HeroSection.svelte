<script>
	import { resolve } from '$app/paths';
	import AmbientHeroMap from './AmbientHeroMap.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import wordmarkSquare from '$lib/assets/brand/logo-word-mark-square.svg?url';
	import wordmarkHorizontal from '$lib/assets/brand/logo-word-mark-horizontal.svg?url';

	let {
		datasets = [],
		children = undefined,
		sectionClass = 'hero-min-h p-2 md:hero-min-h-md',
		// The ambient map runs with MapLibre's attribution control off (see AmbientMapPane), so the
		// OSM/Protomaps credit ODbL requires is rendered here instead. `linkCredit` is false on the
		// placeholder build, whose prerender never crawls beyond `/` — the credit still shows, it
		// just doesn't pull /legal into a build that isn't meant to publish it yet.
		linkCredit = true,
		// Fades out the logo + headline lockup, and the white gradient that only exists to give it
		// contrast, leaving the bare map. Used by the full-viewport /hero page; the map, HUD, pause
		// button and the ODbL credit stay regardless.
		hideBrand = false
	} = $props();

	const brandFade = $derived(
		`transition-opacity duration-500 ${hideBrand ? 'opacity-0' : 'opacity-100'}`
	);

	let paused = $state(false);
</script>

<!-- `max-md:bg-white`: the ambient panes start at `opacity: 0` and only paint once a city has
     loaded, and the section itself is otherwise transparent — so until the reveal the page
     wrapper's `bg-brand-subtle` green shows through the whole hero, which the compact overlay's
     white only masks across its top 30%. White here is what the panes fade in over. -->
<section class="hero-grid relative content-start max-md:bg-white {sectionClass}">
	<!-- Full-bleed ambient map (z-0). Sits behind the panels; gaps between panels reveal it.
	     On mobile (single-column hero) it starts 10% of the viewport down — see .map-layer. -->
	<!-- Decorative: two canvases and a telemetry HUD that changes every frame, none of it content.
	     `inert` takes it out of the tab order and the accessibility tree in one go. -->
	<div
		class="map-layer pointer-events-none z-0 overflow-hidden rounded-sm"
		aria-hidden="true"
		inert
	>
		<AmbientHeroMap {datasets} {paused} />
	</div>

	<div class="overlay rounded-sm {brandFade}"></div>

	<!-- Brand -->
	<div
		class="area-brand relative z-10 flex flex-col items-center justify-center rounded-sm p-4 md:p-6 {brandFade}"
		aria-hidden={hideBrand}
	>
		<img src={wordmarkSquare} alt="BikeNetKit" class="hero-logo-square w-auto" />
		<img src={wordmarkHorizontal} alt="BikeNetKit" class="hero-logo-wide w-auto" />
	</div>

	<!-- Headline -->
	<div
		class="area-headline relative z-10 flex flex-col rounded-sm px-0 py-4 text-white md:justify-center md:p-8 {brandFade}"
		aria-hidden={hideBrand}
	>
		<!-- The landing page's `h1`. It was an `h2`, which left the site's most important page with
		     no first-level heading at all: the wordmark beside it is an image, so nothing else was
		     standing in for one. Purely semantic — the styling is unchanged. -->
		<h1
			class=" tracking-tightest max-w-64 font-display text-2xl leading-snug font-semibold text-balance text-brand-vivid-dark italic md:max-w-none md:text-4xl"
		>
			<span class="max-md:bg-white">The digital toolkit for bicycle networks</span>
		</h1>
		<!-- Desktop only: the mobile lockup is logo + headline alone, no tagline. -->
		<p class="hero-tagline mt-4 text-balance text-ink-alt-weaker md:text-lg">
			Free, open-source Python tools for designing well-connected bicycle infrastructure.
		</p>
		{#if children}
			<div class="mt-6">{@render children()}</div>
		{/if}
	</div>

	<!-- Pause for the rotation (WCAG 2.2.2). Above the HUD's "// bikenetkit" mark, clear of the
	     credit. Hidden under reduced motion, where the hero holds still on its own — CSS rather than
	     the rune, so it is right before hydration too. -->
	<div class="pointer-events-auto absolute right-3 bottom-8 z-10 motion-reduce:hidden">
		<IconButton
			variant="ghost"
			size="sm"
			ariaLabel={paused ? 'Play hero animation' : 'Pause hero animation'}
			onclick={() => (paused = !paused)}
		>
			{#if paused}
				<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
					<polygon points="3,2 10,6 3,10" />
				</svg>
			{:else}
				<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
					<rect x="2" y="2" width="3" height="8" rx="0.5" />
					<rect x="7" y="2" width="3" height="8" rx="0.5" />
				</svg>
			{/if}
		</IconButton>
	</div>

	<!-- Basemap credit. Required wherever OSM-derived rendering appears, including here. Clears the
	     HUD's "// bikenetkit" mark (bottom-3, md and up) rather than sitting on top of it; below md
	     the HUD is hidden, so the credit takes the corner itself. -->
	<p
		class="pointer-events-auto absolute right-4 bottom-2.5 z-10 text-2xs text-ink-alt-weaker md:right-36"
	>
		{#if linkCredit}
			<a href={resolve('/legal')} class="font-mono tracking-wide uppercase hover:text-brand"
				>© OpenStreetMap contributors</a
			>
		{:else}
			© OpenStreetMap contributors
		{/if}
	</p>
</section>

<style>
	/* Full-bleed at every width, and it has to stay that way. Insetting the top on compact to "clear"
	   the logo lockup looks reasonable but puts the page's `bg-brand-subtle` green behind that strip
	   — the section itself is transparent and only the map panes paint white — so the overlay's
	   fading white washes over green above the inset and over white below it, meeting in a hard
	   seam at the map's top edge. The overlay gradient is what gives the lockup its contrast; the
	   map belongs underneath it, not pushed clear of it. */
	.map-layer {
		position: absolute;
		inset: 0;
	}

	.overlay {
		/* Semi-transparent white overlay to improve text contrast */
		background: radial-gradient(at top left, #fffa 0%, #fff0 50%);
		position: absolute;
		width: 100%;
		min-width: 300px;
		height: 100%;
		min-height: 300px;
		z-index: 1;
		@media (max-width: 800px) {
			background: linear-gradient(#ffff 0%, #ffff 4%, #fff0 30%);
			width: 100%;
			height: 100%;
			min-height: 300px;
		}
	}

	/* Desktop: logo and headline side by side. Compact: the wide wordmark on top, the headline
	   underneath, indented so its left edge meets the lettering's "B" — x≈76 of the wordmark's
	   255×59 viewBox, hence the `76 / 59` against the logo's height. */
	.hero-grid {
		--hero-logo-h: 3.5rem;
		display: grid;
		gap: 0;
		grid-template-columns: 1fr;
		grid-template-areas: 'brand' 'headline';
	}
	@media (min-width: 800px) {
		.hero-grid {
			gap: 0.5rem;
			grid-template-columns: auto 1fr;
			grid-template-areas: 'brand headline';
		}
	}

	.hero-logo-wide {
		height: var(--hero-logo-h);
	}
	.hero-logo-square {
		display: none;
		height: 7rem;
	}
	@media (min-width: 800px) {
		.hero-logo-wide {
			display: none;
		}
		.hero-logo-square {
			display: block;
		}
	}

	.area-brand {
		grid-area: brand;
	}
	.area-headline {
		grid-area: headline;
	}
	@media (max-width: 799.98px) {
		.area-brand {
			align-items: flex-start;
			padding: 1rem 1rem 0;
		}
		.area-headline {
			padding: 0.25rem 1rem 1rem calc(1rem + var(--hero-logo-h) * 76 / 59);
		}
	}
	@media (min-width: 800px) {
		.area-brand {
			aspect-ratio: 1 / 1;
		}
	}

	/* Mobile lockup is logo + headline only — see the comment above the tagline in the markup. */
	.hero-tagline {
		display: none;
	}
	@media (min-width: 800px) {
		.hero-tagline {
			display: block;
		}
	}
</style>
