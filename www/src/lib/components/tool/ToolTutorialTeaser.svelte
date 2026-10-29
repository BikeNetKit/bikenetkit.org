<script>
	import ExternalLinkButton from '$lib/components/ui/ExternalLinkButton.svelte';

	// Committed by `pnpm generate:tutorial-thumbs`, never fetched from YouTube at runtime.
	const thumbnails = /** @type {Record<string, string>} */ (
		import.meta.glob('$lib/assets/media/tutorials/*.webp', {
			eager: true,
			query: '?url',
			import: 'default'
		})
	);

	/** @type {{ tool: import('$lib/data/types').Tool }} */
	let { tool } = $props();

	const thumbnail = $derived(
		Object.entries(thumbnails).find(([file]) => file.endsWith(`/${tool.slug}.webp`))?.[1]
	);
</script>

<!-- The landing page's video teaser (ProblemSolutionExplainer) with the city map teasers' hover
     (CityTeaser), but an outbound link rather than a lightbox: the tutorials live only on YouTube,
     and embedding its player would load a third-party origin. Without a committed thumbnail it
     falls back to the plain button, so a new tutorial URL never shows a broken image. -->
{#if thumbnail}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
	<a
		href={tool.tutorial}
		target="_blank"
		rel="noopener noreferrer"
		class="group relative block rounded-2xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
	>
		<span
			class="relative block aspect-video overflow-hidden rounded-2xl border border-brand-muted/70 transition group-hover:border-brand group-hover:shadow-lg hover:scale-105 hover:border-2 hover:border-ink"
		>
			<img src={thumbnail} alt="" class="h-full w-full object-cover" />
			<span class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
				<span
					class="flex h-12 w-12 items-center justify-center rounded-full bg-brand/80 text-xl text-white shadow-lg transition-colors group-hover:bg-brand"
					>&#9654;</span
				>
			</span>
		</span>
		<span class="mt-2 block text-sm font-medium text-brand">
			Watch the tutorial on YouTube<span class="sr-only"> (opens in new tab)</span>
		</span>
	</a>
{:else if tool.tutorial}
	<ExternalLinkButton href={tool.tutorial} label="Watch tutorial" icon="play" variant="solid" />
{/if}
