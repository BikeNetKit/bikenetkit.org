<script>
	import { Download, LoaderCircle } from '@lucide/svelte';

	let { label, onclick, icon = true, variant = 'solid', class: className = '' } = $props();

	let loading = $state(false);

	async function handleClick() {
		if (loading) return;
		loading = true;
		try {
			await onclick?.();
		} finally {
			loading = false;
		}
	}

	const base =
		'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none aria-busy:opacity-60';
	const styles = {
		solid: 'bg-brand text-white hover:opacity-90',
		outline:
			'border border-border-weaker bg-white/60 text-ink-alt hover:border-brand-vivid hover:bg-white'
	};
</script>

<button
	type="button"
	onclick={handleClick}
	aria-busy={loading || undefined}
	class="{base} {styles[variant]} {className}"
>
	{#if icon}
		{#if loading}
			<LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" />
		{:else}
			<Download class="h-4 w-4" aria-hidden="true" />
		{/if}
	{/if}
	{label}
</button>
