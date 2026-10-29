<script>
	import { LoaderCircle } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import AssetCard from './AssetCard.svelte';
	import BannerCard from './BannerCard.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { tools } from '$lib/data/tools';
	import {
		loadBrandFont,
		renderHorizontalLockup,
		slugifyName,
		unsupportedChars
	} from '$lib/design/sublogo.js';

	// The font is fetched at runtime, so the prerendered markup stays on the pending branch.
	const fontRequest = browser ? loadBrandFont() : new Promise(() => {});

	const MODES = [
		{ value: 'lockup', label: 'Logo & wordmark' },
		{ value: 'banner', label: 'GitHub banner' }
	];

	// The banner set leads with the project itself — that card is the bikenetkit repo's.
	const BANNER_NAMES = ['BikeNetKit', ...tools.map((tool) => tool.name)];

	let mode = $state('lockup');
	let customText = $state('');

	function toAsset(font, text) {
		const rawSvg = renderHorizontalLockup(font, text);
		if (!rawSvg) return null;
		return {
			name: `logo-word-mark-horizontal-${slugifyName(text) || 'custom'}`,
			group: 'sublogos',
			label: text,
			rawSvg,
			svgUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rawSvg)}`,
			pngUrl: null
		};
	}
</script>

<div class="flex">
	<SegmentedControl
		options={MODES}
		active={mode}
		onSelect={(value) => (mode = value)}
		ariaLabel="Asset format"
	/>
</div>

{#await fontRequest}
	<p class="mt-4 flex items-center gap-2 text-sm text-ink-weaker">
		<LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" />
		Loading the brand font…
	</p>
{:then font}
	{@const trimmed = customText.trim()}
	{@const missing = trimmed ? unsupportedChars(font, trimmed) : []}

	{#if mode === 'lockup'}
		{@const toolAssets = tools
			.map((tool) => toAsset(font, tool.name))
			.filter((asset) => asset !== null)}
		<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each toolAssets as asset (asset.name)}
				<AssetCard {asset} />
			{/each}
		</div>
	{:else}
		<p class="mt-4 mb-4 text-sm text-ink-weaker">
			GitHub repo social previews at 1280×640, with the lockup centered on the city background.
			Everything stays well inside GitHub's recommended 40&nbsp;px crop-safe border.
		</p>
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			{#each BANNER_NAMES as name (name)}
				<BannerCard {font} text={name} />
			{/each}
		</div>
	{/if}

	<h4 class="mt-10 mb-3 font-display text-xs font-bold tracking-wide text-ink-weaker uppercase">
		Custom {mode === 'banner' ? 'banner' : 'wordmark'}
	</h4>
	<p class="mb-3 text-sm text-ink-weaker">
		Set any text in the lockup. Spaces get the same word gap the wordmark uses between
		<span class="whitespace-nowrap">Bike&#8202;Net&#8202;Kit</span>.
	</p>
	<label class="block">
		<span class="sr-only">Wordmark text</span>
		<input
			type="text"
			bind:value={customText}
			maxlength="48"
			placeholder="e.g. RideBikeNet"
			class="w-full max-w-108 rounded bg-white px-4 py-2.5 text-sm text-brand-ink! hover:border-brand-vivid focus:border-brand"
		/>
	</label>
	{#if missing.length}
		<p class="mt-2 text-sm text-ink-weaker">
			Not available in Bespoke Sans: <span class="font-mono">{missing.join(' ')}</span>
		</p>
	{/if}
	{#if trimmed}
		{#if mode === 'lockup'}
			{@const customAsset = toAsset(font, trimmed)}
			{#if customAsset}
				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<AssetCard asset={customAsset} />
				</div>
			{/if}
		{:else}
			<div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
				<BannerCard {font} text={trimmed} />
			</div>
		{/if}
	{/if}
{:catch error}
	<p class="mt-4 rounded border border-border-weaker bg-paper-white p-3 text-sm text-ink-weaker">
		Could not load Bespoke Sans Bold Italic — logo generation is unavailable. ({error.message})
	</p>
{/await}
