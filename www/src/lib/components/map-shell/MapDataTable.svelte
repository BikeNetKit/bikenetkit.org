<script>
	/** @type {{ table: import('$lib/data/map-table').DataTable }} */
	let { table } = $props();

	const headingId = $derived(`map-table-${table.id}`);
</script>

<div class="mt-6 first:mt-0">
	<h3 id={headingId} class="font-display text-base font-bold text-brand">{table.title}</h3>
	{#if table.note}
		<p class="mt-1 text-sm text-ink-alt">{table.note}</p>
	{/if}
	<!-- Focusable so a keyboard can scroll it sideways on a phone; `relative` anchors the sr-only
	     caption inside it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		role="group"
		aria-labelledby={headingId}
		tabindex="0"
		class="relative mt-2 overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-brand"
	>
		<table class="w-full border-collapse text-sm">
			<caption class="sr-only">{table.caption}</caption>
			<thead>
				<tr>
					{#each table.columns as column, c (c)}
						<th
							scope="col"
							class="border-b border-border-weaker px-2 py-2 align-bottom text-xs font-semibold text-ink-alt {column.numeric
								? 'text-right'
								: 'text-left'}"
						>
							{column.label}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each table.rows as row, r (r)}
					<tr class="border-t border-border-weaker first:border-t-0">
						<th scope="row" class="px-2 py-1.5 text-left font-medium whitespace-nowrap text-ink">
							{row.header}
						</th>
						{#each row.cells as cell, c (c)}
							<td
								class="px-2 py-1.5 text-ink {table.columns[c + 1]?.numeric
									? 'text-right whitespace-nowrap tabular-nums'
									: 'text-left'}"
							>
								{cell}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
