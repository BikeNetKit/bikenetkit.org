<script>
	import ExternalLinkButton from '$lib/components/ui/ExternalLinkButton.svelte';
	import Citation from './Citation.svelte';

	// Static tools only: an interactive tool's page shows its paper as a PaperStack beside the
	// commands, and its Code link under them.
	let { paper, repo = undefined, class: className = '' } = $props();
</script>

<aside class="flex max-w-full flex-col gap-2 text-sm {className}">
	{#if paper}
		<Citation {paper} class="pb-6" />
		<ExternalLinkButton href={paper.url} label="Paper" icon="paper" />
	{/if}
	{#if repo}
		<ExternalLinkButton href={repo} label="Code" icon="code" />
	{/if}
	{#if !paper && !repo}
		<p class="text-ink-alt-weaker">Publication and code forthcoming.</p>
	{/if}
</aside>
