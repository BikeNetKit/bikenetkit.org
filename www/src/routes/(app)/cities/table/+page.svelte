<script>
	import { resolve } from '$app/paths';
	import { ArrowDown, ArrowUp, Circle, Star, X } from '@lucide/svelte';
	import { COVERAGE_COLUMNS } from '$lib/data/coverage';
	import { toolBySlug } from '$lib/data/tools';
	import CoverageCell from '$lib/components/CoverageCell.svelte';
	import CountryChip from '$lib/components/ui/CountryChip.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';

	let { data } = $props();

	let sortKey = $state('city');
	let sortDir = $state('asc');
	// There is no search field here — 403 rows are browsed by sorting — so the country chips
	// double as the filter control.
	/** @type {string | null} */
	let countryFilter = $state(null);

	const countryName = $derived(
		data.rows.find((r) => r.city.countryCode === countryFilter)?.city.country ?? countryFilter
	);

	function toggleSort(key) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			// Tool columns open "best first"; the city column is the alphabetical reset.
			sortDir = key === 'city' ? 'asc' : 'desc';
		}
	}

	const sorted = $derived.by(() => {
		const sign = sortDir === 'asc' ? 1 : -1;
		const rows = countryFilter
			? data.rows.filter((r) => r.city.countryCode === countryFilter)
			: data.rows;
		return [...rows].sort((a, b) => {
			if (sortKey !== 'city') {
				const byRank = a.cells[sortKey].rank - b.cells[sortKey].rank;
				if (byRank !== 0) return sign * byRank;
				return a.city.name.localeCompare(b.city.name);
			}
			return sign * a.city.name.localeCompare(b.city.name);
		});
	});

	const ariaSort = (key) =>
		sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

	const viewOptions = [
		{ value: 'grid', label: 'Grid' },
		{ value: 'table', label: 'Table' }
	];
	const viewHref = (value) => (value === 'grid' ? resolve('/cities') : resolve('/cities/table'));
</script>

{#snippet sortArrow(key)}
	{#if sortKey === key}
		{#if sortDir === 'asc'}
			<ArrowUp class="h-3 w-3 shrink-0" aria-hidden="true" />
		{:else}
			<ArrowDown class="h-3 w-3 shrink-0" aria-hidden="true" />
		{/if}
	{/if}
{/snippet}

<!-- Compact: the page is one scroller on both axes, so the intro and the table scroll away together
     while the header row (`top-0`) and the city column (`left-0`) stick against that same box. The
     intro is `sticky left-0` so a sideways swipe leaves it in place. Desktop: the intro stays put
     and the table scrolls in its own pane below it. -->
<div class="relative h-full overflow-auto md:flex md:flex-col md:overflow-hidden">
	<div class="mx-auto w-full max-w-5xl shrink-0 px-6 pt-12 pb-8 max-md:sticky max-md:left-0">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<h1 class="display-name text-4xl text-brand">Tool coverage</h1>
			<SegmentedControl
				options={viewOptions}
				active="table"
				hrefFor={viewHref}
				ariaLabel="City view"
			/>
		</div>

		<p class="mt-8 max-w-2xl text-ink">
			Which analyses exist for which city, and which ones we recommend as a starting point. Click a
			column heading to sort, or a marked cell to open the map.
		</p>

		{#if countryFilter}
			<div class="mt-6">
				<button
					type="button"
					onclick={() => (countryFilter = null)}
					class="inline-flex items-center gap-2 rounded-full border border-brand bg-brand-subtle px-3 py-1 text-xs text-brand hover:bg-brand hover:text-white"
				>
					{countryName} ({countryFilter}) — {sorted.length} cities
					<X class="h-3 w-3" aria-hidden="true" />
					<span class="sr-only">Clear country filter</span>
				</button>
			</div>
		{/if}

		<ul aria-label="Legend" class="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-alt">
			<li class="flex items-center gap-2">
				<Star class="h-4 w-4 fill-current text-brand" aria-hidden="true" />
				Recommended
			</li>
			<li class="flex items-center gap-2">
				<Circle class="h-4 w-4 text-brand-secondary" aria-hidden="true" />
				Available
			</li>
			<li class="flex items-center gap-2">
				<span class="w-4 text-center text-ink-weakest" aria-hidden="true">·</span>
				Not available
			</li>
		</ul>
	</div>

	<!-- `relative` on both scrollers is load-bearing: the sr-only cell labels are `position:
	     absolute`, and without a positioned ancestor they resolve against the document and add
	     ~700px of page scroll.

	     The padding sits on this wrapper, never on a scroller: sticky `left-0` resolves against the
	     scroller's padding edge, so padding there pinned the city column 24px in and let scrolled
	     cells show through on its left. Compact, `w-max` lets the wrapper grow with the table so its
	     right padding scrolls into view too. -->
	<div
		class="pb-12 max-md:w-max max-md:min-w-full max-md:px-4 md:relative md:mx-auto md:w-full md:max-w-5xl md:flex-1 md:overflow-auto md:px-6"
	>
		<table class="w-full border-collapse text-sm">
			<caption class="sr-only">
				Cities by tool, showing which analyses are available and which are recommended
			</caption>
			<thead>
				<tr>
					<th
						scope="col"
						aria-sort={ariaSort('city')}
						class="sticky top-0 left-0 z-20 h-px border-b border-border-weaker bg-paper p-0 text-left align-top"
					>
						<button
							type="button"
							onclick={() => toggleSort('city')}
							class="flex h-full w-full items-start rounded px-2 py-3 font-display text-sm font-semibold text-brand hover:bg-brand-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
						>
							<span class="flex items-center gap-1">
								City
								{@render sortArrow('city')}
							</span>
						</button>
					</th>
					{#each COVERAGE_COLUMNS as col (col.id)}
						<th
							scope="col"
							aria-sort={ariaSort(col.id)}
							class="sticky top-0 z-10 h-px border-b border-border-weaker bg-paper p-0 align-top"
						>
							<button
								type="button"
								onclick={() => toggleSort(col.id)}
								class="flex h-full w-full flex-col items-center gap-0.5 rounded px-2 py-3 hover:bg-brand-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
							>
								<span class="flex items-center gap-1 font-display text-sm font-semibold text-brand">
									<ToolName name={col.label} parts={toolBySlug[col.tool]?.nameParts} />
									{@render sortArrow(col.id)}
								</span>
								{#if col.sublabel}
									<span class="text-xs text-ink-weaker">{col.sublabel}</span>
								{/if}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sorted as row (row.city.slug)}
					<tr class="group/row border-t border-border-weakest">
						<th
							scope="row"
							class="sticky left-0 z-10 bg-paper px-2 py-1 text-left font-medium transition-colors group-hover/row:bg-paper-brand"
						>
							<div class="flex items-center justify-between gap-2">
								<a
									href={resolve('/(app)/cities/[city]', { city: row.city.slug })}
									class="link-quiet"
								>
									{row.city.name}
								</a>
								{#if row.city.countryCode}
									<CountryChip
										code={row.city.countryCode}
										country={row.city.country}
										onclick={() => (countryFilter = row.city.countryCode ?? null)}
									/>
								{/if}
							</div>
						</th>
						{#each COVERAGE_COLUMNS as col (col.id)}
							<td class="px-1 transition-colors group-hover/row:bg-paper-brand">
								<CoverageCell cell={row.cells[col.id]} city={row.city} column={col} />
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
