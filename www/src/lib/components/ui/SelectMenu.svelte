<script>
	import { Popover } from 'bits-ui';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import RecommendedStar from './RecommendedStar.svelte';

	// The dropdown counterpart to SegmentedControl, for an axis with too many options for one row of
	// pills. Same option shape and the same two modes: links (`hrefFor`, a navigation per option, as
	// on the map pages) or buttons (`onSelect`). An option's optional `star` is the tooltip of a
	// star shown after its label.
	let {
		options,
		active,
		onSelect = undefined,
		hrefFor = undefined,
		ariaLabel = undefined
	} = $props();

	let open = $state(false);

	const current = $derived(options.find((o) => o.value === active));

	function choose(value) {
		open = false;
		onSelect?.(value);
	}
</script>

{#snippet optionBody(option)}
	{option.label}
	{#if option.star}
		<RecommendedStar label={option.star} />
	{/if}
{/snippet}

<Popover.Root bind:open>
	<Popover.Trigger
		aria-label={ariaLabel ? `${ariaLabel}: ${current?.label ?? active}` : undefined}
		class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border-weaker bg-white px-3 py-1.5 text-left text-sm font-medium text-brand hover:border-brand focus-visible:border-brand data-[state=open]:border-brand pointer-coarse:py-2.5"
	>
		<span class="inline-flex min-w-0 items-center gap-1">
			<span class="truncate">{current?.label ?? active}</span>
			{#if current?.star}
				<RecommendedStar label={current.star} />
			{/if}
		</span>
		<ChevronDown class="size-4 shrink-0 text-brand-muted" aria-hidden="true" />
	</Popover.Trigger>
	<!-- Portalled to `body` for the same reason as MetricHelp: the rail and the bottom sheet both
	     scroll, and either would clip a menu left in place. -->
	<Popover.Portal>
		<Popover.Content
			side="bottom"
			align="start"
			sideOffset={4}
			collisionPadding={8}
			class="z-50 flex max-h-96 w-(--bits-popover-anchor-width) flex-col overflow-y-auto rounded-md border border-border-weaker bg-white p-1 shadow-md"
		>
			{#each options as option (option.value)}
				{@const isActive = option.value === active}
				{@const cls = `flex items-center gap-1 rounded px-3 py-2 text-left text-sm font-medium transition-colors ${
					option.available === false
						? 'cursor-not-allowed text-ink-alt-weaker italic'
						: isActive
							? 'bg-brand text-white'
							: 'text-brand hover:bg-brand-subtle/60'
				}`}
				{#if option.available === false}
					<span class={cls} aria-disabled="true" title="Not available for this city"
						>{@render optionBody(option)}</span
					>
				{:else if hrefFor}
					<a
						href={hrefFor(option.value)}
						aria-current={isActive ? 'true' : undefined}
						class={cls}
						onclick={() => (open = false)}>{@render optionBody(option)}</a
					>
				{:else}
					<button
						type="button"
						aria-pressed={isActive}
						class={cls}
						onclick={() => choose(option.value)}>{@render optionBody(option)}</button
					>
				{/if}
			{/each}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
