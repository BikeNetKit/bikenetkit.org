<script>
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import { toolBySlug } from '$lib/data/tools';
	import { toolIntro, toolApplyWhen } from '$lib/data/control-copy';
	import { resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';
	import { getMapTable } from './mapTable.svelte.js';

	let { toolSlug } = $props();

	const mapTable = getMapTable();

	const tool = $derived(toolBySlug[toolSlug]);
	// The catalog's `longDescription` is the tool page's copy: it walks the metrics and the seed
	// types, which the panels below explain one option at a time.
	const intro = $derived(toolIntro(toolSlug) ?? tool.shortDescription);
	const applyWhen = $derived(toolApplyWhen(toolSlug));
	// `toolSlug` is a plain string; every tool has a top-level page route, so cast the built path to
	// one concrete tool route so the typed router accepts it (resolve just echoes the pathname back).
	const toolHref = $derived(resolve(/** @type {'/growbikenet'} */ (`/${toolSlug}`)));
</script>

<CardPanel width="w-full" gap="gap-1.5" surface="dark" class="pointer-events-auto relative">
	<div class="flex items-baseline justify-between gap-2">
		<!-- h2: the page's h1 names tool and city, in the map layout, and is there before the map. -->
		<h2 class="display-name text-xl text-paper-white">
			<a
				href={toolHref}
				class="transition-colors hover:text-brand-subtle focus-visible:outline-paper-white"
			>
				<ToolName name={tool.name} parts={tool.nameParts} />
			</a>
		</h2>
		<a
			href={toolHref}
			class="block w-full text-right text-2xs font-semibold tracking-wider text-brand-subtle uppercase transition-colors hover:text-paper-white focus-visible:outline-paper-white"
		>
			<ArrowRight class="inline pb-1" size="16" aria-hidden="true"></ArrowRight> More info
		</a>
	</div>
	<p class="text-sm leading-snug text-brand-subtle">{intro}</p>
	<p class="sr-only">
		The map itself is a picture that screen readers cannot read. The panels on this page give its
		numbers as text, and the button after this gives a summary and the main results as tables.
	</p>
	<!-- Off-screen until focused, like a skip link: the map's own table control sits in the corner
	     stack, after the canvas in reading order. -->
	{#if mapTable?.available}
		<button
			type="button"
			aria-haspopup="dialog"
			onclick={(e) => mapTable.show(e.currentTarget)}
			class="sr-only self-start text-sm font-semibold text-paper-white underline focus-visible:not-sr-only focus-visible:outline-paper-white"
		>
			View as table
		</button>
	{/if}
	{#if applyWhen}
		<hr class="mt-2! mb-0! opacity-50" />
		<div class="mt-1 flex flex-col gap-0.5">
			<h2 class="m-0! text-xs font-semibold tracking-wider text-brand-light uppercase">
				Apply when…
			</h2>
			<p class="text-sm leading-snug text-brand-subtle">{applyWhen}</p>
		</div>
	{/if}
</CardPanel>
