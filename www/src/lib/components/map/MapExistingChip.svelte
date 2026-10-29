<script>
	import CardPanel from '$lib/components/ui/CardPanel.svelte';

	let { color, connectedColor = null, width = 'w-48' } = $props();
</script>

<!-- `pointer-events-auto`: see MapHUD. Every entry is a line layer, so its swatch is a short line. -->
<CardPanel surface="white" {width} class="pointer-events-auto">
	{#if connectedColor}
		<div class="flex flex-col gap-1 text-xs text-ink">
			<div class="flex items-center gap-2">
				<span
					class="inline-block h-0.5 w-4 shrink-0 rounded-full"
					style:background-color={connectedColor}
				></span>
				Largest component
			</div>
			<div class="flex items-center gap-2">
				<span
					class="inline-block h-0.5 w-4 shrink-0 rounded-full opacity-55"
					style:background-color={color}
				></span>
				Fragmented component
			</div>
		</div>
	{:else}
		<div class="flex items-center gap-2 text-xs text-ink">
			<span class="inline-block h-0.5 w-4 shrink-0 rounded-full" style:background-color={color}
			></span>
			Existing network
		</div>
	{/if}
</CardPanel>
