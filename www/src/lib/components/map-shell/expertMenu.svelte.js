import { getContext, setContext } from 'svelte';

const KEY = Symbol('expert-menu');

/**
 * A single reactive holder for the toolbar's expert menu, created once by the map layout. The
 * toolbar reads `content`; each tool page writes its own controls in and the gear appears
 * only while something is registered. Mirrors `mapOverlay.js`: shell publishes, descendants consume.
 */
export function provideExpertMenu() {
	const menu = $state({ content: null });
	setContext(KEY, menu);
	return menu;
}

export function getExpertMenu() {
	return getContext(KEY);
}

/**
 * Register the current page's expert-menu content. `getContent` is a getter returning the snippet
 * to show, or `null`/`undefined` to hide the gear (e.g. an uncovered city with no data). It is read
 * reactively, so the gear appears and disappears as the page's state changes, and is cleared when
 * the page unmounts. Call once at page-script top level.
 *
 * @param {() => (import('svelte').Snippet | null | undefined)} getContent
 */
export function setExpertMenu(getContent) {
	const menu = getContext(KEY);
	if (!menu) return;
	$effect(() => {
		menu.content = getContent() ?? null;
		return () => {
			menu.content = null;
		};
	});
}
