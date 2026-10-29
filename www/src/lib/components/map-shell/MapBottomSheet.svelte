<script>
	import ChevronUp from '@lucide/svelte/icons/chevron-up';

	// Not a bits-ui Dialog: the map has to stay live and draggable while a setting changes, and a
	// portal target that unmounts on close would strand the panels' DOM in limbo. So: always
	// mounted, `hidden` on the body when collapsed (display:none keeps the panels' component state
	// and MapLibre subscriptions intact), and no scrim or focus trap.
	let { body = $bindable(), dock = $bindable(), dockPad = 8, title = '' } = $props();
	let open = $state(false);
	const bodyId = $props.id();

	// Opening moves focus into the sheet, so the next Tab lands on its first panel rather than on
	// whatever followed the handle. Skipped on mount: the sheet starts collapsed.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) body?.focus({ preventScroll: true });
		wasOpen = open;
	});
</script>

<div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col md:hidden">
	<!-- Playback dock: outside the sheet, so scrubbing works at either sheet state.
	     `empty:hidden` — fixbikenet and superblockify/blocks have no playbar. `pr-12` clears
	     MapLibre's own bottom-right control stack (zoom, labels, download, expert menu) by the card
	     gap — 10px margin, 29px button, 1px ring, 8px: on a short viewport that stack is tall enough
	     to reach down into this row, and since the dock spans the full width, a vertical-only offset
	     can't rule out the overlap the way a right-side gutter does regardless of how many controls
	     are stacked. `dockPad` is MapHost's measurement, which puts the card on the stack's baseline. -->
	<div
		bind:this={dock}
		style:padding-bottom="{dockPad}px"
		class="pointer-events-none px-3 pr-12 empty:hidden"
	></div>

	<div
		class="pointer-events-auto flex flex-col rounded-t-lg border-t border-border-weaker bg-paper shadow-lg"
	>
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			aria-controls={bodyId}
			class="flex min-h-11 shrink-0 items-center gap-3 px-4 py-2 text-left"
		>
			<span class="h-1 w-8 shrink-0 rounded-full bg-border-weaker" aria-hidden="true"></span>
			<!-- Guarded: `title` defaults to `''`, and an empty span still takes its share of the
			     row's `gap-3`, leaving the handle looking lopsided rather than simply untitled. The
			     button stays labelled either way — the "Info & settings" text below names it. -->
			{#if title}
				<span class="truncate text-sm font-semibold text-ink">{title}</span>
			{/if}
			<span class="ml-auto text-xs text-ink-alt-weaker">{open ? 'Hide' : 'Info & settings'}</span>
			<ChevronUp
				class="size-5 shrink-0 text-ink-alt-weaker transition-transform {open ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
		</button>

		<!-- `map-sheet-body` caps the height in dvh — see layout.css. Custom utility rather than an
		     arbitrary `max-h-[60dvh]`: global styles and non-scale sizes live in layout.css. -->
		<div
			bind:this={body}
			id={bodyId}
			tabindex="-1"
			role="region"
			aria-label={title ? `${title} info and settings` : 'Info and settings'}
			class="flex map-sheet-body min-h-0 flex-col gap-2.5 overflow-y-auto px-3 pb-3 focus:outline-none {open
				? ''
				: 'hidden'}"
		></div>
	</div>
</div>
