<script>
	import { formatLengthPair, formatMetric, labelFor, streetLabel } from '$lib/data/metric-meta';
	import { hasSpread, importanceScore, logNorm } from '$lib/map-style/importance';
	import { mapOverlaySize } from '$lib/components/map-shell/mapOverlay.js';
	import MapHistogram from './MapHistogram.svelte';
	import MapTooltipRow from './MapTooltipRow.svelte';
	import MapTooltipShell from './MapTooltipShell.svelte';

	let {
		tooltip,
		// Container pixels, re-derived from the camera by the caller — see `cameraAnchor`.
		x,
		y,
		metricProperty,
		histogram,
		colors,
		totalNewLengthM = null,
		totalOrderedCount = null,
		stepIndexByOrdering = null,
		lccStepProperty = null,
		// Baseline network length, and however much of it `length_cumulative` already counts.
		existingLengthM = 0,
		cumulativeBaselineM = 0,
		// Presents the metric row as a plain-language score instead of the raw measurement:
		// `metricLabel` overrides the row's label, and `scoreRange` + `metricExtent` log-spread the
		// value onto that range via `importanceScore` (e.g. a centrality value shown as a 1–10
		// importance score).
		metricLabel = null,
		scoreRange = null,
		metricExtent = null,
		// Draw the metric's distribution as a histogram under the ramp. Off where the ramp alone
		// reads cleaner — then the value is marked with a dot on a plain ramp, as in score mode.
		showHistogram = true
	} = $props();

	const overlaySize = mapOverlaySize();

	const asScore = $derived(scoreRange != null && metricExtent != null);
	// A single-valued metric still scores (the top of the scale — see `importanceScore`), but there
	// is no distribution behind that score, so neither the ramp nor its marker has anything to say.
	const scored = $derived(hasSpread(metricExtent));

	function metricValueDisplay(value) {
		if (typeof value !== 'number') return value;
		if (asScore) {
			// `asScore` already guarantees an extent, so this is only unset for a non-finite value —
			// a feature whose own metric is missing or NaN, which still reads as the raw measurement.
			const score = importanceScore(value, metricExtent, scoreRange);
			if (Number.isFinite(score)) return String(score);
		}
		return formatMetric(metricProperty, value);
	}

	// sortbikenet's `total_*` columns describe the whole network after a step, not the segment —
	// the HUD tracks them.
	const HIDDEN_PROPS = new Set([
		'source',
		'target',
		'ordering',
		'length_cumulative',
		'path',
		'total_length',
		'total_coverage',
		'total_directness'
	]);
	function isHidden(key) {
		return HIDDEN_PROPS.has(key) || key.startsWith('ordering_') || key.startsWith('lcc_step_');
	}

	const isExisting = $derived(tooltip.kind === 'existing');

	// On the baseline layer: the step at which this segment first joined the largest
	// connected component. `-1` means it was already part of it before anything was built.
	const lccJoinStep = $derived.by(() => {
		if (!isExisting || !lccStepProperty) return null;
		const v = tooltip.properties[lccStepProperty];
		return typeof v === 'number' ? v : 'never';
	});

	// `ordering` is 0-based but sparse on growbikenet, so the raw value is not a position.
	// Resolve it to the index the scrubber counts in; fall back to the value when no map is given.
	const orderingIdx = $derived.by(() => {
		if (isExisting) return null;
		const v = tooltip.properties.ordering;
		if (typeof v !== 'number') return null;
		return stepIndexByOrdering?.get(v) ?? v;
	});

	// Newly built length before this segment. Subtracting the baseline keeps growbikenet's
	// from_bikenw exports — whose `length_cumulative` starts at the existing network's 878 km —
	// in the same "newly built" space as the denominator.
	const builtSoFarM = $derived.by(() => {
		if (isExisting) return null;
		const cum = tooltip.properties.length_cumulative;
		const len = tooltip.properties.length;
		if (typeof cum !== 'number') return null;
		return (typeof len === 'number' ? cum - len : cum) - cumulativeBaselineM;
	});

	const builtSplit = $derived(
		existingLengthM > 0 && builtSoFarM != null
			? formatLengthPair(existingLengthM, builtSoFarM)
			: null
	);

	// Rows shown above the emphasised metric row: the ordering block + any non-hidden,
	// non-metric properties. Used to drop the metric row's top margin when it stands alone.
	//
	// Counts a `name` that `streetLabel` drops, so this can read one high. Left that way rather than
	// duplicating the call: the only tool with a `name` also always ships `length`, so the count
	// never reaches 0 either way, and all that is at stake is a margin above a row that has a
	// sibling regardless.
	const precedingRowCount = $derived.by(() => {
		if (isExisting) return 0;
		const orderingRows = orderingIdx != null && totalOrderedCount ? 1 : 0;
		const propRows = Object.entries(tooltip.properties).filter(
			([key]) => !isHidden(key) && key !== metricProperty
		).length;
		return orderingRows + propRows;
	});

	const markerPct = $derived.by(() => {
		if (isExisting) return null;
		const v = tooltip.properties[metricProperty];
		if (v == null) return null;
		// In score mode the histogram is the log-scored distribution, so the marker sits at the
		// value's log position rather than its linear position in the raw extent.
		if (asScore && scored) {
			return logNorm(v, metricExtent.min, metricExtent.max) * 100;
		}
		if (histogram) {
			return ((v - histogram.min) / (histogram.max - histogram.min)) * 100;
		}
		return null;
	});
