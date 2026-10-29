<script>
	import { tick } from 'svelte';
	import { Popover } from 'bits-ui';
	import { goto } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import { searchCities } from '$lib/utils/city-search';
	import CountryChip from '$lib/components/ui/CountryChip.svelte';

	// `search` carries the view flags (labels, seed points) across a city or tool switch, so a
	// reader who turned the basemap labels off keeps them off.
	/** @type {{ currentCity: string, cityOptions: import('$lib/data/tool-page-loader').CityOption[], toolName: string, search?: string }} */
	let { currentCity, cityOptions, toolName, search = '' } = $props();

	let open = $state(false);
	let query = $state('');
	// See CitySearch: a country-code query hides the cities merely *named* after those two letters.
	let showNameMatches = $state(false);
	/** @type {HTMLInputElement | null} */
	let searchInput = $state(null);
	/** @type {HTMLDivElement | null} */
	let listEl = $state(null);

	const current = $derived(cityOptions.find((c) => c.slug === currentCity));
	const currentName = $derived(current?.name ?? currentCity);

	const isSearching = $derived(query.trim().length > 0);
	const result = $derived(searchCities(cityOptions, query));
	const results = $derived(showNameMatches ? result.nameMatches : result.matches);
	// `featured` is the editorial pick for the current tool and variant (tool-page-loader.ts).
	// Also require `available`: featuring a city with nothing to show is a dead end.
	const featured = $derived(
		cityOptions
			.filter((c) => c.featured !== undefined && c.available)
			.sort((a, b) => (a.featured ?? 0) - (b.featured ?? 0))
	);
	const rest = $derived(cityOptions.filter((c) => !featured.includes(c)));

	// A hover-open (openOnHover on the trigger) must not steal focus from wherever the reader
	// already is on the page. An explicit click, though, should drop the caret straight into
	// search — same as the old search-icon button did.
	//
	// This can't set `open` itself: bits-ui's own Popover.Trigger composes our onclick *before*
	// its internal one, which toggles `open` unconditionally except when hover already opened it.
	// Forcing `open = true` here made that internal toggle immediately flip it back to `false` on
	// any click that wasn't preceded by a hover — i.e. every touch tap, since hover never fires on
	// touch. So: just flag intent, and let bits-ui own `open` entirely; the effect below focuses
	// once it actually lands on `true`.
	let focusOnOpen = $state(false);
	// Whether the reader opened the list on purpose (a click or Enter) or moved focus into it. Only
	// then does closing it return focus to the trigger — a hover peek never took focus, so handing
	// it back would steal it from wherever it actually is.
	let interacted = false;
	/** @type {HTMLElement | null} */
	let triggerEl = $state(null);
	function onTriggerClick() {
		focusOnOpen = true;
		interacted = true;
	}
	// bits-ui opens on Enter/Space keydown and swallows the click that would follow, so the keyboard
	// path has to flag the same intent itself.
	/** @param {KeyboardEvent} event */
	function onTriggerKeydown(event) {
		if (event.key === 'Enter' || event.key === ' ') onTriggerClick();
	}
	$effect(() => {
		if (open && focusOnOpen) {
			focusOnOpen = false;
			tick().then(() => searchInput?.focus());
		} else if (!open) {
			focusOnOpen = false;
		}
	});

	function selectCity() {
		open = false;
		query = '';
		showNameMatches = false;
	}

	// Filtering by country keeps the popover open — the reader is still choosing a city.
	async function filterByCountry(code) {
		query = code;
		showNameMatches = false;
		await tick();
		searchInput?.focus();
	}

	const cityLinks = () =>
		/** @type {HTMLAnchorElement[]} */ ([...(listEl?.querySelectorAll('a[href]') ?? [])]);

	// Arrow keys walk the list from the field and back; Enter on a focused row follows its link.
	/** @param {KeyboardEvent} event */
	function handleListKeydown(event) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const links = cityLinks();
		const i = links.indexOf(/** @type {HTMLAnchorElement} */ (event.target));
		if (i === -1) return;
		event.preventDefault();
		if (event.key === 'ArrowDown') links[Math.min(i + 1, links.length - 1)].focus();
		else if (i === 0) searchInput?.focus();
		else links[i - 1].focus();
	}

	function handleKeydown(event) {
		if (event.key === 'ArrowDown') {
			const first = cityLinks()[0];
			if (first) {
				event.preventDefault();
				first.focus();
			}
			return;
		}
		if (event.key === 'Escape') {
			query = '';
			showNameMatches = false;
			return;
		}
		// Enter on a filtered list goes where the reader is looking: the first match. Without it
		// the field is a dead end for anyone not reaching for the mouse.
		if (event.key === 'Enter' && isSearching && results.length > 0) {
			event.preventDefault();
			goto(results[0].href + search);
			selectCity();
		}
	}
</script>

