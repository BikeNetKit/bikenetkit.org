<script>
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import { activeDataset } from '$lib/data/active-dataset.svelte.js';
	import { buildMapTables } from '$lib/data/map-table';
	import { cityBySlug } from '$lib/data/cities';
	import { cityCenter } from '$lib/data/city-tools';
	import { toolBySlug } from '$lib/data/tools';
	import MapDataTable from './MapDataTable.svelte';
	import { getMapTable } from './mapTable.svelte.js';

	/**
	 * The map as text and tables: the non-visual equivalent of the canvas. Built from the layers the
	 * map is painting (`ds.key`), not the route, so it never describes a half-switched dataset.
	 *
	 * @type {{ toolName: string, cityName: string, viewSummary?: string }}
	 */
	let { toolName, cityName, viewSummary = '' } = $props();

	const table = getMapTable();
	const ds = activeDataset();

	/** @type {HTMLElement | null} */
	let content = $state(null);

	const result = $derived.by(() => {
		const key = ds.key;
		if (!table?.open || !key || !ds.geojson) return null;
		const city = cityBySlug[key.city];
		return buildMapTables({
			key,
			toolName: toolBySlug[key.tool]?.name ?? key.tool,
			cityName: city?.name ?? key.city,
			center: city ? cityCenter(city) : null,
			geojson: ds.geojson,
			existingNetwork: ds.existingNetwork,
			blocks: ds.blocks
		});
	});
	const loading = $derived(!!table?.available && !result && ds.status !== 'error');
	const hasPlayback = $derived(ds.key?.tool !== 'fixbikenet');
</script>

{#if table}
	<Dialog.Root bind:open={() => table.open, (v) => (table.open = v)}>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-40 bg-brand-darkest/60" />
			<Dialog.Content
				bind:ref={content}
				tabindex={-1}
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					content?.focus();
				}}
				onCloseAutoFocus={(e) => {
					e.preventDefault();
					table.opener?.focus();
				}}
				class="fixed inset-0 z-50 flex flex-col bg-paper text-ink focus:outline-none md:inset-x-4 md:inset-y-8 md:mx-auto md:max-w-3xl md:rounded-md md:border md:border-border-weaker md:shadow-lg"
			>
				<div
					class="flex shrink-0 items-start justify-between gap-4 border-b border-border-weaker px-4 py-3 md:px-6"
				>
					<div class="flex flex-col gap-0.5">
						<Dialog.Title level={2} class="font-display text-lg font-bold text-brand">
							{toolName} results for {cityName}
						</Dialog.Title>
						{#if viewSummary && table.available}
							<p class="text-sm text-ink-alt">{viewSummary}</p>
						{/if}
					</div>
					<Dialog.Close
						aria-label="Close"
						class="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-brand hover:bg-brand-subtle"
					>
						<X class="size-5" aria-hidden="true" />
					</Dialog.Close>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6" aria-busy={loading}>
					{#if !table.available}
						<Dialog.Description class="text-sm text-ink-alt">
							{toolName} has no results for {cityName}.
						</Dialog.Description>
					{:else if ds.status === 'error' && !result}
						<Dialog.Description class="text-sm text-ink-alt">
							{toolName} could not load its network for this city. Check your connection and reload the
							page.
						</Dialog.Description>
					{:else if !result}
						<Dialog.Description class="text-sm text-ink-alt">
							Fetching the network…
						</Dialog.Description>
					{:else}
						<Dialog.Description class="max-w-prose text-base leading-relaxed text-ink">
							{result.summary}
						</Dialog.Description>
						{#if result.kind === 'tables'}
							{#if hasPlayback}
								<p class="mt-2 max-w-prose text-sm text-ink-alt">
									These tables describe the finished result. The values beside the map follow the
									playback.
								</p>
							{/if}
							<div class="mt-6">
								{#each result.tables as t (t.id)}
									<MapDataTable table={t} />
								{/each}
							</div>
						{/if}
					{/if}
				</div>

				{#if result?.kind === 'tables'}
					<div
						class="shrink-0 border-t border-border-weaker px-4 py-3 text-sm text-ink-alt md:px-6"
					>
						Every feature, with all of its values, is in the GeoJSON file from the map's export
						button.
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
