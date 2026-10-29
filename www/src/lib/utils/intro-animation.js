// Which (tool, city) pairs have already played their build-up intro this visit. The build-up is
// an arrival gesture: it reads once, when the reader first opens a city in a tool. A mode switch
// (metric/type/variant/strategy) keeps the same key, so the network stays whole under the reader's
// comparison instead of being torn down and rebuilt.
//
// Cleared when the reader leaves the `(map)` section — see `(map)/+layout@.svelte` — so arriving
// from the tool overview or the landing page animates again.
//
// Client-only in practice: `claimIntro` is called from `$effect`, which never runs on the server.
const played = new Set();

/**
 * @param {string} tool
 * @param {string} city
 */
export function introKeyFor(tool, city) {
	return `${tool}:${city}`;
}

/**
 * True the first time a key is claimed, false on every later claim. An undefined key always
 * plays: the capture wrappers (`/screenshot`, `/animation`, `/embed`) pass none and keep
 * animating exactly as before.
 * @param {string | undefined} key
 */
export function claimIntro(key) {
	if (!key) return true;
	if (played.has(key)) return false;
	played.add(key);
	return true;
}

export function resetIntros() {
	played.clear();
}
