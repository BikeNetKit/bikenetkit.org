<script>
	// Anchor point in container pixels, re-projected from the live camera by the caller (see
	// `cameraAnchor`) rather than captured once at pointer time — so it moves as the map does.
	// `offset` is the gap kept between the anchor and the box on whichever side it lands.
	let { x, y, offset = 16, containerWidth = 0, containerHeight = 0, children } = $props();

	// Breathing room from the map's edges. The overlay is `overflow-clip`, so this is what keeps
	// the box from being shaved rather than what prevents scrollbars.
	const MARGIN = 8;

	let w = $state(0);
	let h = $state(0);

	// Flip below the anchor when drawing above would run under the toolbar.
	const below = $derived(h > 0 && y - offset - h < MARGIN);

	// Positions stay expressed as the existing anchor + `translate`, with a corrective shift on
	// top: before the box has been measured (`w`/`h` still 0) the shift is 0, so the very first
	// frame renders exactly where it renders today rather than jumping in from a wrong origin.
	function shift(start, size, extent) {
		if (!size || !extent) return 0;
		if (start < MARGIN) return MARGIN - start;
		const over = start + size - (extent - MARGIN);
		return over > 0 ? -over : 0;
	}

	const shiftX = $derived(shift(x - w / 2, w, containerWidth));
	const anchorY = $derived(below ? y + offset : y - offset);
	const shiftY = $derived(shift(below ? anchorY : anchorY - h, h, containerHeight));
</script>

<div
	bind:clientWidth={w}
	bind:clientHeight={h}
	data-testid="map-tooltip"
	class="pointer-events-none absolute z-30 max-w-72 rounded-lg border border-border-weaker bg-white p-3 font-sans shadow-md"
	style="left: {x + shiftX}px; top: {anchorY + shiftY}px; translate: -50% {below ? '0' : '-100%'};"
>
	<div class="flex min-w-0 flex-col gap-1.5">{@render children()}</div>
</div>
