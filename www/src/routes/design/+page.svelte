<script>
	import CitySearch from '$lib/components/CitySearch.svelte';
	import CountryChip from '$lib/components/ui/CountryChip.svelte';
	import PlaybackControl from '$lib/components/PlaybackControl.svelte';
	import ToolCard from '$lib/components/landing/ToolCard.svelte';
	import CityTeaser from '$lib/components/CityTeaser.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import SelectMenu from '$lib/components/ui/SelectMenu.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import ToggleButton from '$lib/components/ui/ToggleButton.svelte';
	import CheckboxControl from '$lib/components/ui/CheckboxControl.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CodeSample from '$lib/components/ui/CodeSample.svelte';
	import SuperblockSizeFilter from '$lib/components/map/SuperblockSizeFilter.svelte';
	import ExternalLinkButton from '$lib/components/ui/ExternalLinkButton.svelte';
	import TakeActionButton from '$lib/components/map-shell/TakeActionButton.svelte';
	import TakeActionLinks from '$lib/components/TakeActionLinks.svelte';
	import { actionLinksFor } from '$lib/data/contact-links';
	import DownloadButton from '$lib/components/design/DownloadButton.svelte';
	import AssetCard from '$lib/components/design/AssetCard.svelte';
	import TokenExportPanel from '$lib/components/design/TokenExportPanel.svelte';
	import SubLogoSection from '$lib/components/design/SubLogoSection.svelte';
	import SpecPreview from '$lib/components/design/SpecPreview.svelte';
	import MapLayersSection from '$lib/components/design/MapLayersSection.svelte';
	import { parseThemeTokens, resolveTokens, groupColorTokens } from '$lib/design/tokens.js';
	import { brandAssets, assetGroups } from '$lib/design/assets.js';
	import { downloadMarkdown } from '$lib/design/download.js';
	import { cities } from '$lib/data/cities';
	import { datasets } from '$lib/data/datasets';
	import { availableSlugs } from '$lib/data/city-tools';
	import { toolExamplesFor } from '$lib/data/landing';
	import designMd from '../../../DESIGN.md?raw';
	import { version } from '../../../package.json';

	let { data } = $props();

	// Colour swatches are derived from layout.css (single source of truth):
	// names are parsed at build time, values resolved in-browser via a probe
	// element so var() chains and color-mix() come out fully computed.
	let probe = $state();
	let resolvedTokens = $state([]);
	$effect(() => {
		if (probe) resolvedTokens = resolveTokens(parseThemeTokens(), probe);
	});
	/** @type {Record<string, { name: string, value: string, alias: string | null, note: string | null }[]>} */
	const colorGroups = $derived(groupColorTokens(resolvedTokens));

	const groupTitles = {
		logos: 'Logos',
		wordmarks: 'Wordmarks',
		qr: 'QR codes',
		backgrounds: 'Backgrounds'
	};

	// Demo data for SuperblockSizeFilter: log-uniform block areas, roughly the shape a real city's
	// distribution has (many small blocks, a long tail of large ones).
	const demoSizes = Array.from({ length: 400 }, (_, i) => 10 ** (-4 + 4.2 * (i / 399) ** 2)).sort(
		(a, b) => a - b
	);
	const demoExtent = { min: demoSizes[0], max: demoSizes[demoSizes.length - 1] };
	let demoSizeRange = $state([Math.log10(demoExtent.min), Math.log10(demoExtent.max)]);
	const demoVisible = $derived(
		demoSizes.filter((km2) => km2 >= 10 ** demoSizeRange[0] && km2 <= 10 ** demoSizeRange[1]).length
	);

	// Real cities, resolved through the same helper the landing page uses, so the demo screenshots
	// cannot drift: city slugs are `<base>_<cc>` cityids (`copenhagen_dk`), and a bare city name
	// silently yields a 404 image.
	const teaserExamples = toolExamplesFor(
		'growbikenet',
		cities.filter((c) => availableSlugs(c, datasets).includes('growbikenet')).slice(0, 2)
	);

	const downloadDesignMd = () => downloadMarkdown(designMd, 'DESIGN.md');

	const dummyCities = [
		{ name: 'Copenhagen', slug: 'copenhagen', country: 'Denmark', countryCode: 'DK' },
		{ name: 'Vienna', slug: 'vienna', country: 'Austria', countryCode: 'AT' },
		{ name: 'Bogotá', slug: 'bogota', country: 'Colombia', countryCode: 'CO' }
	];

	let pbFrame = $state(12);
	let pbPlaying = $state(false);
	let pbFrame2 = $state(412);
	let pbPlaying2 = $state(false);

	// FixBikeNet's install/run pair, verbatim from docs.bikenetkit.org/FixBikeNet/.
	const codeSampleDemo =
		"conda install fixbikenet\npython\nimport fixbikenet as fbn\nfbn.fixbikenet('Frederiksberg Municipality')";

	const tabOptions = ['standard', 'extended', 'plus'];
	let activeTab = $state('standard');
	const dropdownOptions = [
		{ value: 'real', label: 'As built' },
		{ value: 'betweenness', label: 'Betweenness' },
		{ value: 'closeness', label: 'Closeness' },
		{ value: 'coverage', label: 'Coverage' },
		{ value: 'directness', label: 'Directness', available: false },
		{ value: 'random', label: 'Random' }
	];
	let activeDropdown = $state('coverage');

	let togglePressed = $state(true);

	let checkboxChecked = $state(false);

	const toolActive = {
		name: 'GrowBikeNet',
		slug: 'design',
		description: 'Active tool card — links to its interactive visualization.',
		question: 'Where should a bike network grow?',
		category: 'interactive',
		status: 'active'
	};
	// A placeholder name on purpose. This was SortBikeNet until it shipped; nothing in `tools.json`
	// is `coming-soon` any more, so there is no real tool to stand in. Swap in a real one if a
	// future tool arrives unreleased.
	const toolComingSoon = {
		name: 'ExampleBikeNet',
		slug: 'design',
		description: 'Coming-soon card — visually de-emphasized, non-interactive.',
		category: 'interactive',
		status: 'coming-soon'
	};
	const toolStatic = {
		name: 'StretchBikeNet',
		slug: 'design',
		description: 'Static tool card — read-only documentation page.',
		category: 'static',
		status: 'active'
	};
