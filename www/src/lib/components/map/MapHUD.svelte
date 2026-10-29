<script>
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import { formatMetric, formatMetricPair, labelFor } from '$lib/data/metric-meta';

	let {
		series,
		currentValue,
		frame,
		total,
		chartW = 100,
		chartH = 24,
		fillColor,
		metricId = 'length_cumulative',
		// Tints the big readout to match the chart fill — used where the metric has its own hue
		// (e.g. the purple connectedness share). Falls back to the default green ink when unset.
		valueColor = null,
		// Pre-existing share of `currentValue` — the baseline bike network. When set, the readout
		// splits into "existing + newly built" and the chart stacks the growth on a baseline band.
		baseValue = 0,
		basePct = 0,
		baseColor = null,
		// Where the playhead sits on the chart's own x-axis, 0–1. Defaults to the step index, which
		// is what an evenly spaced series wants; a chart plotted against a cost axis overrides it,
		// because there the playhead has to move nonlinearly to stay on the curve.
		markerPct = null,
		// The pair of labels under the chart. Defaults to the y-range in the metric's own unit;
		// charts whose x-axis is the informative one pass their own.
		axisLabels = null,
		width = 'w-48'
	} = $props();

	// The playhead marker's x, as a percentage of the chart's width. Clamped because `frame` can sit
	// past the last step for a tick during a dataset swap — the SVG viewport used to clip that
	// silently, but a DOM marker would escape the card.
	const markerLeft = $derived(
		Math.max(0, Math.min(1, markerPct ?? frame / Math.max(1, total - 1))) * 100
	);
	const stacked = $derived(baseValue > 0);
	// The curve's floor: the growth area is drawn between the baseline band and the curve, so the
	// band stays visible underneath instead of being covered by a polygon reaching to the axis.
	const yBase = $derived(stacked ? chartH * (1 - basePct) : chartH);
	const split = $derived(
		stacked ? formatMetricPair(metricId, baseValue, currentValue - baseValue) : null
	);
	const labels = $derived(
		axisLabels ?? [formatMetric(metricId, 0), formatMetric(metricId, series.max)]
	);
</script>

<!-- `pointer-events-auto` like every other card over the map: the readout column has to be
     scrollable when it outgrows its space, and a card that lets the wheel through to the map cannot
     scroll the column it sits in. The gutters between cards stay draggable map. -->
<CardPanel surface="white" {width} class="pointer-events-auto">
	<span class="w-max text-2xs font-semibold tracking-wider text-ink-alt-weaker uppercase">
		{labelFor(metricId)}
	</span>
	<!-- The split readout is ~13 characters at its widest ("313 + 1539 km"), which wraps in the
	     card at text-2xl — one step down keeps it on a single line. -->
	<div
		class="{split
			? 'text-xl'
			: 'text-2xl'} leading-none font-semibold whitespace-nowrap tabular-nums"
		style:color={valueColor}
	>
		{#if split}
			<span class="text-existing-network-ink">{split.base}</span>
			<span class="text-ink-weaker">{split.sign}</span>
			<span>{split.delta} {split.unit}</span>
		{:else}
			{formatMetric(metricId, currentValue)}
		{/if}
		{#if total > 1}<span class="sr-only">, at step {frame} of {total - 1}</span>{/if}
	</div>
	<div class="relative mt-0.5">
		<svg
			aria-hidden="true"
			viewBox="0 0 {chartW} {chartH}"
			preserveAspectRatio="none"
			style="height: {chartH}px; width: 100%; display: block;"
		>
			{#if stacked}
				<rect x="0" y={yBase} width={chartW} height={chartH - yBase} fill={baseColor} />
			{/if}
			<polygon points="0,{yBase} {series.pts} {chartW},{yBase}" fill={fillColor} opacity="0.85" />
		</svg>
		<!-- The playhead, centered on the time axis. In the DOM rather than in the chart because the
		     SVG is `preserveAspectRatio="none"` — a <circle> in that stretched coordinate space would
		     render as an ellipse. The white ring separates it from whichever fill it crosses. No
		     transition on `left`: it tracks a scrub the map repaints on the same frame, so any easing
		     reads as lag. -->
		<div
			aria-hidden="true"
			class="absolute bottom-0 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-ink ring-2 ring-paper-white"
			style="left: {markerLeft}%;"
		></div>
	</div>
	<div class="flex justify-between text-xs text-ink tabular-nums">
		<span>{labels[0]}</span>
		<span>{labels[1]}</span>
	</div>
</CardPanel>
