<script>
	import { goto } from '$app/navigation';
	import { LocateFixed, LoaderCircle } from '@lucide/svelte';
	import { cityAtLocation, nearestCities } from '$lib/utils/geo';
	import { searchCities } from '$lib/utils/city-search';
	import { userLocation } from '$lib/state/userLocation.svelte';
	import { CONTACT_EMAIL } from '$lib/site.js';
	import CountryChip from '$lib/components/ui/CountryChip.svelte';

	let {
		cities,
		href = undefined,
		onselect = undefined,
		onNavigate = undefined,
		placeholder = 'Search for a city...',
		class: className = '',
		geolocate = true
	} = $props();

	let search = $state('');
	// A two-letter country code narrows the list to that country, which hides the cities whose
	// *name* starts with those letters (BE → Belgium, not Berlin). This opts back into those.
	let showNameMatches = $state(false);
	let geoStatus = $state('idle'); // idle | locating | nearby | outside | error
	let geoMessage = $state('');
	/** @type {ReturnType<typeof nearestCities>} */
	let nearby = $state([]);
	/** @type {HTMLElement | null} */
	let root = $state(null);

	const COVERAGE_KM = 300;

	// The cast pins the generic: `cities` is an untyped prop, so without it the result would come
	// back as bare `SearchableCity` records and lose `slug`.
	const result = $derived(
		searchCities(/** @type {import('$lib/data/types').City[]} */ (cities), search)
	);
	const shown = $derived(showNameMatches ? result.nameMatches : result.matches);

	const id = $props.id();
	// One polite line for everything the dropdown says visually: the count, the empty result and the
	// geolocation outcomes would otherwise appear without a word to a screen-reader user.
	const status = $derived(
		search.trim()
			? shown.length
				? `${shown.length} ${shown.length === 1 ? 'city' : 'cities'} found. Press Down to browse.`
				: 'No city found.'
			: geoStatus === 'locating'
				? 'Finding your location…'
				: geoStatus === 'nearby'
					? `${nearby.length} nearby cities found. Press Down to browse.`
					: geoStatus === 'outside'
						? 'You appear to be outside our coverage area.'
						: geoStatus === 'error'
							? geoMessage
							: ''
	);

	function choose(city) {
		if (onselect) onselect(city);
		else {
			goto(href(city));
			onNavigate?.();
		}
		search = '';
		showNameMatches = false;
	}

	// The plain `<a>` rows (used whenever `onselect` isn't given) navigate via their own `href`
	// rather than `goto()`, but still need the same dropdown-closing side effect `choose` gives
	// the button rows — otherwise the results list stays open, floating over whatever navigated
	// in behind it.
	function dismiss() {
		onNavigate?.();
		search = '';
		showNameMatches = false;
		geoStatus = 'idle';
		nearby = [];
	}

	/** @type {HTMLInputElement | null} */
	let input = $state(null);
	const rows = () =>
		/** @type {HTMLElement[]} */ ([...(root?.querySelectorAll('[data-city-row]') ?? [])]);

	// The keyboard path through the results: Enter in the field takes the first city, Arrow Down
	// moves into the list, Up and Down walk it, and Up from the first row returns to the field.
	/** @param {KeyboardEvent} event */
	function onInputKeydown(event) {
		if (event.key === 'Escape') {
			search = '';
			showNameMatches = false;
			geoStatus = 'idle';
			nearby = [];
		} else if (event.key === 'Enter') {
			const first = search.trim() ? shown[0] : geoStatus === 'nearby' ? nearby[0]?.city : null;
			if (first) {
				event.preventDefault();
				choose(first);
			}
		} else if (event.key === 'ArrowDown') {
			const first = rows()[0];
			if (first) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	/** @param {KeyboardEvent} event */
	function onListKeydown(event) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const list = rows();
		const i = list.indexOf(/** @type {HTMLElement} */ (event.target));
		if (i === -1) return;
		event.preventDefault();
		if (event.key === 'ArrowDown') list[Math.min(i + 1, list.length - 1)].focus();
		else if (i === 0) input?.focus();
		else list[i - 1].focus();
	}

	export function focus() {
		input?.focus();
	}

	function filterByCountry(code) {
		search = code;
		showNameMatches = false;
	}

	// Exported so a parent can offer a second entry point to geolocation (see the landing page copy).
	export function locate() {
		if (!('geolocation' in navigator)) {
			geoStatus = 'error';
			geoMessage = 'Your browser does not support location.';
			return;
		}
		geoStatus = 'locating';
		geoMessage = '';
		nearby = [];
		userLocation.setCoords(null);
		navigator.geolocation.getCurrentPosition(onPosition, onError, {
			timeout: 10000,
			maximumAge: 0
		});
	}

	function onPosition(pos) {
		const point = /** @type {[number, number]} */ ([pos.coords.longitude, pos.coords.latitude]);
		userLocation.setCoords(point);
		const match = cityAtLocation(point, cities);
		if (match) {
			userLocation.setHomeCity(match.slug);
			geoStatus = 'idle';
			choose(match);
			return;
		}
		userLocation.setHomeCity(null);
		const closest = nearestCities(point, cities, 3);
		if (!closest.length || closest[0].km > COVERAGE_KM) {
			geoStatus = 'outside';
			nearby = [];
		} else {
			geoStatus = 'nearby';
			nearby = closest;
		}
	}

	// Dismiss the geolocation result overlay on a click anywhere outside the search box.
	function onPointerDown(event) {
		if (geoStatus === 'idle' || geoStatus === 'locating') return;
		if (root?.contains(event.target)) return;
		geoStatus = 'idle';
		nearby = [];
	}

	function onError(err) {
		geoStatus = 'error';
		geoMessage =
			err.code === err.PERMISSION_DENIED
				? 'Location permission denied. Try searching by name.'
				: 'Could not determine your location. Try searching by name.';
	}
</script>

<svelte:window onpointerdown={onPointerDown} />

<!-- The country chip is a sibling of the link, never a child: a button inside an anchor is invalid
     markup, and its click would navigate as well as filter. `group/row` keeps the two halves
     reading as one row on hover. -->
{#snippet cityRow(city)}
	<li class="group/row flex items-stretch">
		{#if onselect}
			<button
				type="button"
				onclick={() => choose(city)}
				data-city-row
				class="min-w-0 flex-1 truncate px-4 py-2 text-left text-sm group-hover/row:bg-paper-brand focus-visible:bg-paper-brand focus-visible:-outline-offset-2"
			>
				{city.name}
			</button>
		{:else}
			<a
				href={href(city)}
				onclick={dismiss}
				data-city-row
				class="min-w-0 flex-1 truncate px-4 py-2 text-left text-sm group-hover/row:bg-paper-brand focus-visible:bg-paper-brand focus-visible:-outline-offset-2"
			>
				{city.name}
			</a>
		{/if}
		{#if city.countryCode}
			<span
				class="flex items-center pr-3 pl-2 group-hover/row:bg-paper-brand group-has-[[data-city-row]:focus-visible]/row:bg-paper-brand"
			>
				<CountryChip
					code={city.countryCode}
					country={city.country}
					onclick={() => filterByCountry(city.countryCode)}
				/>
			</span>
		{/if}
	</li>
{/snippet}

<div bind:this={root} onkeydown={onListKeydown} role="presentation" class="relative {className}">
	<div class="relative w-full max-w-108">
		<!-- `text-base`, not `-sm`: iOS Safari auto-zooms the whole page on focus for any input under
		     16px, and the zoom doesn't reset itself once the field blurs. -->
		<label for="{id}-input" class="sr-only">Search for a city</label>
		<input
			bind:this={input}
			id="{id}-input"
			type="text"
			bind:value={search}
			onkeydown={onInputKeydown}
			oninput={() => {
				geoStatus = 'idle';
				showNameMatches = false;
			}}
			{placeholder}
			class="w-full rounded bg-white px-4 py-2.5 text-base text-brand-ink! hover:border-brand-vivid focus:border-brand {geolocate
				? 'pr-11'
				: ''}"
		/>
		{#if geolocate}
			<button
				type="button"
				onclick={locate}
				disabled={geoStatus === 'locating'}
				aria-label="Use my location"
				class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-brand hover:bg-paper-brand hover:text-brand-vivid disabled:opacity-50"
			>
				{#if geoStatus === 'locating'}
					<LoaderCircle class="h-4 w-4 animate-spin" />
				{:else}
					<LocateFixed class="h-4 w-4" />
				{/if}
			</button>
		{/if}
	</div>
	<p class="sr-only" role="status">{status}</p>

	{#if search.trim()}
		{#if shown.length > 0}
			<ul
				class="absolute z-10 mt-1 max-h-80 w-full max-w-96 overflow-y-auto rounded-lg bg-white py-1 shadow-lg"
			>
				{#if result.countryCode && !showNameMatches}
					<li class="flex items-center justify-between gap-2 px-4 py-1.5 text-xs text-ink-alt">
						<span>{result.matches.length} cities in {result.countryName}</span>
						<button type="button" onclick={() => (search = '')} class="link">clear</button>
					</li>
				{/if}
				{#each shown as city (city.slug)}
					{@render cityRow(city)}
				{/each}
				{#if result.countryCode && result.nameMatches.length > 0 && !showNameMatches}
					<li>
						<button
							type="button"
							onclick={() => (showNameMatches = true)}
							class="w-full px-4 py-2 text-left text-xs text-ink-alt hover:bg-paper-brand"
						>
							…or {result.nameMatches.length} cities named “{search.trim()}”
						</button>
					</li>
				{/if}
			</ul>
		{:else}
			<div
				class="absolute z-10 mt-1 w-full max-w-96 rounded-lg border-border-weaker bg-white px-4 py-4 text-sm text-ink-alt shadow-lg"
			>
				Sorry, no city found. <br /><br />We only cover European cities for now — and not all tools
				are available for all cities.
			</div>
		{/if}
	{:else if geoStatus === 'nearby'}
		<ul class="absolute z-10 mt-1 w-full max-w-96 rounded-lg bg-white py-1 shadow-lg">
			<li class="px-4 py-1 text-xs font-light tracking-wider text-ink-alt-weaker uppercase">
				Nearest covered cities
			</li>
			{#each nearby as { city, km } (city.slug)}
				<li>
					{#if onselect}
						<button
							type="button"
							onclick={() => choose(city)}
							data-city-row
							class="flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-sm hover:bg-paper-brand focus-visible:bg-paper-brand focus-visible:-outline-offset-2"
						>
							<span>{city.name}</span>
							<span class="text-ink-alt-weaker">{Math.round(km)} km</span>
						</button>
					{:else}
						<a
							href={href(city)}
							onclick={dismiss}
							data-city-row
							class="flex items-center justify-between gap-4 px-4 py-2 text-sm hover:bg-paper-brand focus-visible:bg-paper-brand focus-visible:-outline-offset-2"
						>
							<span>{city.name}</span>
							<span class="text-ink-alt-weaker">{Math.round(km)} km</span>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if geoStatus === 'outside'}
		<div
			class="absolute z-10 mt-1 w-full max-w-96 rounded-lg border-border-weaker bg-white px-4 py-4 text-sm text-ink-alt shadow-lg"
		>
			You appear to be outside our coverage area. <br /><br />We only cover European cities for now.
			<br />
			<hr />
			<a href="mailto:{CONTACT_EMAIL}" class="link">Suggest a city!</a>
		</div>
	{:else if geoStatus === 'error'}
		<div
			class="absolute z-10 mt-1 w-full max-w-96 rounded-lg border-border-weaker bg-white px-4 py-4 text-sm text-ink-alt shadow-lg"
		>
			{geoMessage}
		</div>
	{/if}
</div>
