<script>
	import { Popover } from 'bits-ui';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import { actionLinksFor } from '$lib/data/contact-links';
	import TakeActionLinks from '$lib/components/TakeActionLinks.svelte';

	let { citySlug, cityName } = $props();

	const links = $derived(actionLinksFor(citySlug));
	let open = $state(false);
</script>

{#if links.length}
	<Popover.Root bind:open>
		<!-- The toolbar's ordinary white-and-outline chrome; the label alone is marked out, by a thick
		     half-strength lime underline. Icon-only below `lg`, where the flanks have no room for a
		     label beside the city name. -->
		<Popover.Trigger
			aria-label="Take action in {cityName}"
			class="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border-weaker bg-white px-2.5 text-sm font-bold text-brand transition-colors hover:border-brand hover:bg-brand hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none data-[state=open]:border-brand data-[state=open]:bg-brand data-[state=open]:text-white lg:px-3"
		>
			<Megaphone class="h-4 w-4 shrink-0" aria-hidden="true" />
			<span
				class="hidden whitespace-nowrap underline decoration-brand-vivid/50 decoration-4 underline-offset-2 lg:inline"
				>Take action!</span
			>
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				side="bottom"
				align="end"
				sideOffset={6}
				collisionPadding={8}
				class="z-50 flex w-80 flex-col gap-2 rounded-md border border-border-weaker bg-white p-3 text-left shadow-md"
			>
				<div class="px-2">
					<h2 class="font-display text-lg font-bold text-brand">Take action in {cityName}</h2>
					<p class="text-sm text-ink-alt">
						Bring what you see here to the people who plan your streets.
					</p>
				</div>
				<TakeActionLinks {links} />
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}
