<script>
	let { checked = $bindable(false), label, title = undefined, class: className = '' } = $props();
</script>

<label {title} class="flex items-center gap-2 text-sm text-ink select-none {className}">
	<input
		type="checkbox"
		bind:checked
		class="size-4 rounded border-border-weaker text-brand focus:ring-brand"
	/>
	{label}
</label>
