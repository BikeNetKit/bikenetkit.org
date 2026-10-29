<script>
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import MapToolbar from '$lib/components/map-shell/MapToolbar.svelte';
	import MapHost from '$lib/components/map-shell/MapHost.svelte';
	import UnavailableNotice from '$lib/components/map-shell/UnavailableNotice.svelte';
	import { toolBySlug } from '$lib/data/tools';
	import { PANEL_FIT_PADDING } from '$lib/map-style/render-config.js';
	import { setViewFlag, viewFlag, viewSearch } from '$lib/utils/view-params';
	import { provideExpertMenu } from '$lib/components/map-shell/expertMenu.svelte.js';
	import { provideActiveDataset } from '$lib/data/active-dataset.svelte.js';
	import { provideMapTable } from '$lib/components/map-shell/mapTable.svelte.js';
	import MapTableDialog from '$lib/components/map-shell/MapTableDialog.svelte';
	import { resetIntros } from '$lib/utils/intro-animation';
	import { mapViewLabels } from '$lib/data/tool-page-loader';

	// One holder for the toolbar gear menu; each tool page registers its own content into it.
	provideExpertMenu();

	// Goes into the map's attribution control (see MapHost). This view drops the sidebar, so it is
	// the only chrome left that can keep /legal reachable — one click away, behind the credit's ⓘ
	// button, which rests collapsed here. Written as raw HTML with an absolute path because MapLibre
	// renders the string itself — `resolve()` can't reach inside it, and the site is served from the
	// domain root, so the plain path is correct.
	const LEGAL_ATTRIBUTION_LINK = '<a href="/legal">Privacy</a>';

	// The build-up is an arrival gesture, so the "already played" set lives exactly as long as one
	// visit to the map section. This layout persists across every city/mode/tool switch and is torn
	// down only when the reader leaves for a tool overview or the landing page.
	onDestroy(resetIntros);

	// One MapLibre instance for every interactive tool route. This layout persists across a
	// same-city tool switch, so the basemap and camera stay put while only the page below — the
	// data overlay and its control panels — swaps. `@`-reset to root: these pages drop the sidebar
	// exactly as the old `+page@.svelte` did.
	let { children } = $props();

	const d = $derived(page.data);
	const showLabels = $derived(viewFlag('labels'));
	const search = $derived(viewSearch());
	const cityName = $derived(d.cityOptions.find((c) => c.slug === d.city)?.name ?? d.city);
	const country = $derived(d.cityOptions.find((c) => c.slug === d.city)?.country);
	const tool = $derived(toolBySlug[d.toolSlug]);
	const viewSummary = $derived(
		mapViewLabels(
			d.toolSlug,
			{ city: d.city, metric: d.metric, type: d.type, variant: d.variant },
			{ metric: d.metricOptions, type: d.typeOptions, variant: d.variantOptions }
		)
			.map((v) => `${v.title}: ${v.label}.`)
			.join(' ')
	);

	// The dataset for whichever map page is mounted below. Owned here because `MapDownloadControl`
	// lives inside `MapHost` — a sibling of the page, which therefore cannot provide to it.
	// `covered` comes from the manifest, so a city the tool has no data for never issues a request.
	const ds = provideActiveDataset(
		() =>
			d.covered
				? {
						tool: d.toolSlug,
						city: d.city,
						metric: d.metric,
						type: d.type,
						variant: d.variant ?? 'default'
					}
				: null,
		() => d.city
	);

	// The "View as table" dialog. Closed on every navigation, so it never outlives the map it
	// describes.
	const mapTable = provideMapTable(() => !!d.covered);
	$effect(() => {
		void page.url.pathname;
		mapTable.open = false;
	});
</script>

<div class="flex h-dvh flex-col">
	<MapToolbar
		toolSlug={d.toolSlug}
		currentCity={d.city}
		cityOptions={d.cityOptions}
		toolOptions={d.toolOptions}
		{search}
	/>

	<!-- `relative` is the positioning context for the panel stack and for every overlay the layer
	     sets place absolutely: playhead, HUD cards, tooltip, size filter. -->
	<main id="main" tabindex="-1" class="relative min-h-0 flex-1 bg-paper-brand focus:outline-none">
		<!-- What a crawler or a screen reader gets before the map has loaded: the panels, the tool's
		     own heading among them, render only once the map style is in, which takes WebGL. Plain
		     text and no links, so it adds no invisible tab stop; the labels are not the panels' copy,
		     so a screen reader does not hear that twice. -->
		<section class="sr-only" aria-labelledby="map-page-title">
			<h1 id="map-page-title">{tool.name} in {cityName}</h1>
			<p>
				{tool.shortDescription}
				{#if d.covered}
					An interactive map of its results for {cityName}{country ? `, ${country}` : ''}.
				{/if}
			</p>
			{#if d.covered && viewSummary}
				<p>{viewSummary}</p>
			{/if}
		</section>
		<!-- Rendered here rather than by each tool page: it anchors to the toolbar's current tab, and
		     every tool says the same thing. Before MapHost so its links come right after the toolbar
		     in the tab order. -->
		{#if !d.covered}
			<UnavailableNotice
				toolName={toolBySlug[d.toolSlug].name}
				{cityName}
				cityOptions={d.cityOptions}
				{search}
			/>
		{/if}
		<MapHost
			bounds={d.fitBounds ?? d.bounds}
			cityBoundary={ds.cityBoundary}
			{showLabels}
			onToggleLabels={(v) => setViewFlag('labels', v)}
			showDownload
			showTable
			fitPadding={PANEL_FIT_PADDING}
			attributionExtra={LEGAL_ATTRIBUTION_LINK}
			sheetTitle={toolBySlug[d.toolSlug].name}
			mapTitle="{toolBySlug[d.toolSlug].name} results for {cityName}"
		>
			{@render children()}
		</MapHost>
		<MapTableDialog toolName={tool.name} {cityName} {viewSummary} />
	</main>
</div>
