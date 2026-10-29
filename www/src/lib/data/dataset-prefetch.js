import {
	geojsonPathFor,
	existingNetworkPathFor,
	contextPointsPathFor,
	growBikeNetSeedPathFor,
	superblockBlocksPathFor
} from '$lib/data/tool-paths';
import { wantsExistingNetwork } from '$lib/data/dataset-layers';
import { datasetKeyFromHref } from '$lib/data/dataset-href';
import { toolCoversCity } from '$lib/data/tool-page-loader';
import { datasets } from '$lib/data/datasets';
import { loadCityBoundary } from '$lib/data/boundaries';

/** @typedef {import('$lib/data/dataset-layers').DatasetKey} DatasetKey */

// Long enough that sweeping the pointer down the 403-entry city menu prefetches nothing, short
// enough that resting on a link still wins most of the round trip back.
const HOVER_DELAY_MS = 120;

// Dataset ids already warmed this session. Ids only — a few hundred short strings. The payloads are
// deliberately *not* retained; see `prefetchDataset`.
const warmed = new Set();

const idFor = (/** @type {DatasetKey} */ k) =>
	`${k.tool}|${k.city}|${k.metric}|${k.type}|${k.variant}`;

/**
 * The same files `fetchDatasetLayers` will request, derived from the same helpers and the same
 * existing-network gate so the two can never drift apart and prefetch the wrong URLs.
 *
 * @param {DatasetKey} key
 */
function urlsFor(key) {
	const { tool, city, metric, type, variant } = key;
	return /** @type {string[]} */ (
		[
			geojsonPathFor(tool, key),
			tool === 'growbikenet' && growBikeNetSeedPathFor(city, type, variant),
			tool === 'growbikenet' && contextPointsPathFor(city, type),
			tool === 'superblockify' && superblockBlocksPathFor(city, metric),
			wantsExistingNetwork(tool, variant) && existingNetworkPathFor(tool, city, type)
		].filter(Boolean)
	);
}

/**
 * Warm the browser's HTTP cache for a dataset. The response body is deliberately discarded: the
 * point is the cache entry, not the value. Parsed GeoJSON runs to several times its wire size
 * (Berlin's superblockify edges are 18.5 MB before parsing), so holding it would cost far more
 * memory than the re-parse it saves — and this way `fetchDatasetLayers` needs no changes at all,
 * it simply finds the bytes already there.
 *
 * @param {DatasetKey} key
 */
export function prefetchDataset(key) {
	// The city boundary too — and unlike the network payloads this one is kept *parsed*, because
	// `active-dataset` reads it synchronously to bake the basemap label clip into the map's initial
	// style. It is 2–9 KB, and `loadCityBoundary` dedupes per slug, so this sits above the
	// dataset-level guard below: a second dataset in the same city should still warm it.
	loadCityBoundary(fetch, key.city);
	const id = idFor(key);
	if (warmed.has(id)) return;
	warmed.add(id);
	for (const url of urlsFor(key)) {
		// `priority` is Chromium-only and ignored elsewhere; harmless where unsupported.
		fetch(url, { priority: 'low' }).catch(() => warmed.delete(id));
	}
}

/** Metered or slow connections: the reader pays for this, so don't spend on a guess. */
function shouldPrefetch() {
	// Network Information API: widely available on Chromium, absent on Safari and Firefox, and not
	// in the DOM typings — treat absence as "no reason to hold back".
	const c = /** @type {{ connection?: { saveData?: boolean, effectiveType?: string } }} */ (
		/** @type {unknown} */ (navigator)
	).connection;
	if (!c) return true;
	return !c.saveData && !/(^|-)2g$/.test(c.effectiveType ?? '');
}

/**
 * Attach hover/focus prefetching for every map link on the page, and return a cleanup function.
 *
 * One delegated listener rather than handlers on each link: the links live across six components
 * (city menu, tool tabs, axis controls, the unavailable-city suggestions, the city pages and the
 * coverage table), and none of them should have to know this exists. Mirrors what
 * `data-sveltekit-preload-data="hover"` already does for the page module — that covers the code
 * and `__data.json`, neither of which carries the network any more.
 *
 * Plain module rather than a rune one: nothing here is reactive, and the caller owns the effect.
 *
 * @returns {() => void} cleanup
 */
export function startDatasetPrefetch() {
	if (!shouldPrefetch()) return () => {};
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** @param {Event} event */
	const arm = (event) => {
		const target = /** @type {Element | null} */ (event.target);
		const link = target?.closest?.('a[href]');
		const key = datasetKeyFromHref(link?.getAttribute('href') ?? null);
		// A tool/city pair with no dataset resolves to the "not available here" page, whose files do
		// not exist — prefetching it is a guaranteed 404.
		if (!key || !toolCoversCity(datasets[key.tool] ?? [], key.city)) return;
		clearTimeout(timer);
		timer = setTimeout(() => prefetchDataset(key), HOVER_DELAY_MS);
	};
	const disarm = () => clearTimeout(timer);
	document.addEventListener('pointerover', arm);
	document.addEventListener('pointerout', disarm);
	// Keyboard parity: tabbing onto a link arms the same prefetch.
	document.addEventListener('focusin', arm);
	return () => {
		disarm();
		document.removeEventListener('pointerover', arm);
		document.removeEventListener('pointerout', disarm);
		document.removeEventListener('focusin', arm);
	};
}
