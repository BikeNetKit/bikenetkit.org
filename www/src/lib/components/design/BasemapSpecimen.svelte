<script>
	import { MapLibre } from 'svelte-maplibre-gl';
	import { makeMapStyle, setLabelVisibility } from '$lib/map-style/style.js';
	import { MAX_ZOOM, MIN_ZOOM } from '$lib/map-style/render-config.js';
	import { loadCityBoundary } from '$lib/data/boundaries';
	import { cityBySlug } from '$lib/data/cities';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import CheckboxControl from '$lib/components/ui/CheckboxControl.svelte';

	let { city = 'copenhagen_dk' } = $props();

	const PRESETS = [
		{ value: '10', label: 'z10 region' },
		{ value: '12', label: 'z12 city' },
		{ value: '14', label: 'z14 quarter' },
		{ value: '16', label: 'z16 street' }
	];

	/** @type {import('maplibre-gl').Map | undefined} */
	let map = $state();
	let zoom = $state(12);
	let labels = $state(true);
	/** @type {import('$lib/data/boundaries').CityBoundary | null | undefined} */
	let boundary = $state.raw();

	const [[west, south], [east, north]] = $derived(cityBySlug[city].bounds);
	const center = $derived(
		/** @type {[number, number]} */ ([(west + east) / 2, (south + north) / 2])
	);

	const style = $derived(
		/** @type {import('maplibre-gl').StyleSpecification} */ (
			makeMapStyle({ cityBoundary: boundary ?? null })
		)
	);

	// The boundary is baked into the style at construction, as on the tool pages, so the map waits
	// for it rather than painting unclipped labels first.
	$effect(() => {
		loadCityBoundary(fetch, city).then((b) => (boundary = b));
	});

	$effect(() => {
		if (!map) return;
		const m = map;
		const onzoom = () => (zoom = m.getZoom());
		m.on('zoom', onzoom);
		return () => m.off('zoom', onzoom);
	});

	$effect(() => {
		if (map) setLabelVisibility(map, labels);
	});
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-4">
		<SegmentedControl
			options={PRESETS}
			active={String(Math.round(zoom))}
			onSelect={(v) => map?.easeTo({ center, zoom: Number(v) })}
			ariaLabel="Basemap zoom"
		/>
		<CheckboxControl bind:checked={labels} label="Labels" />
		<span class="ml-auto font-mono text-xs text-ink-weaker tabular-nums">z {zoom.toFixed(1)}</span>
	</div>
	<div class="relative h-96 overflow-hidden rounded border border-border-weaker bg-paper">
		{#if boundary !== undefined}
			<MapLibre
				class="absolute inset-0 h-full w-full"
				autoloadGlobalCss={false}
				{style}
				{center}
				zoom={12}
				minZoom={MIN_ZOOM}
				maxZoom={MAX_ZOOM}
				bind:map
			/>
		{/if}
	</div>
</div>
