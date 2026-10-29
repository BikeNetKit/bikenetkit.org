<script>
	import CodeSample from '$lib/components/ui/CodeSample.svelte';
	import ExternalLinkButton from '$lib/components/ui/ExternalLinkButton.svelte';
	import PaperStack from './PaperStack.svelte';
	import ToolReferenceCard from './ToolReferenceCard.svelte';
	import ToolTutorialTeaser from './ToolTutorialTeaser.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import { toolVersionFor } from '$lib/data/tools';
	import { formatIsoDate } from '$lib/utils/formatters';

	let { tool, muted = false, level = 1 } = $props();

	const version = $derived(toolVersionFor(tool.slug));

	// level 1 = the tool's own page (h1/h2); level 2 = a section of a page with its own h1; level 3
	// = a tool inside a titled group on /more-tools, where the group heading holds the h2. Several
	// tools on one page must not produce multiple <h1>s, or skip a level under their group.
	// Nothing passes 2 today — /more-tools moved to 3 when it gained group headings — but the arm
	// stays: a prop that accepts 1 and 3 and silently mis-maps 2 is worse than an unused branch.
	const h = $derived(
		level === 1
			? { title: 'h1', sub: 'h2' }
			: level === 2
				? { title: 'h2', sub: 'h3' }
				: { title: 'h3', sub: 'h4' }
	);
	const titleSize = $derived(level === 1 ? 'text-4xl' : 'text-3xl');
	// Static tools have no commands to run, so they get the reference card (Paper and Code) beside
	// the description and no second row.
	const isStatic = $derived(tool.category === 'static');
</script>

<!-- `version` describes the shipped data, not the tool's latest release: the release that produced
     this export and the date of the OpenStreetMap extract behind it. Absent for tools not in the
     export, which includes every static tool. -->
<div class="grid items-baseline-last gap-x-8 gap-y-1 sm:grid-cols-3 lg:gap-x-16">
	<svelte:element
		this={h.title}
		class="display-name {titleSize} sm:col-span-2 {muted ? 'text-ink' : 'text-brand'}"
	>
		<ToolName name={tool.name} parts={tool.nameParts} />
	</svelte:element>
	{#if version}
		<!-- Two lines that read as one sentence, the last one on the heading's baseline. -->
		<p class="text-xs text-ink-alt-weaker">
			<span class="sm:block">Data built with v{version.version}</span>
			{#if version.osmDataDate}
				<span class="sm:block">from OpenStreetMap data of {formatIsoDate(version.osmDataDate)}</span
				>
			{/if}
		</p>
	{/if}
</div>

<!-- Row 1: the description, beside the tutorial teaser for an interactive tool or the citation card
     for a static one. Static tools have no commands, so the card and their Code link stay up here
     and the row below doesn't render for them at all. -->
<div class="mt-8 grid gap-8 sm:grid-cols-3 lg:gap-x-16">
	<p class="text-lg text-ink sm:col-span-2">{tool.longDescription}</p>
	{#if isStatic}
		<ToolReferenceCard
			paper={tool.paper}
			repo={tool.repo}
			class="border-y border-brand-subtle py-6 sm:col-span-1 sm:border-y-0 sm:py-0"
		/>
	{:else if tool.tutorial}
		<div class="sm:col-span-1">
			<ToolTutorialTeaser {tool} />
		</div>
	{/if}
</div>

<!-- Row 2, interactive tools only: the commands with Docs and Code under them, beside the citation
     under its own heading. Same 3-col grid as the rows above and below, so the terminal and the
     citation line up with the description / teaser and the explorer columns. -->
{#if !isStatic}
	<div class="mt-12 grid gap-8 sm:grid-cols-3 lg:gap-x-16">
		{#if tool.usage || tool.docs || tool.repo}
			<!-- `min-w-0` lets the terminal shrink instead of forcing the column to overflow: a grid
			     item defaults to `min-width: auto`, and the <pre>'s scroll container would otherwise
			     push the row wider than its column. -->
			<section class="min-w-0 sm:col-span-2">
				<svelte:element this={h.sub} class="text-lg font-semibold text-brand">
					{tool.usage?.title ?? 'Run it yourself'}
				</svelte:element>
				{#if tool.usage}
					<!-- A tool whose commands are not published yet carries `usage.code: ''` and renders as
					     empty terminal chrome, so the row keeps the same shape on every tool page. The
					     height floor is passed unconditionally: the real samples all clear it already, and
					     it keeps the rows level across the tool pages. -->
					<div class="mt-4">
						<CodeSample
							code={tool.usage.code}
							prompt={tool.usage.code.trim() !== ''}
							minHeight="min-h-24"
							label="{tool.name} commands"
							requirements={tool.usage.requirements}
						/>
					</div>
				{/if}
				<div class="mt-4 flex flex-wrap gap-2">
					{#if tool.docs}
						<ExternalLinkButton href={tool.docs} label="Docs" icon="docs" variant="solid" />
					{/if}
					{#if tool.repo}
						<ExternalLinkButton href={tool.repo} label="Code" icon="code" variant="solid" />
					{/if}
				</div>
			</section>
		{/if}
		<section class="sm:col-span-1">
			<svelte:element this={h.sub} class="text-lg font-semibold text-brand">
				Learn more about the science
			</svelte:element>
			<PaperStack paper={tool.paper} class="mt-4" />
		</section>
	</div>
{/if}
