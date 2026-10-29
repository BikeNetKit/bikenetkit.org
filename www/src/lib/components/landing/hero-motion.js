// Camera motion shared by the landing hero (AmbientMapPane / AmbientHeroMap), which integrates it
// per animation frame, and the /hero-clip capture route, which evaluates it in closed form per
// video frame. One set of numbers, so an exported clip moves the way the hero does.
export const PITCH = 50;
export const BUILD_MS = 3000;
export const ORBIT_SPEED = 3;
export const ZOOM_PUSH = 0.4;
export const ORBIT_MS = 3000;
export const ZOOM_SPEED = ZOOM_PUSH / ((BUILD_MS + ORBIT_MS) / 1000);
// Ceiling on the creep above the city's fitted zoom; the last `ZOOM_EASE_RANGE` decelerates
// into it rather than stopping dead. A normal cycle swaps before reaching the ease.
export const MAX_ZOOM_CREEP = 1.5;
export const ZOOM_EASE_RANGE = 0.5;
// The cross-fade's push/pull swoop.
export const ZOOM_PULL_AMT = 0.8;

export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Zoom creep above the fitted zoom after `t` seconds of orbit, in closed form: linear at
 * `ZOOM_SPEED`, then — where the hero scales the speed by the remaining headroom — an
 * exponential approach to `MAX_ZOOM_CREEP`.
 * @param {number} t
 */
export function zoomCreepAt(t) {
	const linearEnd = (MAX_ZOOM_CREEP - ZOOM_EASE_RANGE) / ZOOM_SPEED;
	if (t <= linearEnd) return ZOOM_SPEED * Math.max(0, t);
	const k = ZOOM_SPEED / ZOOM_EASE_RANGE;
	return MAX_ZOOM_CREEP - ZOOM_EASE_RANGE * Math.exp(-k * (t - linearEnd));
}
