<script>
	let { label, value = null, emphasis = false, spaced = null, children = null } = $props();

	// Emphasised rows get a top margin to separate them from the property rows above.
	// When there is nothing above (e.g. fixbikenet, whose only row is the metric), callers
	// pass spaced={false} to drop the margin so the tooltip has no empty band on top.
	const showMargin = $derived(spaced ?? emphasis);
</script>

<div class="flex items-baseline justify-between gap-1 {showMargin ? 'mt-4' : ''}">
	<div
		class={emphasis
			? 'text-2xs font-semibold tracking-wider text-ink uppercase'
			: 'text-2xs tracking-wider text-ink-weaker uppercase'}
	>
		{label}
	</div>
	<div class="grow border-b border-border-weakest"></div>
	<div
		class={emphasis
			? 'text-lg leading-tight font-semibold tabular-nums'
			: 'text-xs leading-tight tabular-nums'}
	>
		{#if children}
			{@render children()}
		{:else}
			{value}
		{/if}
	</div>
</div>
