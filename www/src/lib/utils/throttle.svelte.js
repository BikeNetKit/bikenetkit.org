/**
 * Mirrors `getValue()`, but applies it at most once every `intervalMs` — a plain wall-clock
 * throttle, not one keyed to the display's refresh rate. Playback and fast scrubbing can change
 * the source value every frame; on a big enough city a single expensive map update (a
 * `setPaintProperty`/`setFeatureState` pass across many features) can itself take longer than one
 * frame to process, so gating to "once per animation frame" doesn't leave enough headroom — the
 * next update gets issued before the browser has actually finished the last one, and the map falls
 * further behind the longer it runs. A longer, fixed interval guarantees it always has time to
 * finish one update before the next is asked for.
 *
 * Always applies the latest value once the interval elapses — trailing-edge, never a stale
 * intermediate one — so motion still visibly advances during a long playback or drag instead of
 * freezing until it stops.
 *
 * Cheap UI driven by the same source (the scrubber position, a HUD readout) should keep reading
 * `getValue()` directly — only the expensive map update belongs behind this.
 * @template T
 * @param {() => T} getValue
 * @param {number} [intervalMs]
 * @returns {{ readonly current: T }}
 */
export function timeThrottled(getValue, intervalMs = 120) {
	let current = $state(getValue());
	let latest = getValue();
	let lastApplied = 0;
	let timeoutId = null;

	// Not a `$derived`: the whole point is to *not* apply in lockstep with `getValue()` — a
	// `$effect` is what lets the trailing timeout below decide when `current` actually advances.
	$effect(() => {
		latest = getValue();
		if (timeoutId != null) return;
		const delay = Math.max(0, intervalMs - (performance.now() - lastApplied));
		timeoutId = setTimeout(() => {
			timeoutId = null;
			lastApplied = performance.now();
			current = latest;
		}, delay);
	});

	// A separate, dependency-free effect: its cleanup only runs on unmount, not before every
	// re-run of the effect above — clearing the pending timeout there would reset the throttle's
	// wait on every single change and defeat the whole point.
	$effect(() => {
		return () => {
			if (timeoutId != null) clearTimeout(timeoutId);
		};
	});

	return {
		get current() {
			return current;
		}
	};
}
