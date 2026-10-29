<script>
	import StaticLayers from '$lib/components/map/StaticLayers.svelte';
	import MapPanelStack from '$lib/components/map-shell/MapPanelStack.svelte';
	import InfoPanel from '$lib/components/map-shell/InfoPanel.svelte';
	import MapLoadingNotice from '$lib/components/map-shell/MapLoadingNotice.svelte';
	import ControlPanel from '$lib/components/map-shell/ControlPanel.svelte';
	import TopSpotsPanel from '$lib/components/map-shell/TopSpotsPanel.svelte';
	import MapLegend from '$lib/components/map/MapLegend.svelte';
	import { toolBySlug, lineWidthRangeFor } from '$lib/data/tools';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { computeRampStops, colorForValue } from '$lib/map-style/line-paint.js';
	import { hasSpread } from '$lib/map-style/importance';
	import { geojsonBounds } from '$lib/utils/bounds';
	import { axisTitle, optionCopy } from '$lib/data/control-copy';
	import { metricHelp } from '$lib/data/metric-help';
	import { rankGaps, GAP_SCORE_RANGE, FIXBIKENET_RAMP } from '$lib/data/fixbikenet';
	import { resolve } from '$app/paths';
	import { viewSearch } from '$lib/utils/view-params';

	import { activeDataset } from '$lib/data/active-dataset.svelte.js';

	let { data } = $props();

	// The layers arrive from data.bikenetkit.org after hydration; the shell around them is
	// prerendered. `covered` is decided synchronously from the manifest, so the permanent
	// "not available here" state never masquerades as a slow load.
	const ds = activeDataset();
	const covered = $derived(data.covered);

	const route = '/(app)/(map)/fixbikenet/[city]/[metric]/[type]';
	const search = $derived(viewSearch());

	const metricProperty = 'benefit';
	const scale = $derived(metricScale(ds.geojson, metricProperty));

	// The missing links, ranked and framed for the top-spots tour — see `rankGaps`.
	// TOP_SPOT_COUNT is how many rows the panel lays out as a table, and how many overview dots the
	// map enlarges and numbers — ranks past it surface one at a time in the panel's overflow row,
	// which is what lets the tour run to the end and lets a gap picked on the map report its real
	// rank. The map reads the export's own `ordering`, this same benefit rank.
	const TOP_SPOT_COUNT = 5;
	const rampStops = $derived(
		computeRampStops(scale.sortedValues, FIXBIKENET_RAMP, lineWidthRangeFor('fixbikenet'))
	);
	const rankedSpots = $derived(
		rankGaps(ds.geojson, scale.legend).map((g) => ({
			idx: g.idx,
			rank: g.rank,
			label: g.label,
			score: g.score,
			color: colorForValue(g.benefit, rampStops),
			bounds: geojsonBounds({ type: 'FeatureCollection', features: [g.feature] })
		}))
	);

	// One selection for the page, held as the *feature* id rather than a rank, so a gap picked on the
	// map (which may sit outside the top spots) and a row picked in the panel cannot both be lit.
	let selectedFeatureId = $state(/** @type {number | null} */ (null));
	const selectedIndex = $derived.by(() => {
		if (selectedFeatureId == null) return null;
		const i = rankedSpots.findIndex((s) => s.idx === selectedFeatureId);
		// A gap outside the top five resolves to its real rank, and the panel gives it a row below
		// the hairline. `-1` survives only as a guard: reaching it needs a feature with a non-finite
		// `benefit`, and the frozen export has none in 18730 gaps.
		return i === -1 ? null : i;
	});

	// Clear the selection whenever the dataset changes, so a stale index never highlights the wrong
	// feature in the newly loaded network.
	$effect(() => {
		void ds.geojson;
		selectedFeatureId = null;
	});

	const href = (patch) =>
		resolve(route, { city: data.city, metric: data.metric, type: data.type, ...patch }) + search;
</script>

{#if ds.geojson}
	<StaticLayers
		idPrefix="fixbikenet"
		geojson={ds.geojson}
		existingNetwork={ds.existingNetwork}
		{metricProperty}
		lineWidthRange={lineWidthRangeFor('fixbikenet')}
		colors={FIXBIKENET_RAMP}
		showMetricLegend={false}
		metricLabel="Gap severity"
		scoreRange={GAP_SCORE_RANGE}
		metricExtent={scale.legend}
		highlightId={selectedFeatureId}
		onSelect={(id) => (selectedFeatureId = id)}
		dotsWhenZoomedOut
		emphasizeTop={TOP_SPOT_COUNT}
		selectable
	/>
{/if}

<MapPanelStack>
	<InfoPanel toolSlug="fixbikenet" />
	{#if covered}
		{#if !ds.geojson}
			<MapLoadingNotice status={ds.status} toolName={toolBySlug['fixbikenet'].name} />
		{/if}
		<ControlPanel
			title={axisTitle('fixbikenet', 'metric', 'Gap severity')}
			options={data.metricOptions}
			active={data.metric}
			hrefFor={(v) => href({ metric: v })}
			describe={(v) => optionCopy('fixbikenet', 'metric', v)}
			help={metricHelp('fixbikenet')}
			capitalize
		>
			<!-- Four cities (berdyansk_ua, kamyanske_ua, orsha_by, vitebsk_by) have a single gap, so
			     there is no spread for the 1–10 ramp to label — the one gap still scores, in the
			     tooltip and the top-spots list. -->
			{#if scale.legend && hasSpread(scale.legend)}
				<MapLegend
					bare
					{metricProperty}
					legend={scale.legend}
					colors={FIXBIKENET_RAMP}
					showHistogram={false}
					minLabel="1"
					maxLabel="10"
				/>
			{/if}
		</ControlPanel>

		<TopSpotsPanel
			spots={rankedSpots}
			topCount={TOP_SPOT_COUNT}
			{selectedIndex}
			onSelect={(i) => (selectedFeatureId = i == null ? null : rankedSpots[i].idx)}
			resetBounds={data.bounds}
		/>

		{#if data.typeOptions.length > 1}
			<ControlPanel
				title={axisTitle('fixbikenet', 'type', 'Network')}
				options={data.typeOptions}
				active={data.type}
				hrefFor={(v) => href({ type: v })}
				describe={(v) => optionCopy('fixbikenet', 'type', v)}
				capitalize
			/>
		{/if}
	{/if}
</MapPanelStack>
