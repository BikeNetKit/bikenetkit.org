<script>
	let { children } = $props();
</script>

<div class="tool-landing-bg h-full">
	{@render children()}
</div>

<style>
	.tool-landing-bg {
		background-image: url('/bg.svg');
		background-repeat: no-repeat;
		background-position: right bottom;
		background-size: 33%;
	}
</style>
