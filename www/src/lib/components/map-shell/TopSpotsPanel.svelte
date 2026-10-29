<script>
	import { getMapContext } from 'svelte-maplibre-gl';
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import PanelHeading from './PanelHeading.svelte';
	import { PANEL_FIT_PADDING } from '$lib/map-style/render-config.js';

	// The ranked spots (rank, score, color, bounds, label — built by the page) and the shared
	// selection the map highlight reads from. `resetBounds` reframes the whole network on Reset.
	// Selection is controlled by the page — see the fixbikenet page for why: a feature picked
	// directly on the map can also live in this list, so the page needs to be the one place that
	// tracks it.
	//
	// `label` is optional rather than a required `string | null`: a tool whose features carry no
	// street name at all can mount this panel without inventing one, and the row falls back to
	// naming the absence.
	//
	// `spots` is the *whole* ranking, not the slice on show. `topCount` is only how many rows are a
	// table; everything past it is reachable one row at a time — see `overflow`. Handing the panel
	// the full list is what lets Prev/Next stay a clamped index step and lets a gap picked on the
	// map resolve to a real rank instead of falling off the end of a five-element array.
	let {
		spots = [],
		topCount = 5,
		selectedIndex = null,
		onSelect = undefined,
		resetBounds = null
	} = $props();

	const visible = $derived(spots.slice(0, topCount));
	const lastVisible = $derived(Math.min(topCount, spots.length) - 1);

	// The single row beyond the table that the selection has reached — by stepping past the bottom of
	// it, or by picking a gap on the map that is not in it. Stepping on replaces this row rather than
	// appending to it: the panel shows where the reader is, not where they have been.
	const overflow = $derived(
		selectedIndex != null && selectedIndex >= topCount ? spots[selectedIndex] : null
	);

	const mapCtx = getMapContext();
	const map = $derived(mapCtx.map);

	// A gentle glide between spots — slow enough to keep the reader oriented as the camera travels.
	const FLY_DURATION = 1600;

	// Framing is an action of *this* panel, not a consequence of the selection: a reader who picks a
	// gap on the map directly has already chosen their viewport and a table selection shouldn't yank it.
	function fly(bounds) {
		if (map && bounds) {
			map.fitBounds(bounds, { padding: PANEL_FIT_PADDING, maxZoom: 16, duration: FLY_DURATION });
		}
	}

	function go(i) {
		onSelect?.(i);
		fly(spots[i]?.bounds);
	}
	const atFirst = $derived(selectedIndex === 0);
	const atLast = $derived(selectedIndex === spots.length - 1);
	const atRest = $derived(selectedIndex == null);

	// The three buttons dim with `aria-disabled` rather than `disabled`, which would drop the focus
	// of a reader who has just stepped to an end — so each one also guards itself.
	function prev() {
		if (atFirst) return;
		// Entering the tour cold lands inside the visible table at either end — Next at the top row,
		// Prev at the bottom one — never on the overflow row, which has nothing on screen yet to have
		// prompted it. `spots` runs to the last gap in the city, so `spots.length - 1` here would open
		// the panel on rank #50 under a hairline with the whole table unlit.
		go(selectedIndex == null ? lastVisible : Math.max(selectedIndex - 1, 0));
	}
	function next() {
		if (atLast) return;
		go(selectedIndex == null ? 0 : Math.min(selectedIndex + 1, spots.length - 1));
	}
	function reset() {
		if (atRest) return;
		onSelect?.(null);
		if (map && resetBounds) {
			map.fitBounds(resetBounds, { padding: PANEL_FIT_PADDING, duration: FLY_DURATION });
		}
	}
</script>

<!-- One snippet for both the table rows and the overflow row below the rule: the two are the same
     row, and rendering them from separate copies of this markup would let them drift the first time
     the street-name branch is touched.

     `tabular-nums` sits on the numeric spans, not on the button: 17 of the street names in the
     frozen export carry a digit ("Aleja Konstytucji 3 Maja"), and tabular figures inside prose read
     as misaligned. The name is the only flexible column, so it is the only one that needs `min-w-0`
     — without it a flex child refuses to shrink below its content and a 50-character name pushes
     the score out of the card. The rank column is `w-7` rather than the `w-5` that held `#5`: the
     ranking now runs the whole network and every gap export caps at 50 features, so `#50` is the
     widest label that can land there — measured at 24.13px, which `w-6` (24px) misses. -->
{#snippet row(spot, i)}
	<button
		type="button"
		aria-current={i === selectedIndex}
		onclick={() => go(i)}
		title={spot.label ?? undefined}
		class="flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs text-ink hover:bg-ink/5 aria-current:bg-ink/10 aria-current:font-semibold"
	>
		<span class="w-7 shrink-0 text-ink-weaker tabular-nums">#{spot.rank}</span>
		<span
			class="size-2.5 shrink-0 rounded-full"
			style="background: {spot.color};"
			aria-hidden="true"
		></span>
		{#if spot.label}
			<span class="min-w-0 flex-1 truncate">{spot.label}</span>
		{:else}
			<span class="min-w-0 flex-1 truncate text-ink-weaker">Unnamed street</span>
		{/if}
		<span class="shrink-0 font-semibold tabular-nums">{spot.score}</span>
		<span class="shrink-0 text-ink-weaker tabular-nums">/ 10</span>
	</button>
{/snippet}

{#if spots.length}
	<CardPanel width="w-full" gap="gap-2" class="pointer-events-auto">
		<!-- The heading counts the table, not the ranking behind it, and it keeps saying "Top 3
		     spots" in the cities with fewer than `topCount` gaps. It deliberately does not change
		     when the overflow row appears: these words describe the rows above the rule, and the one
		     below it is the current selection, which is a different thing. -->
		<PanelHeading title="Top {Math.min(topCount, spots.length)} spots" />

		<ul class="flex flex-col">
			{#each visible as spot, i (spot.idx)}
				<li>{@render row(spot, i)}</li>
			{/each}
			{#if overflow}
				<!-- The hairline rides on the row's own `<li>` rather than sitting in an empty one of
				     its own: a contentless list item is announced as a blank row and puts the list's
				     item count out of step with what is on screen. -->
				<li class="mt-1 border-t border-border-weakest pt-1">
					{@render row(overflow, selectedIndex)}
				</li>
			{/if}
		</ul>

		<div class="flex items-center gap-1.5 pt-0.5">
			<button
				type="button"
				onclick={prev}
				aria-disabled={atFirst || undefined}
				class="rounded-sm border border-border-weaker px-2 py-1 text-xs text-ink hover:bg-ink/5 aria-disabled:opacity-40"
			>
				‹ Prev
			</button>
			<button
				type="button"
				onclick={next}
				aria-disabled={atLast || undefined}
				class="rounded-sm border border-border-weaker px-2 py-1 text-xs text-ink hover:bg-ink/5 aria-disabled:opacity-40"
			>
				Next ›
			</button>
			<button
				type="button"
				onclick={reset}
				aria-disabled={atRest || undefined}
				class="ml-auto rounded-sm border border-border-weaker px-2 py-1 text-xs text-ink hover:bg-ink/5 aria-disabled:opacity-40"
			>
				Reset
			</button>
		</div>
	</CardPanel>
{/if}
