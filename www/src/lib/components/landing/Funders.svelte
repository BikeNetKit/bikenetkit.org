<script>
	import { Popover } from 'bits-ui';
	import Info from '@lucide/svelte/icons/info';
	import { logoWeight, sponsors } from '$lib/data/landing';

	// Only the sponsors that ship a logo appear in the bar; the rest are credited as text
	// in the landing page's sponsors card.
	const funders = sponsors.filter((s) => s.logo);

	let { mode = 'bar' } = $props();

	let open = $state(false);
</script>

{#if mode === 'bar'}
	<!-- Desktop: below xl a flex item so its width is reserved (cards centre in the space to
	     its left); at xl+ it is absolutely positioned bottom-right so the cards centre on the
	     full page width. -->
	<div
		class="pointer-events-none hidden shrink-0 items-end gap-1.5 self-end pr-5 pb-4 max-2xl:flex-col md:flex 2xl:absolute 2xl:right-5 2xl:bottom-4 2xl:z-20 2xl:items-center 2xl:gap-4 2xl:pr-0 2xl:pb-0"
	>
		<span class=" text-xs tracking-wide text-ink-weaker uppercase">Supported by</span>
		<div class="funder-row pointer-events-auto flex items-center gap-5">
			{#each funders as f (f.name)}
				<a
					href={f.url}
					target="_blank"
					rel="noopener noreferrer"
					title={f.name}
					aria-label="{f.name} (opens in new tab)"
					class="inline-flex"
				>
					<img
						src={f.logo}
						alt={f.name}
						style="aspect-ratio: {f.ratio}; height: calc(var(--funder-size) / {logoWeight(
							f.ratio
						)})"
						class="w-auto opacity-60 grayscale transition duration-200 ease-out hover:opacity-100 hover:grayscale-0"
					/>
				</a>
			{/each}
		</div>
	</div>
{/if}

{#if mode === 'mobile'}
	<!-- Mobile: info button, top-right, opens a popover with the same logos -->
	<div class="absolute top-4 right-4 z-30 md:hidden">
		<Popover.Root bind:open>
			<Popover.Trigger
				aria-label="Supported by"
				class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-brand-light bg-white/85 text-brand shadow-md backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-white"
			>
				<Info class="h-5 w-5" />
			</Popover.Trigger>

			<Popover.Content
				sideOffset={8}
				align="end"
				class="funder-popover z-50 flex w-60 flex-col gap-4 rounded-lg border border-border-weaker bg-white p-4 shadow-lg"
			>
				<span class="text-xs tracking-wide text-ink-weaker uppercase">Supported by</span>
				{#each funders as f (f.name)}
					<a
						href={f.url}
						target="_blank"
						rel="noopener noreferrer"
						title={f.name}
						aria-label="{f.name} (opens in new tab)"
						onclick={() => (open = false)}
						class="inline-flex"
					>
						<img
							src={f.logo}
							alt={f.name}
							style="aspect-ratio: {f.ratio}; height: calc(var(--funder-size) / {logoWeight(
								f.ratio
							)})"
							class="w-auto object-contain object-left opacity-90 grayscale"
						/>
					</a>
				{/each}
			</Popover.Content>
		</Popover.Root>
	</div>
{/if}

<style>
	/* Base height the equal-area logo sizing is derived from; the actual height of each mark is
	   this divided by its `logoWeight`. */
	.funder-row {
		--funder-size: 3.25rem;
	}

	@media (min-width: 96rem) {
		.funder-row {
			--funder-size: 3.75rem;
		}
	}

	/* `:global` because the class is handed to bits-ui's `Popover.Content`, so it never carries
	   this component's scoping hash. */
	:global(.funder-popover) {
		--funder-size: 2.75rem;
	}
</style>
