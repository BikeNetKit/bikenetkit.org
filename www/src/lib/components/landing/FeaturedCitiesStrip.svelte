<script>
	import CityTeaser from '$lib/components/CityTeaser.svelte';

	let { examples } = $props();
</script>

{#if examples.length > 0}
	<div class="flex justify-center">
		<div class="grid grid-cols-3 gap-12 px-12 sm:grid-cols-3 lg:max-w-5xl">
			{#each examples as example (example.city)}
				<CityTeaser
					href={example.href}
					image={example.screenshot}
					alt="{example.city} — {example.tool}"
					label={example.city}
					sublabel={example.tool}
				/>
			{/each}
		</div>
	</div>
{/if}
