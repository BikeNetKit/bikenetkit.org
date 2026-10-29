/**
 * Collapse the basemap credit to its ⓘ button.
 *
 * MapLibre's `AttributionControl` already runs in `compact` mode by default — the rounded pill with
 * a toggle button — but it mounts *expanded*: `_updateCompact()` adds both `maplibregl-compact` and
 * `maplibregl-compact-show`, and the only thing that ever closes it again is a map drag
 * (`_updateCompactMinimize`). So on a tool page the loudest object in the bottom-right corner at
 * first paint is a credit, sitting under the controls the reader actually came for.
 *
 * Safe to call once and forget: `_updateCompact()` re-adds that pair only while
 * `maplibregl-compact` is *absent*, which it never is again after the first mount — so neither a
 * resize nor a later attribution update can re-expand what this closed.
 *
 * `open` goes with the class. The vendor's toggle runs on the `summary` click, which is *before* the
 * browser's own `<details>` activation behaviour, and it pre-sets `open` to the value the browser is
 * about to invert — so a collapsed control carries neither. Leaving `open` set here would make the
 * reader's first click close the element while our CSS shows its text.
 *
 * @param {import('maplibre-gl').Map} map
 * @returns {boolean} true once the control was found in compact mode and closed
 */
export function collapseAttribution(map) {
	const el = map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact');
	if (!el) return false;
	el.classList.remove('maplibregl-compact-show');
	el.removeAttribute('open');
	return true;
}
