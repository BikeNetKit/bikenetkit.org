// The clip timeline for /hero-clip: fade in from white, build up, orbit the finished network,
// tear it down in reverse, fade out to white. Every value is a pure function of the frame index,
// so a capture can step it frame by frame and a rerun renders the same pixels. Relative imports
// only: `timeline.test.js` runs it under plain Node.
import {
	ORBIT_SPEED,
	ZOOM_PULL_AMT,
	easeInCubic,
	easeOutCubic,
	zoomCreepAt
} from '../components/landing/hero-motion.js';

/** Seconds per phase. */
export const DEFAULT_PHASES = Object.freeze({
	fadeIn: 1,
	build: 5,
	hold: 4,
	teardown: 3,
	fadeOut: 1
});

/**
 * @typedef {{ fadeIn: number, build: number, hold: number, teardown: number, fadeOut: number }} Phases
 */

/** @param {Phases} phases */
export const clipSeconds = (phases) =>
	phases.fadeIn + phases.build + phases.hold + phases.teardown + phases.fadeOut;

/**
 * @param {number} fps
 * @param {Phases} [phases]
 */
export const frameCount = (fps, phases = DEFAULT_PHASES) => Math.round(clipSeconds(phases) * fps);

/** Phase boundaries in seconds, for the sidecar and the tests. @param {Phases} phases */
export function phaseBounds(phases) {
	const buildStart = phases.fadeIn;
	const buildEnd = buildStart + phases.build;
	const teardownStart = buildEnd + phases.hold;
	const teardownEnd = teardownStart + phases.teardown;
	return { buildStart, buildEnd, teardownStart, teardownEnd, end: teardownEnd + phases.fadeOut };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Everything frame `i` shows: the reveal playhead (`-1` = nothing built, `total - 1` = complete,
 * the same index space as the hero pane's `paneState.frame`), the map's opacity, and the camera's
 * offsets from the fitted camera.
 *
 * @param {number} i
 * @param {{ fps: number, total: number, phases?: Phases, orbitSpeed?: number }} opts
 */
export function frameAt(i, { fps, total, phases = DEFAULT_PHASES, orbitSpeed = ORBIT_SPEED }) {
	const t = i / fps;
	const { buildStart, buildEnd, teardownStart, teardownEnd, end } = phaseBounds(phases);
	const steps = Math.max(0, total);
	const last = steps - 1;

	let reveal;
	if (t < buildStart) reveal = -1;
	else if (t < buildEnd)
		reveal = Math.min(last, Math.floor(((t - buildStart) / phases.build) * steps));
	else if (t < teardownStart) reveal = last;
	else if (t < teardownEnd)
		reveal = Math.ceil((1 - (t - teardownStart) / phases.teardown) * steps) - 1;
	else reveal = -1;

	const opacity =
		t < buildStart
			? phases.fadeIn > 0
				? clamp01(t / phases.fadeIn)
				: 1
			: t > teardownEnd
				? phases.fadeOut > 0
					? clamp01((end - t) / phases.fadeOut)
					: 0
				: 1;

	// The hero's cross-fade swoop: arrive pulled back and settle, leave pushing in.
	const swoop =
		t < buildStart && phases.fadeIn > 0
			? -ZOOM_PULL_AMT * (1 - easeOutCubic(clamp01(t / phases.fadeIn)))
			: t > teardownEnd && phases.fadeOut > 0
				? ZOOM_PULL_AMT * easeInCubic(clamp01((t - teardownEnd) / phases.fadeOut))
				: 0;

	// The fitted zoom is anchored at the middle of the hold rather than at frame 0: the creep would
	// otherwise carry the finished network ~1.5× past its fit, off the frame's edges. Anchored, the
	// clip opens a little wide, orbits the complete network at its fit, and ends a little tight.
	const anchor = zoomCreepAt((buildEnd + teardownStart) / 2);
	return { reveal, opacity, bearing: orbitSpeed * t, zoom: zoomCreepAt(t) - anchor + swoop };
}
