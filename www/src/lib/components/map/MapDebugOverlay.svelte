<script>
	let { map } = $props();

	let zoom = $state(0);
	let features = $state([]);

	$effect(() => {
		if (!map) return;
		const m = map;

		const updateZoom = () => (zoom = m.getZoom());
		const updateFeatures = (e) => {
			const hits = m.queryRenderedFeatures(e.point) ?? [];
			features = hits.slice(0, 8).map((f) => ({
				layer: f.layer?.id ?? '?',
				source: f.source ?? '?',
				sourceLayer: f.sourceLayer ?? null
			}));
			console.log(hits[0]?.properties);
		};
		const clearFeatures = () => (features = []);

		// Handle for the console and the Playwright checks to drive the map directly. MapHost mounts
		// this overlay on the dev server only, so a production build never exposes it.
		/** @type {Window & { __map?: import('maplibre-gl').Map }} */ (window).__map = m;

		updateZoom();
		m.on('zoom', updateZoom);
		m.on('mousemove', updateFeatures);
		m.on('mouseout', clearFeatures);

		return () => {
			m.off('zoom', updateZoom);
			m.off('mousemove', updateFeatures);
			m.off('mouseout', clearFeatures);
		};
	});
</script>

<div
	class="pointer-events-none absolute top-4 right-4 max-w-xs rounded bg-black/60 px-2 py-1 font-mono text-xs text-white tabular-nums"
>
	<div>z {zoom.toFixed(2)}</div>
	{#if features.length}
		<div class="mt-1 flex flex-col gap-0.5 opacity-80">
			{#each features as f, i (i)}
				<div class="truncate">
					{f.layer}
					<span class="opacity-60">· {f.source}{f.sourceLayer ? `/${f.sourceLayer}` : ''}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
