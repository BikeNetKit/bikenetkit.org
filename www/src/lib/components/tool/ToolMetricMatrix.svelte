<script>
	import CityTeaser from '$lib/components/CityTeaser.svelte';
	import { humanizeLabel } from '$lib/utils/formatters';

	let { metrics, types, available, hrefFor, imageFor, altFor, metricLabel } = $props();

	/** With a single type the matrix degenerates to a list — drop the axis entirely. */
	const singleType = $derived(types.length === 1);

	const labelFor = (metric) => metricLabel?.(metric) ?? humanizeLabel(metric);
	const altOr = (metric, type) => altFor?.(metric, type) ?? `${metric} ${type}`;
</script>

{#snippet noData(extraClass)}
	<div
		class={[
			'grid aspect-square w-full place-items-center rounded-full border-2 border-dashed border-brand-subtle text-xs text-ink-alt-weaker',
			extraClass
		]}
	>
		No data
	</div>
{/snippet}

{#if singleType}
	{@const type = types[0]}
	<div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		{#each metrics as metric (metric)}
			<div class="capitalize">
				{#if available(metric, type)}
					<CityTeaser
						href={hrefFor(metric, type)}
						image={imageFor(metric, type)}
						alt={altOr(metric, type)}
						label={labelFor(metric)}
					/>
				{:else}
					<div class="flex flex-col items-center gap-3">
						{@render noData()}
						<span class="font-display text-lg font-bold text-ink-alt-weaker">
							{labelFor(metric)}
						</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{:else}
	<!-- A table to a screen reader, a CSS grid on screen: the rows are `display: contents`, so each
	     teaser is announced with its metric and type headers while the grid keeps laying out the
	     cells directly. A real <table> would trade that layout for table sizing rules. -->
	<div
		role="table"
		aria-label="Results by metric and type"
		class="mt-8 grid gap-x-6 gap-y-8"
		style="grid-template-columns: auto repeat({types.length}, minmax(0, 1fr));"
	>
		<div role="row" class="contents">
			<div role="columnheader" class="relative"><span class="sr-only">Metric</span></div>
			{#each types as type (type)}
				<div
					role="columnheader"
					class="text-center font-display text-sm font-semibold text-brand capitalize"
				>
					{humanizeLabel(type)}
				</div>
			{/each}
		</div>

		{#each metrics as metric (metric)}
			<div role="row" class="contents">
				<div
					role="rowheader"
					class="flex w-min items-center text-sm font-medium text-ink-alt capitalize"
				>
					{labelFor(metric)}
				</div>
				{#each types as type (type)}
					<div role="cell" class="flex justify-center">
						{#if available(metric, type)}
							<CityTeaser
								href={hrefFor(metric, type)}
								image={imageFor(metric, type)}
								alt={altOr(metric, type)}
								class="w-full max-w-96"
							/>
						{:else}
							{@render noData('m-2')}
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}
