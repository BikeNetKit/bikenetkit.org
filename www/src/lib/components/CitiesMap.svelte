<script>
	import { geoConicConformal, geoGraticule, geoPath } from 'd3-geo';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import Info from '@lucide/svelte/icons/info';
	import X from '@lucide/svelte/icons/x';
	import land from '$lib/data/land.geo.json';
	import borders from '$lib/data/borders.geo.json';
	import { cityCenter } from '$lib/data/city-tools';
	import { assertCapitalCoverage, isCapital } from '$lib/data/capitals';
	import { userLocation } from '$lib/state/userLocation.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';

	// `insetLeft` reserves space (e.g. for a floating panel) that the fitted map area should not
	// extend under — the dots then center in the remaining width instead of the full container.
	let { cities, selected = null, onselect, padding = 32, insetLeft = 0 } = $props();

	// Container size, measured on the client. Fallbacks keep the prerendered SSR
	// map sensible before hydration.
	let cw = $state(0);
	let ch = $state(0);
	const W = $derived(cw || 800);
	const H = $derived(ch || 800);
	// Capped so a narrow container (mobile) never collapses the fit area to nothing.
	const effectiveInsetLeft = $derived(Math.min(insetLeft, W * 0.5));

	// Fit to the city points (not the land) so every dot stays inside `padding` of the available
	// area (full container, minus `insetLeft`); the land fills around them and is clipped to the
	// viewport, so the map always covers the container without being cut off. `fitExtent` centers
	// the geometry within the given box on both axes, preserving aspect ratio. Funchal (Madeira) is
	// excluded from this fit — it sits far outside the rest of the catalog's bounds, and including
	// it would zoom the whole map out just to fit one outlying dot. It still renders normally below
	// (via `points`, computed from the unfiltered `cities`), just wherever the resulting projection
	// happens to place it.
	const cityPoints = $derived(
		/** @type {import('geojson').MultiPoint} */ ({
			type: 'MultiPoint',
			coordinates: cities.filter((c) => c.slug !== 'funchal_pt').map(cityCenter)
		})
	);

	const projection = $derived(
		geoConicConformal()
			.parallels([40, 60])
			.rotate([-15, 0])
			.fitExtent(
				[
					[effectiveInsetLeft + padding, padding],
					[W - padding, H - padding]
				],
				cityPoints
			)
			.clipExtent([
				[0, 0],
				[W, H]
			])
	);

	const graticule = geoGraticule().step([2, 2])();
	const graticulePath = $derived(geoPath(projection)(graticule));
	const landPath = $derived(
		geoPath(projection)(/** @type {import('geojson').FeatureCollection} */ (land))
	);
	const bordersPath = $derived(
		geoPath(projection)(/** @type {import('geojson').MultiLineString} */ (borders))
	);

	// Population is classed, not continuous. A sqrt ramp anchored to London (8.1M) squeezed the
	// 336 cities under 500k into the bottom quarter of the radius range and gave no two dots the
	// same size — unreadable, and impossible to put in a legend. Three fixed classes are
	// distinguishable and stable across data pulls; the breaks are round human numbers on purpose,
	// since the legend prints them verbatim. Only the two outer classes are labelled — the middle
	// dot's meaning is unambiguous once the ends are anchored, and two labels read as a scale
	// where three read as a list.
	const SIZE_CLASSES = [
		{ key: 'large', min: 1_500_000, r: 8, stroke: 2, label: '> 1.5M' },
		{ key: 'medium', min: 500_000, r: 5, stroke: 1.5, label: '' },
		{ key: 'small', min: 0, r: 3, stroke: 1, label: '< 500k' }
	];

	function sizeClass(city) {
		const pop = city.population ?? 0;
		return SIZE_CLASSES.find((c) => pop >= c.min) ?? SIZE_CLASSES[SIZE_CLASSES.length - 1];
	}

	// Legend swatch geometry, laid out left-to-right small → large and derived from SIZE_CLASSES,
	// scaled like the current view's dots, so the dots in the key are literally the dots on the map. The legend is a single row rather than
	// a stack because it shares the bottom-left corner with the floating panel above it, whose
	// height follows its content (search prompt vs. selected-city panel) — a 125px-tall stacked
	// legend collided with the taller states, and took up half the map's height on a phone.
	const LEGEND_SWATCH_GAP = 6;
	/** @param {number} scale */
	function legendGeometry(scale) {
		const classes = SIZE_CLASSES.map((c) => ({ ...c, r: c.r * scale, stroke: c.stroke * scale }));
		const swatches = classes.toReversed().map((c, i, all) => {
			let left = 0;
			for (const prev of all.slice(0, i)) left += 2 * prev.r + prev.stroke + LEGEND_SWATCH_GAP;
			return { ...c, cx: left + c.r + c.stroke / 2 };
		});
		return {
			classes,
			swatches,
			width: swatches.reduce((w, c) => Math.max(w, c.cx + c.r + c.stroke), 0),
			height: classes.reduce((h, c) => Math.max(h, 2 * c.r + c.stroke), 0)
		};
	}
	const smallestLabel = SIZE_CLASSES[SIZE_CLASSES.length - 1].label;
	const largestLabel = SIZE_CLASSES[0].label;

	// Size encodes population, fill encodes capital status — one visual variable per attribute,
	// where radius, stroke and fill used to restate the same number three times. Capitals need
	// their own channel because `population` is a city-proper figure: Brussels (174k), Bern (134k)
	// and ten other capitals land in the smallest class and would otherwise be indistinguishable
	// from any provincial town, which is exactly what makes the map hard to orient in.
	$effect(() => assertCapitalCoverage(cities));

	const points = $derived(
		cities
			.map((city) => {
				const p = projection(cityCenter(city));
				return p ? { city, x: p[0], y: p[1] } : null;
			})
			.filter((p) => p !== null)
			// Small → large, and within a class non-capitals → capitals, so neither a large dot nor a
			// capital can be hidden under a neighbour that happens to come later in the A-Z list.
			.sort(
				(a, b) =>
					sizeClass(a.city).r - sizeClass(b.city).r ||
					Number(isCapital(a.city)) - Number(isCapital(b.city)) ||
					(a.city.population ?? 0) - (b.city.population ?? 0)
			)
	);

	const clusterCenter = $derived.by(() => {
		const visible = points.filter((p) => p.city.slug !== 'funchal_pt');
		if (!visible.length) return { x: W / 2, y: H / 2 };
		const x = visible.reduce((s, p) => s + p.x, 0) / visible.length;
		const y = visible.reduce((s, p) => s + p.y, 0) / visible.length;
		return { x, y };
	});

	const userPoint = $derived.by(() => {
		const c = userLocation.coords;
		if (!c) return null;
		const p = projection(c);
		return p ? { x: p[0], y: p[1] } : null;
	});

	// Only meaningful below `sm`, where the legend row is collapsed behind an info button; from `sm`
	// up the row is shown unconditionally and the toggle is hidden.
	let legendOpen = $state(false);

	let hovered = $state(null);
	const labelled = $derived(hovered ?? points.find((p) => p.city.slug === selected?.slug) ?? null);

	// Two zoom levels only: fitted-to-Europe (out) and a fixed 3x region view (in). A `<g>`
	// transform is cheaper than re-fitting the d3 projection on every drag pixel — no path
	// recompute — at the cost of counter-scaling radii/strokes/font-sizes by 1/k so dots and
	// labels keep a constant on-screen size at both levels.
	const ZOOM_SCALE = 3;
	let zoomed = $state(false);
	let pan = $state({ x: 0, y: 0 });
	const k = $derived(zoomed ? ZOOM_SCALE : 1);

	// The fitted-to-Europe view draws every dot a fifth smaller, where 412 of them crowd the
	// continent; the region view keeps the class radii. The legend follows the current view.
	const DOT_SCALE_OUT = 0.8;
	const dotScale = $derived(zoomed ? 1 : DOT_SCALE_OUT);
	const legend = $derived(legendGeometry(dotScale));

	/** @type {SVGSVGElement | null} */
	let svgEl = $state(null);
	let dragging = $state(false);
	let dragMoved = false;

	// Touch: a two-finger spread zooms in, a pinch zooms out (the map has only the two levels), and
	// while zoomed one or two fingers pan. Every pointer is tracked and the pan follows their
	// centroid, re-anchored whenever a finger lands or lifts — anchoring on the last finger down
	// alone made two-finger moves jump between the fingers on every frame.
	const PINCH_IN = 1.2;
	const PINCH_OUT = 0.8;
	const ZOOM_MS = 300;
	/** @type {Map<number, { x: number, y: number }>} */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- gesture bookkeeping, never rendered
	const pointers = new Map();
	/** @type {{ dist: number, mid: { x: number, y: number }, pan: { x: number, y: number } } | null} */
	let anchor = null;
	let zoomSwitchedAt = -Infinity;

	function measurePointers() {
		const [a, b] = [...pointers.values()];
		if (!a) return null;
		if (!b) return { dist: 0, mid: a };
		return {
			dist: Math.hypot(a.x - b.x, a.y - b.y),
			mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
		};
	}

	function reanchor() {
		const m = measurePointers();
		anchor = m && { ...m, pan: { ...pan } };
	}

	// Keeps the drawn canvas (which exactly covers [0,W]x[0,H] at k=1, per fitExtent+clipExtent
	// above) covering the viewport at any pan offset — the reader can never drag every city dot
	// or coastline fully out of view.
	function clampPan(x, y, scale) {
		const minX = W * (1 - scale);
		const minY = H * (1 - scale);
		return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
	}

	function zoomTo(px, py) {
		pan = clampPan(W / 2 - ZOOM_SCALE * px, H / 2 - ZOOM_SCALE * py, ZOOM_SCALE);
		zoomed = true;
	}

	function zoomOut() {
		zoomed = false;
		pan = { x: 0, y: 0 };
	}

	function onBackgroundDblClick(e) {
		if (zoomed || !svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		zoomTo(e.clientX - rect.left, e.clientY - rect.top);
	}

	function onPointerDown(e) {
		// Fresh for every gesture regardless of zoom state, or a drag made while zoomed can leave it
		// stuck `true` after zooming back out, silently blocking every dot click until the next drag.
		if (pointers.size === 0) dragMoved = false;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size > 1) {
			// A pinch is never a tap on a dot.
			dragMoved = true;
			e.currentTarget.setPointerCapture(e.pointerId);
		}
		if (zoomed) dragging = true;
		reanchor();
	}

	function onPointerMove(e) {
		if (!pointers.has(e.pointerId) || !anchor || !svgEl) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const m = measurePointers();
		if (!m) return;

		// Let the zoom transition finish before panning, which would switch it off mid-way.
		if (performance.now() - zoomSwitchedAt < ZOOM_MS) return reanchor();

		if (pointers.size > 1 && anchor.dist > 0) {
			const ratio = m.dist / anchor.dist;
			if ((!zoomed && ratio > PINCH_IN) || (zoomed && ratio < PINCH_OUT)) {
				const rect = svgEl.getBoundingClientRect();
				if (zoomed) zoomOut();
				else zoomTo(m.mid.x - rect.left, m.mid.y - rect.top);
				dragging = false;
				zoomSwitchedAt = performance.now();
				return reanchor();
			}
		}

		if (!zoomed) return;
		const dx = m.mid.x - anchor.mid.x;
		const dy = m.mid.y - anchor.mid.y;
		if (!dragMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
			dragMoved = true;
			// Captured lazily, only once a drag is confirmed: capturing on every pointerdown
			// (including plain clicks) retargets the resulting click event to the svg itself,
			// per the Pointer Events spec — which silently breaks dot selection, since the click
			// never reaches the dot's own `<g>` and its onclick handler.
			e.currentTarget.setPointerCapture(e.pointerId);
		}
		dragging = true;
		pan = clampPan(anchor.pan.x + dx, anchor.pan.y + dy, ZOOM_SCALE);
	}

	function onPointerUp(e) {
		pointers.delete(e.pointerId);
		if (pointers.size === 0) dragging = false;
		reanchor();
	}

	// Guards against a drag that started on a dot from also firing the dot's click (native
	// click fires on pointerup regardless of movement in between).
	function selectCity(e, city) {
		e.stopPropagation();
		if (dragMoved) return;
		onselect?.(city);
	}
