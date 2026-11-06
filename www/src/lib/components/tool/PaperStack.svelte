<script>
	import { ArrowUpRight } from '@lucide/svelte';
	import Citation from './Citation.svelte';

	/** @type {{ paper?: import('$lib/data/types').ToolReference, class?: string }} */
	let { paper = undefined, class: className = '' } = $props();

	// The terminal's chrome (CodeSample), so the commands and the publication beside them read as
	// a pair. At least square; a long citation grows it taller.
	const sheet = 'rounded-sm border border-border-weaker bg-paper-white';
</script>

<!-- Two copies of the front sheet peek out behind it, each shifted a step further down and to the
     right; they are decoration only. The wrapper is the front sheet's box, so the copies match its
     size exactly, and its margin leaves room for the offset. The front sheet is the link to the
     paper as a whole. Hovering or focusing the stack fans it out: the front sheet lifts up and to
     the left, the middle one follows by less, and the back one stays put. -->
<div class="relative mr-3 mb-3 max-w-xs {paper ? 'group/stack' : ''} {className}">
	<div class="absolute inset-0 translate-x-3 translate-y-3 {sheet}" aria-hidden="true"></div>
	<div
		class="absolute inset-0 translate-x-1.5 translate-y-1.5 transition-transform group-focus-within/stack:translate-x-1 group-focus-within/stack:translate-y-1 group-hover/stack:translate-x-1 group-hover/stack:translate-y-1 motion-reduce:transition-none {sheet}"
		aria-hidden="true"
	></div>
	{#if paper}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
		<a
			href={paper.url}
			target="_blank"
			rel="noopener noreferrer"
			class="group relative flex aspect-square flex-col justify-between gap-4 px-6 py-5 text-sm transition group-focus-within/stack:-translate-x-1 group-focus-within/stack:-translate-y-1 group-hover/stack:-translate-x-1 group-hover/stack:-translate-y-1 hover:border-brand hover:shadow-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none {sheet}"
		>
			<Citation {paper} titleClass="my-2 text-lg leading-snug" />
			<ArrowUpRight
				class="self-end text-brand transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
				size="20"
				aria-hidden="true"
			/>
			<span class="sr-only"> (opens in new tab)</span>
		</a>
	{:else}
		<p class="relative aspect-square px-6 py-5 text-sm text-ink-alt-weaker {sheet}">
			Publication forthcoming.
		</p>
	{/if}
</div>
