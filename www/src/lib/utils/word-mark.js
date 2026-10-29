// Acronym runs stay intact; an all-lowercase name stays whole. Shared by the generated SVG
// lockups (`$lib/design/sublogo.js`) and the HTML rendering (`ui/ToolName.svelte`), so the two can
// never disagree about where a name breaks.
const WORD_RE = /[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|[A-Z]/g;

/**
 * GrowBikeNet -> [Grow, Bike, Net] | BikeDNA -> [Bike, DNA] | superblockify -> [superblockify]
 * @param {string} text
 * @returns {string[]}
 */
export function splitWordMark(text) {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (/\s/.test(trimmed)) return trimmed.split(/\s+/);
	const parts = trimmed.match(WORD_RE);
	// Fall back to the raw string whenever the regex would drop characters it cannot classify.
	return parts && parts.join('') === trimmed ? parts : [trimmed];
}
