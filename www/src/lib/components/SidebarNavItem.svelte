<script>
	import { MapPin } from '@lucide/svelte';

	let {
		href = undefined,
		active = false,
		disabled = false,
		home = false,
		sublabel = undefined,
		onclick = undefined,
		children
	} = $props();

	// `relative`: the sr-only notes below are absolutely positioned, and without a positioned
	// ancestor inside the scrolling list they escape it and scroll the whole shell.
	const base =
		'relative flex items-center rounded-md px-3 py-2 text-sm font-semibold transition-colors';
	const interactive = $derived(
		active ? 'bg-brand text-white' : 'text-ink hover:bg-brand-subtle hover:text-brand'
	);
	const inert = 'cursor-default text-ink-alt-weakest';

	/** @type {HTMLAnchorElement | null} */
	let el = $state(null);

	// Long lists (403 cities) routinely have the active entry scrolled out of view — after a
	// search-driven or direct navigation, jump the list so the reader can see what's selected.
	$effect(() => {
		if (active) el?.scrollIntoView({ block: 'nearest' });
	});
</script>

{#if disabled}
	<span class="{base} {inert}">
		{@render children()}<span class="sr-only"> (coming soon)</span>
	</span>
{:else}
	<a
		bind:this={el}
		{href}
		{onclick}
		aria-current={active ? 'page' : undefined}
		class="{base} {interactive}"
	>
		<span class="flex min-w-0 flex-1 flex-col">
			<span class="truncate">{@render children()}</span>
			{#if sublabel}
				<span
					class="truncate text-xs font-normal {active ? 'text-white/70' : 'text-ink-alt-weaker'}"
				>
					{sublabel}
				</span>
			{/if}
		</span>
		{#if home}
			<MapPin
				class="ml-auto h-3.5 w-3.5 shrink-0 {active ? 'text-white' : 'text-brand-vivid'}"
				aria-hidden="true"
			/>
			<span class="sr-only"> (your city)</span>
		{/if}
	</a>
{/if}
