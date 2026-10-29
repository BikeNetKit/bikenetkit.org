<script>
	import { resolve } from '$app/paths';
	import {
		activeInteractiveTools,
		staticTools,
		toolBySlug,
		growBikeNetConfig
	} from '$lib/data/tools';
	import {
		screenshotFor,
		growBikeNetVariantLabels,
		linkBikeNetStrategyLabels
	} from '$lib/data/tool-paths';
	import { humanizeLabel, joinList } from '$lib/utils/formatters';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import { RECOMMENDED_FLAGS } from '$lib/data/recommended';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import CityTeaser from '$lib/components/CityTeaser.svelte';
	import ToolSectionHeader from '$lib/components/tool/ToolSectionHeader.svelte';
	import ToolMetricMatrix from '$lib/components/tool/ToolMetricMatrix.svelte';
	import { optionLabel } from '$lib/data/control-copy';
	import { SORTBIKENET_PRIMARY_ORDERINGS } from '$lib/data/sortbikenet';
	import { actionLinksFor } from '$lib/data/contact-links';
	import TakeActionLinks from '$lib/components/TakeActionLinks.svelte';
	import Megaphone from '@lucide/svelte/icons/megaphone';

	let { data } = $props();

	const actionLinks = $derived(actionLinksFor(data.city.slug));

	// The page's facts in a sentence or three, for a reader skimming and for anything that reads the
	// page as text — the sections below are mostly thumbnails.
	const toolNames = $derived(joinList(data.coveringTools.map((t) => t.name)));
	const recommendedNames = $derived(
		data.coveringTools.filter((t) => t.recommended).map((t) => t.name)
	);
	const population = $derived.by(() => {
		const n = data.city.population;
		if (!n) return null;
		if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)} million`;
		return (Math.round(n / 1000) * 1000).toLocaleString('en-US');
	});

	const growBikeNet = toolBySlug['growbikenet'];

	/** Per-tool overrides for the `metric` axis; anything absent falls back to humanizeLabel. */
	const METRIC_LABELS = {
		linkbikenet: linkBikeNetStrategyLabels
	};

	const metricLabelFor = (toolSlug) => (metric) =>
		toolSlug === 'sortbikenet'
			? optionLabel(toolSlug, 'metric', metric)
			: (METRIC_LABELS[toolSlug]?.[metric] ?? humanizeLabel(metric));

	// SortBikeNet's full matrix is 11 orderings × 3 starting points — its own tool page lays that
	// out. Here it shows the primary orderings from the default starting point, as one row.
	const matrixAxes = (tool) =>
		tool.slug === 'sortbikenet'
			? { metrics: SORTBIKENET_PRIMARY_ORDERINGS, types: [tool.config.defaultType] }
			: { metrics: tool.config.metrics, types: tool.config.types };

	const gbnDatasets = $derived(data.cityDatasetsByTool.growbikenet ?? []);
	let gbnVariant = $state(growBikeNetConfig.defaultVariant);

	function hasGbnCombo(metric, type, variant) {
		return gbnDatasets.some((d) => d.metric === metric && d.type === type && d.variant === variant);
	}

	function gbnComboHref(metric, type, variant) {
		return resolve('/(app)/(map)/growbikenet/[city]/[metric]/[type]/[variant]', {
			city: data.city.slug,
			metric,
			type,
			variant
		});
	}

	function gbnComboScreenshot(metric, type, variant) {
		return screenshotFor('growbikenet', { city: data.city.slug, metric, type, variant });
	}

	const hasGbnData = $derived(gbnDatasets.length > 0);
	const gbnRecommended = $derived(data.city.recommended?.gbn === true);

	const variantOptions = growBikeNetConfig.variants.map((v) => ({
		value: v,
		label: growBikeNetVariantLabels[v] ?? v
	}));

	const otherTools = $derived(
		activeInteractiveTools
			.filter((tool) => tool.slug !== 'growbikenet')
			.map((tool) => ({
				tool,
				datasets: data.cityDatasetsByTool[tool.slug] ?? []
			}))
			.filter((entry) => entry.datasets.length > 0)
	);

	function otherToolComboHref(toolSlug, metric, type) {
		return `/${toolSlug}/${data.city.slug}/${metric}/${type}`;
	}

	function otherToolScreenshot(toolSlug, metric, type) {
		return screenshotFor(toolSlug, { city: data.city.slug, metric, type });
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="mx-auto w-full max-w-5xl px-6 pt-12 pb-16">
		<!-- The one place on the site where a breadcrumb earns its keep: a city page has a real
		     parent index, and a reader who arrived on a deep link has no other way up to it. The
		     tool pages get none — their parent is the sidebar, not a route. -->
		<nav aria-label="Breadcrumb" class="mb-3 text-sm text-ink-alt-weaker">
			<ol class="flex items-center gap-2">
				<li><a href={resolve('/(app)/cities')} class="link">Cities</a></li>
				<li aria-hidden="true">/</li>
				<li aria-current="page">{data.city.name}</li>
			</ol>
		</nav>
		<h1 class="font-display text-4xl font-bold text-brand">{data.city.name}</h1>
		{#if data.city.country}
			<p class="mt-2 text-ink-alt-weaker">{data.city.country}</p>
		{/if}
		{#if data.coveringTools.length}
			<p class="mt-6 text-ink-alt">
				{#if population}{data.city.name} has about {population} inhabitants.{/if}
				BikeNetKit has results for {population ? 'it' : data.city.name} from {toolNames}.
				{#if recommendedNames.length === 1}
					The tool recommended for this city is {recommendedNames[0]}.
				{:else if recommendedNames.length > 1}
					The tools recommended for this city are {joinList(recommendedNames)}.
				{/if}
				Each section below opens the interactive maps.
			</p>
		{/if}

		{#if hasGbnData}
			<section class="mt-12">
				<ToolSectionHeader tool={growBikeNet} recommended={gbnRecommended}>
					{#snippet controls()}
						<SegmentedControl
							options={variantOptions}
							active={gbnVariant}
							onSelect={(v) => (gbnVariant = v)}
							ariaLabel="Starting network"
						/>
					{/snippet}
				</ToolSectionHeader>

				<ToolMetricMatrix
					metrics={growBikeNetConfig.metrics}
					types={growBikeNetConfig.types}
					available={(metric, type) => hasGbnCombo(metric, type, gbnVariant)}
					hrefFor={(metric, type) => gbnComboHref(metric, type, gbnVariant)}
					imageFor={(metric, type) => gbnComboScreenshot(metric, type, gbnVariant)}
					metricLabel={metricLabelFor('growbikenet')}
					altFor={(metric, type) =>
						`${data.city.name} ${humanizeLabel(metric)} ${humanizeLabel(type)}`}
				/>
			</section>
		{/if}

		{#each otherTools as { tool, datasets } (tool.slug)}
			{@const cfg = tool.config}
			{@const recommendedKey = RECOMMENDED_FLAGS[tool.slug]}
			{@const isRecommended = recommendedKey && data.city.recommended?.[recommendedKey] === true}
			<section class="mt-16">
				<ToolSectionHeader {tool} recommended={isRecommended} />

				{#if cfg && cfg.metrics.length > 1}
					{@const axes = matrixAxes(tool)}
					<ToolMetricMatrix
						metrics={axes.metrics}
						types={axes.types}
						available={(metric, type) =>
							datasets.some((d) => d.metric === metric && d.type === type)}
						hrefFor={(metric, type) => otherToolComboHref(tool.slug, metric, type)}
						imageFor={(metric, type) => otherToolScreenshot(tool.slug, metric, type)}
						metricLabel={metricLabelFor(tool.slug)}
						altFor={(metric, type) =>
							`${data.city.name} ${tool.name} ${humanizeLabel(metric)} ${humanizeLabel(type)}`}
					/>
				{:else if cfg}
					<div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{#each datasets as d (`${d.metric}-${d.type}`)}
							<CityTeaser
								href={otherToolComboHref(tool.slug, d.metric, d.type)}
								image={otherToolScreenshot(tool.slug, d.metric, d.type)}
								alt="{data.city.name} {tool.name}"
								class="w-full max-w-96"
							/>
						{/each}
					</div>
				{/if}
			</section>
		{/each}

		{#if !hasGbnData && otherTools.length === 0}
			<p class="mt-12 text-ink-alt-weaker">No analyses available for this city yet.</p>
		{/if}

		<!-- More tools. These tools ship as code and papers rather than per-city maps, so
		     there is nothing city-specific to link to — but a reader who has just looked at this city
		     through four tools should not have to guess that the others exist. Beside it, where to
		     take what they saw: the same links as the map toolbar's "Take action!" button. -->
		<div class="mt-16 grid gap-10 border-t border-brand-subtle pt-8 md:grid-cols-2">
			<section>
				<h2 class="font-display text-lg font-bold text-brand">More tools</h2>
				<p class="mt-2 max-w-2xl text-ink-alt">
					These have no map for {data.city.name}: they run on your own data and are published as
					code and papers.
				</p>
				<ul class="mt-4 flex flex-wrap gap-x-6 gap-y-2">
					{#each staticTools as tool (tool.slug)}
						<li>
							<a href="{resolve('/(app)/more-tools')}#{tool.slug}" class="link"
								><ToolName name={tool.name} parts={tool.nameParts} /></a
							>
						</li>
					{/each}
				</ul>
			</section>

			{#if actionLinks.length}
				<section aria-labelledby="take-action-heading">
					<h2
						id="take-action-heading"
						class="flex items-center gap-2 font-display text-lg font-bold text-brand"
					>
						<Megaphone class="h-5 w-5 shrink-0" aria-hidden="true" />
						<span class="underline decoration-brand-vivid/50 decoration-4 underline-offset-2">
							Take action in {data.city.name}
						</span>
					</h2>
					<p class="mt-2 max-w-2xl text-ink-alt">
						Bring what you see here to the people who plan your streets.
					</p>
					<div class="mt-2 -ml-2">
						<TakeActionLinks links={actionLinks} />
					</div>
				</section>
			{/if}
		</div>
	</div>
</div>
