<script>
	import HeroSection from '$lib/components/landing/HeroSection.svelte';
	import BottomTabs from './BottomTabs.svelte';
	import Funders from './Funders.svelte';

	let { datasets = [] } = $props();
</script>

<div class="relative flex h-dvh flex-col overflow-hidden bg-brand-subtle p-3">
	<main
		id="main"
		tabindex="-1"
		class="flex flex-1 flex-col pb-0 focus:outline-none md:pb-24 2xl:pb-20"
	>
		<HeroSection {datasets} sectionClass="flex-1" linkCredit={false}></HeroSection>
	</main>

	<Funders mode="mobile" />

	<!-- Bottom bar: below xl the funders row is a flex item, so the cards centre in the
	     remaining space to its left. At xl+ the funders row is positioned absolutely
	     (bottom-right), freeing the cards to centre across the full page width as before.
	     On mobile the funders bar is hidden, so the cards also centre full width. -->
	<div class="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end">
		<div class="relative h-0 flex-1">
			<!-- Centring frame: spans the full remaining space (cards centre at 50%); on xl the
			     left edge shifts to 20% so the inset-centred cards land at ~60% of that space. -->
			<div class="absolute inset-x-0 bottom-0 h-0 xl:left-[20%] 2xl:left-0">
				<BottomTabs />
			</div>
		</div>
		<Funders mode="bar" />
	</div>
</div>
