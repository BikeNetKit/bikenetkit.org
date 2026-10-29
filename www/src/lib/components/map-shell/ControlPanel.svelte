<script>
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import PanelHeading from './PanelHeading.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import SelectMenu from '$lib/components/ui/SelectMenu.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import Info from '@lucide/svelte/icons/info';
	import { untrack } from 'svelte';
	import { announce } from '$lib/state/announce.svelte.js';

	let {
		title,
		options = [],
		active,
		hrefFor = undefined,
		onSelect = undefined,
		capitalize = false,
		// A dropdown instead of the pills, for an axis with too many options for one row.
		dropdown = false,
		// Copy for one option. The panel describes what is currently on screen rather than listing
		// every choice — four axes of two options each would be eight paragraphs — and previews the
		// others while the pointer or focus is on them.
		describe = undefined,
		// Optional snippet rendered in the tabs row, right-aligned — e.g. a toggle that belongs
		// beside the tabs rather than stacked below the description.
		controls = undefined,
		// The (?) beside the heading, explaining where the panel's number comes from. The metric
		// panels pass `metricHelp(tool)`; an axis panel (focus, layer, network) passes nothing.
		/** @type {import('$lib/data/metric-help').MetricHelp | null | undefined} */
		help = undefined,
		// No card of its own: for a panel that sits inside another surface (the settings menu),
		// where a second border and shadow would read as a box inside a box.
		bare = false,
		children = undefined
	} = $props();

	let previewed = $state(null);
	const shown = $derived(previewed ?? active);

	// Below `md`, and in a map rail too short for everything (MapHost's `.rail-tight`), the
	// description sits behind an (i): every line of copy pushes the controls further down. CSS
	// rather than `compact`, which reads desktop in SSR.
	let infoOpen = $state(false);
	const uid = $props.id();
	const descId = `${uid}-desc`;

	// Every option's copy, not just the active one: they are all rendered into the same grid cell
	// so the block is as tall as the longest of them and the panel — and everything stacked below
	// it — holds still while the pointer moves across the control. A dropdown previews nothing (its
	// menu is portalled out of the panel), so it carries only the active option's copy.
	const descriptions = $derived(
		(options.length && !dropdown ? options.map((o) => o.value) : [active])
			.map((value) => ({ value, text: describe?.(value) }))
			.filter((d) => d.text)
	);

	// Reads the option off the `data-value` SegmentedControl stamps on each button/link.
	function preview(event) {
		const value = event.target?.closest?.('[data-value]')?.dataset.value;
		if (value) previewed = value;
	}

	// A switch keeps focus on the option just chosen and changes nothing that focus would read out,
	// so the new state — and what it means — is spoken instead. Not on mount: arriving on a page is
	// not a switch.
	let spoken = untrack(() => active);
	$effect(() => {
		if (active === spoken) return;
		spoken = active;
		const label = untrack(() => options.find((o) => o.value === active)?.label ?? active);
		const text = untrack(() => describe?.(active));
		announce(text ? `${title}: ${label}. ${text}` : `${title}: ${label}.`);
	});

	function clearPreview(event) {
		if (event.currentTarget.contains(event.relatedTarget)) return;
		previewed = null;
	}
</script>

{#snippet infoToggle()}
	<div class="hidden max-md:block rail-tight:block">
		<IconButton
			variant="ghost"
			size="sm"
			ariaLabel={infoOpen ? 'Hide explanation' : 'Show explanation'}
			ariaExpanded={infoOpen}
			ariaControls={descId}
			data-state={infoOpen ? 'open' : 'closed'}
			onclick={() => (infoOpen = !infoOpen)}
		>
			<Info class="size-4" aria-hidden="true" />
		</IconButton>
	</div>
{/snippet}

{#snippet body()}
	<PanelHeading {title} {help} actions={descriptions.length ? infoToggle : undefined} />

	{#if options.length > 1 || controls}
		<div class="flex flex-wrap items-center gap-3">
			{#if options.length > 1 && dropdown}
				<div class="w-full">
					<SelectMenu {options} {active} {hrefFor} {onSelect} ariaLabel={title} />
				</div>
			{:else if options.length > 1}
				<!-- `w-max`: the wrapper is a block box, so without it the segmented control's own
				     `self-start` has nothing to act against and the pills stretch across the panel. -->
				<div
					class="w-max max-w-full"
					onpointerover={preview}
					onfocusin={preview}
					onpointerleave={clearPreview}
					onfocusout={clearPreview}
					role="presentation"
				>
					<SegmentedControl
						{options}
						{active}
						{hrefFor}
						{onSelect}
						{capitalize}
						ariaLabel={title}
					/>
				</div>
			{/if}
			{@render controls?.()}
		</div>
	{/if}

	{#if descriptions.length}
		<!-- One grid cell, every description stacked in it: the cell takes the height of the tallest,
		     and `invisible` keeps the others out of both the picture and the accessibility tree while
		     still holding that height. Not a live region: a hover preview is not news. A real switch
		     is announced from the effect above. -->
		<div id={descId} class={infoOpen ? 'grid' : 'grid max-md:hidden rail-tight:hidden'}>
			{#each descriptions as description (description.value)}
				<p
					class="col-start-1 row-start-1 text-xs leading-snug text-ink-alt {description.value ===
					shown
						? ''
						: 'invisible'}"
				>
					{description.text}
				</p>
			{/each}
		</div>
	{/if}

	{@render children?.()}
{/snippet}

{#if bare}
	<div class="flex flex-col gap-2">{@render body()}</div>
{:else}
	<CardPanel width="w-full" gap="gap-2" class="pointer-events-auto">{@render body()}</CardPanel>
{/if}
