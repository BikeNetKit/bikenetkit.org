<script>
	let {
		pressed,
		onclick = undefined,
		title = undefined,
		ariaLabel = undefined,
		children
	} = $props();
</script>

<button
	type="button"
	{onclick}
	{title}
	aria-label={ariaLabel ?? title}
	aria-pressed={pressed}
	class="flex items-center rounded-md border border-border-weaker p-1.5 transition-colors {pressed
		? 'bg-brand text-white'
		: 'bg-white text-brand-muted hover:text-ink'}"
>
	{@render children?.()}
</button>
