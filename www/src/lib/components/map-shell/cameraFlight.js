import { getContext, setContext } from 'svelte';

const KEY = Symbol('camera-flight');

/**
 * MapHost publishes whether it has just started flying the camera to a new city's bounds, and a
 * way to be notified once that flight settles. Layer sets read this instead of the map's own
 * `isMoving()` directly: MapLibre doesn't flip that flag until the browser's next animation frame,
 * which lands after a layer set's own dataset-reset effect has already decided whether to wait —
 * so a build-up reveal could start racing the camera's fly-to. MapHost flags a flight synchronously,
 * the instant it decides to call `fitBounds`, closing that gap.
 *
 * Settlement is detected by polling `isMoving()` every animation frame rather than listening for a
 * single `moveend`: interrupting an in-flight `fitBounds` with another one (two city switches in
 * quick succession) fires a `moveend` for the *interrupted* transition, which would otherwise be
 * mistaken for the new one settling. Polling only concludes "settled" once the map is genuinely
 * idle, however many transitions it chained through to get there.
 */
export function provideCameraFlight() {
	let flying = false;
	let flightId = 0;
	const waiters = new Set();

	function settle(id) {
		// A newer flight superseded this one — its own poll loop owns settling instead.
		if (id !== flightId) return;
		flying = false;
		for (const cb of waiters) cb();
		waiters.clear();
	}

	const api = {
		isFlying: () => flying,
		/** Call right before `map.fitBounds(...)`. */
		start(map) {
			flying = true;
			const id = ++flightId;
			const check = () => {
				if (id !== flightId) return;
				if (map.isMoving()) requestAnimationFrame(check);
				else settle(id);
			};
			requestAnimationFrame(check);
		},
		/** Runs `cb` now if idle, or once the current flight settles. */
		onSettled(cb) {
			if (flying) waiters.add(cb);
			else cb();
		}
	};
	setContext(KEY, api);
	return api;
}

export function getCameraFlight() {
	return getContext(KEY);
}

/**
 * Runs `cb` once any in-flight camera flight has settled — immediately if the map is already idle.
 * Deferred one tick first: MapHost's own bounds effect may run before or after the caller's dataset
 * effect within the same reactive flush, so the flight flag is only read once that flush has fully
 * settled. `map.isMoving()` is kept as a secondary check for the unrelated case of a reader manually
 * panning/zooming at the exact moment a dataset changes.
 * @param {ReturnType<typeof provideCameraFlight> | undefined} cameraFlight
 * @param {import('maplibre-gl').Map | null | undefined} map
 * @param {() => void} cb
 */
export function afterCameraSettles(cameraFlight, map, cb) {
	queueMicrotask(() => {
		if (cameraFlight?.isFlying() || map?.isMoving()) {
			cameraFlight?.onSettled(cb);
		} else {
			cb();
		}
	});
}
