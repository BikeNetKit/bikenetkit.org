import { getContext, setContext } from 'svelte';

const KEY = Symbol('map-overlay');

/**
 * @typedef {'controls' | 'readouts' | 'playback'} RailZone
 * The three slots of the host's left rail, top to bottom: the page's control panels, the map's own
 * readout cards (existing-network chip, HUD, legend, size filter), and the playback bar.
 */

/**
 * MapHost publishes a getter for its shared overlay container — a positioned sibling of the
 * `<MapLibre>` element, not a descendant. Layer sets and panel stacks relocate their DOM into it so
 * they inherit the app's styles from `body`, not the vendor rules on `.maplibregl-map` (which forces
 * a font and could grow other inherited properties on a future maplibre update).
 *
 * `getZone` resolves the left rail's slots. A host that renders no rail (or a caller asking for an
 * unknown slot) returns undefined, which the portal treats as "nowhere to go" and leaves the element
 * where it is.
 *
 * @param {() => HTMLElement | undefined} getEl
 * @param {() => { width: number, height: number }} getSize
 * @param {(zone: RailZone) => HTMLElement | undefined} [getZone]
 */
export function provideMapOverlay(getEl, getSize, getZone = () => undefined) {
	setContext(KEY, { getEl, getSize, getZone });
}

/**
 * Returns a Svelte attachment that moves its element into the host's overlay container. Call it in a
 * component script (so the context read happens during init); apply the result with `{@attach …}` on
 * the element whose subtree should render over the map — its MapLibre sources/layers, if any, stay
 * where they are. No-op outside a MapHost.
 *
 * With a `zone`, the element lands in that slot of the host's left rail instead of the overlay at
 * large — the rail then owns its position and how it yields when the map gets short. Without one it
 * lands in the overlay itself, which is what anything positioning against the map (tooltips) wants.
 *
 * @param {RailZone} [zone]
 */
export function mapOverlayPortal(zone) {
	const ctx = getContext(KEY);
	return (node) => {
		const target = zone ? ctx?.getZone(zone) : ctx?.getEl();
		if (!target || node.parentNode === target) return;
		target.appendChild(node);
		return () => node.remove();
	};
}

/**
 * Returns a getter for the live pixel size of the shared overlay layer — the box a tooltip must
 * stay inside. `{ width: 0, height: 0 }` outside a MapHost, which callers treat as "don't clamp".
 */
export function mapOverlaySize() {
	const ctx = getContext(KEY);
	return () => ctx?.getSize() ?? { width: 0, height: 0 };
}
