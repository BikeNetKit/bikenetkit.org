<script>
	/** @type {{ path: string, title: string, caption: string }} */
	let { path, title, caption } = $props();
</script>

<figure class="min-w-0">
	<iframe
		src={path}
		{title}
		loading="lazy"
		class="aspect-video w-full rounded border border-border-weaker bg-paper"
	></iframe>
	<figcaption class="mt-2 text-xs text-ink-weaker">
		<span class="font-semibold text-ink">{title}.</span>
		{caption}
		<a class="link" href={path} target="_blank"
			>Open<span class="sr-only"> {title} (opens in new tab)</span></a
		>
	</figcaption>
</figure>
