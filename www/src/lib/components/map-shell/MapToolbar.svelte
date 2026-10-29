<script>
	import { resolve } from '$app/paths';
	import { toolBySlug } from '$lib/data/tools';
	import wordmarkHorizontal from '$lib/assets/brand/logo-word-mark-horizontal.svg?url';
	import logoMark from '$lib/assets/brand/logo-colors.svg?url';
	import ToolTabs from './ToolTabs.svelte';
	import ToolSelect from './ToolSelect.svelte';
	import CitySelect from './CitySelect.svelte';
	import TakeActionButton from './TakeActionButton.svelte';

	let { toolSlug, currentCity, cityOptions, toolOptions, search = '' } = $props();

	const tool = $derived(toolBySlug[toolSlug]);
	const cityName = $derived(cityOptions.find((c) => c.slug === currentCity)?.name ?? currentCity);
</script>

<!-- Compact: a tight `[mark] [tool ▾] [city ▾]` row — the full toolbar needs ~440px minimum, which
     doesn't fit a 360px phone. Desktop keeps the three-column layout with equal `1fr`
     flanks so the tab strip is centred on the *header*, not on the gap between the two flanks.
     Centring on the gap walks the tabs sideways whenever a flank resizes — which the city selector
     does every time its search field expands (the name collapses to 0 and a fixed-width input takes
     its place). Equal flanks keep the centre still. `minmax(0,auto)` on the middle lets the tab
     strip shrink and scroll before the flanks give, preserving the narrow-screen / 200%-zoom
     behaviour. Both flanks floor at their min-content, though: the right one carries the "Get
     active!" button next to a city name of any length, and a `0` floor let it spill leftwards over
     the tab strip between md and lg while the logo slid under the strip's other end. Where it has
     to, the strip gives way and scrolls, and the tabs drift off centre only on screens too narrow
     to hold all three. Arbitrary grid tracks are the documented exception to the no-arbitrary-values rule —
     the scale has no token for a grid fraction. -->
<header
	class="grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-brand-light bg-paper px-3
	       md:h-18 md:grid-cols-[minmax(min-content,1fr)_minmax(0,auto)_minmax(min-content,1fr)] md:gap-4 md:px-4"
>
	<a href={resolve('/')} class="shrink-0 justify-self-start" aria-label="BikeNetKit home">
		<img src={logoMark} alt="" class="h-8 w-auto max-w-none lg:hidden" />
		<img src={wordmarkHorizontal} alt="" class="hidden h-8 w-auto max-w-none lg:block" />
	</a>

	<div class="hidden min-w-0 justify-center overflow-x-auto md:flex">
		<ToolTabs {toolSlug} {toolOptions} {cityName} {search} />
	</div>
	<div class="flex min-w-0 md:hidden">
		<ToolSelect {toolSlug} {toolOptions} {cityName} {search} />
	</div>

	<div class="flex min-w-0 items-center gap-1 justify-self-end md:gap-2">
		<TakeActionButton citySlug={currentCity} {cityName} />
		<CitySelect {currentCity} {cityOptions} {search} toolName={tool.name} />
	</div>
</header>
