<script>
	import { kitStaticTools, relatedTools } from '$lib/data/tools';
	import ToolHeader from '$lib/components/tool/ToolHeader.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';

	// Two groups rather than one list: only BikeNetLib is in the BikeNetKit organisation. The other
	// six are tools by the same research community that BikeNetKit does not include and has no plan
	// to incorporate — listed here because they solve adjacent problems, not as family members.
	const groups = [
		{
			id: 'part-of-bikenetkit',
			title: 'Part of BikeNetKit',
			blurb: 'The shared Python library the rest of the family is built on.',
			tools: kitStaticTools
		},
		{
			id: 'related-tools',
			title: 'Related tools',
			blurb:
				'Built by the same researchers and neighboring groups, and free to use. They are not ' +
				'part of BikeNetKit and ship as code and papers of their own.',
			tools: relatedTools
		}
	];
</script>

<div class="tool-landing-bg h-full overflow-y-auto">
	<div class="mx-auto w-full max-w-5xl px-6 py-12">
		<h1 class="display-name text-4xl text-ink">More tools</h1>
		<p class="mt-4 max-w-2xl text-lg text-ink-alt">
			BikeNetLib, the shared Python library the BikeNetKit tools are built on — plus six related
			tools from the same research community: data-quality assessment, desire lines, corridor
			analysis and node-network planning. All come as code and papers rather than interactive maps.
		</p>

		<nav aria-label="On this page" class="mt-8 border-y border-brand-subtle py-4">
			{#each groups as group (group.id)}
				<div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm not-first:mt-2">
					<span class="text-ink-alt-weaker">{group.title}</span>
					<ul class="flex flex-wrap gap-x-6 gap-y-1">
						{#each group.tools as tool (tool.slug)}
							<li>
								<a href="#{tool.slug}" class="link"
									><ToolName name={tool.name} parts={tool.nameParts} /></a
								>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>

		{#each groups as group (group.id)}
			<section aria-labelledby="{group.id}-heading" class="mt-24 first:mt-12">
				<h2 id="{group.id}-heading" class="font-display text-lg font-bold text-brand">
					{group.title}
				</h2>
				<p class="mt-2 max-w-2xl text-ink-alt">{group.blurb}</p>

				{#each group.tools as tool (tool.slug)}
					<!-- scroll-mt keeps the heading clear of the container top on deep links -->
					<section id={tool.slug} class="mt-8 scroll-mt-6 border-t border-brand-subtle pt-8">
						<ToolHeader {tool} muted level={3} />
					</section>
				{/each}
			</section>
		{/each}
	</div>
</div>

<style>
	/* Same treatment the (tools) group gives its landing pages. */
	.tool-landing-bg {
		background-image: url('/bg.svg');
		background-repeat: no-repeat;
		background-position: right bottom;
		background-size: 33%;
	}
</style>
