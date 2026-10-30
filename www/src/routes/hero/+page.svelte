<script>
	import HeroSection from '$lib/components/landing/HeroSection.svelte';
	import { heroCombos } from '$lib/components/landing/hero-tools.js';
	import { datasets } from '$lib/data/datasets';

	// The landing page's hero teaser alone, filling the viewport — for presenting and recording.
	// `x` toggles the logo + headline lockup, leaving the bare map.
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

<main id="main" tabindex="-1" class="h-dvh w-full overflow-hidden bg-white focus:outline-none">
	<HeroSection datasets={heroDatasets} sectionClass="h-full" hideBrand={!showBrand} />
</main>
