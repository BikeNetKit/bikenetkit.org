<script>
	// Interactive when given `onclick` (filter the list by this country), inert otherwise.
	let { code, country = undefined, onclick = undefined, class: className = '' } = $props();

	const base =
		'shrink-0 rounded border border-border-weaker px-1 text-2xs font-semibold tracking-wider text-brand-muted uppercase';
</script>

{#if onclick}
	<button
		type="button"
		{onclick}
		title="Show cities in {country ?? code}"
		aria-label="{code}: show cities in {country ?? code}"
		class="{base} cursor-pointer hover:border-brand hover:bg-brand-subtle hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand {className}"
	>
		{code}
	</button>
{:else}
	<span class="{base} {className}" title={country}>{code}</span>
{/if}
