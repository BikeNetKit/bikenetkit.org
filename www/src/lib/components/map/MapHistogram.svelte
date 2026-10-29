<script>
	let {
		histogram,
		colors,
		markerPct = null,
		// `[lo, hi]` in the histogram's own value space. Bins whose center falls outside fade out, so
		// a range filter's effect reads on the distribution itself. Null leaves every bin solid.
		dimOutside = null
	} = $props();

	function inRange(bin) {
		if (!dimOutside) return true;
		const t = (bin.start + bin.end) / 2;
		return t >= dimOutside[0] && t <= dimOutside[1];
	}

	function binColor(bin) {
		const t = (bin.start + bin.end) / 2;
		const { min, max } = histogram;
		const norm = (t - min) / (max - min);
		const idx = norm * (colors.length - 1);
		const lo = Math.floor(idx);
		const hi = Math.min(lo + 1, colors.length - 1);
		const frac = idx - lo;
		if (lo === hi || frac === 0) return colors[lo];
		return `color-mix(in lch, ${colors[lo]}, ${colors[hi]} ${frac * 100}%)`;
	}
</script>

{#if histogram}
	<!-- A picture of the distribution; the legend below it carries the range as text. -->
	<div class="relative" aria-hidden="true">
		<div class="flex items-end gap-px" style="height: 24px;">
			{#each histogram.bins as bin, i (i)}
				<!-- No transition on the fade: the bars track a slider drag, and any easing reads as lag
				     against the map, which redraws on the same frame. -->
				<div
					class="flex-1 rounded-[0.5px]"
					class:opacity-20={!inRange(bin)}
					style="height: {(bin.count / histogram.maxCount) * 100}%; background: {binColor(bin)};"
				></div>
			{/each}
		</div>
		{#if markerPct != null}
			<div class="absolute" style="left: {markerPct}%; bottom: -7px; transform: translateX(-50%);">
				<svg width="7" height="5" viewBox="0 0 7 5">
					<polygon points="3.5,0 7,5 0,5" fill="var(--color-ink)" />
				</svg>
			</div>
		{/if}
	</div>
{/if}
