<script>
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { activeInteractiveTools, comingSoonTools } from '$lib/data/tools';
	import { cities } from '$lib/data/cities';
	import CitySearch from '$lib/components/CitySearch.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import SidebarNavItem from '$lib/components/SidebarNavItem.svelte';
	import ToolName from '$lib/components/ui/ToolName.svelte';
	import { userLocation } from '$lib/state/userLocation.svelte';
	import { FAQ_URL, GITHUB_ORG_URL, REPORT_EMAIL } from '$lib/site.js';

	let { onNavigate = undefined } = $props();

	const isActive = (slug) => page.url.pathname.startsWith(`/${slug}`);

	// Tool landing routes are single-segment and runtime-dynamic; the generated route union can't
	// express `/${slug}`, so assert to one representative no-param tool route for the typed router.
	/** @param {string} slug */
	const toolHref = (slug) => resolve(/** @type {'/growbikenet'} */ (`/${slug}`));

	// One link for all the static tools: /more-tools lists them itself, so the sidebar doesn't.
	const onMoreTools = $derived(page.url.pathname === resolve('/more-tools'));

	let mode = $state(page.url.pathname.startsWith('/cities') ? 'cities' : 'tools');
	let lastPath = page.url.pathname;

	$effect(() => {
		const path = page.url.pathname;
		if (path === lastPath) return;
		lastPath = path;
		if (path.startsWith('/cities')) mode = 'cities';
	});

	const cityHref = (c) => resolve(`/cities/${c.slug}`);

	// Switching to the Cities section also navigates to the /cities landing page so the main
	// content matches the sidebar. Guarded so an already-active cities sub-view (e.g. /cities/table)
	// isn't bounced back to the grid. Tools stays state-only — there is no single tools route.
	function selectSection(value) {
		mode = value;
		if (value === 'cities' && !page.url.pathname.startsWith('/cities')) {
			goto(resolve('/cities'));
			onNavigate?.();
		}
	}
</script>

<div class="flex shrink-0 flex-col gap-2 border-b border-brand-subtle p-3">
	<SegmentedControl
		options={[
			{ value: 'tools', label: 'Tools' },
			{ value: 'cities', label: 'Cities' }
		]}
		active={mode}
		onSelect={selectSection}
		ariaLabel="Sidebar section"
	/>

	{#if mode === 'cities'}
		<CitySearch {cities} href={cityHref} placeholder="Search cities…" {onNavigate} />
	{/if}
</div>

<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
	{#if mode === 'tools'}
		{#each activeInteractiveTools as tool (tool.slug)}
			<SidebarNavItem href={toolHref(tool.slug)} active={isActive(tool.slug)} onclick={onNavigate}>
				<ToolName name={tool.name} parts={tool.nameParts} />
			</SidebarNavItem>
		{/each}

		{#each comingSoonTools as tool (tool.slug)}
			<SidebarNavItem disabled>
				<ToolName name={tool.name} parts={tool.nameParts} />
			</SidebarNavItem>
		{/each}

		<div class="mt-2 border-t border-brand-subtle pt-2">
			<SidebarNavItem href={resolve('/more-tools')} active={onMoreTools} onclick={onNavigate}>
				More tools
			</SidebarNavItem>
		</div>
	{:else}
		<div class="flex flex-col">
			{#each cities as city (city.slug)}
				<SidebarNavItem
					href={cityHref(city)}
					active={isActive(`cities/${city.slug}`)}
					home={city.slug === userLocation.homeCitySlug}
					sublabel={city.country}
					onclick={onNavigate}
				>
					{city.name}
				</SidebarNavItem>
			{/each}
		</div>
	{/if}
</div>

<!-- The site footer renders on the landing page only, so this row is what makes the legal
     page, the feedback address, the code and the FAQ reachable from every tool and city page —
     "easily and permanently accessible", as the privacy notice has to be. -->
<div
	class="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-brand-subtle px-3 py-3 text-xs text-ink-alt-weaker"
>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
	<a
		href={GITHUB_ORG_URL}
		target="_blank"
		rel="noopener noreferrer"
		class="relative transition-colors hover:text-brand"
		onclick={onNavigate}>GitHub<span class="sr-only"> (opens in new tab)</span></a
	>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
	<a
		href={FAQ_URL}
		target="_blank"
		rel="noopener noreferrer"
		class="relative transition-colors hover:text-brand"
		onclick={onNavigate}>FAQ<span class="sr-only"> (opens in new tab)</span></a
	>
	<a href={resolve('/legal')} class="transition-colors hover:text-brand" onclick={onNavigate}
		>Legal & privacy</a
	>
	<a href="mailto:{REPORT_EMAIL}" class="transition-colors hover:text-brand" onclick={onNavigate}
		>Report a problem</a
	>
</div>
