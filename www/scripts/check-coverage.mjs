#!/usr/bin/env node
/**
 * City × tool coverage audit.
 *
 * The failure this exists to catch: a city flagged `recommended` for a tool the export does not
 * actually cover. The tool switcher stars it, the coverage table shows it as not available, and
 * the page the reader lands on then explains the tool is unavailable there. Advertising something we do not have is
 * worse than a gap we never claimed.
 *
 *   pnpm check:coverage              # exits non-zero on a claimed or orphaned dataset
 *   pnpm check:coverage -- --quiet   # findings only, no per-tool summary
 *
 * Run it after every `pnpm update-data` — a recommendation flag and the data behind it come from
 * different files in the export and drift apart silently.
 *
 * It also checks the editorial picks in `featured-cities.ts`: every featured city must exist in the
 * catalog and have data for its tool (and variant). Those fail outright — there is no known list,
 * since the fix is always an edit to a constant this repo owns.
 *
 * Deliberately a script rather than the build preflight in `src/hooks.server.ts`. That one
 * throws when the manifest is missing a whole tool, which is the right blast radius for a build
 * gate. A recommended-but-uncovered city is a data-quality finding someone has to decide about —
 * often by fixing a flag upstream — and should not stop a deploy.
 *
 * Runs through `--experimental-strip-types` with the `$lib` alias hook so it imports the app's own
 * `buildCoverageRows` rather than restating the rules; a second implementation of "is this covered"
 * would be the thing that drifts.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
module.register(pathToFileURL(path.join(HERE, 'lib-alias-hook.mjs')));

/**
 * Gaps that are known, tracked, and waiting on someone upstream. They are reported every run but do
 * not fail it — a check that is red for a reason nobody can act on today is a check that gets
 * muted, and then the *next* regression goes unnoticed too. Anything not in here fails.
 *
 *   pnpm check:coverage -- --accept   # after confirming a new gap is expected, record it here
 */
const KNOWN_PATH = path.join(HERE, 'check-coverage.known.json');

const { cities } = await import('../src/lib/data/cities.ts');
const { datasets } = await import('../src/lib/data/datasets.ts');
const { COVERAGE_COLUMNS, coverageFacts } = await import('../src/lib/data/coverage.ts');
const { FEATURED_CITIES } = await import('../src/lib/data/featured-cities.ts');
const { pickDataset } = await import('../src/lib/data/city-tools.ts');

const quiet = process.argv.includes('--quiet');
const label = (col) => (col.sublabel ? `${col.label} (${col.sublabel})` : col.label);

const facts = cities.map((city) =>
	COVERAGE_COLUMNS.map((col) => ({ city, col, ...coverageFacts(col, city, datasets) }))
);
const knownCities = new Set(cities.map((c) => c.slug));

/** Recommended, but the export ships nothing. */
const claimed = [];
/** Data on disk for a city the catalogue does not know about: unreachable, and a slug-drift smell. */
const orphaned = [];

for (const { city, col, recommended, hasData } of facts.flat()) {
	if (recommended && !hasData) claimed.push({ city: city.slug, column: label(col) });
}

for (const [tool, list] of Object.entries(datasets)) {
	for (const slug of new Set(list.map((d) => d.city))) {
		if (!knownCities.has(slug)) orphaned.push({ tool, city: slug });
	}
}

const FEATURED_PER_TOOL = 6;
/** Editorial picks that are misspelled, duplicated, the wrong count, or have nothing to show. */
const featuredProblems = [];
const citiesBySlug = new Map(cities.map((c) => [c.slug, c]));

for (const [key, slugs] of Object.entries(FEATURED_CITIES)) {
	const [tool, variant] = key.split(':');
	// A tool that covers fewer cities than that (SortBikeNet: Paris only) features all of them.
	const covered = cities.filter((c) => pickDataset(tool, c, datasets, variant)).length;
	const expected = Math.min(FEATURED_PER_TOOL, covered);
	if (slugs.length !== expected) {
		featuredProblems.push({ key, problem: `${slugs.length} picks, expected ${expected}` });
	}
	for (const slug of new Set(slugs.filter((s, i) => slugs.indexOf(s) !== i))) {
		featuredProblems.push({ key, problem: `${slug} listed twice` });
	}
	for (const slug of slugs) {
		const city = citiesBySlug.get(slug);
		if (!city) featuredProblems.push({ key, problem: `${slug} is not in cities.json` });
		else if (!pickDataset(tool, city, datasets, variant)) {
			featuredProblems.push({ key, problem: `${slug} has no data` });
		}
	}
}

