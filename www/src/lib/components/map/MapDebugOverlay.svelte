<script>
	// Dev-server-only map debug panel: zoom readout plus the layers under the cursor. Hidden by
	// default; `d` toggles it, and the choice persists for the tab. The `window.__map` handle is
	// exposed whether or not the panel is shown, because the Playwright checks and
	// `scripts/probe-labels.mjs` rely on it.
	let { map } = $props();

	const STORAGE_KEY = 'bnk-map-debug';

	let visible = $state(
		typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1'
	);
	let zoom = $state(0);
	let features = $state([]);

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.key !== 'd' && e.key !== 'D') return;
		if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
		const target = /** @type {HTMLElement | null} */ (e.target);
		if (target?.isContentEditable || target?.closest('input, textarea, select')) return;
		visible = !visible;
		sessionStorage.setItem(STORAGE_KEY, visible ? '1' : '0');
	}

	// Handle for the console and the Playwright checks to drive the map directly. MapHost mounts
	// this overlay on the dev server only, so a production build never exposes it.
	$effect(() => {
		if (!map) return;
		/** @type {Window & { __map?: import('maplibre-gl').Map }} */ (window).__map = map;
	});

	// The listeners run a feature query and a console.log on every mousemove, so they are attached
	// only while the panel is shown.
	$effect(() => {
		if (!map || !visible) return;
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

		updateZoom();
		m.on('zoom', updateZoom);
		m.on('mousemove', updateFeatures);
		m.on('mouseout', clearFeatures);

		return () => {
			m.off('zoom', updateZoom);
			m.off('mousemove', updateFeatures);
			m.off('mouseout', clearFeatures);
			features = [];
		};
	});
</script>

<svelte:window onkeydown={onKeydown} />

{#if visible}
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
{/if}