</script>

<!-- Dots and labels live inside the SVG so they always align with the land
     silhouette. The viewBox matches the container's pixel size, so the map fills
     the container with no letterboxing. -->
<div class="absolute inset-0" bind:clientWidth={cw} bind:clientHeight={ch}>
	<!-- Click-to-zoom is replaced by double-click; the corner +/- control is the keyboard-reachable
	     equivalent, so the dblclick handler here is intentionally unaccompanied by a key handler.
	     Unzoomed, `pan-y` hands one-finger swipes to the page, so a reader scrolling past the map
	     isn't stopped by it; two-finger pinches still arrive here, since `pan-y` excludes pinch-zoom.
	     Zoomed, every touch is the map's. -->
	<!-- The dots are a pointer shortcut, not a keyboard surface: ~400 tab stops in no geographic
	     order would bury the search field beside the map, which is the complete keyboard route to the
	     same cities. `role="img"` makes everything inside presentational, and the name says where to
	     go instead. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		bind:this={svgEl}
		role="img"
		aria-label="Map of the covered cities. Use the search field to choose a city by keyboard."
		viewBox="0 0 {W} {H}"
		class="h-full w-full {zoomed
			? `touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`
			: 'touch-pan-y'}"
		ondblclick={onBackgroundDblClick}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
	>
		<g
			style="transform: translate({pan.x}px, {pan.y}px) scale({k})"
			class="origin-top-left transition-transform duration-300 motion-reduce:transition-none {dragging
				? '!transition-none'
				: ''}"
		>
			<path
				d={graticulePath}
				fill="none"
				stroke-width={0.5 / k}
				class="stroke-base-teal opacity-40"
			/>
			<path d={landPath} class="fill-base-teal-light" />
			<path
				d={bordersPath}
				fill="none"
				stroke="white"
				stroke-width={1 / k}
				stroke-linejoin="round"
				class="opacity-80"
			/>

			{#each points as pt (pt.city.slug)}
				{@const isSelected = selected?.slug === pt.city.slug}
				{@const cls = sizeClass(pt.city)}
				{@const capital = isCapital(pt.city)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<g
					class="cursor-pointer"
					onclick={(e) => selectCity(e, pt.city)}
					onmouseenter={() => (hovered = pt)}
					onmouseleave={() => (hovered = null)}
				>
					<circle cx={pt.x} cy={pt.y} r={14 / k} class="fill-transparent" />
					{#if isSelected}
						<!-- The selection ring sits outside the dot so the dot keeps its own class radius:
						     selection used to force r=9, i.e. every selected city briefly claimed to be
						     London-sized. -->
						<circle
							cx={pt.x}
							cy={pt.y}
							r={(cls.r * dotScale + 4) / k}
							fill="none"
							stroke-width={2 / k}
							class="stroke-brand-vivid"
						/>
					{/if}
					<circle
						cx={pt.x}
						cy={pt.y}
						r={(cls.r * dotScale) / k}
						stroke="white"
						stroke-opacity={isSelected ? 1 : 0.66}
						stroke-width={((isSelected ? 2 : cls.stroke) * dotScale) / k}
						class={isSelected ? 'fill-brand-vivid' : capital ? 'fill-ink' : 'fill-ink-weaker'}
					/>
				</g>
			{/each}

			{#if userPoint}
				<g class="pointer-events-none">
					<circle
						cx={userPoint.x}
						cy={userPoint.y}
						r={6 / k}
						fill="none"
						class="stroke-brand-vivid motion-reduce:hidden"
						stroke-width={2 / k}
					>
						<animate
							attributeName="r"
							from={6 / k}
							to={20 / k}
							dur="1.8s"
							repeatCount="indefinite"
						/>
						<animate
							attributeName="opacity"
							from="0.7"
							to="0"
							dur="1.8s"
							repeatCount="indefinite"
						/>
					</circle>
					<circle
						cx={userPoint.x}
						cy={userPoint.y}
						r={5 / k}
						stroke="white"
						stroke-width={2.5 / k}
						class="fill-brand-vivid"
					/>
				</g>
			{/if}

			{#if labelled}
				<text
					x={labelled.x}
					y={labelled.y - 14 / k}
					text-anchor="middle"
					stroke="white"
					stroke-width={3.5 / k}
					paint-order="stroke"
					font-size={14 / k}
					font-weight="600"
					class="pointer-events-none fill-ink"
				>
					{labelled.city.name}
				</text>
			{/if}
		</g>
	</svg>

	<!-- Discrete size classes are only decodable with a key, but the key competes for the bottom-left
	     corner with the floating panel above it, so it takes three forms by width. All of them are
	     `pointer-events-none` (only the mobile toggle is interactive) and all sit outside the
	     zoomable `<g>`, so they keep their size at both zoom levels without counter-scaling.

	     - `xl` and up: the stacked block. Only here is there room — `xl` is where the page goes
	       two-column and the map becomes `min-h-150` (601×600) instead of a 2:1 letterbox, leaving
	       141px of measured clearance under the panel.
	     - `sm` to `xl`: one row at bottom-left. The letterbox leaves ~100px under a tall panel, less
	       than the stacked block's 125px, which is what made the stacked form collide.
	     - below `sm`: the same row, collapsed behind an info button in the bottom-right control
	       column, since even the row is 245px of a 328px-wide map.

	     Every legend in the bottom-left corner is inset `4` (16px), matching the floating panel's
	     own inset inside the map so their left edges are flush — no breakpoint variant needed,
	     since neither bottom-left form renders below `sm` anyway. The bottom-right column does
	     exist at every width, so it drops to `2` (8px) on a phone, where the map is only ~344px
	     wide and the legend is collapsed into the toggle, and takes the same `sm:4` above that.
	     The panel is positioned against the wrapper rather than the map, so its `md:mt-8`/`md:ml-6`
	     are the map's own `mt-4`/`m-2` margins plus that same 16px. -->
	<!-- One box size for every form so the capital row's label aligns with the size rows above it in
	     the stacked legend. -->
	{#snippet capitalSwatch()}
		<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" class="shrink-0">
			<circle cx="9" cy="9" r="5" stroke="white" stroke-width="1.5" class="fill-ink" />
		</svg>
	{/snippet}

	<!-- Shared by the mobile (collapsed) and `sm`-to-`xl` (always-on) row legends, which sit in
	     different corners and so cannot be the same element. -->
	{#snippet rowLegendBody(showTitle)}
		{#if showTitle}
			<span class="text-2xs font-semibold tracking-wider text-ink-alt-weaker uppercase">
				Population
			</span>
		{/if}
		<span class="flex items-center gap-1.5 text-xs text-ink-alt">
			<span class="tabular-nums">{smallestLabel}</span>
			<svg
				width={legend.width}
				height={legend.height}
				viewBox="0 0 {legend.width} {legend.height}"
				aria-hidden="true"
				class="shrink-0"
			>
				{#each legend.swatches as cls (cls.key)}
					<circle
						cx={cls.cx}
						cy={legend.height / 2}
						r={cls.r}
						stroke="white"
						stroke-width={cls.stroke}
						class="fill-ink-weaker"
					/>
				{/each}
			</svg>
			<span class="tabular-nums">{largestLabel}</span>
		</span>
		<span class="flex items-center gap-1.5 text-xs text-ink-alt">
			{@render capitalSwatch()}
			Capital
		</span>
	{/snippet}

	<div
		class="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-3 rounded border border-border-weaker bg-paper/80 px-3 py-1.5 shadow-sm backdrop-blur-sm sm:flex xl:hidden"
	>
		{@render rowLegendBody(true)}
	</div>

	<div
		class="pointer-events-none absolute bottom-4 left-4 hidden flex-col gap-1 rounded border border-border-weaker bg-paper/80 px-3 py-2 shadow-sm backdrop-blur-sm xl:flex"
	>
		<div class="text-2xs font-semibold tracking-wider text-ink-alt-weaker uppercase">
			Population
		</div>
		{#each legend.classes as cls (cls.key)}
			<div class="flex items-center gap-2 text-xs text-ink-alt">
				<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" class="shrink-0">
					<circle
						cx="9"
						cy="9"
						r={cls.r}
						stroke="white"
						stroke-width={cls.stroke}
						class="fill-ink-weaker"
					/>
				</svg>
				<span class="tabular-nums">{cls.label}</span>
			</div>
		{/each}
		<div class="mt-1 flex items-center gap-2 text-xs text-ink-alt">
			{@render capitalSwatch()}
			<span>Capital</span>
		</div>
	</div>

	<!-- Below `sm` the legend joins the zoom control in this one bottom-right column, so the map's
	     chrome lives in a single corner instead of bracketing the map from both sides; the expanded
	     row hangs above the two buttons, right-aligned with them. -->
	<div
		class="pointer-events-none absolute right-2 bottom-2 flex flex-col items-end gap-2 sm:right-4 sm:bottom-4"
	>
		<div
			id="cities-map-legend"
			class="{legendOpen ? 'flex' : 'hidden'} items-center gap-3 rounded border
				border-border-weaker bg-paper/80 px-3 py-1.5 shadow-sm backdrop-blur-sm sm:hidden"
		>
			{@render rowLegendBody(false)}
		</div>

		<!-- `ghost` rather than the zoom button's `solid`: the glyph itself carries the dark green
		     fill, so the toggle reads as a single small mark rather than a second heavy brand-filled
		     disc directly above the zoom button. -->
		<div class="pointer-events-auto sm:hidden">
			<IconButton
				variant="ghost"
				ariaLabel={legendOpen ? 'Hide map legend' : 'Show map legend'}
				ariaExpanded={legendOpen}
				ariaControls="cities-map-legend"
				onclick={() => (legendOpen = !legendOpen)}
			>
				{#if legendOpen}
					<X class="h-5 w-5 text-brand" />
				{:else}
					<Info class="h-5 w-5 fill-brand text-white" />
				{/if}
			</IconButton>
		</div>

		<div class="pointer-events-auto">
			{#if zoomed}
				<IconButton ariaLabel="Zoom out" onclick={zoomOut}>
					<Minus class="h-4 w-4" />
				</IconButton>
			{:else}
				<IconButton ariaLabel="Zoom in" onclick={() => zoomTo(clusterCenter.x, clusterCenter.y)}>
					<Plus class="h-4 w-4" />
				</IconButton>
			{/if}
		</div>
	</div>
</div>
