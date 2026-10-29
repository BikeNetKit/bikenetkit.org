<script>
	import Badge from '$lib/components/ui/Badge.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';

	let { tool, recommended = false, controls = undefined } = $props();
</script>

<div class="flex flex-wrap items-center justify-between gap-4">
	<div>
		<div class="flex flex-wrap items-center gap-3">
			<h2 class="display-name text-2xl text-brand">
				<ToolName name={tool.name} parts={tool.nameParts} />
			</h2>
			{#if recommended}
				<Badge>Recommended!</Badge>
			{/if}
		</div>
		<p class="mt-2 max-w-2xl text-sm text-ink-alt">{tool.shortDescription}</p>
	</div>
	{#if controls}
		{@render controls()}
	{/if}
</div>
