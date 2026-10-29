<script>
	import BuildupLayers from '$lib/components/map/BuildupLayers.svelte';
	import MapPanelStack from '$lib/components/map-shell/MapPanelStack.svelte';
	import InfoPanel from '$lib/components/map-shell/InfoPanel.svelte';
	import MapLoadingNotice from '$lib/components/map-shell/MapLoadingNotice.svelte';
	import ControlPanel from '$lib/components/map-shell/ControlPanel.svelte';
	import MapLegend from '$lib/components/map/MapLegend.svelte';
	import { toolBySlug } from '$lib/data/tools';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { axisTitle, labelOptions, optionCopy } from '$lib/data/control-copy';
	import { metricHelp } from '$lib/data/metric-help';
	import { resolve } from '$app/paths';
	import { viewSearch } from '$lib/utils/view-params';
	import { introKeyFor } from '$lib/utils/intro-animation';
	import { activeDataset } from '$lib/data/active-dataset.svelte.js';
	import { SORTBIKENET_RAMP, sortBikeNetLayerProps, sortBikeNetStar } from '$lib/data/sortbikenet';

	let { data } = $props();

	const ds = activeDataset();
	const covered = $derived(data.covered);

	const route = '/(app)/(map)/sortbikenet/[city]/[metric]/[type]';
	const search = $derived(viewSearch());

	// Coloured by when each segment is built — see `SORTBIKENET_RAMP`.
	const metricProperty = 'length_cumulative';
	const scale = $derived(
		metricScale(ds.geojson, metricProperty, (f) => f.properties?.ordering != null)
	);

	// Every ordering in one dropdown, the as-built order first: it is the reference the models are
	// read against.
	const orderingOptions = $derived(
		labelOptions('sortbikenet', 'metric', data.metricOptions)
			.map((o) => ({ ...o, star: sortBikeNetStar(o.value) }))
			.sort((a, b) => Number(b.value === 'real') - Number(a.value === 'real'))
	);

	const href = (patch) =>
		resolve(route, { city: data.city, metric: data.metric, type: data.type, ...patch }) + search;
</script>

{#if ds.geojson}
	<BuildupLayers
		idPrefix="sortbikenet"
		introKey={introKeyFor('sortbikenet', data.city)}
		geojson={ds.geojson}
		existingNetwork={ds.existingNetwork}
		{metricProperty}
		{...sortBikeNetLayerProps(ds.geojson)}
		showMetricLegend={false}
		showHistogram={false}
		metricLabel="Built at"
		carryPlayhead="length"
	/>
{/if}

<MapPanelStack>
	<InfoPanel toolSlug="sortbikenet" />
	{#if covered}
		{#if !ds.geojson}
			<MapLoadingNotice status={ds.status} toolName={toolBySlug['sortbikenet'].name} />
		{/if}
		<ControlPanel
			title={axisTitle('sortbikenet', 'metric', 'Ordering')}
			options={orderingOptions}
			active={data.metric}
			hrefFor={(v) => href({ metric: v })}
			describe={(v) => optionCopy('sortbikenet', 'metric', v)}
			help={metricHelp('sortbikenet')}
			dropdown
		>
			<!-- The ramp sits inside the panel it belongs to: one card fewer keeps the playback bar and
			     both HUD cards on screen at laptop height. -->
			{#if scale.legend}
				<MapLegend
					bare
					{metricProperty}
					legend={scale.legend}
					colors={SORTBIKENET_RAMP}
					showHistogram={false}
					minLabel="built first"
					maxLabel="built last"
				/>
			{/if}
		</ControlPanel>
		<ControlPanel
			title={axisTitle('sortbikenet', 'type', 'Starting point')}
			options={labelOptions('sortbikenet', 'type', data.typeOptions)}
			active={data.type}
			hrefFor={(v) => href({ type: v })}
			describe={(v) => optionCopy('sortbikenet', 'type', v)}
		/>
	{/if}
</MapPanelStack>
