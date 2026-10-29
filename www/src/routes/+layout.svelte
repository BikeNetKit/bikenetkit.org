<script>
	import './layout.css';
	import BreakpointDebug from '$lib/components/BreakpointDebug.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Announcer from '$lib/components/Announcer.svelte';
	import { startDatasetPrefetch } from '$lib/data/dataset-prefetch.js';
	import { DATA_ORIGIN } from '$lib/data/data-base';

	let { children } = $props();

	// Hovering a map link starts its GeoJSON downloading, the same gesture `app.html`'s
	// `data-sveltekit-preload-data="hover"` already uses for the page module. Since the network
	// moved off the prerender it is fetched after hydration, so without this a navigation cannot
	// start loading data until the new page is already on screen.
	$effect(() => startDatasetPrefetch());
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon.png" />
	<!-- The map layers come from the off-repo data host, fetched after hydration and warmed by the
	     hover prefetch above — so the cross-origin DNS + TLS handshake is pure latency in front of
	     the first one. Rendered here rather than in app.html because the host is only known from
	     PUBLIC_DATA_URL, and is empty when the data is served same-origin. -->
	{#if DATA_ORIGIN}
		<link rel="preconnect" href={DATA_ORIGIN} crossorigin="anonymous" />
	{/if}
</svelte:head>
<Meta />
<a href="#main" class="skip-link">Skip to content</a>
{@render children()}
<Announcer />
<BreakpointDebug />
