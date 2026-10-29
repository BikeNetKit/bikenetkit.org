<script>
	import { resolve } from '$app/paths';
	import ToolCard from './ToolCard.svelte';

	let { interactive } = $props();

	const active = $derived(interactive.filter((tool) => tool.status === 'active'));
	const comingSoon = $derived(interactive.filter((tool) => tool.status === 'coming-soon'));
</script>

<section
	class="grid auto-cols-fr auto-rows-fr grid-cols-2 items-stretch p-2 pt-4 sm:grid-cols-3 xl:flex-1"
>
	{#each active as tool (tool.slug)}
		<ToolCard
			name={tool.name}
			nameParts={tool.nameParts}
			slug={tool.slug}
			description={tool.shortDescription}
			question={tool.questionAnswered}
			category={tool.category}
			status={tool.status}
		/>
	{/each}

	{#each comingSoon as tool (tool.slug)}
		<ToolCard
			name={tool.name}
			nameParts={tool.nameParts}
			slug={tool.slug}
			description={tool.shortDescription}
			category={tool.category}
			status={tool.status}
		/>
	{/each}

	<!-- Sixth tile: BikeNetLib plus the related tools that have no map of their own. -->
	<ToolCard
		name="More tools"
		description="Shared utilities and more tools for assessing data quality, cyclist motions, and recreational bicycle networks."
		category="static"
		status="active"
		href={resolve('/more-tools')}
		cta="See all tools"
	/>
</section>