if (!quiet) {
	console.log(`[coverage] ${cities.length} cities × ${COVERAGE_COLUMNS.length} columns\n`);
	for (const [i, col] of COVERAGE_COLUMNS.entries()) {
		const column = facts.map((row) => row[i]);
		const withData = column.filter((f) => f.hasData).length;
		const recommended = column.filter((f) => f.recommended).length;
		console.log(
			`  ${label(col).padEnd(34)} ${String(withData).padStart(3)} with data, ` +
				`${String(recommended).padStart(3)} recommended`
		);
	}
	console.log();
	console.log(`[coverage] featured picks\n`);
	for (const [key, slugs] of Object.entries(FEATURED_CITIES)) {
		console.log(`  ${key.padEnd(34)} ${slugs.join(', ')}`);
	}
	console.log();
}

const known = existsSync(KNOWN_PATH)
	? JSON.parse(readFileSync(KNOWN_PATH, 'utf8'))
	: { note: '', claimed: [] };
const keyOf = ({ city, column }) => `${city} | ${column}`;
const knownKeys = new Set((known.claimed ?? []).map(keyOf));

if (process.argv.includes('--accept')) {
	const payload = {
		note:
			'Recommended-but-uncovered pairs that are known and tracked. Reported every run, but they ' +
			'do not fail it; each is raised with its tool team. Re-record with ' +
			'`pnpm check:coverage -- --accept` once an answer lands.',
		claimed: [...claimed].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
	};
	writeFileSync(KNOWN_PATH, `${JSON.stringify(payload, null, '\t')}\n`);
	console.log(`[coverage] recorded ${claimed.length} known gap(s) in ${path.basename(KNOWN_PATH)}`);
	process.exit(0);
}

const unexpected = claimed.filter((c) => !knownKeys.has(keyOf(c)));
const fixed = [...knownKeys].filter((k) => !claimed.some((c) => keyOf(c) === k));

if (claimed.length > 0) {
	const tracked = claimed.length - unexpected.length;
	console.log(
		`[coverage] ${claimed.length} city/tool pair(s) are recommended but have no data` +
			`${tracked ? ` (${tracked} known and tracked)` : ''}.`
	);
	for (const { city, column } of claimed.slice(0, 40)) {
		const mark = knownKeys.has(keyOf({ city, column })) ? ' ' : '!';
		console.log(`  ${mark} ${city.padEnd(24)} ${column}`);
	}
	if (claimed.length > 40) console.log(`  … and ${claimed.length - 40} more`);
	console.log();
}

if (fixed.length > 0) {
	console.log(
		`[coverage] ${fixed.length} previously-known gap(s) now have data — re-record with ` +
			`\`pnpm check:coverage -- --accept\`:`
	);
	for (const k of fixed.slice(0, 20)) console.log(`  ${k}`);
	console.log();
}

if (unexpected.length > 0) {
	console.error(
		`[coverage] ${unexpected.length} NEW recommended-but-uncovered pair(s).\n` +
			`           The tool switcher stars them and the coverage table shows them as not available;\n` +
			`           the page the reader lands on then says the tool is unavailable there. Fix the flag in the export's\n` +
			`           rec_table.csv, ship the data, or accept it with --accept once it is tracked.\n`
	);
	for (const { city, column } of unexpected.slice(0, 40)) {
		console.error(`  ${city.padEnd(24)} ${column}`);
	}
	console.error();
}

if (orphaned.length > 0) {
	console.error(
		`[coverage] ${orphaned.length} dataset(s) belong to a city that is not in cities.json, so\n` +
			`           nothing on the site can reach them. Usually a slug that did not survive the\n` +
			`           cityid mapping in update-data.\n`
	);
	for (const { tool, city } of orphaned.slice(0, 40)) {
		console.error(`  ${tool.padEnd(16)} ${city}`);
	}
	console.error();
}

if (featuredProblems.length > 0) {
	console.error(
		`[coverage] ${featuredProblems.length} problem(s) with the featured picks in\n` +
			`           src/lib/data/featured-cities.ts. A featured city is a promise on the tool's\n` +
			`           landing page; fix the slug or pick another city.\n`
	);
	for (const { key, problem } of featuredProblems) console.error(`  ${key.padEnd(26)} ${problem}`);
	console.error();
}

if (unexpected.length === 0 && orphaned.length === 0 && featuredProblems.length === 0) {
	console.log(
		claimed.length === 0
			? '[coverage] OK — every recommendation and featured pick has data behind it, and every dataset is reachable.'
			: '[coverage] OK — no new gaps; the ones above are tracked.'
	);
	process.exit(0);
}
process.exit(1);