</script>

{#snippet swatch(token)}
	<div class="flex items-center gap-3">
		<div
			class="h-12 w-12 shrink-0 rounded border border-border-weaker"
			style="background-color: var(--color-{token.name});"
		></div>
		<div class="min-w-0 text-xs">
			<div class="font-mono font-semibold text-ink">--color-{token.name}</div>
			<div class="font-mono text-ink-weaker">{token.value}</div>
			{#if token.alias}
				<div class="text-ink-weakest">→ {token.alias}</div>
			{:else if token.note}
				<div class="text-ink-weakest">{token.note}</div>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet swatchGrid(tokens)}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each tokens as t (t.name)}
			{@render swatch(t)}
		{/each}
	</div>
{/snippet}

{#snippet section(id, title, subtitle)}
	<header class="mb-6">
		<h2 {id} class="font-display text-2xl font-bold text-brand">{title}</h2>
		{#if subtitle}<p class="mt-1 text-sm text-ink-weaker">{subtitle}</p>{/if}
	</header>
{/snippet}

<main id="main" tabindex="-1" class="mx-auto max-w-5xl px-6 py-12 focus:outline-none">
	<header class="mb-12 border-b border-brand-subtle pb-8">
		<p class="text-2xs tracking-wider text-ink-alt-weaker uppercase">Internal · noindex</p>
		<h1 class="mt-2 font-display text-4xl font-bold text-brand italic">
			Bike&#8202;Net&#8202;Kit design system
		</h1>
		<p class="mt-3 max-w-2xl text-sm text-ink-weaker">
			Live reference for color tokens, map layers, typography, and reusable UI components. Source of
			truth is
			<code class="font-mono text-xs">www/src/routes/layout.css</code>. Keep
			<code class="font-mono text-xs">DESIGN.md</code> in sync with this page.
		</p>
		<nav aria-label="Design system" class="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs">
			<a class="link" href="#downloads">Downloads</a>
			<a class="link" href="#colors">Colors</a>
			<a class="link" href="#maps">Maps</a>
			<a class="link" href="#typography">Typography</a>
			<a class="link" href="#buttons">Buttons</a>
			<a class="link" href="#tabs">Tab bar</a>
			<a class="link" href="#dropdown">Dropdown</a>
			<a class="link" href="#components">Components</a>
			<a class="link" href="#routing">Routing</a>
			<a class="link" href="#spec">Spec</a>
			<a class="link" href="#conventions">Conventions</a>
		</nav>
	</header>

	<span bind:this={probe} aria-hidden="true" class="pointer-events-none absolute h-0 w-0 opacity-0"
	></span>

	<section class="mb-16">
		{@render section(
			'downloads',
			'Downloads',
			'Brand assets, design tokens, and this spec — ready to hand off.'
		)}

		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
			<div>
				<h3 class="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">Spec</h3>
				<div class="flex h-full flex-col rounded border border-border-weaker bg-paper-white p-4">
					<p class="text-sm text-ink-weaker">
						The current <code class="font-mono text-xs">DESIGN.md</code> bundled with this build —
						read it in <a class="link" href="#spec">the preview below</a>.
					</p>
					<div class="mt-auto pt-3">
						<DownloadButton label="Download DESIGN.md" onclick={downloadDesignMd} />
					</div>
				</div>
			</div>
			<div>
				<h3 class="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
					Design tokens
				</h3>
				<TokenExportPanel resolved={resolvedTokens} {version} />
			</div>
		</div>

		<h3 class="mt-20 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Brand assets
		</h3>
		<p class="mb-4 text-sm text-ink-weaker">
			Download as SVG (vector) or PNG (rasterized in-browser at the chosen scale).
		</p>
		{#each assetGroups as group (group)}
			<h4 class="mt-6 mb-3 font-display text-xs font-bold tracking-wide text-ink-weaker uppercase">
				{groupTitles[group]}
			</h4>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each brandAssets.filter((a) => a.group === group) as asset (asset.name)}
					<AssetCard {asset} />
				{/each}
			</div>
		{/each}

		<h3 class="mt-20 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Tool logos
		</h3>
		<p class="mb-4 text-sm text-ink-weaker">
			The horizontal lockup with the tool name in place of the wordmark — same font, size, spacing
			and color. Type is converted to outlines, so the files need no font to open.
		</p>
		<SubLogoSection />
	</section>

	<section class="mb-16">
		{@render section(
			'colors',
			'Color tokens',
			'All values defined in layout.css @theme block. Reference via var(--color-…) or Tailwind utilities like bg-brand.'
		)}

		<h3 class="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Base palette
		</h3>
		{@render swatchGrid(colorGroups.base)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Brand (semantic)
		</h3>
		{@render swatchGrid(colorGroups.brand)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Ink (text)
		</h3>
		{@render swatchGrid(colorGroups.ink)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Surfaces
		</h3>
		{@render swatchGrid(colorGroups.surface)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Borders
		</h3>
		{@render swatchGrid(colorGroups.border)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Category palette
		</h3>
		<p class="mb-3 text-sm text-ink-weaker">
			Used to color categorical groups in visualizations, e.g. superblockify classification IDs.
			Hashed assignment; <code class="font-mono text-xs">category-other</code> is the unclassified fallback.
		</p>
		{@render swatchGrid(colorGroups.category)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Existing network
		</h3>
		<p class="mb-3 text-sm text-ink-weaker">
			Periwinkle baseline for already-built bike infrastructure, kept off the green ramp so that
			stays exclusive to newly proposed links. LinkBikeNet distinguishes segments wired into the
			largest connected component by saturation, not hue. Mirrored in
			<code class="font-mono text-xs">$lib/colors.js</code> for MapLibre paint.
		</p>
		{@render swatchGrid(colorGroups.network)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Notice
		</h3>
		<p class="mb-3 text-sm text-ink-weaker">
			Pale amber for a state the reader must not miss: a tool with no results for the city. Body
			copy on it stays in the ink colors. Apply it through
			<code class="font-mono text-xs">CardPanel surface="notice"</code>.
		</p>
		{@render swatchGrid(colorGroups.notice)}

		<h3 class="mt-10 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
			Visualization ramp
		</h3>
		<div class="flex overflow-hidden rounded border border-border-weaker">
			{#each colorGroups.ramp as r (r.name)}
				<div class="h-12 flex-1" style="background-color: var(--color-{r.name});"></div>
			{/each}
		</div>
		<div class="mt-2 grid grid-cols-4 gap-2 font-mono text-2xs text-ink-weaker">
			{#each colorGroups.ramp as r (r.name)}
				<div>
					<div class="font-semibold text-ink">{r.name}</div>
					{r.value}
				</div>
			{/each}
		</div>
	</section>

	<section class="mb-16">
		<MapLayersSection />
	</section>

	<section class="mb-16">
		{@render section(
			'typography',
			'Typography',
			'Three families. Bespoke Sans for display, Public Sans for body and most labels & values, IBM Plex Mono for HUD telemetry and small counters only.'
		)}

		<div class="space-y-6">
			<div class="rounded border border-brand-subtle bg-paper-white p-6">
				<div class="text-2xs tracking-wider text-ink-alt-weaker uppercase">
					font-display · Bespoke Sans · weights 300–800
				</div>
				<p class="mt-3 font-display text-4xl font-bold text-brand italic">
					Bike&#8202;Net&#8202;Kit
				</p>
				<p class="mt-2 font-display text-2xl font-semibold text-ink">Headline · text-2xl 600</p>
				<p class="mt-1 font-display text-lg font-bold text-ink">Section heading · text-lg 700</p>
				<p class="mt-1 font-display text-sm font-bold text-brand italic">
					CTA · text-sm 700 italic
				</p>
			</div>

			<div class="rounded border border-brand-subtle bg-paper-white p-6">
				<div class="text-2xs tracking-wider text-ink-alt-weaker uppercase">
					font-sans · Public Sans
				</div>
				<p class="mt-3 text-base text-ink">
					Body — the quick brown fox jumps over the lazy dog. Body text uses Public Sans at the
					default size; paragraphs are capped at 30em for readability.
				</p>
				<p class="mt-2 text-sm text-ink-weaker">
					text-sm · used for secondary text, descriptions, and most UI labels.
				</p>
				<p class="mt-2 text-xs text-ink-weakest">
					text-xs · used for captions, "coming soon" labels, sub-labels.
				</p>
			</div>

			<!-- Shown on both surfaces the class actually lands on, since the resting underline and the
			     ink-link green have to hold up on white and on paper-brand alike. -->
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="rounded border border-brand-subtle bg-paper-white p-6">
					<div class="text-2xs tracking-wider text-ink-alt-weaker uppercase">
						class="link" · on white
					</div>
					<p class="mt-3 text-sm text-ink">
						Inline links in body copy always use <code class="font-mono text-xs">.link</code> —
						check out the <a class="link" href="#colors">color tokens</a>, or read the
						<a class="link" href="#conventions">conventions</a>. Never style a prose link with bare
						<code class="font-mono text-xs">text-brand</code>.
					</p>
				</div>
				<div class="rounded border border-brand-subtle bg-paper-brand p-6">
					<div class="text-2xs tracking-wider text-ink-alt-weaker uppercase">
						class="link" · on paper-brand
					</div>
					<p class="mt-3 text-sm text-ink">
						Inline links in body copy always use <code class="font-mono text-xs">.link</code> —
						check out the <a class="link" href="#colors">color tokens</a>, or read the
						<a class="link" href="#conventions">conventions</a>. Never style a prose link with bare
						<code class="font-mono text-xs">text-brand</code>.
					</p>
					<p class="mt-4 text-sm text-ink">
						<a class="link link-quiet" href="#components">link-quiet</a> drops the resting underline for
						grids where every item is a link — hover to reveal it.
					</p>
				</div>
			</div>

			<div class="rounded border border-brand-subtle bg-paper-white p-6">
				<div class="text-2xs tracking-wider text-ink-alt-weaker uppercase">
					font-mono · IBM Plex Mono · weights 400–700
				</div>
				<p class="mt-3 font-mono text-sm text-ink tabular-nums">FRAME 0042 / 0128</p>
				<p class="mt-1 text-2xs text-ink-alt-weaker">
					text-2xs (0.625rem) — used only for HUD telemetry &amp; small counters
				</p>
			</div>

			<div class="rounded border border-brand-subtle bg-paper-white p-6">
				<div class="text-2xs tracking-wider text-ink-alt-weaker uppercase">
					Weight ladder · Bespoke Sans
				</div>
				<div class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-display text-lg sm:grid-cols-3">
					<span style="font-weight: 300;">300 Light</span>
					<span style="font-weight: 400;">400 Regular</span>
					<span style="font-weight: 500;">500 Medium</span>
					<span style="font-weight: 600;">600 Semibold</span>
					<span style="font-weight: 700;">700 Bold</span>
					<span style="font-weight: 800;">800 Extrabold</span>
				</div>
			</div>
		</div>
	</section>

	<section class="mb-16">
		{@render section(
			'buttons',
			'Buttons & controls',
			'Reusable button primitives in src/lib/components/ui/.'
		)}

		<div class="space-y-8">
			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">IconButton</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Circular. <code class="font-mono text-xs">variant="solid"</code> (default) is
					brand-filled, used as the play/pause control in
					<code class="font-mono text-xs">PlaybackControl</code>.
					<code class="font-mono text-xs">variant="ghost"</code> with
					<code class="font-mono text-xs">size="sm"</code> is the quieter companion used for its step
					buttons.
				</p>
				<div class="flex items-center gap-4 rounded border border-brand-subtle bg-paper-white p-6">
					<IconButton ariaLabel="Play">
						<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
							<polygon points="3,2 10,6 3,10" />
						</svg>
					</IconButton>
					<code class="font-mono text-xs text-ink-weaker">&lt;IconButton ariaLabel="Play"&gt;</code>
				</div>
				<div
					class="mt-3 flex items-center gap-4 rounded border border-brand-subtle bg-paper-white p-6"
				>
					<IconButton variant="ghost" size="sm" ariaLabel="Previous step">
						<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
							<polygon points="9,2 3,6 9,10" />
						</svg>
					</IconButton>
					<code class="font-mono text-xs text-ink-weaker"
						>&lt;IconButton variant="ghost" size="sm"&gt;</code
					>
				</div>
				<div
					class="mt-3 flex items-center gap-4 rounded border border-brand-subtle bg-paper-white p-6"
				>
					<IconButton variant="ghost" size="sm" disabled ariaLabel="Previous step">
						<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
							<polygon points="9,2 3,6 9,10" />
						</svg>
					</IconButton>
					<code class="font-mono text-xs text-ink-weaker">&lt;IconButton disabled&gt;</code>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">ToggleButton</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Bordered square icon button with a pressed state. For compact on/off map overlays where
					the icon alone carries the meaning — when it doesn't, use <code class="font-mono text-xs"
						>CheckboxControl</code
					> instead.
				</p>
				<div class="flex items-center gap-4 rounded border border-brand-subtle bg-paper-white p-6">
					<ToggleButton
						pressed={togglePressed}
						onclick={() => (togglePressed = !togglePressed)}
						title="Toggle seed nodes"
					>
						<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
							<circle cx="3.5" cy="3.5" r="1.5" />
							<circle cx="10.5" cy="3.5" r="1.5" />
							<circle cx="3.5" cy="10.5" r="1.5" />
							<circle cx="10.5" cy="10.5" r="1.5" />
						</svg>
					</ToggleButton>
					<code class="font-mono text-xs text-ink-weaker"
						>&lt;ToggleButton pressed onclick title&gt;</code
					>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">CheckboxControl</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Native checkbox with a visible text label, for optional map layers that need naming
					(GrowBikeNet's seed points, the basemap labels). The whole label is the click target.
				</p>
				<div class="flex items-center gap-4 rounded border border-brand-subtle bg-paper-white p-6">
					<CheckboxControl bind:checked={checkboxChecked} label="Seed points" />
					<code class="font-mono text-xs text-ink-weaker"
						>&lt;CheckboxControl bind:checked label&gt;</code
					>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">ExternalLinkButton</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Link with icon. Used for the "Paper", "Code", and "Docs" links on tool pages.
					<code class="font-mono text-xs">icon</code>
					accepts
					<code class="font-mono text-xs">'paper' | 'code' | 'docs' | 'external'</code>; the
					<code class="font-mono text-xs">external</code> icon is unused on tool pages today (it was the
					"Live demo" link back to the tools' old standalone prototypes) but stays available for a future
					external-link pattern of that shape.
				</p>
				<div
					class="flex flex-col gap-2 rounded border border-brand-subtle bg-paper-white p-6 text-sm"
				>
					<ExternalLinkButton href="#buttons" label="Paper" icon="paper" />
					<ExternalLinkButton href="#buttons" label="Code" icon="code" />
					<ExternalLinkButton href="#buttons" label="Docs" icon="docs" />
					<ExternalLinkButton href="#buttons" label="External" icon="external" />
				</div>
				<p class="mt-4 mb-3 text-sm text-ink-weaker">
					<code class="font-mono text-xs">variant</code>
					is <code class="font-mono text-xs">'outline'</code> (above) or
					<code class="font-mono text-xs">'solid'</code>. Solid carries the "Docs" and "Code" links
					in a row under the commands, where they are the call to action after the commands; outline
					carries a static tool's "Paper" and "Code" inside its citation card, where a filled button
					would shout over the citation that is the point of the card.
				</p>
				<div
					class="flex flex-col gap-2 rounded border border-brand-subtle bg-paper-white p-6 text-sm"
				>
					<ExternalLinkButton href="#buttons" label="Docs" icon="docs" variant="solid" />
					<ExternalLinkButton href="#buttons" label="Code" icon="code" variant="solid" />
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">Take action!</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					The one underlined button: the map toolbar's call to action, which opens a popover of
					<code class="font-mono text-xs">TakeActionLinks</code> for the current city. Ordinary
					outline, white fill, a thick half-strength lime underline on the label. Icon-only below
					<code class="font-mono text-xs">lg</code>. The same list renders on each city page.
				</p>
				<div
					class="flex flex-col gap-4 rounded border border-brand-subtle bg-paper-white p-6 text-sm"
				>
					<div class="flex items-center gap-2">
						<TakeActionButton citySlug="aachen_de" cityName="Aachen" />
					</div>
					<div class="max-w-80">
						<TakeActionLinks links={actionLinksFor('aachen_de')} />
					</div>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">Badge</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Pill badge for emphasis labels (e.g. "Recommended").
				</p>
				<div class="flex items-center gap-4 rounded border border-brand-subtle bg-paper-white p-6">
					<Badge>Recommended!</Badge>
					<code class="font-mono text-xs text-ink-weaker">&lt;Badge&gt;</code>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">CardPanel</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Floating panel container used by map overlays. Four surfaces:
					<em>paper</em> (sand, default — control panels), <em>white</em> (map readouts),
					<em>dark</em> (brand-green identity/header panels; supply light child text), and
					<em>notice</em> (pale amber — the "not available" callout).
				</p>
				<div
					class="grid grid-cols-1 gap-4 rounded border border-brand-subtle bg-paper-white p-6 sm:grid-cols-2 lg:grid-cols-4"
				>
					<div class="flex flex-col items-center gap-2">
						<CardPanel>
							<span
								class="w-max text-2xs font-semibold tracking-wider text-ink-alt-weaker uppercase"
							>
								example metric
							</span>
							<div class="text-2xl leading-none font-semibold tabular-nums">12.4 km</div>
						</CardPanel>
						<code class="font-mono text-xs text-ink-weaker">surface="paper"</code>
					</div>

					<div class="flex flex-col items-center gap-2">
						<CardPanel surface="white">
							<span
								class="w-max text-2xs font-semibold tracking-wider text-ink-alt-weaker uppercase"
							>
								example metric
							</span>
							<div class="text-2xl leading-none font-semibold tabular-nums">12.4 km</div>
						</CardPanel>
						<code class="font-mono text-xs text-ink-weaker">surface="white"</code>
					</div>

					<div class="flex flex-col items-center gap-2">
						<CardPanel surface="dark">
							<span class="w-max text-2xs font-semibold tracking-wider text-brand-subtle uppercase">
								example metric
							</span>
							<div class="text-2xl leading-none font-semibold text-white tabular-nums">12.4 km</div>
						</CardPanel>
						<code class="font-mono text-xs text-ink-weaker">surface="dark"</code>
					</div>

					<div class="flex flex-col items-center gap-2">
						<CardPanel surface="notice">
							<span
								class="flex w-max items-center gap-1 text-2xs font-semibold tracking-wider text-notice uppercase"
							>
								<CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
								not available
							</span>
							<div class="text-sm leading-snug text-ink-alt">No results here yet.</div>
						</CardPanel>
						<code class="font-mono text-xs text-ink-weaker">surface="notice"</code>
					</div>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">SuperblockSizeFilter</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					SuperBlockify's map legend: size distribution as a histogram, plus a two-handle range
					slider that filters the blocks on the map. Both axes are log10 — block areas span three
					orders of magnitude — and the bars outside the selection fade. Drag the bar between the
					handles, or anywhere on the histogram, to slide the whole window at constant width; the
					handles still set each bound on their own, by pointer or keyboard.
				</p>
				<div class="rounded border border-brand-subtle bg-paper-white p-6">
					<SuperblockSizeFilter
						bind:range={demoSizeRange}
						sizes={demoSizes}
						extent={demoExtent}
						visibleCount={demoVisible}
						totalCount={demoSizes.length}
					/>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">CTA link</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Inline italic display-font link with chevron. Used inside
					<code class="font-mono text-xs">ToolCard</code> and similar cards.
				</p>
				<div class="rounded border border-brand-subtle bg-paper-white p-6">
					<a
						href="#buttons"
						class="group inline-flex items-center gap-1 font-display text-sm font-bold text-brand italic hover:underline"
					>
						Explore
						<svg
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M9 5l7 7-7 7" />
						</svg>
					</a>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">Sidebar nav item</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Used for active/inactive nav rows in
					<code class="font-mono text-xs">(app)/+layout.svelte</code>. Active row is filled brand;
					inactive rows highlight on hover.
				</p>
				<div class="flex w-64 flex-col gap-1 rounded border border-brand-subtle bg-paper p-3">
					<a href="#buttons" class="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white">
						Active route
					</a>
					<a
						href="#buttons"
						class="rounded-md px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-brand-subtle hover:text-brand"
					>
						Hoverable route
					</a>
					<span
						class="cursor-default rounded-md px-3 py-2 text-sm font-semibold text-ink-alt-weakest"
					>
						Disabled / coming soon
					</span>
				</div>
			</div>
		</div>
	</section>

	<section class="mb-16">
		{@render section(
			'tabs',
			'SegmentedControl',
			'Pill container holding mutually-exclusive options. Used for variant / type / metric switchers on city and growbikenet pages.'
		)}

		<div class="space-y-6">
			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">Button-driven (local state)</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Pass <code class="font-mono text-xs">onSelect</code> for in-page toggles.
				</p>
				<div class="rounded border border-brand-subtle bg-paper-white p-6">
					<SegmentedControl
						options={tabOptions.map((v) => ({ value: v, label: v }))}
						active={activeTab}
						onSelect={(v) => (activeTab = v)}
						capitalize
						ariaLabel="Example: button mode"
					/>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">Link-driven (route state)</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Pass <code class="font-mono text-xs">hrefFor</code> when switching navigates to a different
					URL.
				</p>
				<div class="rounded border border-brand-subtle bg-paper-white p-6">
					<SegmentedControl
						options={tabOptions.map((v) => ({ value: v, label: v }))}
						active="standard"
						hrefFor={() => '#tabs'}
						capitalize
						ariaLabel="Example: link mode"
					/>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">Unavailable option</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					An option with <code class="font-mono text-xs">available: false</code> renders muted and italic,
					and is not navigable — used where a city has no data for that axis value.
				</p>
				<div class="rounded border border-brand-subtle bg-paper-white p-6">
					<SegmentedControl
						options={[
							{ value: 'grid', label: 'grid' },
							{ value: 'rail', label: 'rail', available: false }
						]}
						active="grid"
						hrefFor={() => '#tabs'}
						capitalize
						ariaLabel="Example: unavailable option"
					/>
				</div>
			</div>
		</div>
	</section>

	<section class="mb-16">
		{@render section(
			'dropdown',
			'SelectMenu',
			'The dropdown counterpart to SegmentedControl, for an axis with too many options for one row of pills — SortBikeNet’s orderings. Same options, same link- or button-driven modes; ControlPanel switches to it with dropdown.'
		)}

		<div class="rounded border border-brand-subtle bg-paper-white p-6">
			<div class="w-72">
				<SelectMenu
					options={dropdownOptions}
					active={activeDropdown}
					onSelect={(v) => (activeDropdown = v)}
					ariaLabel="Ordering"
				/>
			</div>
			<p class="mt-3 text-sm text-ink-weaker">
				The menu is portalled to <code class="font-mono text-xs">body</code>, so a scrolling rail or
				the mobile sheet cannot clip it. An option with
				<code class="font-mono text-xs">available: false</code> renders muted and italic.
			</p>
		</div>
	</section>

	<section class="mb-16">
		{@render section(
			'components',
			'UI components',
			'Live instances. Heavy components (HeroSection, AmbientHeroMap) are described in static blocks below.'
		)}

		<div class="space-y-10">
			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">CitySearch</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Filterable city dropdown. Props: <code class="font-mono text-xs"
						>cities, href, placeholder, class</code
					>. Matches city names and country names; an exact two-letter country code (
					<code class="font-mono text-xs">DK</code>) narrows to that country, which is what clicking
					a row's country chip does.
				</p>
				<div class="rounded border border-brand-subtle bg-paper-white p-6">
					<CitySearch cities={dummyCities} href={(c) => `#${c.slug}`} />
					<p class="mt-3 text-xs text-ink-weakest">Type a letter to see the dropdown.</p>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">CountryChip</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Two-letter country marker for city lists. Props: <code class="font-mono text-xs"
						>code, country, onclick, class</code
					>. With <code class="font-mono text-xs">onclick</code> it is a button that filters the list
					by country; without, an inert label.
				</p>
				<div class="flex items-center gap-4 rounded border border-brand-subtle bg-paper-white p-6">
					<CountryChip code="DK" country="Denmark" />
					<CountryChip code="DE" country="Germany" onclick={() => {}} />
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">PlaybackControl</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Map timeline scrubber. Props: <code class="font-mono text-xs"
						>frame, total, isPlaying, onplay, onpause, onscrub, playbackMs</code
					>. Rendered as a full-width panel at the bottom of the map sidebar. ‹ and › step the
					playhead one frame, and holding one runs the timeline at playback speed — forward or in
					reverse; the counter stacks "n" over "total" at a fixed width so the slider never shifts.
				</p>
				<div class="w-72 rounded border border-brand-subtle bg-paper p-3">
					<PlaybackControl
						bind:frame={pbFrame}
						bind:isPlaying={pbPlaying}
						total={128}
						onplay={() => (pbPlaying = true)}
						onpause={() => (pbPlaying = false)}
					/>
				</div>
				<div class="mt-3 w-72 rounded border border-brand-subtle bg-paper p-3">
					<PlaybackControl
						bind:frame={pbFrame2}
						bind:isPlaying={pbPlaying2}
						total={847}
						onplay={() => (pbPlaying2 = true)}
						onpause={() => (pbPlaying2 = false)}
					/>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">ToolCard</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Three variants: <em>active interactive</em> (white bg), <em>active static</em> (sand bg),
					and <em>coming-soon</em> (subtle bg, no link). The landing page passes active interactive
					tools their <code class="font-mono text-xs">questionAnswered</code> as
					<code class="font-mono text-xs">question</code>, which replaces the description.
				</p>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<ToolCard {...toolActive} />
					<ToolCard {...toolStatic} />
					<ToolCard {...toolComingSoon} />
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">CityTeaser</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Circular city thumbnail with hover scale. Props: <code class="font-mono text-xs"
						>href, image, alt, label, sublabel?, size?</code
					>.
				</p>
				<div class="grid grid-cols-2 gap-6 sm:grid-cols-4">
					{#each teaserExamples as example (example.city)}
						<CityTeaser
							href="#components"
							image={example.screenshot}
							alt="{example.city} — growbikenet"
							label={example.city}
							sublabel="growbikenet"
						/>
					{/each}
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">CodeSample</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Terminal-styled, read-only shell/REPL sample for tool pages. Props: <code
						class="font-mono text-xs"
						>code, label?, maxHeight?, minHeight?, prompt?, requirements?, class?</code
					>. Fluid width, content height; long lines scroll horizontally rather than wrap. Each line
					carries a soft, pseudo-element prompt — <code class="font-mono text-xs">&gt;</code> for a
					shell line, switching to <code class="font-mono text-xs">&gt;&gt;&gt;</code> once a line
					enters a Python REPL and <code class="font-mono text-xs">...</code> for its bracketed
					continuation lines — so selecting the sample still copies the bare commands (<code
						class="font-mono text-xs">prompt=&#123;false&#125;</code
					>
					turns it off entirely). The three window dots are the only non-palette color in the component
					(<code class="font-mono text-xs">--color-terminal-dot-*</code>). Shown here in the row the
					tool pages use — terminal (its title bar carries the
					<code class="font-mono text-xs">requirements</code> line, right-aligned next to the dots), then
					the Docs and Code links.
				</p>
				<div class="rounded border border-brand-subtle bg-paper p-6">
					<div class="grid gap-8 sm:grid-cols-3">
						<div class="min-w-0 sm:col-span-2">
							<CodeSample
								code={codeSampleDemo}
								label="FixBikeNet commands"
								requirements="Python>=3.12"
							/>
						</div>
						<div class="grid grid-cols-2 items-start gap-2 sm:col-span-1">
							<ExternalLinkButton
								href="https://docs.bikenetkit.org/FixBikeNet/"
								label="Docs"
								icon="docs"
								variant="solid"
								class="w-full justify-center"
							/>
							<ExternalLinkButton
								href="https://github.com/BikeNetKit/FixBikeNet"
								label="Code"
								icon="code"
								variant="solid"
								class="w-full justify-center"
							/>
						</div>
					</div>
				</div>

				<p class="mt-4 mb-3 text-sm text-ink-weaker">
					Empty state: a tool whose commands are not published yet (<code class="font-mono text-xs"
						>code=""</code
					>) renders chrome only, held open by <code class="font-mono text-xs">minHeight</code>. No
					prompt, no lines, and the body is <code class="font-mono text-xs">aria-hidden</code> — there
					is nothing to scroll or announce. A tool with only one of the two links keeps the same button
					width and leaves the second cell empty, so the links are the same size on every tool page.
				</p>
				<div class="rounded border border-brand-subtle bg-paper p-6">
					<div class="grid gap-8 sm:grid-cols-3">
						<CodeSample class="min-w-0 sm:col-span-2" code="" minHeight="min-h-24" prompt={false} />
						<div class="grid grid-cols-2 items-start gap-2 sm:col-span-1">
							<ExternalLinkButton
								href="https://github.com/BikeNetKit/LinkBikeNet"
								label="Code"
								icon="code"
								variant="solid"
								class="w-full justify-center"
							/>
						</div>
					</div>
				</div>
			</div>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-ink">Heavy components</h3>
				<p class="mb-3 text-sm text-ink-weaker">
					Not instantiated here because they require live data, WebGL, or full-bleed layout. The map
					itself is shown live under <a class="link" href="#maps">Maps</a>.
				</p>
				<dl class="space-y-3 text-sm">
					<div>
						<dt class="font-semibold text-ink">HeroSection</dt>
						<dd class="text-ink-weaker">
							Landing-page hero: brand logo, headline, and an ambient map background with radial
							gradient overlay.
						</dd>
					</div>
					<div>
						<dt class="font-semibold text-ink">AmbientHeroMap</dt>
						<dd class="text-ink-weaker">
							3D orbiting MapLibre camera that cycles through city/tool combos with build → orbit →
							tear transitions.
						</dd>
					</div>
					<div>
						<dt class="font-semibold text-ink">AmbientHud</dt>
						<dd class="text-ink-weaker">
							Monospace HUD overlay (LAT/LON/BRG/ZOOM, frame counter, blinking cursor) layered over
							AmbientHeroMap. Uses IBM Plex Mono.
						</dd>
					</div>
					<div>
						<dt class="font-semibold text-ink">ToolShowcase</dt>
						<dd class="text-ink-weaker">
							Responsive grid of six ToolCards: the active and coming-soon interactive tools, plus a
							"More tools" tile linking to /more-tools.
						</dd>
					</div>
					<div>
						<dt class="font-semibold text-ink">InfoGrid</dt>
						<dd class="text-ink-weaker">
							Multi-column info block on the landing page (stats, news, team, sponsors, embedded
							CitySearch).
						</dd>
					</div>
				</dl>
			</div>
		</div>
	</section>

	<section class="mb-16">
		{@render section(
			'routing',
			'Routing overview',
			'SvelteKit file-based routing under www/src/routes/.'
		)}
		<pre
			class="overflow-x-auto rounded border border-brand-subtle bg-paper-white p-4 font-mono text-xs leading-relaxed text-ink">src/routes/
├── +layout.svelte            root layout (favicon + layout.css + Meta)
├── +page.svelte              landing page (no sidebar)
├── layout.css                global styles + @theme tokens
├── design/                   ← this page (hidden, noindex)
├── legal/                    imprint &amp; privacy
├── sitemap.xml/+server.ts    generated sitemap
├── embed/[tool]/[city]/…     chrome-free iframe embed
├── og/[name]/                Open Graph card source (pnpm generate:og)
├── og/map|city/…             per-city Open Graph cards (pnpm generate:og-cards)
├── screenshot/[tool]/[city]/ Playwright screenshot routes
├── animation/[tool]/[city]/  chrome-free build-up route (gif / video)
└── (app)/                    layout group with sidebar nav
    ├── +layout.svelte        sidebar
    ├── cities/               index, [city], table/
    ├── more-tools/           BikeNetLib + related tools, one page, anchored sections
    ├── (tools)/(interactive)/    tool landing pages, no city selected
    │   └── growbikenet/ linkbikenet/ fixbikenet/ sortbikenet/ superblockify/
    └── (map)/                +layout@.svelte — full-bleed, escapes the sidebar shell
        ├── growbikenet/[city]/[metric]/[type]/[variant]/
        ├── linkbikenet/[city]/[metric]/[type]/
        ├── fixbikenet/[city]/[metric]/[type]/
        ├── sortbikenet/[city]/[metric]/[type]/   metric = ordering, type = scenario
        └── superblockify/[city]/[metric]/[type]/</pre>
	</section>

	<section class="mb-16">
		{@render section(
			'spec',
			'Spec — DESIGN.md',
			'The written companion to this page, rendered from the copy committed in this build. Where the two disagree, this page wins.'
		)}
		<SpecPreview {...data.spec} raw={designMd} filename="DESIGN.md" />
	</section>

	<section class="mb-16">
		{@render section('conventions', 'Conventions')}
		<ul class="ml-5 list-disc space-y-2 text-sm text-ink">
			<li>
				<strong>Tailwind v4</strong> — tokens declared in
				<code class="font-mono text-xs">@theme</code> inside
				<code class="font-mono text-xs">layout.css</code>. No
				<code class="font-mono text-xs">tailwind.config.js</code>.
			</li>
			<li>
				<strong>Single global stylesheet</strong> — all global rules live in
				<code class="font-mono text-xs">www/src/routes/layout.css</code>. No
				<code class="font-mono text-xs">app.css</code>.
			</li>
			<li>
				<strong>Semantic tokens only</strong> in templates — never hard-code hex. Use
				<code class="font-mono text-xs">bg-brand</code>,
				<code class="font-mono text-xs">text-ink</code>, etc. Hex constants only inside
				<code class="font-mono text-xs">$lib/colors.js</code> for MapLibre paint.
			</li>
		</ul>
	</section>

	<footer class="mt-16 border-t border-brand-subtle pt-6 text-2xs text-ink-alt-weaker">
		hidden · not linked from public nav · keep in sync with
		<code class="font-mono">www/DESIGN.md</code> and
		<code class="font-mono">www/src/routes/layout.css</code>
	</footer>
</main>
