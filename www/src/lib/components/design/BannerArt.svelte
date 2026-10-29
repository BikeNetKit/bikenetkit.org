<script>
	import { cityBgUrl } from '$lib/design/banner.js';

	// The on-screen rendering of a banner layout, shared by the /design preview cards and by
	// the /og capture route, so the generated images cannot drift from the reviewed preview.
	// It draws the rasterised artwork rather than the ~5k vector paths bannerSvg() inlines.
	let { layout, label, class: className = '', style = undefined, onready = undefined } = $props();
</script>

<svg
	viewBox="0 0 {layout.width} {layout.height}"
	class={className}
	{style}
	role="img"
	aria-label={label}
>
	<image
		href={cityBgUrl}
		x={layout.bg.x}
		y={layout.bg.y}
		width={layout.bg.width}
		height={layout.bg.height}
		onload={onready}
	/>
	<g transform={layout.lockupTransform}>
		{#each [...layout.lockup.iconShapes, { d: layout.lockup.wordmarkPath }] as shape, i (i)}
			<path
				{...shape}
				fill={layout.halo.fill}
				stroke={layout.halo.fill}
				stroke-width={layout.halo.strokeWidth}
				stroke-linejoin="round"
			/>
		{/each}
		{#each layout.lockup.iconShapes as shape, i (i)}
			<path {...shape} />
		{/each}
		<path d={layout.lockup.wordmarkPath} fill={layout.lockup.fill} />
	</g>
</svg>
