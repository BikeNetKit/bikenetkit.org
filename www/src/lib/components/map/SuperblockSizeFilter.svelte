<script>
	import { Slider } from 'bits-ui';
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import MapHistogram from './MapHistogram.svelte';
	import { formatBlockArea } from '$lib/utils/formatters';
	import {
		defaultSizeRange,
		fromLog,
		logHistogram,
		sizeSelection,
		toLog
	} from '$lib/utils/superblocks';
	import { beginWindowDrag } from '$lib/utils/window-drag';
	import { HISTOGRAM_BIN_COUNT } from '$lib/map-style/render-config.js';
	import { timeThrottled } from '$lib/utils/throttle.svelte.js';

	let {
		// `[loLog, hiLog]` — log10 of the area bounds. The map owns it and derives its layer filters
		// from it; the slider works in log space because block areas span three orders of magnitude.
		range = $bindable(),
		// Sorted block areas in km², and their extent.
		sizes,
		extent,
		// Blocks inside the current range, and the tool's own total (see the note on `blockCount`
		// in MapSuperblocks — the total can exceed the number of drawable hulls).
		visibleCount,
		totalCount,
		// The map's own bottom-left corner sizes itself, matching the playback bar in the same
		// column; inside the control stack the panel takes the column's width — and its sand
		// surface — like every other one.
		width = 'w-72',
		surface = 'white'
	} = $props();

	const bounds = $derived(/** @type {[number, number]} */ ([toLog(extent.min), toLog(extent.max)]));
	const hasRange = $derived(bounds[1] > bounds[0]);

	/**
	 * The slider runs on integer step indices, not on the log values themselves: with a fractional
	 * step bits-ui snaps the top handle a whole step short of `max`, which would leave the largest
	 * block permanently filtered out. 100 steps is fine enough to feel continuous under the mouse and
	 * coarse enough to cross with the keyboard.
	 */
	const STEPS = 100;
	const toIndex = (log) => Math.round(((log - bounds[0]) / (bounds[1] - bounds[0])) * STEPS);
	const fromIndex = (i) => bounds[0] + (i / STEPS) * (bounds[1] - bounds[0]);

	// Mirror of `range` in index space. Kept in sync both ways: the map resets `range` on navigation,
	// the slider writes it back on drag. `toIndex(fromIndex(i)) === i`, so the two cannot ping-pong.
	let indices = $state([0, STEPS]);
	$effect(() => {
		if (!hasRange) return;
		const next = [toIndex(range[0]), toIndex(range[1])];
		if (next[0] !== indices[0] || next[1] !== indices[1]) indices = next;
	});

	function handleChange(next) {
		indices = next;
		range = [fromIndex(next[0]), fromIndex(next[1])];
	}

	/**
	 * Slider thumb width in px — keep in step with `size-3.5` on `Slider.Thumb` below. bits-ui keeps
	 * the thumbs contained inside the track, so the slider's value axis is half a thumb short at each
	 * end while the histogram's bins fill their box, and a drag has to be scaled against whichever
	 * surface it started on.
	 */
	const THUMB_PX = 14;

	/** @type {HTMLElement | null} */
	let chartEl = $state(null);
	/** @type {HTMLElement | null} */
	let trackEl = $state(null);
	let dragging = $state(false);

	// Only movable while the window is narrower than the whole axis — otherwise there is nowhere for
	// it to go and `cursor-grab` would be a lie.
	const canDrag = $derived(hasRange && indices[1] - indices[0] < STEPS);
	const dragCursor = $derived(
		canDrag ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
	);

	/**
	 * Start a window drag from one of the two surfaces.
	 *
	 * @param {PointerEvent} event
	 * @param {HTMLElement | null} track the element carrying the axis
	 * @param {number} inset px at each end of `track` the axis does not cover
	 */
	function startWindowDrag(event, track, inset) {
		if (!canDrag || event.button !== 0 || !track) return;
		event.preventDefault();
		// bits-ui's multi-slider listens for `pointerdown` on `document` and snaps the nearest thumb
		// to wherever the press landed. Stopping propagation here is what keeps a drag on the bar
		// from also throwing a handle. (Redundant but consistent on the histogram, which sits outside
		// the slider root and never reaches that listener.)
		event.stopPropagation();
		dragging = true;
		beginWindowDrag(event, {
			track,
			steps: STEPS,
			inset,
			from: [indices[0], indices[1]],
			onMove: handleChange,
			onEnd: () => (dragging = false)
		});
	}

	const histogram = $derived(hasRange ? logHistogram(sizes, bounds, HISTOGRAM_BIN_COUNT) : null);

	// Same tolerance the map filters on, so the readout and the map never disagree.
	const isFiltered = $derived(sizeSelection(range, extent).isFiltered);
	const spokenCount = timeThrottled(
		() =>
			isFiltered
				? `${visibleCount} of ${totalCount} superblocks`
				: `${totalCount} potential superblocks`,
		600
	);

	// Whether the handles sit at the default window (not necessarily the full extent — see
	// `defaultSizeRange`). Compared in index space, the same integer snapping the slider itself uses,
	// so a handle dragged back to the default position reads as "at default" even through float
	// rounding. Drives Reset's visibility instead of `isFiltered`: opening the sliders to the full
	// extent must not hide the only way back to the default window.
	const isAtDefault = $derived.by(() => {
		if (!hasRange) return true;
		const [lo, hi] = defaultSizeRange(extent);
		return indices[0] === toIndex(lo) && indices[1] === toIndex(hi);
	});

	// One flat tone: the bars encode a distribution, not a category or a ramp position.
	const HISTOGRAM_COLORS = ['var(--color-brand-muted)'];
