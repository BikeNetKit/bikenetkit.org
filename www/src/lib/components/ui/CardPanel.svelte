<script>
	// Sand by default: a panel that *holds controls* floats over a near-white basemap and its
	// controls (segmented controls, the size slider's track, checkboxes) are themselves white —
	// sand separates the panel from the map and lets the controls read as raised out of it.
	// `surface="white"` is for the map's own readouts, which carry no controls and read as part of
	// the map rather than as something to operate.
	// `surface="dark"` is for foregrounded identity/header panels (the tool info block) that carry
	// no controls — brand green with light text, sitting above the sand control panels below it.
	// `surface="notice"` is for a state the reader must not miss (the tool has no results here) —
	// pale amber, so it stands apart from every green panel around it.
	let {
		width = 'w-48',
		gap = 'gap-1.5',
		surface = 'paper',
		class: className = '',
		children
	} = $props();

	/** @type {Record<string, string>} */
	const SURFACES = {
		dark: 'border-brand-ink bg-brand',
		white: 'border-border-weaker bg-white',
		notice: 'border-notice-border bg-notice-subtle',
		paper: 'border-border-weaker bg-paper'
	};
</script>

<div
	class="flex {width} flex-col {gap} rounded-sm border px-3 py-2.5 {className} shadow-md {SURFACES[
		surface
	] ?? SURFACES.paper}"
>
	{@render children()}
</div>
