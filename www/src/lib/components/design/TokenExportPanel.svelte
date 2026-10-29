<script>
	import { downloadBlob } from '$lib/design/download.js';
	import { buildTokenExport, buildDtcgExport } from '$lib/design/tokens.js';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import DownloadButton from './DownloadButton.svelte';

	let { resolved, version } = $props();

	let showPreview = $state(false);
	let format = $state('w3c');

	const formats = {
		w3c: {
			label: 'W3C',
			filename: 'bikenetkit.tokens.json',
			build: () => buildDtcgExport(resolved, version)
		},
		flat: {
			label: 'Flat',
			filename: 'bikenetkit-design-tokens.json',
			build: () => buildTokenExport(resolved, version)
		}
	};

	const formatOptions = Object.entries(formats).map(([value, f]) => ({ value, label: f.label }));

	const active = $derived(formats[format]);
	const json = $derived(JSON.stringify(active.build(), null, 2));
	const tokenCount = $derived(resolved.filter((t) => t.category === 'color').length);

	function download() {
		downloadBlob(new Blob([json], { type: 'application/json' }), active.filename);
	}
</script>

<div class="flex h-full w-full flex-col rounded border border-border-weaker bg-paper-white p-4">
	<p class="text-sm text-ink-weaker">
		Resolved design tokens ({tokenCount} colors + fonts, sizes &amp; tracking) as JSON — values are computed
		(incl. <code class="font-mono text-xs">color-mix()</code>) and ready for Python or other apps.
	</p>
	<p class="mt-2 text-sm text-ink-weaker">
		<strong class="font-semibold text-ink">W3C</strong> is the Design Tokens Community Group
		interchange format (<code class="font-mono text-xs">$value</code> /
		<code class="font-mono text-xs">$type</code>) that Style Dictionary, Tokens Studio and Figma
		read. <strong class="font-semibold text-ink">Flat</strong> is the older BikeNetKit-specific
		shape, which also carries each token's
		<code class="font-mono text-xs">--var</code> name and raw CSS declaration.
	</p>
	<div class="mt-auto flex flex-wrap items-center gap-2 pt-3">
		<SegmentedControl
			options={formatOptions}
			active={format}
			onSelect={(v) => (format = v)}
			ariaLabel="Token format"
		/>
		<DownloadButton label="Download" onclick={download} />
		<button
			type="button"
			onclick={() => (showPreview = !showPreview)}
			class="text-sm text-brand hover:underline"
		>
			{showPreview ? 'Hide' : 'Preview'}
		</button>
	</div>
	{#if showPreview}
		<pre
			class="mt-3 max-h-80 overflow-auto rounded border border-border-weaker bg-paper p-3 font-mono text-2xs text-ink">{json}</pre>
	{/if}
</div>