{#snippet cityRow(city)}
	{@const isCurrent = city.slug === currentCity}
	<!-- Cities this tool does not cover stay in the list and stay clickable: the page they land
	     on says so and suggests cities that are covered.
	     The country chip sits beside the link rather than inside it — a button nested in an anchor
	     is invalid markup, and clicking it would navigate as well as filter. -->
	<div class="group/row flex items-stretch rounded {isCurrent ? 'bg-brand-subtle' : ''}">
		<a
			href={city.href + search}
			aria-current={isCurrent ? 'page' : undefined}
			title={city.available ? undefined : `No ${toolName} data for ${city.name}`}
			onclick={selectCity}
			class="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-l px-3 py-1.5 text-sm capitalize transition-colors focus-visible:bg-brand-subtle focus-visible:text-brand focus-visible:-outline-offset-2 {isCurrent
				? 'font-semibold text-brand'
				: city.available
					? 'text-ink group-hover/row:bg-brand-subtle/60 group-hover/row:text-brand'
					: 'text-brand-muted group-hover/row:bg-brand-subtle/60 group-hover/row:text-brand'}"
		>
			<span class="truncate">{city.name}</span>
			{#if !city.available}
				<span class="shrink-0 text-2xs text-brand-muted">no data</span>
			{/if}
		</a>
		{#if city.countryCode}
			<span
				class="flex items-center rounded-r pr-2 pl-1.5 transition-colors {isCurrent
					? ''
					: 'group-hover/row:bg-brand-subtle/60 group-has-[a:focus-visible]/row:bg-brand-subtle'}"
			>
				<CountryChip
					code={city.countryCode}
					country={city.country}
					onclick={() => filterByCountry(city.countryCode)}
				/>
			</span>
		{/if}
	</div>
{/snippet}

<div class="flex shrink-0 items-center gap-1">
	<Popover.Root bind:open>
		<Popover.Trigger
			openOnHover
			openDelay={0}
			closeDelay={120}
			bind:ref={triggerEl}
			onclick={onTriggerClick}
			onkeydown={onTriggerKeydown}
			class="relative flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-brand-subtle focus-visible:bg-brand-subtle data-[state=open]:bg-brand-subtle"
		>
			<!-- Prefixed, not replaced by an `aria-label`: the visible city name stays in the accessible
			     name (WCAG 2.5.3). -->
			<span class="sr-only">Change city: </span>
			<span class="text-lg font-bold whitespace-nowrap capitalize">
				{currentName}
			</span>
			<!-- Hints that the name itself is the search entry point (hover to preview, click to
			     search) now that the standalone search field/button is gone from the toolbar. -->
			<Search class="h-4 w-4 shrink-0 text-brand-muted" aria-hidden="true" />
		</Popover.Trigger>

		<!-- No focus trap: this popover also opens on hover, where trapping focus would be wrong. -->
		<Popover.Content
			trapFocus={false}
			onOpenAutoFocus={(e) => e.preventDefault()}
			onCloseAutoFocus={(e) => {
				// bits-ui would restore focus to the filter field, which is unmounting — and its focus
				// scope also fires this once while *opening*. So the trigger is focused by hand, and
				// only on a real close of a list the reader opened on purpose.
				e.preventDefault();
				if (open || !interacted) return;
				interacted = false;
				triggerEl?.focus();
			}}
			onfocusin={() => (interacted = true)}
			sideOffset={6}
			align="end"
			class="z-50 flex max-h-96 min-w-56 flex-col overflow-hidden rounded-md border border-border-weaker bg-white shadow-md"
		>
			<div class="shrink-0 border-b border-border-weaker p-1">
				<div class="relative">
					<Search
						class="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted"
					/>
					<!-- `text-base`, not `-sm`: iOS Safari auto-zooms the whole page on focus for any input
					     under 16px, and the zoom doesn't reset itself once the field blurs. -->
					<input
						bind:this={searchInput}
						bind:value={query}
						type="text"
						placeholder="Search cities…"
						aria-label="Filter cities"
						oninput={() => (showNameMatches = false)}
						onkeydown={handleKeydown}
						class="w-full rounded border-0 bg-brand-subtle/60 py-1.5 pr-2 pl-7 text-base text-ink placeholder:text-ink-alt-weaker focus:ring-1 focus:ring-brand"
					/>
				</div>
			</div>

			<div
				bind:this={listEl}
				onkeydown={handleListKeydown}
				role="presentation"
				class="overflow-y-auto p-1"
			>
				{#if isSearching}
					{#if result.countryCode && !showNameMatches}
						<p class="flex items-center justify-between gap-2 px-3 py-1.5 text-2xs text-ink-alt">
							<span>{result.matches.length} cities in {result.countryName}</span>
							<button type="button" onclick={() => (query = '')} class="link">clear</button>
						</p>
					{/if}
					{#each results as city (city.slug)}
						{@render cityRow(city)}
					{:else}
						<p class="px-3 py-2 text-sm text-ink-alt">No city matches "{query}".</p>
					{/each}
					{#if result.countryCode && result.nameMatches.length > 0 && !showNameMatches}
						<button
							type="button"
							onclick={() => (showNameMatches = true)}
							class="w-full rounded px-3 py-1.5 text-left text-2xs text-ink-alt hover:bg-brand-subtle/60"
						>
							…or {result.nameMatches.length} cities named “{query.trim()}”
						</button>
					{/if}
				{:else}
					{#if featured.length > 0}
						<p class="px-3 pt-2 pb-1 text-2xs tracking-wider text-ink-alt-weaker uppercase">
							Featured cities
						</p>
						{#each featured as city (city.slug)}
							{@render cityRow(city)}
						{/each}
						<p class="px-3 pt-2 pb-1 text-2xs tracking-wider text-ink-alt-weaker uppercase">
							All cities
						</p>
					{/if}
					{#each rest as city (city.slug)}
						{@render cityRow(city)}
					{/each}
				{/if}
			</div>
		</Popover.Content>
	</Popover.Root>

	<!-- <a
		href={resolve('/(app)/cities/[city]', { city: currentCity })}
		title="{currentName} city page"
		aria-label="{currentName} city page"
		class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-brand-muted transition-colors hover:bg-brand-subtle hover:text-brand focus-visible:bg-brand-subtle focus-visible:text-brand"
	>
		<ArrowUpRight class="h-4 w-4" />
	</a> -->
</div>
