<script>
	import { Download, LoaderCircle } from '@lucide/svelte';

	/**
	 * @typedef {object} Props
	 * @property {string} label
	 * @property {() => unknown} [onclick] Builds the file in the browser. Ignored when `href` is set.
	 * @property {string} [href] A file the build ships: rendered as a real link, so it has a URL.
	 * @property {string} [download] Saved filename for `href`; defaults to the URL's own name.
	 * @property {boolean} [icon]
	 * @property {'solid' | 'outline'} [variant]
	 * @property {string} [class]
	 */
	/** @type {Props} */
	let {
		label,
		onclick,
		href,
		download = '',
		icon = true,
		variant = 'solid',
		class: className = ''
	} = $props();

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

{#if href}
	<a {href} {download} class="{base} {styles[variant]} {className}">
		{#if icon}
			<Download class="h-4 w-4" aria-hidden="true" />
		{/if}
		{label}
	</a>
{:else}
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
{/if}
