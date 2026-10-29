<script>
	import { resolve } from '$app/paths';
	import ToolName from '$lib/components/ui/ToolName.svelte';

	let {
		name,
		nameParts = undefined,
		slug = undefined,
		description,
		question = undefined,
		category,
		status,
		href: hrefProp = undefined,
		cta = undefined
	} = $props();

	// `slug` is a tool slug resolved at runtime; the generated route union can't express a dynamic
	// single-segment path, so assert one representative no-param tool route to satisfy `resolve`.
	const href = $derived(
		hrefProp ??
			(status === 'active' ? resolve(/** @type {'/growbikenet'} */ (`/${slug}`)) : undefined)
	);
	const isStatic = $derived(category === 'static');
	const label = $derived(cta ?? (isStatic ? 'Learn more' : 'Explore'));
	// The sixth tile is titled "More tools" — a phrase, not a product name. The logo word gap is
	// tighter than a word space, so setting it there would read as a typo rather than as branding.
	const isProduct = $derived(Boolean(slug));
</script>

{#snippet title()}
	{#if isProduct}<ToolName {name} parts={nameParts} />{:else}{name}{/if}
{/snippet}

{#if href}
	<a
		{href}
		class="group flex flex-col justify-between rounded-sm border border-brand-subtle p-6 transition-colors
			{isStatic ? 'bg-paper' : 'bg-white'}"
	>
		<div>
			<h3 class="display-name text-lg 2xl:text-xl {isStatic ? 'text-ink' : 'text-brand'}">
				{@render title()}
			</h3>
			{#if question}
				<p class="mt-2 text-ink-alt-weaker 2xl:text-lg">{question}</p>
			{:else}
				<p class="mt-2 {isStatic ? 'text-ink-weaker' : 'text-ink-alt'}">{description}</p>
			{/if}
		</div>
		<span
			class="display-name mt-4 inline-flex items-center gap-1 text-sm {isStatic
				? 'text-ink group-hover:text-brand'
				: 'text-brand'} group-hover:underline"
		>
			{label}
			<svg
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path d="M9 5l7 7-7 7" />
			</svg>
		</span>
	</a>
{:else}
	<div
		class="flex flex-col justify-between rounded-sm border border-brand-subtle bg-paper-brand p-6"
	>
		<div>
			<h3 class="display-name text-lg text-ink-alt-weaker">{@render title()}</h3>
			<p class="mt-2 text-sm text-ink-alt-weaker">{description}</p>
		</div>
		<span class="mt-4 text-xs text-ink-alt-weaker">Coming soon</span>
	</div>
{/if}
