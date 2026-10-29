<script>
	import { splitWordMark } from '$lib/utils/word-mark.js';

	/** Renders a product name with the logo's word gap at each camel-case boundary, via
	 *  `.name-word` in layout.css. The spans below sit on one line with no whitespace between
	 *  them, so `textContent` stays the name verbatim — copy-paste, find-in-page, accessible names
	 *  and the Playwright text matchers all still see `GrowBikeNet`, and the name keeps its single
	 *  break opportunity (none). Hence the `prettier-ignore`: reflowing that line would insert the
	 *  whitespace it exists to avoid. Never use this for an attribute value or for head metadata —
	 *  those want `tool.name` unchanged.
	 *  @type {{ name: string, parts?: string[] }} */
	let { name, parts = undefined } = $props();

	const words = $derived(parts ?? splitWordMark(name));
</script>

<!-- The wrapper is load-bearing, not tidiness: several call sites drop the name straight into a
     flex container with a `gap` (the map tool tabs, the tool select, the coverage table headers).
     Without it each word becomes a flex item of its own and picks up the container's gap on top of
     `.name-word`'s margin, which sets the name far wider than the lockup does. One element keeps
     the name a single inline box whatever the parent's display is. -->
<!-- prettier-ignore -->
<span>{#each words as word, i (i)}<span class="name-word">{word}</span>{/each}</span>
