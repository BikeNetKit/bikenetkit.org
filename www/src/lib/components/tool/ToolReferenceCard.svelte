<script>
	import ExternalLinkButton from '$lib/components/ui/ExternalLinkButton.svelte';
	import PaperStack from './PaperStack.svelte';

	// Static tools only: the same paper teaser an interactive tool's page shows beside its commands,
	// with the Code link as a full-width button under it. A tool with code but no paper yet
	// (BikeNetLib) gets the button alone rather than a "forthcoming" sheet.
	let { paper, repo = undefined, class: className = '' } = $props();
</script>

<aside class="flex max-w-full flex-col gap-4 text-sm {className}">
	{#if paper}
		<PaperStack {paper} />
	{/if}
	{#if repo}
		<ExternalLinkButton
			href={repo}
			label="Code"
			icon="code"
			variant="solid"
			class="w-full justify-center"
		/>
	{/if}
	{#if !paper && !repo}
		<p class="text-ink-alt-weaker">Publication and code forthcoming.</p>
	{/if}
</aside>