</script>

<CardPanel {width} {surface} class="pointer-events-auto">
	<span class="w-max text-xs font-semibold tracking-wider text-ink-alt-weaker uppercase">
		Superblock size
	</span>

	{#if hasRange}
		<!-- Dragging anywhere on the distribution slides the selected window, dimmed bins included:
		     the gesture is relative, so it never jumps the window to the press. `touch-pan-y` leaves
		     vertical scrolling — the bottom sheet's — to the browser and claims horizontal movement. -->
		<div class="relative" bind:this={chartEl}>
			<MapHistogram {histogram} colors={HISTOGRAM_COLORS} dimOutside={range} />
			<div
				class="absolute inset-0 touch-pan-y {dragCursor}"
				aria-hidden="true"
				onpointerdown={(e) => startWindowDrag(e, chartEl, 0)}
			></div>
		</div>

		<Slider.Root
			type="multiple"
			value={indices}
			onValueChange={handleChange}
			min={0}
			max={STEPS}
			step={1}
			class="relative flex h-4 w-full touch-none items-center select-none"
		>
			{#snippet children({ thumbItems })}
				<span class="relative h-1.5 w-full rounded-full bg-brand-subtle" bind:this={trackEl}>
					<Slider.Range class="h-full rounded-full bg-brand">
						<!-- The bar is 6 px tall; this grows the hit area to the row's full height. It
						     renders before the thumbs, so a press near a handle still grabs the handle
						     rather than the window. -->
						<span
							class="absolute inset-x-0 -inset-y-1 {dragCursor}"
							aria-hidden="true"
							onpointerdown={(e) => startWindowDrag(e, trackEl, THUMB_PX / 2)}
						></span>
					</Slider.Range>
				</span>
				{#each thumbItems as thumb (thumb.index)}
					<Slider.Thumb
						index={thumb.index}
						aria-label={thumb.index === 0 ? 'Smallest superblock size' : 'Largest superblock size'}
						aria-valuetext={formatBlockArea(fromLog(fromIndex(thumb.value)))}
						class="block size-3.5 cursor-grab rounded-full border border-brand bg-white shadow-sm
						       focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none
						       active:cursor-grabbing"
					/>
				{/each}
			{/snippet}
		</Slider.Root>

		<div class="flex justify-between text-xs text-ink tabular-nums">
			<span>{formatBlockArea(fromLog(range[0]))}</span>
			<span>{formatBlockArea(fromLog(range[1]))}</span>
		</div>
	{/if}

	<div class="relative flex items-baseline justify-between gap-2">
		<!-- The count changes on every slider step; the live copy below is throttled so a held arrow
		     key is not read out step by step. `relative` contains its sr-only box. -->
		<p class="sr-only" aria-live="polite">{spokenCount.current}</p>
		<span class="text-xs text-ink tabular-nums" aria-hidden="true">
			{#if isFiltered}
				<!-- `&nbsp;`: Svelte trims a leading space inside the span, and "675 of 680" should not
				     break across lines anyway. -->
				{visibleCount}<span class="text-ink-weaker">&nbsp;of {totalCount}</span> superblocks
			{:else}
				{totalCount} potential superblocks
			{/if}
		</span>
		{#if !isAtDefault}
			<button
				type="button"
				class="link text-2xs whitespace-nowrap"
				onclick={() => {
					// The button unmounts once the range is back at its default; hand focus to the
					// control it just reset rather than to the page.
					const thumb = trackEl?.parentElement?.querySelector('[role="slider"]');
					if (thumb instanceof HTMLElement) thumb.focus();
					range = defaultSizeRange(extent);
				}}
			>
				Reset
			</button>
		{/if}
	</div>
</CardPanel>
