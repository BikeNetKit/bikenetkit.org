import { getContext, setContext } from 'svelte';
import { fetchDatasetLayers } from '$lib/data/dataset-layers';
import { cachedCityBoundary, loadCityBoundary } from '$lib/data/boundaries';

const KEY = Symbol('active-dataset');

/** @typedef {import('$lib/data/dataset-layers').DatasetKey} DatasetKey */
/** @typedef {import('$lib/data/dataset-layers').DatasetLayers} DatasetLayers */
/** @typedef {import('$lib/data/boundaries').CityBoundary} CityBoundary */
/** @typedef {'idle' | 'loading' | 'ready' | 'error'} ActiveDatasetStatus */

/**
 * The map section's dataset, fetched in the browser from `PUBLIC_DATA_URL`.
 *
 * Owned by the `(map)` layout rather than each page because `MapDownloadControl` renders inside
 * `MapHost`, a *sibling* of the page — context only flows down, so the page could not provide to it.
 * Mirrors `expertMenu.svelte.js`: the shell publishes, descendants consume.
 *
 * The layers and the key they were fetched for are held as one value, so the map keeps its last
 * complete render until the replacement lands. That preserves the atomic swap SvelteKit's `load()`
 * used to give for free: a metric toggle does not flash to a bare basemap, and the controls can
 * update instantly from `page.data` while the map follows one fetch behind.
 *
 * @param {() => (DatasetKey | null)} key
 * @param {() => (string | undefined)} citySlug
 */
export function provideActiveDataset(key, citySlug) {
	// `$state.raw`, not `$state`: these hold parsed GeoJSON — up to ~18 MB and hundreds of thousands
	// of nested objects for a big superblockify city. Plain `$state` deep-proxies everything assigned
	// into it, which costs a fortune to wrap and hands MapLibre Proxies instead of the plain objects
	// it expects. The layers are immutable once fetched and always replaced wholesale, so raw state
	// is both correct and what the data wants. (Before this refactor they arrived as plain objects
	// from SvelteKit's `load()`, so nothing was ever proxied.)
	/** @type {{ key: DatasetKey, layers: DatasetLayers } | null} */
	let current = $state.raw(null);
	// Seeded from the synchronous cache rather than starting at null: this runs while the `(map)`
	// layout is initialising, so a boundary already parsed this session reaches `MapHost` in time to
	// be baked into the map's initial style. Starting at null would work — the effect below still
	// catches up — but only after the basemap has painted its labels unclipped once.
	/** @type {CityBoundary | null} */
	let boundary = $state.raw(cachedCityBoundary(citySlug() ?? ''));
	/** @type {ActiveDatasetStatus} */
	let status = $state('idle');
	// Deliberately not reactive — see the comparison in the effect below.
	/** @type {DatasetKey | null} */
	let lastKey = null;

	// `$effect` never runs during SSR, so the prerendered shell ships no dataset at all — which is
	// the point: the GeoJSON is no longer serialised into ~8,700 pages. Layers arrive on hydration.
	$effect(() => {
		const next = key();
		if (!next) {
			current = null;
			status = 'idle';
			return;
		}
		// Holding the previous render is only ever right for a *parameter* switch within one tool and
		// city — that is the atomic swap this store exists for. Across a tool or city switch it hands
		// the incoming page a foreign dataset: LinkBikeNet would mount against SuperBlockify's network
		// and paint it as its own build-up until its fetch lands, or a new city's page would draw the
		// previous city's network under the new camera. Drop it up front instead.
		//
		// Compared against `lastKey`, a plain variable, rather than against `current`: reading
		// `current` here would make this effect depend on the state it assigns on completion, so
		// every finished fetch would retrigger the effect and refetch, forever.
		if (lastKey && (lastKey.tool !== next.tool || lastKey.city !== next.city)) {
			current = null;
		}
		lastKey = next;
		const controller = new AbortController();
		status = 'loading';
		fetchDatasetLayers(fetch, next, { signal: controller.signal })
			.then((layers) => {
				current = { key: next, layers };
				status = 'ready';
			})
			.catch((err) => {
				// Superseded by a newer key: the effect that replaced this one owns the state now.
				if (err?.name === 'AbortError') return;
				current = null;
				status = 'error';
			});
		// A fast city switch must never paint the previous city's network over the new basemap.
		return () => controller.abort();
	});

	// Keyed on the city alone: a metric/type/variant switch must not drop the boundary mask and
	// re-clip the basemap labels. `loadCityBoundary` already caches per slug for the session.
	$effect(() => {
		const slug = citySlug();
		if (!slug) {
			boundary = null;
			return;
		}
		// Already parsed — a city seen earlier this session, or one the hover prefetch warmed. Take
		// it now so the switch re-clips once, on the same tick, instead of a tick later.
		//
		// Only when there *is* one: on a cold switch the previous city's polygon deliberately stays
		// up until the new one lands. Clearing to null first would un-clip the whole basemap for the
		// duration of the fetch, which reads worse than briefly holding a stale clip while the camera
		// is still flying.
		const warm = cachedCityBoundary(slug);
		if (warm) boundary = warm;
		let live = true;
		loadCityBoundary(fetch, slug).then((b) => {
			if (live) boundary = b;
		});
		return () => {
			live = false;
		};
	});

	const store = {
		get geojson() {
			return current?.layers.geojson ?? null;
		},
		get seeds() {
			return current?.layers.seeds ?? null;
		},
		get context() {
			return current?.layers.context ?? null;
		},
		get blocks() {
			return current?.layers.blocks ?? null;
		},
		get existingNetwork() {
			return current?.layers.existingNetwork ?? null;
		},
		/**
		 * The parameters the currently-painted layers belong to — *not* the current route params.
		 * Derive anything describing the render (metric property, ramps, legends) from this, so a
		 * parameter switch can never paint the old network against the new metric.
		 */
		get key() {
			return current?.key ?? null;
		},
		get cityBoundary() {
			return boundary;
		},
		get status() {
			return status;
		}
	};
	setContext(KEY, store);
	return store;
}

/** @returns {ReturnType<typeof provideActiveDataset>} */
export const activeDataset = () => getContext(KEY);
