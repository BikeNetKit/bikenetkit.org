<script>
	import RecommendedStar from './ui/RecommendedStar.svelte';

	let {
		href,
		image = undefined,
		alt = undefined,
		label = undefined,
		sublabel = undefined,
		size = 'md',
		highlight = false,
		// Tooltip of a star shown after the label; no star when unset.
		star = undefined,
		class: className = ''
	} = $props();
</script>

<a {href} class="group flex flex-col items-center gap-3 {className}">
	<div
		class="aspect-square w-full overflow-hidden rounded-full border bg-white/60 transition group-hover:border-brand group-hover:shadow-lg hover:scale-105 hover:border-2 hover:border-ink hover:bg-white {highlight
			? 'border-brand-vivid ring-2 ring-brand-vivid'
			: 'border-brand-muted/70'}"
	>
		{#if image}
			<!-- With a visible label the label names the link; repeating it as alt text would make a
			     screen reader say the city twice. -->
			<img src={image} alt={label ? '' : alt} class="h-full w-full object-cover" loading="lazy" />
		{/if}
	</div>
	{#if label}
		<div class="text-center">
			<span
				class="inline-flex items-center gap-1 font-display font-bold text-brand {size === 'sm'
					? 'text-base'
					: 'text-lg'}"
			>
				{label}
				{#if star}
					<RecommendedStar label={star} />
				{/if}
			</span>
			{#if sublabel}
				<span class="block text-xs text-ink-alt-weaker">{sublabel}</span>
			{/if}
		</div>
	{/if}
</a>
