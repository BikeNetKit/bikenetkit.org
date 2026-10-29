<script>
	import { downloadBlob, downloadUrl, svgToPng } from '$lib/design/download.js';

	let { asset } = $props();

	let busyScale = $state(null);

	const scales = [1, 2, 4];

	// Backgrounds (banner, city-bg) ship as pre-rendered PNGs only: their SVGs are huge
	// and banner.svg embeds an outdated logo, so we hide the SVG/rasterized variants.
	const isBackground = $derived(asset.group === 'backgrounds');

	async function downloadSvg() {
		const blob = new Blob([asset.rawSvg], { type: 'image/svg+xml;charset=utf-8' });
		downloadBlob(blob, `${asset.name}.svg`);
	}

	async function downloadPng(scale) {
		if (busyScale !== null) return;
		busyScale = scale;
		try {
			const blob = await svgToPng(asset.rawSvg, { scale });
			if (blob) downloadBlob(blob, `${asset.name}@${scale}x.png`);
		} finally {
			busyScale = null;
		}
	}

	function downloadOriginalPng() {
		downloadUrl(asset.pngUrl, `${asset.name}@2x.png`);
	}

	const action =
		'rounded border border-border-weaker bg-white/60 px-2 py-1 font-mono text-2xs text-ink-alt transition-colors hover:border-brand-vivid hover:bg-white hover:text-ink-alt disabled:opacity-50';
</script>

<div class="flex flex-col rounded border border-border-weaker bg-paper-white p-3">
	<div
		class="checkerboard mb-3 flex h-28 items-center justify-center overflow-hidden rounded bg-paper p-3"
	>
		<img
			src={asset.svgUrl ?? asset.pngUrl}
			alt={asset.label}
			class="max-h-full max-w-full object-contain"
		/>
	</div>
	<div class="min-w-0">
		<div class="truncate text-sm font-semibold text-ink">{asset.label}</div>
		<div class="truncate font-mono text-2xs text-ink-weaker">
			{asset.name}.{asset.svgUrl ? 'svg' : 'png'}
		</div>
	</div>
	<div class="mt-3 flex flex-wrap gap-1.5">
		{#if !isBackground}
			<button type="button" class={action} onclick={downloadSvg}>SVG</button>
			{#each scales as scale (scale)}
				<button
					type="button"
					class={action}
					disabled={busyScale !== null}
					onclick={() => downloadPng(scale)}
				>
					{busyScale === scale ? '…' : `PNG ${scale}×`}
				</button>
			{/each}
		{/if}
		{#if asset.pngUrl}
			<button type="button" class={action} onclick={downloadOriginalPng}>
				{isBackground ? 'PNG 2×' : 'PNG 2× orig'}
			</button>
		{/if}
	</div>
</div>
