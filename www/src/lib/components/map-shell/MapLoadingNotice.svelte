<script>
	import CardPanel from '$lib/components/ui/CardPanel.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import { announce } from '$lib/state/announce.svelte.js';

	// Shown while a city's network is on its way from data.bikenetkit.org, and if it fails to
	// arrive. Deliberately distinct from `UnavailableNotice`, which is the permanent "this tool has
	// no results for this city" state and is decided synchronously from the manifest — a reader must
	// not be told a city is uncovered while its data is merely still loading.
	//
	// Only rendered on a genuinely empty map: a metric or type switch keeps the previous render on
	// screen until its replacement lands, so there is nothing to explain.
	let { status = 'loading', toolName = '' } = $props();

	$effect(() => {
		announce(
			status === 'error'
				? `${toolName} could not load its network for this city.`
				: 'Fetching the network…'
		);
	});
</script>

<CardPanel width="w-full" gap="gap-2" class="pointer-events-auto">
	<h2 class="text-sm font-semibold tracking-wider text-ink-alt-weaker uppercase">
		{status === 'error' ? 'Could not load' : 'Loading'}
	</h2>
	<p class="text-sm leading-snug text-ink-alt">
		{#if status === 'error'}
			<ToolName name={toolName} /> could not load its network for this city. Check your connection and
			reload the page.
		{:else}
			Fetching the network…
		{/if}
	</p>
</CardPanel>
