<script>
	let { children } = $props();
</script>

<div class="flex h-full flex-col overflow-y-auto">
	<div class="mx-auto w-full max-w-5xl px-6 py-12">
		{@render children()}
	</div>
</div>
