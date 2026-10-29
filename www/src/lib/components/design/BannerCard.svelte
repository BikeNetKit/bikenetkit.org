<script>
	import { bannerLayout, bannerName, bannerSvg } from '$lib/design/banner.js';
	import { downloadBlob, svgToPng } from '$lib/design/download.js';
	import BannerArt from './BannerArt.svelte';

	let { font, text } = $props();

	const layout = $derived(bannerLayout(font, text));
	const name = $derived(bannerName(text));

	let busy = $state(null);

	const scales = [1, 2];

	function downloadSvg() {
		const svg = bannerSvg(font, text);
		if (!svg) return;
		const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
		downloadBlob(blob, `${name}.svg`);
	}

	async function downloadPng(scale) {
		if (busy !== null) return;
		busy = scale;
		try {
			const blob = await svgToPng(bannerSvg(font, text), { scale });
			if (blob) downloadBlob(blob, `${name}@${scale}x.png`);
		} finally {
			busy = null;
		}
	}

	const action =
		'rounded border border-border-weaker bg-white/60 px-2 py-1 font-mono text-2xs text-ink-alt transition-colors hover:border-brand-vivid hover:bg-white hover:text-ink-alt disabled:opacity-50';
</script>

{#if layout}
	<div class="flex flex-col rounded border border-border-weaker bg-paper-white p-3">
		<BannerArt
			{layout}
			label="{text} GitHub banner"
			class="mb-3 w-full rounded border border-border-weaker"
		/>
		<div class="min-w-0">
			<div class="truncate text-sm font-semibold text-ink">{text}</div>
			<div class="truncate font-mono text-2xs text-ink-weaker">
				{name} · {layout.width}×{layout.height}
			</div>
		</div>
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each scales as scale (scale)}
				<button
					type="button"
					class={action}
					disabled={busy !== null}
					onclick={() => downloadPng(scale)}
				>
					{busy === scale ? '…' : `PNG ${scale}×`}
				</button>
			{/each}
			<button type="button" class={action} onclick={downloadSvg} title="Vector, ~260 kB">
				SVG
			</button>
		</div>
	</div>
{/if}
