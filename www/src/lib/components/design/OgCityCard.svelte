<script>
	import { tick } from 'svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import wordmark from '$lib/assets/brand/logo-word-mark-horizontal.svg?url';

	/**
	 * A 1200×630 Open Graph card for a city, or for one tool's results in a city: the lockup and the
	 * city's name on the left, the result's screenshot in the circle the city pages frame it in.
	 * Rendered only on the capture routes under /og and photographed by `pnpm generate:og-cards`,
	 * which waits for `body[data-og-ready]`.
	 * @type {{ cityName: string, country?: string, tool?: { name: string, nameParts?: string[] },
	 *   caption: string, image: string }}
	 */
	let { cityName, country = undefined, tool = undefined, caption, image } = $props();

	// The name is the card's subject, so it is set as large as it fits: the largest size at which no
	// word overflows the column and the name takes at most two lines. Measured, because the column
	// holds "Lyon" at 8xl but not "Copenhagen".
	const SIZES = ['text-8xl', 'text-7xl', 'text-6xl', 'text-5xl'];
	let sizeIndex = $state(0);
	let fitted = $state(false);
	let imageLoaded = $state(false);
	const ready = $derived(fitted && imageLoaded);

	/** @param {HTMLElement} el */
	function fitName(el) {
		(async () => {
			await document.fonts.ready;
			for (let i = 0; i < SIZES.length; i++) {
				sizeIndex = i;
				await tick();
				const lineHeight = parseFloat(getComputedStyle(el).fontSize);
				if (el.scrollWidth <= el.clientWidth && el.offsetHeight <= lineHeight * 2.1) break;
			}
			fitted = true;
		})();
	}

	$effect(() => {
		if (ready) document.body.setAttribute('data-og-ready', 'true');
	});
</script>

<div class="flex items-center gap-12 bg-paper px-16" style="width: 1200px; height: 630px;">
	<div class="flex h-full min-w-0 flex-1 flex-col justify-between py-16">
		<img src={wordmark} alt="BikeNetKit" class="h-12 w-auto self-start" />
		<div>
			{#if tool}
				<p class="display-name text-4xl text-brand-vivid-dark">
					<ToolName name={tool.name} parts={tool.nameParts} />
				</p>
			{/if}
			<h1
				{@attach fitName}
				class="mt-2 font-display {SIZES[sizeIndex]} leading-none font-bold text-balance text-brand"
			>
				{cityName}
			</h1>
			{#if country}
				<p class="mt-4 text-3xl text-ink-alt-weaker">{country}</p>
			{/if}
		</div>
		<p class="max-w-none text-2xl text-ink-alt">{caption}</p>
	</div>
	<div
		class="shrink-0 overflow-hidden rounded-full border-2 border-brand-subtle bg-paper"
		style="width: 520px; height: 520px;"
	>
		<img src={image} alt="" class="size-full object-cover" onload={() => (imageLoaded = true)} />
	</div>
</div>
