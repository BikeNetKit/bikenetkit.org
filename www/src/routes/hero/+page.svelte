<script>
	import HeroSection from '$lib/components/landing/HeroSection.svelte';
	import { heroCombos } from '$lib/components/landing/hero-tools.js';
	import { datasets } from '$lib/data/datasets';

	// The landing page's hero teaser alone, filling the viewport — for presenting and recording.
	// The frame is a 16:9 box, at most 1440px wide, centered on the landing page's green: a
	// larger display shows it with margins, a smaller one scales it down to fit whichever side is
	// tighter. `x` toggles the logo + headline lockup, leaving the bare map.
	const heroDatasets = $derived(heroCombos(datasets));

	let showBrand = $state(true);

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.key !== 'x' && e.key !== 'X') return;
		if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
		const target = /** @type {HTMLElement | null} */ (e.target);
		if (target?.isContentEditable || target?.closest('input, textarea, select')) return;
		showBrand = !showBrand;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<main
	id="main"
	tabindex="-1"
	class="flex h-dvh w-full items-center justify-center overflow-hidden bg-brand-subtle focus:outline-none"
>
	<div class="hero-frame">
		<HeroSection datasets={heroDatasets} sectionClass="h-full" hideBrand={!showBrand} />
	</div>
</main>

<style>
	/* A recording format, not a layout token — hence pixels, and not a Tailwind size. The width
	   is the smallest of the cap, the viewport width, and the width a 16:9 box of the viewport's
	   height would have; the aspect ratio then gives the height. */
	.hero-frame {
		width: min(100%, 1440px, calc(100dvh * 16 / 9));
		aspect-ratio: 16 / 9;
	}
	/* The landing page rounds the map layer and its gradient overlay against the page's green; a
	   recording frame is edge to edge, so square them off here and leave the component alone. */
	.hero-frame :global(.rounded-sm) {
		border-radius: 0;
	}
</style>
