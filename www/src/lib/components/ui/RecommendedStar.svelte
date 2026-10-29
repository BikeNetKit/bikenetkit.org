<script>
	import { Tooltip } from 'bits-ui';
	import Star from '@lucide/svelte/icons/star';
	import { asNonButtonProps } from './tooltip-trigger.js';

	// `plain` drops the tooltip, for a star that already sits inside another tooltip's trigger.
	// `label` replaces the default "Recommended for …" sentence, for a star that means something else.
	let { cityName = '', label = undefined, plain = false } = $props();

	const text = $derived(label ?? `Recommended for ${cityName}`);
</script>

{#snippet star(props)}
	<span {...props} class="relative inline-flex shrink-0">
		<Star class="h-3.5 w-3.5 text-brand-vivid" fill="currentColor" aria-hidden="true" />
		<span class="sr-only">{text}</span>
	</span>
{/snippet}

{#if plain}
	{@render star({})}
{:else}
	<!-- A non-focusable trigger: the star sits inside a link or button, and a second tab stop in
	     there is invalid. Keyboard and screen-reader users get the sr-only sentence instead. -->
	<Tooltip.Provider delayDuration={150}>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					{@render star(asNonButtonProps(props))}
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Portal>
				<Tooltip.Content
					side="bottom"
					sideOffset={6}
					aria-hidden="true"
					data-star-tip
					class="z-50 rounded-sm border border-border-weaker bg-white px-3 py-1.5 text-sm leading-snug text-ink-alt shadow-md"
				>
					{text}
				</Tooltip.Content>
			</Tooltip.Portal>
		</Tooltip.Root>
	</Tooltip.Provider>
{/if}
