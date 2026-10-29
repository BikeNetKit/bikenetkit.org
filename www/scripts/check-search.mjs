#!/usr/bin/env node
/**
 * City search audit: can a reader reach every city with a spelling they can actually type?
 *
 * The failure this exists to catch: 37 of the 403 catalog names carry a character that is not on
 * an ordinary keyboard, and the catalog is inconsistent about which way it leans — it keeps the
 * umlaut in `Gütersloh` but drops it in `Malmo` and `Lodz`. A search that compares raw characters
 * makes those cities reachable only by someone who already knows how the catalog spelled them,
 * which for a site whose front door is a search field means unreachable. `text-fold.ts` folds both
 * sides; this checks that the fold still covers the catalog it is folding.
 *
 *   pnpm check:search              # exits non-zero if any city is unreachable
 *   pnpm check:search -- --quiet   # failures only, no per-layer summary
 *
 * Run it after `pnpm update-data` — a new city can introduce a character the fold tables have
 * never seen, and nothing else in the pipeline would notice.
 *
 * Four layers, because each catches a different regression:
 *
 *   1. Hand-typed spellings → the slug they must reach. The only layer that tests the fold
 *      *tables*; the generated sweeps cannot, since they would derive the query from the same code
 *      they are checking.
 *   2. Every city is reachable by the ASCII spelling in its own URL — the property a reader leans
 *      on without knowing it, since the slug *is* the ASCII spelling.
 *   3. Every city is reachable by its own display name, verbatim. Catches a fold that mangles a
 *      name into something that no longer matches itself.
 *   4. Every non-ASCII character in the catalog folds to something. This is the one that fires
 *      when a *new* city arrives carrying a letter the tables have never seen.
 *
 * Runs through `--experimental-strip-types` with the `$lib` alias hook so it imports the app's own
 * `searchCities` rather than restating it; a second implementation of "does this match" would be
 * the thing that drifts.
 */
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
module.register(pathToFileURL(path.join(HERE, 'lib-alias-hook.mjs')));

const { searchCities } = await import('../src/lib/utils/city-search.ts');
const { matchKeys } = await import('../src/lib/utils/text-fold.ts');
const { cities } = await import('../src/lib/data/cities.ts');

const quiet = process.argv.includes('--quiet');
const failures = [];
const fail = (layer, detail) => failures.push({ layer, detail });
const note = (line) => {
	if (!quiet) console.log(line);
};

const finds = (query, slug) => searchCities(cities, query).matches.some((c) => c.slug === slug);

/**
 * The spellings a reader produces, and the city each one has to reach. Hand-written on purpose:
 * derived queries would only prove the plumbing, not the tables behind it. Each group names the
 * rule it pins down, so a failure says which one broke.
 */
const TYPED = [
	// The umlaut dropped, spelled out, and typed — one city, three keyboards.
	['gutersloh', 'gutersloh_de'],
	['guetersloh', 'gutersloh_de'],
	['Gütersloh', 'gutersloh_de'],
	['dusseldorf', 'dusseldorf_de'],
	['duesseldorf', 'dusseldorf_de'],
	['munster', 'munster_de'],
	['muenster', 'munster_de'],
	['osnabrueck', 'osnabruck_de'],
	['wurzburg', 'wurzburg_de'],
	// …and the reverse: the catalog dropped the diacritic, the reader did not.
	['Malmö', 'malmo_se'],
	['Łódź', 'lodz_pl'],
	['Gdańsk', 'gdansk_pl'],
	['Poznań', 'poznan_pl'],
	['Wrocław', 'wroclaw_pl'],
	// Å → Aa, the Danish convention, applied in the direction the reader typed it.
	['Århus', 'aarhus_dk'],
	['umea', 'umea_se'],
	['umeaa', 'umea_se'],
	// Marks that are not umlauts at all.
	['Chișinău', 'chisinau_md'],
	['chisinau', 'chisinau_md'],
	['siauliai', 'siauliai_lt'],
	['besancon', 'besancon_fr'],
	['durres', 'durres_al'],
	// Separators: hyphen, slash, and the spaces the catalog's own name does not have.
	['saint etienne', 'saintetienne_fr'],
	['saint-etienne', 'saintetienne_fr'],
	['Saint-Étienne', 'saintetienne_fr'],
	['pamplona iruna', 'pamplonairuna_es'],
	['aix en provence', 'aixenprovence_fr'],
	['zielona gora', 'zielonagora_pl'],
	['alcala de henares', 'alcaladehenares_es']
];

