<script>
	import BuildupLayers from '$lib/components/map/BuildupLayers.svelte';
	import MapPanelStack from '$lib/components/map-shell/MapPanelStack.svelte';
	import InfoPanel from '$lib/components/map-shell/InfoPanel.svelte';
	import MapLoadingNotice from '$lib/components/map-shell/MapLoadingNotice.svelte';
	import ControlPanel from '$lib/components/map-shell/ControlPanel.svelte';
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import PanelHeading from '$lib/components/map-shell/PanelHeading.svelte';
	import MapLegend from '$lib/components/map/MapLegend.svelte';
	import { setExpertMenu } from '$lib/components/map-shell/expertMenu.svelte.js';
	import { toolBySlug } from '$lib/data/tools';
	import { rampColorsFor } from '$lib/map-style/line-paint.js';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { axisTitle, labelOptions, optionCopy } from '$lib/data/control-copy';
	import { labelFor } from '$lib/data/metric-meta';
	import { metricHelp } from '$lib/data/metric-help';
	import { LINKBIKENET_LCC_SHARE } from '$lib/data/metric-properties';
	import { resolve } from '$app/paths';
	import { viewSearch } from '$lib/utils/view-params';
	import { introKeyFor } from '$lib/utils/intro-animation';

	import { activeDataset } from '$lib/data/active-dataset.svelte.js';

	let { data } = $props();

	// The layers arrive from data.bikenetkit.org after hydration; the shell around them is
	// prerendered. `covered` is decided synchronously from the manifest, so the permanent
	// "not available here" state never masquerades as a slow load.
	const ds = activeDataset();
	const covered = $derived(data.covered);

	const route = '/(app)/(map)/linkbikenet/[city]/[metric]/[type]';
	const search = $derived(viewSearch());

	// The map colours the proposed links by the connectivity each one buys, not by the strategy
	// axis — so the legend reads `lcc_gain` whichever strategy is on screen.
	const metricProperty = 'lcc_gain';
	// The build order column is per strategy, and it is what colours the existing network. Read it
	// off the painted dataset: mid-switch, `data.metric` names a column the loaded features lack, and
	// the baseline silently paints as nothing.
	const lccStepProperty = $derived(ds.key ? `lcc_step_${ds.key.metric}` : null);
	const scale = $derived(
		metricScale(ds.geojson, metricProperty, (f) => f.properties?.ordering != null)
	);

	// The strategy selector lives in the toolbar's expert gear menu — the default view leads with the
	// map and the connectivity ramp, and only shows the three-way choice when the reader asks for it.
	setExpertMenu(() => (covered ? expertControls : null));

	const href = (patch) =>
		resolve(route, { city: data.city, metric: data.metric, type: data.type, ...patch }) + search;
</script>

{#if ds.geojson}
	<BuildupLayers
		idPrefix="linkbikenet"
		introKey={introKeyFor('linkbikenet', data.city)}
		geojson={ds.geojson}
		existingNetwork={ds.existingNetwork}
		{metricProperty}
		{lccStepProperty}
		lccShareProperty={LINKBIKENET_LCC_SHARE}
		showMetricLegend={false}
		showHistogram={false}
	/>
{/if}

<MapPanelStack>
	<InfoPanel toolSlug="linkbikenet" />
	{#if covered}
		{#if !ds.geojson}
			<MapLoadingNotice status={ds.status} toolName={toolBySlug['linkbikenet'].name} />
		{/if}
		<!-- The connectivity-gain ramp stands alone so it stays on screen while the strategy selector
		     that it belongs to sits in the expert gear menu. -->
		{#if scale.legend}
			<CardPanel width="w-full" gap="gap-2" class="pointer-events-auto">
				<PanelHeading title={labelFor(metricProperty)} help={metricHelp('linkbikenet')} />
				<MapLegend
					bare
					{metricProperty}
					legend={scale.legend}
					colors={rampColorsFor(metricProperty)}
					showHistogram={false}
				/>
			</CardPanel>
		{/if}
	{/if}
</MapPanelStack>

{#snippet expertControls()}
	<ControlPanel
		bare
		title={axisTitle('linkbikenet', 'metric', 'Linking strategy')}
		options={labelOptions('linkbikenet', 'metric', data.metricOptions)}
		active={data.metric}
		hrefFor={(v) => href({ metric: v })}
		describe={(v) => optionCopy('linkbikenet', 'metric', v)}
	/>
{/snippet}
