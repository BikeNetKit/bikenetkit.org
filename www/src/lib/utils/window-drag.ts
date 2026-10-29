/** A `[lo, hi]` window on an integer axis running `0…steps`. */
export type Window = [number, number];

export type WindowDragOptions = {
	/** The element whose box carries the axis — its width sets the px→step scale. */
	track: HTMLElement;
	/** Inclusive upper bound of the axis. The lower bound is always 0. */
	steps: number;
	/**
	 * Pixels at each end of `track` the axis does not cover. Zero for a histogram, whose bins fill
	 * the box; half a thumb for a bits-ui slider, whose thumbs it keeps contained inside the track.
	 */
	inset?: number;
	/** The window at pointerdown. Read once — the gesture is anchored, not accumulated. */
	from: Window;
	onMove: (next: Window) => void;
	onEnd?: () => void;
};

/**
 * Slide a `[lo, hi]` window along its axis at constant width for the life of one pointer gesture.
 *
 * Listeners go on `window` rather than on `track` (or a pointer capture): the gesture has to keep
 * running while the pointer is outside a 16 px-tall control, and it has to end even if the node it
 * started on is re-rendered under it — which it is, since the node's own geometry tracks the very
 * state the drag writes.
 */
export function beginWindowDrag(event: PointerEvent, opts: WindowDragOptions): void {
	const { track, steps, inset = 0, from, onMove, onEnd } = opts;
	const usable = track.getBoundingClientRect().width - 2 * inset;
	if (!(usable > 0)) return;

	const pxPerStep = usable / steps;
	const startX = event.clientX;
	const width = from[1] - from[0];

	const move = (e: PointerEvent) => {
		// Anchored on the press position rather than accumulated per event: rounding to whole steps
		// every frame would drift over a long drag, and a window pushed against a bound would not
		// resume the moment the pointer came back the other way.
		const raw = Math.round((e.clientX - startX) / pxPerStep);
		const delta = Math.max(-from[0], Math.min(steps - width - from[0], raw));
		onMove([from[0] + delta, from[0] + delta + width]);
	};
	const end = () => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', end);
		window.removeEventListener('pointercancel', end);
		onEnd?.();
	};

	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', end);
	window.addEventListener('pointercancel', end);
}