for (const [query, slug] of TYPED) {
	if (!finds(query, slug)) fail('typed', `"${query}" does not find ${slug}`);
}
note(`[search] ${TYPED.length} hand-typed spellings`);

// 2. The slug minus its country suffix is the ASCII spelling the URL already shows a reader.
for (const city of cities) {
	const base = city.slug.replace(/_[a-z]{2}$/, '');
	if (!finds(base, city.slug)) {
		fail('slug', `"${base}" does not find ${city.slug} (${city.name}) — keys ${key(city.name)}`);
	}
}
note(`[search] ${cities.length} cities by the ASCII spelling in their URL`);

// 3. …and by the name the site displays, which is what someone copying from the page will paste.
for (const city of cities) {
	if (!finds(city.name, city.slug)) {
		fail('name', `"${city.name}" does not find itself (${city.slug}) — keys ${key(city.name)}`);
	}
}
note(`[search] ${cities.length} cities by their own display name`);

// 4. Every non-ASCII character the catalog uses has to fold to a non-empty run of ASCII letters.
// A character that folds to nothing is dropped silently, which is how `Łódź` would have become
// `odz` and stopped matching anything a reader would type.
const exotic = new Set();
for (const city of cities) {
	for (const char of `${city.name}${city.country ?? ''}`) {
		if (!/[\x20-\x7e]/.test(char)) exotic.add(char.toLowerCase());
	}
}
for (const char of [...exotic].sort()) {
	const folded = matchKeys(char)[0];
	if (!/^[a-z0-9]+$/.test(folded)) {
		fail(
			'character',
			`"${char}" (U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) ` +
				`folds to ${JSON.stringify(folded)} — add it to the tables in text-fold.ts`
		);
	}
}
note(`[search] ${exotic.size} distinct non-ASCII characters in the catalog`);

// Guards on the behaviour around the fold, which this change could plausibly have broken.
const dk = searchCities(cities, 'dk');
if (dk.countryCode !== 'DK' || dk.matches.some((c) => c.countryCode !== 'DK')) {
	fail('guard', 'a two-letter country code no longer resolves to the country');
}
if (searchCities(cities, 'zzzz').matches.length > 0) fail('guard', '"zzzz" matches something');
if (searchCities(cities, '   ').matches.length > 0)
	fail('guard', 'a blank query matches something');
if (searchCities(cities, '-').matches.length > 0) {
	fail('guard', 'a query of pure punctuation matches something');
}
note('[search] 4 guards on the country-code path and empty queries');

function key(name) {
	return JSON.stringify(matchKeys(name));
}

if (failures.length === 0) {
	console.log('[search] OK — every city is reachable by every spelling a reader can type.');
	process.exit(0);
}

console.error(
	`\n[search] ${failures.length} unreachable spelling(s). A city nobody can type the name of is a\n` +
		`         city nobody can reach: the search field is the front door on the landing page.\n` +
		`         Usually a character missing from the fold tables in src/lib/utils/text-fold.ts.\n`
);
for (const { layer, detail } of failures.slice(0, 40)) {
	console.error(`  ${layer.padEnd(10)} ${detail}`);
}
if (failures.length > 40) console.error(`  …and ${failures.length - 40} more`);
console.error();
process.exit(1);
