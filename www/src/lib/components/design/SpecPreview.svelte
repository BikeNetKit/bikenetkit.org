<script>
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import DownloadButton from './DownloadButton.svelte';

	/**
	 * @typedef {object} Props
	 * @property {string} html Markdown rendered at prerender time by `$lib/design/markdown.js`.
	 * @property {{ id: string, text: string }[]} toc Top-level headings, for the jump list.
	 * @property {string} raw The verbatim source, shown by the "Source" view.
	 * @property {string} filename
	 * @property {string} href Where the build serves `raw` as a file, for the Download button.
	 */
	/** @type {Props} */
	let { html, toc, raw, filename, href } = $props();

	let view = $state('rendered');

	const viewOptions = [
		{ value: 'rendered', label: 'Rendered' },
		{ value: 'source', label: 'Source' }
	];
</script>

<div class="rounded border border-border-weaker bg-paper-white">
	<div
		class="flex flex-wrap items-center gap-3 border-b border-border-weaker bg-paper-brand px-4 py-3"
	>
		<code class="font-mono text-xs text-ink">www/{filename}</code>
		<div class="ml-auto flex flex-wrap items-center gap-2">
			<SegmentedControl
				options={viewOptions}
				active={view}
				onSelect={(v) => (view = v)}
				ariaLabel="Preview format"
			/>
			<DownloadButton label="Download" variant="outline" {href} download={filename} />
		</div>
	</div>

	{#if view === 'rendered'}
		<nav aria-label="Spec contents" class="border-b border-border-weakest px-4 py-3">
			<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{#each toc as entry (entry.id)}
					<a class="link link-quiet" href="#{entry.id}">{entry.text}</a>
				{/each}
			</div>
		</nav>
		<!-- The markdown is rendered at prerender time from DESIGN.md, a file in this repo. There is
		     no user input anywhere in the path, so there is nothing to sanitize. -->
		<div class="spec-preview prose-brand prose prose-sm max-w-none px-6 py-5">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- Deliberate, as in CodeSample: the source view is a scrollable region with no focusable
		     content of its own, so it has to be reachable by keyboard to be scrolled at all
		     (WCAG 2.1.1). The lint rule does not model the scrollable-region exception. -->
		<pre
			tabindex="0"
			role="region"
			aria-label="{filename} source"
			class="spec-preview px-6 py-5 font-mono text-2xs leading-relaxed text-ink">{raw}</pre>
	{/if}
</div>
