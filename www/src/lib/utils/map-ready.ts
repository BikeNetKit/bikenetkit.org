import type { Map as MapLibreMap } from 'maplibre-gl';

export interface MapReadyOptions {
	timeoutMs?: number;
	isCancelled?: () => boolean;
}

const POLL_MS = 100;

/**
 * Resolves once every source in `sourceIds` reports loaded, or once `timeoutMs` runs out. Resolves
 * `true` when genuinely loaded, `false` on timeout or cancellation, so a caller can degrade rather
 * than stall.
 *
 * It never waits on the basemap's own raster/vector tiles — only on the given sources, which for
 * the ambient hero are local GeoJSON (no network fetch, just MapLibre tiling it internally), so it
 * settles in a frame or two regardless of how slow the pmtiles basemap is to arrive. The basemap
 * keeps loading in the background and fades in as it does.
 *
 * Polling rather than `map.once('idle')`: the hero orbits the camera every frame, and a map that
 * never stops moving never goes idle. `setInterval` rather than `requestAnimationFrame` so it keeps
 * ticking in a backgrounded tab.
 */
export function waitForSourcesLoaded(
	map: MapLibreMap | undefined,
	sourceIds: string[],
	{ timeoutMs = 2000, isCancelled = () => false }: MapReadyOptions = {}
): Promise<boolean> {
	return new Promise((resolve) => {
		if (!map || sourceIds.length === 0) return resolve(false);
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			clearInterval(poll);
			clearTimeout(timer);
			resolve(ok);
		};
		// Two polls of grace: svelte-maplibre-gl adds the GeoJSON source on Svelte's effect flush,
		// which lands after this call returns, so the first reading would otherwise describe the
		// state before the source existed.
		let grace = 2;
		const poll = setInterval(() => {
			if (isCancelled()) return finish(false);
			if (grace > 0) return void grace--;
			if (sourceIds.every((id) => map.getSource(id) && map.isSourceLoaded(id))) finish(true);
		}, POLL_MS);
		const timer = setTimeout(() => finish(false), timeoutMs);
	});
}
