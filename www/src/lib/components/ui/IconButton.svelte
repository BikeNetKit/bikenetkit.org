<script>
	let {
		onclick = undefined,
		// For buttons that act on press rather than on release — the playback transport's step
		// buttons, which repeat while held.
		onpointerdown = undefined,
		ariaLabel,
		// Set both when the button is a disclosure toggle (e.g. the cities map's mobile legend), so
		// the expanded/collapsed state is exposed rather than only implied by a changing label.
		ariaExpanded = undefined,
		ariaControls = undefined,
		// `solid` is the brand-filled default (play/pause, map zoom). `ghost` is the quieter
		// companion for buttons that flank a solid one — no fill, so the solid button stays the
		// row's single focal point.
		variant = 'solid',
		size = 'md',
		// Exposed as `aria-disabled`, not `disabled`: a step button that dims at the end of playback
		// is the button the reader just pressed, and a real `disabled` would drop their focus to the
		// page. It stays focusable, announces as dimmed, and a press does nothing.
		disabled = false,
		children,
		// Anything else lands on the button after the named props — the `aria-expanded`,
		// `data-state` and handlers a bits-ui trigger delegates through its `child` snippet — so a
		// delegated attribute wins over the named one. Never pass `class` this way: it would replace
		// the button's own.
		...rest
	} = $props();

	const sizeClass = $derived(
		size === 'sm' ? 'h-6 w-6 pointer-coarse:size-9' : 'h-8 w-8 pointer-coarse:size-11'
	);
	const variantClass = $derived(
		variant === 'ghost'
			? 'bg-transparent text-ink-alt-weaker hover:bg-brand-subtle hover:text-brand active:scale-90 data-[state=open]:bg-brand-subtle data-[state=open]:text-brand'
			: 'bg-brand text-white hover:opacity-90'
	);
</script>

<button
	type="button"
	onclick={(e) => {
		if (!disabled) onclick?.(e);
	}}
	onpointerdown={(e) => {
		if (!disabled) onpointerdown?.(e);
	}}
	aria-disabled={disabled || undefined}
	aria-label={ariaLabel}
	aria-expanded={ariaExpanded}
	aria-controls={ariaControls}
	class="inline-flex {sizeClass} shrink-0 touch-manipulation appearance-none items-center justify-center rounded-full transition select-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none aria-disabled:cursor-default aria-disabled:opacity-40 {variantClass}"
	{...rest}
>
	{@render children?.()}
</button>
