<script>
	import StaticLayers from '$lib/components/map/StaticLayers.svelte';
	import SuperblockLayers from '$lib/components/map/SuperblockLayers.svelte';
	import MapPanelStack from '$lib/components/map-shell/MapPanelStack.svelte';
	import InfoPanel from '$lib/components/map-shell/InfoPanel.svelte';
	import MapLoadingNotice from '$lib/components/map-shell/MapLoadingNotice.svelte';
	import ControlPanel from '$lib/components/map-shell/ControlPanel.svelte';
	import MapLegend from '$lib/components/map/MapLegend.svelte';
	import SuperblockSizeFilter from '$lib/components/map/SuperblockSizeFilter.svelte';
	import CheckboxControl from '$lib/components/ui/CheckboxControl.svelte';
	import { toolBySlug, lineWidthRangeFor } from '$lib/data/tools';
	import { metricPropertyFor } from '$lib/data/metric-properties';
	import { RAMP_COLORS } from '$lib/map-style/line-paint.js';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { axisTitle, labelOptions, optionCopy } from '$lib/data/control-copy';
	import { metricHelp } from '$lib/data/metric-help';
	import { setExpertMenu } from '$lib/components/map-shell/expertMenu.svelte.js';
	import { resolve } from '$app/paths';
	import { setViewFlag, viewFlag, viewSearch } from '$lib/utils/view-params';
	import { introKeyFor } from '$lib/utils/intro-animation';

	import { activeDataset } from '$lib/data/active-dataset.svelte.js';

	let { data } = $props();

	// The layers arrive from data.bikenetkit.org after hydration; the shell around them is
	// prerendered. `covered` is decided synchronously from the manifest, so the permanent
	// "not available here" state never masquerades as a slow load.
	const ds = activeDataset();
	const covered = $derived(data.covered);

	const route = '/(app)/(map)/superblockify/[city]/[metric]/[type]';
	const search = $derived(viewSearch());

	// Painting values follow the dataset actually on screen (`ds.key`), not the URL. During the
	// fetch that a metric or type switch kicks off, `data.*` has already moved on while `ds` still
	// holds the previous network — describing that network with the new parameters paints nothing.
	const isEdges = $derived(ds.key?.type === 'edges');
	const metricProperty = $derived(
		ds.key ? metricPropertyFor('superblockify', ds.key.metric, ds.key.type) : null
	);
	const scale = $derived(metricScale(ds.geojson, metricProperty ?? ''));

	// Expert toggle: color streets/blocks by population density instead of by superblock. Linkable
	// like the other view flags, so a density view can be shared and stepped through with back/forward.
	const colorByDensity = $derived(viewFlag('colorby'));

	setExpertMenu(() => (covered && isEdges ? expertControls : null));

	// The size selection and the index it reads live in SuperblockLayers — it owns the hulls the
	// index falls back to — and come back out so the filter can render as a control panel.
	let sizeRange = $state(null);
	/** @type {{ sizes: number[], extent: { min: number, max: number }, visibleCount: number, totalCount: number } | null} */
	let sizeIndex = $state(null);

	// The block-level density extent, for the ramp legend — same source the layer's ramp is built
	// from, so the legend always matches what's painted.
	/** @type {{ min: number, max: number } | null} */
	let densityLegend = $state(null);

	const href = (patch) =>
		resolve(route, { city: data.city, metric: data.metric, type: data.type, ...patch }) + search;
</script>

{#if ds.geojson}
	{#if isEdges}
		<SuperblockLayers
			geojson={ds.geojson}
			introKey={introKeyFor('superblockify', data.city)}
			blockAttributes={ds.blocks}
			metric={ds.key?.metric}
			metricProperty={metricProperty ?? undefined}
			lineWidthRange={lineWidthRangeFor('superblockify', ds.key?.type)}
			bind:sizeRange
			onSizeIndex={(state) => (sizeIndex = state)}
			onDensityIndex={(d) => (densityLegend = d)}
			showSizeFilter={false}
			{colorByDensity}
		/>
	{:else}
		<StaticLayers
			idPrefix="superblockify"
			geojson={ds.geojson}
			metricProperty={metricProperty ?? undefined}
			lineWidthRange={lineWidthRangeFor('superblockify', ds.key?.type)}
			showMetricLegend={false}
		/>
	{/if}
{/if}

<MapPanelStack>
	<InfoPanel toolSlug="superblockify" />
	{#if covered}
		{#if !ds.geojson}
			<MapLoadingNotice status={ds.status} toolName={toolBySlug['superblockify'].name} />
		{/if}
		<ControlPanel
			title={axisTitle('superblockify', 'metric', 'Classification')}
			options={labelOptions('superblockify', 'metric', data.metricOptions)}
			active={data.metric}
			hrefFor={(v) => href({ metric: v })}
			describe={(v) => optionCopy('superblockify', 'metric', v)}
			help={metricHelp('superblockify')}
			capitalize
		>
			{#if !isEdges && scale.legend}
				<MapLegend
					bare
					metricProperty={metricProperty ?? undefined}
					histogram={scale.histogram}
					legend={scale.legend}
					colors={RAMP_COLORS}
				/>
			{:else if isEdges && !colorByDensity}
				<p class="text-2xs leading-snug text-ink-alt-weaker">
					Colors distinguish neighboring superblocks only — the same color in different parts of the
					map doesn't mean the same thing.
				</p>
			{/if}
		</ControlPanel>

		{#if data.typeOptions.length > 1}
			<ControlPanel
				title={axisTitle('superblockify', 'type', 'Layer')}
				options={data.typeOptions}
				active={data.type}
				hrefFor={(v) => href({ type: v })}
				describe={(v) => optionCopy('superblockify', 'type', v)}
				capitalize
			/>
		{/if}

		{#if isEdges && sizeIndex && sizeRange}
			<SuperblockSizeFilter
				bind:range={sizeRange}
				sizes={sizeIndex.sizes}
				extent={sizeIndex.extent}
				visibleCount={sizeIndex.visibleCount}
				totalCount={sizeIndex.totalCount}
				width="w-full"
				surface="paper"
			/>
		{/if}

		{#if isEdges && colorByDensity && densityLegend}
			<MapLegend
				metricProperty="population_density"
				legend={densityLegend}
				colors={RAMP_COLORS}
				showHistogram={false}
				width="w-full"
				class="pointer-events-auto"
			/>
		{/if}
	{/if}
</MapPanelStack>

{#snippet expertControls()}
	<CheckboxControl
		bind:checked={() => colorByDensity, (v) => setViewFlag('colorby', v)}
		label="Color by population density"
		title="Shade streets and blocks by people per km² instead of by superblock"
	/>
{/snippet}
