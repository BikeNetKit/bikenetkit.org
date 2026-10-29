<script>
	import { Tooltip } from 'bits-ui';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import RecommendedStar from '$lib/components/ui/RecommendedStar.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import { asNonButtonProps } from '$lib/components/ui/tooltip-trigger.js';

	let { toolSlug, toolOptions, cityName, search = '' } = $props();
</script>

<!-- `plain`: an unavailable tab is itself a tooltip trigger, and the star must not nest a second one. -->
{#snippet tabLabel(option, plain = false)}
	<span class="inline-flex items-center gap-1">
		<ToolName name={option.name} parts={option.nameParts} />
		{#if option.recommended}
			<RecommendedStar {cityName} {plain} />
		{/if}
	</span>
{/snippet}

<!-- Links with `aria-current`, not a `tablist`: every tab is a page navigation, and a tab widget's
     roving-tabindex model laid over real navigation misleads screen readers.

     Styled as a `SegmentedControl` — same container, same pills — one size up (`text-sm`) because
     this is the page's primary switch. Not the component itself: these options need a per-option
     tooltip and a muted state for tools the city has no data for.

     `data-tool-anchor` marks the current tab for `UnavailableNotice`, whose caret points at it. -->
<Tooltip.Provider delayDuration={150}>
	<nav
		aria-label="Tools"
		class="flex shrink-0 gap-0.5 rounded-md border border-border-weaker bg-white p-0.5"
	>
		{#each toolOptions as option (option.slug)}
			{@const isCurrent = option.slug === toolSlug}
			{@const cls = `rounded px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:py-2.5 ${
				isCurrent
					? 'bg-brand text-white'
					: option.available
						? 'text-brand hover:text-ink'
						: 'text-brand-muted italic hover:text-brand'
			}`}
			{#if option.available || isCurrent}
				<a
					href={option.href + search}
					aria-current={isCurrent ? 'page' : undefined}
					data-tool-anchor={isCurrent ? '' : undefined}
					class={cls}
				>
					{@render tabLabel(option)}
				</a>
			{:else}
				<!-- Tools without data for this city stay links: the page they land on says so and
				     points at cities that do have them, which a disabled tab cannot. The tooltip says
				     it before the click, in the same amber as that page's notice. -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<a {...asNonButtonProps(props)} href={option.href + search} class={cls}>
								{@render tabLabel(option, true)}
								<span class="sr-only">— no results for {cityName} yet</span>
							</a>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content
							side="bottom"
							sideOffset={6}
							aria-hidden="true"
							data-tool-tip
							class="z-50 flex max-w-64 items-start gap-1.5 rounded-sm border border-notice-border bg-notice-subtle px-3 py-2 text-sm leading-snug text-ink-alt shadow-md"
						>
							<CircleAlert class="mt-0.5 size-4 shrink-0 text-notice" aria-hidden="true" />
							<span><ToolName name={option.name} /> has no results for {cityName} yet.</span>
						</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>
			{/if}
		{/each}
	</nav>
</Tooltip.Provider>
