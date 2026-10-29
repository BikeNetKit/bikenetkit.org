<script>
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import MapHistogram from './MapHistogram.svelte';
	import { formatMetric, labelFor } from '$lib/data/metric-meta';

	// `bare` drops the card and the heading: inside a control panel, the panel already names the
	// metric, and a card within a card reads as a mistake.
	// `minLabel`/`maxLabel` override the formatted extent labels — e.g. presenting a raw centrality
	// value as a 1–10 importance score, a log spread of the same distribution (see
	// `$lib/map-style/importance.js`).
	let {
		metricProperty,
		histogram = null,
		legend,
		colors,
		bare = false,
		minLabel = null,
		maxLabel = null,
		showHistogram = true,
		width = 'w-48',
		class: className = ''
	} = $props();

	const lowLabel = $derived(minLabel ?? formatMetric(metricProperty, legend.min));
	const highLabel = $derived(maxLabel ?? formatMetric(metricProperty, legend.max));
</script>

{#snippet body()}
	{#if !bare}
		<span class="mb-4 w-max text-2xs font-semibold tracking-wider text-ink-alt-weaker uppercase">
			{labelFor(metricProperty)}
		</span>
	{/if}
	{#if showHistogram}
		<MapHistogram {histogram} {colors} />
	{/if}
	<div
		class="h-2.5 w-full rounded-full"
		role="img"
		aria-label="Color scale from {lowLabel}, lightest, to {highLabel}, darkest"
		style="background: linear-gradient(in lch to right, {colors.join(', ')})"
	></div>
	<div class="flex justify-between text-xs text-ink tabular-nums" aria-hidden="true">
		<span>{lowLabel}</span>
		<span>{highLabel}</span>
	</div>
{/snippet}

{#if bare}
	<!-- Inside a control panel: no surface of its own. The ramp and the histogram are ink on the
	     panel, not a thing to operate — a box around them would compete with the control above. -->
	<div class="flex flex-col gap-1.5">
		{@render body()}
	</div>
{:else}
	<!-- `pointer-events-auto`: see MapHUD. -->
	<CardPanel surface="white" {width} class="pointer-events-auto {className}">
		{@render body()}
	</CardPanel>
{/if}
