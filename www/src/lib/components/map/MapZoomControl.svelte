<script>
	import { CustomControl, getMapContext } from 'svelte-maplibre-gl';
	import { createSubscriber } from 'svelte/reactivity';
	import Home from '@lucide/svelte/icons/home';

	/** @type {{ homeDisabled: boolean, onhome: () => void }} */
	let { homeDisabled, onhome } = $props();

	const mapCtx = getMapContext();

	const zoomChanges = createSubscriber((update) => {
		const m = mapCtx.map;
		m?.on('zoom', update);
		return () => m?.off('zoom', update);
	});

	const atMax = $derived.by(() => {
		zoomChanges();
		const m = mapCtx.map;
		return !!m && m.getZoom() >= m.getMaxZoom();
	});
	const atMin = $derived.by(() => {
		zoomChanges();
		const m = mapCtx.map;
		return !!m && m.getZoom() <= m.getMinZoom();
	});
</script>

<!-- MapLibre's NavigationControl, minus the compass, plus the reset-view button in its slot. The
     zoom buttons carry the vendor's own classes, so its stylesheet draws the same +/- glyphs and
     disabled state. The compass went because the reset button already says "the view has moved":
     `isAtDefaultView` counts bearing and pitch, so rotating the map is enough to enable it.
     The end states are `aria-disabled`, not `disabled`: zooming to the limit or resetting the view
     would otherwise disable the very button the reader just pressed and drop their focus. -->
<CustomControl position="bottom-right">
	<button
		type="button"
		class="maplibregl-ctrl-zoom-in"
		aria-label="Zoom in"
		title="Zoom in"
		aria-disabled={atMax || undefined}
		onclick={(e) => {
			if (!atMax) mapCtx.map?.zoomIn({}, { originalEvent: e });
		}}
	>
		<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>
	</button>
	<button
		type="button"
		class="maplibregl-ctrl-zoom-out"
		aria-label="Zoom out"
		title="Zoom out"
		aria-disabled={atMin || undefined}
		onclick={(e) => {
			if (!atMin) mapCtx.map?.zoomOut({}, { originalEvent: e });
		}}
	>
		<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>
	</button>
	<button
		type="button"
		class="map-ctrl-toggle"
		aria-disabled={homeDisabled || undefined}
		aria-label="Reset map view"
		title={homeDisabled ? 'Already at the default view' : 'Reset to the default view'}
		onclick={() => {
			if (!homeDisabled) onhome();
		}}
	>
		<Home class="h-4 w-4" aria-hidden="true" />
	</button>
</CustomControl>
