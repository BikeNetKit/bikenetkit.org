<script>
	import { Popover } from 'bits-ui';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import RecommendedStar from '$lib/components/ui/RecommendedStar.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';

	// Compact-only counterpart to ToolTabs: the pill-strip tab markup and this menu-row markup share
	// nothing but the option list, so it is its own component rather than a `compact` prop on
	// ToolTabs.
	let { toolSlug, toolOptions, cityName, search = '' } = $props();

	let open = $state(false);

	const current = $derived(toolOptions.find((o) => o.slug === toolSlug));

	function selectTool() {
		open = false;
	}
</script>

<Popover.Root bind:open>
	<!-- `data-tool-anchor`: on compact, `UnavailableNotice`'s caret points here. -->
	<Popover.Trigger
		data-tool-anchor
		class="relative flex min-h-11 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 hover:bg-brand-subtle focus-visible:bg-brand-subtle data-[state=open]:bg-brand-subtle"
	>
		<!-- The visible tool name is the accessible name, prefixed rather than replaced, so speech
		     input users can say what they see (WCAG 2.5.3). -->
		<span class="sr-only">Change tool: </span>
		<span class="inline-flex min-w-0 items-center gap-1">
			<span class="truncate text-base font-semibold whitespace-nowrap text-brand">
				{#if current}<ToolName
						name={current.name}
						parts={current.nameParts}
					/>{:else}{toolSlug}{/if}
			</span>
			{#if current?.recommended}
				<RecommendedStar {cityName} />
			{/if}
		</span>
		<ChevronDown class="size-4 shrink-0 text-brand-muted" aria-hidden="true" />
	</Popover.Trigger>

	<Popover.Content
		sideOffset={6}
		align="start"
		class="z-50 flex max-h-96 min-w-48 flex-col overflow-y-auto rounded-md border border-border-weaker bg-white p-1 shadow-md"
	>
		{#each toolOptions as option (option.slug)}
			{@const isCurrent = option.slug === toolSlug}
			<a
				href={option.href + search}
				aria-current={isCurrent ? 'page' : undefined}
				title={option.available ? undefined : `No ${option.name} data for ${cityName}`}
				onclick={selectTool}
				class="relative rounded px-3 py-2 text-sm font-medium transition-colors {isCurrent
					? 'bg-brand text-white'
					: option.available
						? 'text-brand hover:bg-brand-subtle/60'
						: 'text-brand-muted italic hover:bg-brand-subtle/60'}"
			>
				<span class="inline-flex items-center gap-1">
					<ToolName name={option.name} parts={option.nameParts} />
					{#if !option.available}
						<span class="sr-only"> — no results for {cityName} yet</span>
					{/if}
					{#if option.recommended}
						<RecommendedStar {cityName} />
					{/if}
				</span>
			</a>
		{/each}
	</Popover.Content>
</Popover.Root>
