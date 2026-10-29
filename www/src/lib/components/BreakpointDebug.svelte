<script>
	// Dev-only Tailwind breakpoint indicator. CSS-only labels — each is shown
	// only within its breakpoint range via responsive `inline`/`hidden` utilities.
	// The chip itself is only revealed while resizing, then fades out 3s after
	// the last resize event.
	let visible = $state(false);

	$effect(() => {
		let timer;
		const onResize = () => {
			visible = true;
			clearTimeout(timer);
			timer = setTimeout(() => (visible = false), 3000);
		};
		window.addEventListener('resize', onResize);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

{#if import.meta.env.DEV}
	<div
		class="pointer-events-none fixed top-4 right-4 z-50 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white tabular-nums transition-opacity duration-500"
		class:opacity-0={!visible}
		class:opacity-100={visible}
	>
		<span class="sm:hidden">xs</span>
		<span class="hidden sm:inline md:hidden">sm</span>
		<span class="hidden md:inline lg:hidden">md</span>
		<span class="hidden lg:inline xl:hidden">lg</span>
		<span class="hidden xl:inline 2xl:hidden">xl</span>
		<span class="hidden 2xl:inline">2xl</span>
	</div>
{/if}
