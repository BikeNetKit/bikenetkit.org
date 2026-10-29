<script>
	// One stroke at true MapLibre pixel width. `casing` draws the hover/selection treatment: an ink
	// line `width + 2 × inset` wide under the core.
	/** @type {{ color: string, width: number, opacity?: number, casing?: { color: string, inset: number } | null, length?: number }} */
	let { color, width, opacity = 1, casing = null, length = 96 } = $props();

	const outer = $derived(casing ? width + 2 * casing.inset : width);
	const height = $derived(Math.ceil(outer) + 8);
	const pad = $derived(Math.ceil(outer / 2) + 2);
</script>

<svg width={length} {height} viewBox="0 0 {length} {height}" aria-hidden="true" class="block">
	{#if casing}
		<line
			x1={pad}
			x2={length - pad}
			y1={height / 2}
			y2={height / 2}
			stroke={casing.color}
			stroke-width={outer}
			stroke-linecap="round"
		/>
	{/if}
	<line
		x1={pad}
		x2={length - pad}
		y1={height / 2}
		y2={height / 2}
		stroke={color}
		stroke-width={width}
		stroke-opacity={opacity}
		stroke-linecap="round"
	/>
</svg>
