import { getContext, setContext } from 'svelte';

const KEY = Symbol('map-table');

/**
 * Open state for the "View as table" dialog, created once by the map layout. Two triggers open it —
 * the map's corner control and the InfoPanel's screen-reader entry — and focus returns to whichever
 * one did. Mirrors `expertMenu.svelte.js`: shell publishes, descendants consume.
 *
 * @param {() => boolean} available whether the current city has data to tabulate
 */
export function provideMapTable(available) {
	let open = $state(false);
	/** @type {HTMLElement | null} */
	let opener = null;
	const table = {
		get open() {
			return open;
		},
		set open(value) {
			open = value;
		},
		get available() {
			return available();
		},
		get opener() {
			return opener;
		},
		/** @param {HTMLElement | null} from */
		show(from) {
			opener = from;
			open = true;
		}
	};
	setContext(KEY, table);
	return table;
}

/** @returns {ReturnType<typeof provideMapTable> | undefined} */
export function getMapTable() {
	return getContext(KEY);
}
