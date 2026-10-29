<script>
	import { browser } from '$app/environment';
	import BannerArt from '$lib/components/design/BannerArt.svelte';
	import { CANVAS, bannerLayout } from '$lib/design/banner.js';
	import { loadBrandFont } from '$lib/design/sublogo.js';
	import { tools } from '$lib/data/tools';

	let { data } = $props();

	// The generator addresses images by file stem; `bikenetkit` and `more-tools` name the project
	// and the collected static-tools page, every other name is a tool slug. Anything else renders
	// nothing and never signals ready, so a typo fails the capture instead of writing a blank card.
	const EXTRA_NAMES = { bikenetkit: 'BikeNetKit', 'more-tools': 'More tools' };
	const text = $derived(
		EXTRA_NAMES[data.name] ?? tools.find((tool) => tool.slug === data.name)?.name
	);

	// The font is fetched at runtime, so this stays on the pending branch until it lands.
	const fontRequest = browser ? loadBrandFont() : new Promise(() => {});

	// Set once the artwork has decoded too — the capture waits on this attribute rather than
	// on a timer, so it can never photograph the lockup on an empty background.
	function markReady() {
		document.body.setAttribute('data-og-ready', 'true');
	}
</script>

<svelte:head>
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
	</style>
</svelte:head>

{#await fontRequest then font}
	{#if text}
		{@const layout = bannerLayout(font, text, CANVAS.og)}
		{#if layout}
			<BannerArt
				{layout}
				label="{text} social preview"
				class="block"
				onready={markReady}
				style="width: {layout.width}px; height: {layout.height}px;"
			/>
		{/if}
	{/if}
{/await}
