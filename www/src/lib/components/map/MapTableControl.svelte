<script>
	import { CustomControl } from 'svelte-maplibre-gl';
	import Table2 from '@lucide/svelte/icons/table-2';
	import { getMapTable } from '../map-shell/mapTable.svelte.js';

	const table = getMapTable();
</script>

<!-- Expands to its label on hover and focus, like the report control. -->
<CustomControl position="bottom-right">
	<button
		type="button"
		class="map-ctrl-toggle map-ctrl-expand group/table"
		aria-haspopup="dialog"
		title="View as table"
		onclick={(e) => table?.show(e.currentTarget)}
	>
		<Table2
			class="h-4 w-4 shrink-0 transition-[margin-left] duration-200 group-hover/table:ml-2 group-focus-visible/table:ml-2"
			aria-hidden="true"
		/>
		<span
			class="max-w-0 overflow-hidden pr-0 pl-0 whitespace-nowrap transition-[max-width,padding] duration-200 group-hover/table:max-w-40 group-hover/table:pr-2 group-hover/table:pl-1.5 group-focus-visible/table:max-w-40 group-focus-visible/table:pr-2 group-focus-visible/table:pl-1.5"
		>
			View as table
		</span>
	</button>
</CustomControl>
