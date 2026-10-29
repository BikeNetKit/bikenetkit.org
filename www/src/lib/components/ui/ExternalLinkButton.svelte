<script>
	let { href, label, icon, variant = 'outline', class: className = '' } = $props();

	const base =
		'inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none';
	// The hover rules belong to the variant, not to `base`: `hover:bg-white` on a solid button
	// would repaint it white-on-white.
	const styles = {
		outline:
			'border border-paper bg-white/60 text-ink-alt hover:border-brand-vivid hover:bg-white hover:text-ink-alt',
		solid: 'bg-brand text-white hover:opacity-90'
	};

	const paths = {
		paper:
			'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
		code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
		// Open book — documentation, as distinct from the repo the `code` chevrons point at.
		docs: 'M12 6.5C10.5 5.2 8.6 4.5 6 4.5H4v13h2c2.6 0 4.5.7 6 2m0-15c1.5-1.3 3.4-2 6-2h2v13h-2c-2.6 0-4.5.7-6 2m0-15v15',
		play: 'M12 21a9 9 0 100-18 9 9 0 000 18zM10 8.5v7l6-3.5-6-3.5z',
		external: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
	};
</script>

<a
	{href}
	target="_blank"
	rel="noopener noreferrer"
	class="relative {base} {styles[variant]} {className}"
>
	<svg
		class="h-3.5 w-3.5"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="2"
		aria-hidden="true"
	>
		<path d={paths[icon]} />
	</svg>
	{label}
	<span class="sr-only"> (opens in new tab)</span></a
>
