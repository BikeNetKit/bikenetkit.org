<script>
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { compact } from '$lib/state/viewport.svelte.js';
	import { announce } from '$lib/state/announce.svelte.js';

	let { toolName, cityName, cityOptions, search = '' } = $props();

	// The tool's featured cities that have data, else any city it covers. Both lists are already on
	// the page — the city menu needs them — so the suggestion costs no extra load.
	const covered = $derived(cityOptions.filter((c) => c.available));
	const featured = $derived(
		covered
			.filter((c) => c.featured !== undefined)
			.sort((a, b) => (a.featured ?? 0) - (b.featured ?? 0))
	);
	const suggestions = $derived((featured.length ? featured : covered).slice(0, 6));

	// A tool or city switch lands here without a page load, and the map simply stays empty.
	$effect(() => announce(`Not available: ${toolName} has no results for ${cityName} yet.`));

	// A callout at the top of the map whose caret points up at the current tool tab (on compact, at
	// the tool menu) — so "not available" reads as a fact about the tab the reader just picked, not
	// as one more panel in the rail. Positioned by measuring the `[data-tool-anchor]` element the
	// toolbar marks: a floating-ui popover would place it for free but bring dialog semantics,
	// focus handling and dismissal, all wrong for a permanent state.
	//
	// On desktop the box never starts left of the rail (`left-4` + `w-72` + one card gap), so it
	// cannot cover the InfoPanel; a tab further left keeps the box there and only the caret moves.
	const RAIL_EDGE = 16 + 288 + 12;
	const INSET = 12;
	const BOX_W = 320;
	const CARET_MARGIN = 16;

	/** @type {HTMLDivElement | undefined} */
	let host = $state();
	/** Anchor centre, px from the host's left edge. */
	let anchorX = $state(/** @type {number | null} */ (null));
	let hostW = $state(0);

	const findAnchor = () =>
		/** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-tool-anchor]')]).find(
			(el) => el.offsetParent !== null
		);

	function measure() {
		if (!host) return;
		const h = host.getBoundingClientRect();
		hostW = h.width;
		const anchor = findAnchor();
		if (!anchor) {
			anchorX = null;
			return;
		}
		const a = anchor.getBoundingClientRect();
		anchorX = a.left + a.width / 2 - h.left;
	}

	// Re-run on a tool or city switch: the current tab moved. The nav is observed as well as the
	// host because the tabs re-flow on their own when the display font swaps in; the capture-phase
	// scroll listener catches the tab strip scrolling sideways at narrow widths / 200% zoom.
	$effect(() => {
		void toolName;
		void cityName;
		if (!host) return;
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(host);
		const strip = findAnchor()?.parentElement;
		if (strip) ro.observe(strip);
		window.addEventListener('scroll', measure, true);
		document.fonts?.ready.then(measure);
		return () => {
			ro.disconnect();
			window.removeEventListener('scroll', measure, true);
		};
	});

	const measured = $derived(hostW > 0);
	const boxW = $derived(compact.current ? hostW - 2 * INSET : BOX_W);
	const boxLeft = $derived.by(() => {
		if (compact.current) return INSET;
		const max = Math.max(RAIL_EDGE, hostW - BOX_W - INSET);
		const ideal = anchorX == null ? (hostW - BOX_W) / 2 : anchorX - BOX_W / 2;
		return Math.min(max, Math.max(RAIL_EDGE, ideal));
	});
	const caretLeft = $derived(
		anchorX == null
			? null
			: Math.min(boxW - CARET_MARGIN, Math.max(CARET_MARGIN, anchorX - boxLeft))
	);
</script>

<!-- Covers the map but lets drags through; only the card takes pointer events. After the first
     measurement `left`/`width` are measured pixels, not design values. Before it (prerendered HTML,
     until hydration) compact already sits where it will end up, so it shows; desktop waits rather
     than jump sideways from centre to the tab. -->
<div bind:this={host} class="pointer-events-none absolute inset-0 z-20">
	<section
		aria-labelledby="unavailable-notice-heading"
		class="pointer-events-auto absolute top-3 {measured ? '' : 'inset-x-3 md:invisible'}"
		style:left={measured ? `${boxLeft}px` : undefined}
		style:width={measured ? `${boxW}px` : undefined}
	>
		<CardPanel width="w-full" gap="gap-2" surface="notice">
			<h2
				id="unavailable-notice-heading"
				class="flex items-center gap-1.5 text-sm font-semibold tracking-wider text-notice uppercase"
			>
				<CircleAlert class="size-4 shrink-0" aria-hidden="true" />
				Not available
			</h2>
			<p class="text-sm leading-snug text-ink-alt">
				<ToolName name={toolName} /> has no results for {cityName} yet.
				{#if suggestions.length}
					{featured.length ? 'It works well in these cities:' : 'It covers these cities:'}
				{/if}
			</p>

			{#if suggestions.length}
				<ul class="flex flex-col">
					{#each suggestions as city (city.slug)}
						<li>
							<a
								href={city.href + search}
								class="flex items-center justify-between gap-3 rounded px-2 py-1 text-sm text-ink transition-colors hover:bg-white hover:text-brand"
							>
								<span>{city.name}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</CardPanel>
		{#if measured && caretLeft != null}
			<!-- After the card in the DOM so it paints over the card's top border: a rotated square
			     with two borders, its lower half hidden inside the card, reads as one outline. -->
			<span
				aria-hidden="true"
				class="absolute -top-1.5 size-3 -translate-x-1/2 rotate-45 border-t border-l border-notice-border bg-notice-subtle"
				style:left="{caretLeft}px"
			></span>
		{/if}
	</section>
</div>
