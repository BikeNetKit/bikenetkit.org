<script>
	import { mapOverlayPortal } from './mapOverlay.js';

	let { children } = $props();

	// Portalled to the `controls` slot of MapHost's left rail (a sibling of the map), so the panels
	// inherit the app font rather than `.maplibregl-map`'s vendor rules — and so the rail, not this
	// column, decides how much height the panels get and when they start scrolling.
	const portalControls = mapOverlayPortal('controls');
</script>

<!-- `pointer-events-none` on the column and `pointer-events-auto` on each card (the panels set it
     themselves): the gutters between panels stay draggable map. -->
<div {@attach portalControls} class="pointer-events-none flex w-full flex-col gap-2.5">
	{@render children()}
</div>
