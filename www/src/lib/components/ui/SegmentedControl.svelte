<script>
	let {
		options,
		active,
		onSelect = undefined,
		hrefFor = undefined,
		capitalize = false,
		ariaLabel = undefined
	} = $props();
</script>

<div
	class="flex gap-0.5 self-start rounded-md border border-border-weaker bg-white p-0.5"
	role="group"
	aria-label={ariaLabel}
>
	{#each options as option (option.value)}
		{@const isActive = option.value === active}
		{@const disabled = option.available === false}
		{@const cls = `rounded px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:px-4 pointer-coarse:py-2.5 pointer-coarse:text-sm ${
			capitalize ? 'capitalize ' : ''
		}${
			disabled
				? 'cursor-not-allowed text-ink-alt-weaker italic'
				: isActive
					? 'bg-brand text-white'
					: 'text-brand hover:text-ink'
		}`}
		{#if disabled}
			<!-- This city has no data for the option: shown so the axis reads complete, but not
			     navigable — there is no page to link to. The `title` explains the muted state to a
			     pointer, the sr-only note to a screen reader (the same "why" ToolTabs gives its
			     unavailable tools); `data-value` still drives the description preview. `relative`
			     contains the sr-only note. -->
			<span data-value={option.value} class="relative {cls}" title="Not available for this city"
				>{option.label}<span class="sr-only"> — not available for this city</span></span
			>
		{:else if hrefFor}
			<!-- `data-value` lets a wrapper tell which option the pointer or focus is on — the
			     control panels preview an option's description on hover. Every option is its own URL,
			     so the active one is the current page. `keepfocus`: the keyed list reuses this same
			     link after the navigation, so focus stays on the option just chosen instead of
			     resetting to the page. -->
			<a
				href={hrefFor(option.value)}
				data-value={option.value}
				aria-current={isActive ? 'page' : undefined}
				data-sveltekit-keepfocus
				data-sveltekit-noscroll
				class={cls}>{option.label}</a
			>
		{:else}
			<button
				type="button"
				onclick={() => onSelect?.(option.value)}
				aria-pressed={isActive}
				data-value={option.value}
				class={cls}
			>
				{option.label}
			</button>
		{/if}
	{/each}
</div>
