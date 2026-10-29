<script>
	import BuildupLayers from '$lib/components/map/BuildupLayers.svelte';
	import MapPanelStack from '$lib/components/map-shell/MapPanelStack.svelte';
	import InfoPanel from '$lib/components/map-shell/InfoPanel.svelte';
	import MapLoadingNotice from '$lib/components/map-shell/MapLoadingNotice.svelte';
	import ControlPanel from '$lib/components/map-shell/ControlPanel.svelte';
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import PanelHeading from '$lib/components/map-shell/PanelHeading.svelte';
	import MapLegend from '$lib/components/map/MapLegend.svelte';
	import CheckboxControl from '$lib/components/ui/CheckboxControl.svelte';
	import { setExpertMenu } from '$lib/components/map-shell/expertMenu.svelte.js';
	import { toolBySlug } from '$lib/data/tools';
	import { RAMP_COLORS } from '$lib/map-style/line-paint.js';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { hasSpread } from '$lib/map-style/importance';
	import { metricPropertyFor } from '$lib/data/metric-properties';
	import { axisTitle, labelOptions, optionCopy } from '$lib/data/control-copy';
	import { metricHelp } from '$lib/data/metric-help';
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

	const route = '/(app)/(map)/growbikenet/[city]/[metric]/[type]/[variant]';

	// Seed visibility lives in the URL so a view can be linked and stepped through with back/forward.
	const showSeeds = $derived(viewFlag('seeds'));
	const seedTitle = $derived(
		{
			rail: 'Show the rail stations and the seed nodes the network grew from',
			school: 'Show the schools and the seed nodes the network grew from'
		}[data.type] ?? 'Show the seed nodes the network grew from'
	);
	const seedLabel = $derived(
		{ grid: 'show grid seeds', rail: 'show rail stations', school: 'show schools' }[data.type] ??
			'show seed points'
	);
	const search = $derived(viewSearch());

	const metricProperty = $derived(
		ds.key ? metricPropertyFor('growbikenet', ds.key.metric, ds.key.type) : null
	);
	// The same distribution the layers are painted from — the panel's legend reads the ramp the
	// map draws. Only ordered features carry the metric; the baseline network is context.
	const scale = $derived(
		metricScale(ds.geojson, metricProperty ?? '', (f) => f.properties?.ordering != null)
	);

	// The metric is presented as a 1–10 importance score (a log spread of the skewed centrality),
	// shared with the tooltip via BuildupLayers' `metricScoreRange`.
	const IMPORTANCE_RANGE = [1, 10];

	// A 1–10 ramp needs a distribution to spread over. The smallest `rail` and `school` results are
	// a handful of segments that all carry the same centrality, and there the ramp would label a
	// range the data does not cover — the tooltip still scores each segment (see `importanceScore`).
	const rampReadable = $derived(hasSpread(scale.legend));

	// The metric and starting-point selectors live in the toolbar's expert gear menu.
	setExpertMenu(() => (covered ? expertControls : null));

	const href = (patch) =>
		resolve(route, {
			city: data.city,
			metric: data.metric,
			type: data.type,
			variant: data.variant,
			...patch
		}) + search;
</script>

{#if ds.geojson}
	<BuildupLayers
		idPrefix="growbikenet"
		introKey={introKeyFor('growbikenet', data.city)}
		geojson={ds.geojson}
		metricProperty={metricProperty ?? undefined}
		existingNetwork={ds.existingNetwork}
		seeds={ds.seeds}
		{showSeeds}
		contextPoints={ds.context}
		contextKind={ds.key?.type ?? null}
		showMetricLegend={false}
		metricLabel="Importance"
		metricScoreRange={IMPORTANCE_RANGE}
		carryPlayhead="length"
	/>
{/if}

<MapPanelStack>
	<InfoPanel toolSlug="growbikenet" />
	{#if covered}
		{#if !ds.geojson}
			<MapLoadingNotice status={ds.status} toolName={toolBySlug['growbikenet'].name} />
		{/if}
		<!-- The focus axis always shows every tab (an unavailable one rendered disabled), and this
		     panel also hosts the seed-point toggle alongside them. -->
		<ControlPanel
			title={axisTitle('growbikenet', 'type', 'Focus')}
			options={labelOptions('growbikenet', 'type', data.typeOptions)}
			active={data.type}
			hrefFor={(v) => href({ type: v })}
			describe={(v) => optionCopy('growbikenet', 'type', v)}
		>
			{#snippet controls()}
				{#if ds.seeds}
					<CheckboxControl
						bind:checked={() => showSeeds, (v) => setViewFlag('seeds', v)}
						label={seedLabel}
						title={seedTitle}
					/>
				{/if}
			{/snippet}
		</ControlPanel>

		<!-- The importance ramp stands alone so it stays on screen while the metric selector that drives
		     it sits collapsed inside expert settings. Scores are shown as a 1–10 importance scale — a
		     log spread of the raw centrality extent, see `$lib/map-style/importance.js`. -->
		{#if scale.legend && rampReadable}
			<CardPanel width="w-full" gap="gap-2" class="pointer-events-auto">
				<PanelHeading title="Importance" help={metricHelp('growbikenet')} />
				<MapLegend
					bare
					{metricProperty}
					legend={scale.legend}
					colors={RAMP_COLORS}
					showHistogram={false}
					minLabel="1"
					maxLabel="10"
				/>
			</CardPanel>
		{/if}
	{/if}
</MapPanelStack>

{#snippet expertControls()}
	<ControlPanel
		bare
		title={axisTitle('growbikenet', 'metric', 'Growth metric')}
		options={labelOptions('growbikenet', 'metric', data.metricOptions)}
		active={data.metric}
		hrefFor={(v) => href({ metric: v })}
		describe={(v) => optionCopy('growbikenet', 'metric', v)}
		capitalize
	/>

	<ControlPanel
		bare
		title={axisTitle('growbikenet', 'variant', 'Starting point')}
		options={data.variantOptions}
		active={data.variant}
		hrefFor={(v) => href({ variant: v })}
		describe={(v) => optionCopy('growbikenet', 'variant', v)}
	/>
{/snippet}
