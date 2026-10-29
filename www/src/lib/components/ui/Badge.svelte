<script>
	let { children } = $props();
</script>

<span
	class="rounded-full bg-brand-vivid px-2.5 py-0.5 text-xs font-semibold tracking-wider text-white uppercase"
>
	{@render children()}
</span>
