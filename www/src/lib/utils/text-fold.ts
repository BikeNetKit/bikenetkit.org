/**
 * Match keys for free-text search: diacritic-, digraph- and punctuation-insensitive.
 *
 * Two keys per string, because the two spellings a reader reaches for when they cannot type a
 * letter disagree with each other — dropping the mark (Gütersloh → gutersloh) and spelling it out
 * (Gütersloh → guetersloh). Both keys are generated for the *query* as well as for the target, so
 * this is one symmetric rule rather than a list of directions, and the awkward cases fall out of
 * it: the catalog is inconsistent about whether it keeps diacritics at all, so "Malmö" has to find
 * `Malmo` on the plain key while "Århus" finds `Aarhus` on the spelled-out one.
 */

/** Letters NFD leaves alone — the mark is part of the glyph, not a combining character. */
const PLAIN: Record<string, string> = {
	ø: 'o',
	đ: 'd',
	ð: 'd',
	þ: 'th',
	ł: 'l',
	ı: 'i',
	ħ: 'h',
	ŧ: 't',
	ŋ: 'n',
	æ: 'ae',
	œ: 'oe',
	ß: 'ss'
};

/** …and the spelling people type instead, listing only what differs from the base letter. */
const TRANSLITERATED: Record<string, string> = {
	...PLAIN,
	ä: 'ae',
	ö: 'oe',
	ü: 'ue',
	å: 'aa',
	ø: 'oe',
	ð: 'dh'
};

function fold(text: string, table: Record<string, string>): string {
	let out = '';
	// Lowercase *then* compose: a name that arrives decomposed spells ü as "u + ◌̈", which would
	// miss the table entirely and lose the transliteration.
	for (const char of text.toLowerCase().normalize('NFC')) out += table[char] ?? char;
	return out
		.normalize('NFD')
		.replace(/\p{M}+/gu, '') // é→e, ș→s, ă→a, ź→z — everything NFD does decompose
		.replace(/[^\p{L}\p{N}]+/gu, ''); // hyphens, slashes, apostrophes, spaces
}

/** The keys for one string. One entry when the two folds agree, which is the common case. */
export function matchKeys(text: string): string[] {
	const plain = fold(text, PLAIN);
	const spelled = fold(text, TRANSLITERATED);
	return plain === spelled ? [plain] : [plain, spelled];
}

// The catalog is a fixed set of ~440 names and countries, refolded on every keystroke, so it is
// worth caching. Queries deliberately are not cached: every keystroke is a new string, and the
// cache would grow by one dead entry per character typed.
const cache = new Map<string, readonly string[]>();

function cachedKeys(text: string): readonly string[] {
	let keys = cache.get(text);
	if (!keys) cache.set(text, (keys = matchKeys(text)));
	return keys;
}

/** Does `haystack` contain any of `queryKeys`, once both sides are folded? */
export function matchesFolded(haystack: string, queryKeys: readonly string[]): boolean {
	const keys = cachedKeys(haystack);
	return queryKeys.some((q) => keys.some((k) => k.includes(q)));
}
