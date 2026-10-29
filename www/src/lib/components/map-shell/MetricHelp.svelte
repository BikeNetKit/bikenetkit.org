<script>
	import { Popover } from 'bits-ui';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import IconButton from '$lib/components/ui/IconButton.svelte';

	/** @type {{ help: import('$lib/data/metric-help').MetricHelp }} */
	let { help } = $props();

	let open = $state(false);
	const uid = $props.id();
	const titleId = `${uid}-title`;
</script>

<Popover.Root bind:open>
	<!-- `child` hands bits-ui's trigger attributes (aria-expanded, data-state, the handlers) to the
	     shared IconButton instead of re-inlining its class string on a bare trigger. -->
	<Popover.Trigger>
		{#snippet child({ props })}
			<IconButton variant="ghost" size="sm" ariaLabel="How is this calculated?" {...props}>
				<CircleHelp class="size-4" aria-hidden="true" />
			</IconButton>
		{/snippet}
	</Popover.Trigger>
	<!-- Portalled to `body`: the panel scrolls inside the rail's overflow on desktop and inside the
	     bottom sheet on mobile, either of which would clip a popover left in place. Opens below;
	     bits-ui flips it upward when the trigger sits low, which is where the sheet puts it. -->
	<Popover.Portal>
		<!-- `role="dialog"` because bits-ui leaves the content unnamed while the trigger already
		     announces `aria-haspopup="dialog"`; with the heading as its label, a screen reader hears
		     what opened. -->
		<Popover.Content
			role="dialog"
			side="bottom"
			align="end"
			sideOffset={6}
			collisionPadding={8}
			aria-labelledby={titleId}
			class="z-50 flex w-72 flex-col gap-2 rounded-md border border-border-weaker bg-white p-3 text-left shadow-md"
		>
			<h3 id={titleId} class="text-xs font-semibold tracking-wider text-ink-alt-weaker uppercase">
				{help.heading}
			</h3>
			{#each help.paragraphs as paragraph (paragraph)}
				<p class="text-sm leading-snug text-ink-alt">{paragraph}</p>
			{/each}
			{#if help.links.length}
				<p class="text-sm leading-snug text-ink-alt-weaker">
					Read more:
					{#each help.links as link, i (link.href)}
						{#if i > 0}·{/if}
						<a href={link.href} class="link relative" target="_blank" rel="noopener noreferrer">
							{link.label}
							<span class="sr-only"> (opens in new tab)</span></a
						>
					{/each}
				</p>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