</script>

<MapTooltipShell
	{x}
	{y}
	containerWidth={overlaySize().width}
	containerHeight={overlaySize().height}
>
	{#if isExisting}
		<!-- Values inherit the container's color; row labels keep their own muted ink. -->
		<div class="flex flex-col gap-1.5 text-existing-network-ink">
			<div class="text-2xs font-semibold tracking-wider uppercase">Existing network</div>
			{#if typeof tooltip.properties.length === 'number'}
				<MapTooltipRow
					label={labelFor('length')}
					value={formatMetric('length', tooltip.properties.length)}
				/>
			{/if}
			{#if lccJoinStep !== null}
				<MapTooltipRow label="Joins largest">
					{#if lccJoinStep === 'never'}
						<span class="text-ink-weaker">never</span>
					{:else if lccJoinStep < 0}
						<span class="font-semibold">from the start</span>
					{:else}
						<span class="font-semibold tabular-nums">at step #{lccJoinStep + 1}</span>
					{/if}
				</MapTooltipRow>
			{/if}
		</div>
	{:else}
		{#if orderingIdx != null && totalOrderedCount}
			<MapTooltipRow label="Build step">
				<span class="font-semibold text-ink tabular-nums">#{orderingIdx + 1}</span>
				<span class="text-ink-weaker tabular-nums">/ {totalOrderedCount}</span>
			</MapTooltipRow>

			{#if builtSoFarM != null && totalNewLengthM}
				<MapTooltipRow label="Built after">
					{#if builtSplit}
						<span class="font-semibold text-existing-network-ink tabular-nums"
							>{builtSplit.base}</span
						>
						<span class="text-ink-weaker">+</span>
						<span class="font-semibold text-ink tabular-nums"
							>{builtSplit.delta} {builtSplit.unit}</span
						>
					{:else}
						<span class="font-semibold text-ink tabular-nums"
							>{formatMetric('length_cumulative', builtSoFarM)}</span
						>
					{/if}
					<span class="text-ink-weaker tabular-nums"
						>/ {formatMetric('length_cumulative', totalNewLengthM)}</span
					>
				</MapTooltipRow>
			{/if}
		{/if}
		<!-- `name` is the one property whose raw value is a string, and the only one that can come out
		     of `streetLabel` as nothing at all — the export writes "n/a" for an unnamed way, and
		     sometimes a list with a blank member, which reached here as ",Jadranski most". A row
		     reading "Street n/a" says less than no row, so it is dropped. -->
		{#each Object.entries(tooltip.properties)
			.filter(([key]) => !isHidden(key) && key !== metricProperty)
			.sort(([a], [b]) => (a === 'length' ? -1 : b === 'length' ? 1 : 0)) as [key, value] (key)}
			{@const display = key === 'name' ? streetLabel(value) : value}
			{#if display != null}
				<MapTooltipRow
					label={labelFor(key)}
					value={typeof display === 'number' ? formatMetric(key, display) : display}
				/>
			{/if}
		{/each}

		{#each Object.entries(tooltip.properties).filter(([key]) => key === metricProperty) as [key, value] (key)}
			<MapTooltipRow
				label={metricLabel ?? labelFor(key)}
				value={metricValueDisplay(value)}
				emphasis
				spaced={precedingRowCount > 0}
			/>
		{/each}
		{#if !asScore || scored}
			<div class="mt-0.5">
				{#if asScore || !showHistogram}
					<!-- The ramp the map is painted with, marked with the hovered value's position. -->
					<div class="relative">
						<div
							class="h-2.5 w-full rounded-full"
							style="background: linear-gradient(in lch to right, {colors.join(', ')})"
						></div>
						{#if markerPct != null}
							<div
								class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-white"
								style="left: {markerPct}%;"
							></div>
						{/if}
					</div>
				{:else}
					<MapHistogram {histogram} {colors} {markerPct} />
				{/if}
			</div>
		{/if}
	{/if}
</MapTooltipShell>
