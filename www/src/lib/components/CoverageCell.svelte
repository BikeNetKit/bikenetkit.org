<script>
	import { Star, Circle } from '@lucide/svelte';

	let { cell, city, column } = $props();

	const STATE_LABELS = {
		2: 'recommended',
		1: 'available',
		0: 'not available'
	};

	const label = $derived(STATE_LABELS[cell.rank]);
	const columnName = $derived(
		column.sublabel ? `${column.label} (${column.sublabel})` : column.label
	);
	const title = $derived(`${city.name} · ${columnName} — ${label}`);
</script>

{#snippet mark()}
	{#if cell.rank === 2}
		<Star class="h-4 w-4 fill-current text-brand" aria-hidden="true" />
	{:else if cell.rank === 1}
		<Circle class="h-4 w-4 text-brand-secondary" aria-hidden="true" />
	{:else}
		<span class="text-ink-weakest" aria-hidden="true">·</span>
	{/if}
{/snippet}

{#if cell.href}
	<a
		href={cell.href}
		{title}
		class="group/cell relative grid h-8 w-full place-items-center rounded transition-colors hover:bg-brand-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
	>
		<span class="transition-opacity group-hover/cell:opacity-0 group-focus-visible/cell:opacity-0">
			{@render mark()}
		</span>
		<span
			class="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100"
		>
			<span
				class="rounded-full bg-brand px-2 py-0.5 text-2xs font-semibold tracking-wider text-white uppercase"
			>
				View
			</span>
		</span>
		<span class="sr-only">{title}</span>
	</a>
{:else}
	<span class="grid h-8 w-full place-items-center" {title}>
		{@render mark()}
		<span class="sr-only">{label}</span>
	</span>
{/if}
