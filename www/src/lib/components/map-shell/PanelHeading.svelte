<script>
	import MetricHelp from './MetricHelp.svelte';

	/**
	 * The uppercase heading every floating panel opens with, and — on a metric panel — the (?)
	 * that explains where its number comes from. One place for the heading style, which used to be
	 * pasted into each panel. `actions` renders further buttons before the (?).
	 *
	 * @type {{
	 *   title: string,
	 *   help?: import('$lib/data/metric-help').MetricHelp | null,
	 *   actions?: import('svelte').Snippet
	 * }}
	 */
	let { title, help = null, actions = undefined } = $props();
</script>

<div class="flex items-center justify-between gap-2">
	<h2 class="text-xs font-semibold tracking-wider text-ink-alt-weaker uppercase">{title}</h2>
	{#if help || actions}
		<!-- The 24px button is taller than the heading's line; the negative margins keep a panel with
		     a (?) the same height as one without. The coarse-pointer size is allowed to grow the row. -->
		<div class="-my-1 -mr-1 flex items-center">
			{@render actions?.()}
			{#if help}
				<MetricHelp {help} />
			{/if}
		</div>
	{/if}
</div>
