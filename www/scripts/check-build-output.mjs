#!/usr/bin/env node
/**
 * Three contract tests against a finished build. All interrogate the same artifact, and a build is
 * expensive, so they are one command:
 *
 *   pnpm build && pnpm check:build-output
 *   pnpm check:build-output -- --dir some/other/build
 *
 * **1. No external runtime dependencies.** The site has to keep working for years with nobody
 * maintaining it, so nothing may load from a third-party origin at runtime — no CDN scripts, fonts,
 * tiles, or iframes. See AGENTS.md § Project and www/README.md § No external runtime dependencies.
 * This replaces the grep-and-squint procedure that section used to describe.
 *
 * **2. Prerendered pages carry real content.** `adapter-static` must emit HTML with the text in it,
 * not an empty shell that only fills in once JavaScript runs — otherwise the metadata, JSON-LD and
 * `llms.txt` work is decorative, because the crawlers it is for never execute the script.
 *
 * **3. Index signals are coherent.** `llms.txt` and `llms-full.txt` cover every interactive tool, and each covered
 * tool×city has exactly one indexable map page that every other view of the pair names as canonical.
 *
 * None of the checks needs the data on disk or a reachable data host: the build is decoupled from both.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dirArg = process.argv.indexOf('--dir');
const BUILD = path.resolve(HERE, '..', dirArg === -1 ? 'build' : process.argv[dirArg + 1]);

if (!existsSync(BUILD)) {
	console.error(`[build-output] No build at ${BUILD}. Run \`pnpm build\` first.`);
	process.exit(1);
}

/**
 * Origins the built site may name. Two kinds, and the distinction is the whole point:
 *
 * - **Our own hosts**, which serve assets at runtime. These are the dependency, and they are ours.
 * - **Documented non-dependencies**: strings that appear in the bundle but are never fetched.
 *   `unpkg.com` is dead code — `svelte-maplibre-gl` would inject a `<link>` to MapLibre's CSS from
 *   there unless told not to, and every `<MapLibre>` in this repo passes `autoloadGlobalCss={false}`
 *   (the CSS is imported in layout.css instead). **Any new `<MapLibre>` must pass that prop.**
 *   `protomaps.com` and `openstreetmap.org` are the attribution links in the map control.
 */
const ALLOWED_ASSET_HOSTS = new Set([
	'bikenetkit.org',
	'www.bikenetkit.org',
	'tiles.bikenetkit.org',
	'data.bikenetkit.org',
	'docs.bikenetkit.org',
	'faq.bikenetkit.org',
	'unpkg.com',
	'protomaps.com',
	'openstreetmap.org',
	'www.openstreetmap.org',
	'maplibre.org'
]);

/**
 * Hosts that may appear as *human-facing links* — a reader clicking through to a paper, a repo or a
 * social profile. They are not fetched, so they cannot break the site when they go away.
 * Enumerated rather than waved through, so a CDN cannot arrive disguised as a link.
 */
const ALLOWED_LINK_HOSTS = new Set([
	// Code, papers and identifiers
	'github.com',
	'doi.org',
	'dx.doi.org',
	'arxiv.org',
	'zenodo.org',
	'schema.org',
	// Publishers the tool catalogue's papers resolve to
	'nature.com',
	'www.nature.com',
	'sciencedirect.com',
	'www.sciencedirect.com',
	'journals.plos.org',
	'journals.sagepub.com',
	'iopscience.iop.org',
	'link.springer.com',
	'www.tandfonline.com',
	'onlinelibrary.wiley.com',
	'royalsocietypublishing.org',
	'joss.theoj.org',
	'findingspress.org',
	'transfindings.org',
	// A tool's own site
	'superblockify.city',
	// The YouTube channel and the per-tool tutorials: linked, never embedded
	'www.youtube.com',
	// Licences and attribution, mostly the credits block on /legal
	'creativecommons.org',
	'www.creativecommons.org',
	'opendefinition.org',
	'opendatacommons.org',
	'fontshare.com',
	'www.fontshare.com',
	'public-sans.digital.gov',
	'www.gnu.org',
	'www.w3.org',
	'docs.protomaps.com',
	// Named in the same credits block as the software this site is built on. `tailwindcss.com` is
	// not even a link — it is the licence banner in Tailwind's own CSS output.
	'svelte.dev',
	'bits-ui.com',
	'lucide.dev',
	'tailwindcss.com',
	// String literals inside MapLibre 6, never fetched: the link in its "no WebGL2" error message,
	// and a reserved `.invalid` base it parses relative URLs against
	'wiki.openstreetmap.org',
	'maplibre.invalid',
	// The Danish data protection authority, named in the GDPR notice as the supervisory authority
	'www.datatilsynet.dk',
	// Funders, affiliations and credits
	'innovationsfonden.dk',
	'commission.europa.eu',
	'www.just-streets.eu',
	'itu.dk',
	'en.itu.dk',
	'nerds.itu.dk',
	'truth-and-beauty.net',
	'brietzke.com',
	// The UN Demographic Yearbook, credited on /legal for the population figures
	'unstats.un.org',
	// Socials
	'mastodon.social',
	'fosstodon.org',
	'bsky.app',
	'www.linkedin.com',
	'linkedin.com'
]);

function walk(dir, filter) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full, filter));
		else if (filter(full)) out.push(full);
	}
	return out;
}

const htmlFiles = walk(BUILD, (f) => f.endsWith('.html'));
const appFiles = existsSync(path.join(BUILD, '_app'))
	? walk(path.join(BUILD, '_app'), (f) => /\.(js|css)$/.test(f))
	: [];

// ---------------------------------------------------------------- 1. external origins

const URL_RE = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
/** host -> the first few files it was seen in */
const unknown = new Map();

for (const file of [...htmlFiles, ...appFiles]) {
	const text = readFileSync(file, 'utf8');
	for (const match of text.matchAll(URL_RE)) {
		const host = match[1].toLowerCase();
		if (ALLOWED_ASSET_HOSTS.has(host) || ALLOWED_LINK_HOSTS.has(host)) continue;
		const seen = unknown.get(host) ?? [];
		if (seen.length < 3) seen.push(path.relative(BUILD, file));
		unknown.set(host, seen);
	}
}

// ---------------------------------------------------------------- 2. prerendered content

/**
 * A spread of routes rather than all ~10,000: one of each shape is what a shell regression would
 * show up in. The map page is a tool×city default view, the one search engines are told to index;
 * its panels need WebGL, so what it prerenders is the summary in the map layout.
 */
const SAMPLE_ROUTES = [
	'index.html',
	'cities.html',
	'cities/table.html',
	'more-tools.html',
	'legal.html',
	'growbikenet.html',
	'sortbikenet.html',
	'cities/copenhagen_dk.html',
	'growbikenet/copenhagen_dk/betweenness/grid/from_bikenw.html'
];

const MIN_TEXT = 500;
const thin = [];
const missing = [];

const textOf = (html) =>
	html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

for (const route of SAMPLE_ROUTES) {
	const file = path.join(BUILD, route);
	if (!existsSync(file)) {
		missing.push(route);
		continue;
	}
	const html = readFileSync(file, 'utf8');
	const text = textOf(html);
	const hasHeading = /<h1[\s>]/i.test(html);
	if (!hasHeading || text.length < MIN_TEXT) {
		thin.push({ route, chars: text.length, hasHeading });
	}
}

// ---------------------------------------------------------------- 3. index signals

/**
 * What search engines are told to index. Every map view of a tool×city names that pair's default
 * view as canonical, so each covered pair has exactly one indexable, self-canonical page; a city
 * the tool has no data for has only the "not available" page, which is noindexed. Checked across
 * every map page rather than a sample — a wrong canonical is invisible in the browser.
 */
const catalog = JSON.parse(readFileSync(path.join(HERE, '../src/lib/data/tools.json'), 'utf8'));
const activeTools = catalog.filter((t) => t.category === 'interactive' && t.status === 'active');

const llmsFile = path.join(BUILD, 'llms.txt');
const llmsText = existsSync(llmsFile) ? readFileSync(llmsFile, 'utf8') : '';
const llmsMissing = activeTools
	.filter((t) => !llmsText.includes(`(https://bikenetkit.org/${t.slug})`))
	.map((t) => t.name);

// The generated long form: one section per tool, so a few kilobytes at the least.
const llmsFullFile = path.join(BUILD, 'llms-full.txt');
const llmsFullText = existsSync(llmsFullFile) ? readFileSync(llmsFullFile, 'utf8') : '';
const llmsFullMissing = activeTools
	.filter((t) => !llmsFullText.includes(`## ${t.name}\n`))
	.map((t) => t.name);

const CANONICAL_RE = /<link rel="canonical" href="([^"]+)"/;
const NOINDEX_RE = /<meta name="robots" content="noindex"/;
const indexProblems = [];
let mapPages = 0;

for (const tool of activeTools) {
	const dir = path.join(BUILD, tool.slug);
	if (!existsSync(dir)) continue;
	/** city -> pages */
	const byCity = new Map();
	for (const file of walk(dir, (f) => f.endsWith('.html'))) {
		const rel = path.relative(BUILD, file).replace(/\.html$/, '');
		const [, city, ...rest] = rel.split(path.sep);
		if (rest.length < 2) continue;
		const html = readFileSync(file, 'utf8');
		const canonical = html.match(CANONICAL_RE)?.[1];
		const page = {
			path: `/${rel.split(path.sep).join('/')}`,
			canonical: canonical ? new URL(canonical).pathname : null,
			noindex: NOINDEX_RE.test(html)
		};
		byCity.set(city, [...(byCity.get(city) ?? []), page]);
		mapPages++;
	}
	for (const [city, pages] of byCity) {
		const indexable = pages.filter((p) => !p.noindex);
		if (indexable.length === 0) continue;
		const own = indexable.filter((p) => p.canonical === p.path);
		if (own.length !== 1) {
			indexProblems.push(`${tool.slug}/${city}: ${own.length} self-canonical pages, want 1`);
			continue;
		}
		const strays = indexable.filter((p) => p.canonical !== own[0].path);
		if (strays.length > 0) {
			indexProblems.push(
				`${tool.slug}/${city}: ${strays.length} page(s) not canonical on ${own[0].path}, e.g. ${strays[0].path}`
			);
		}
		if (pages.some((p) => p.noindex)) {
			indexProblems.push(`${tool.slug}/${city}: covered, yet has a noindexed page`);
		}
	}
}

// ---------------------------------------------------------------- report

console.log(
	`[build-output] ${htmlFiles.length} HTML files, ${appFiles.length} bundle files in ${path.relative(process.cwd(), BUILD)}`
);

let failed = false;

if (unknown.size > 0) {
	failed = true;
	console.error(
		`\n[build-output] ${unknown.size} unrecognised external origin(s) in the build.\n` +
			`               The site must not depend on a third-party host at runtime. If one of these\n` +
			`               is a human-facing link rather than an asset, add it to ALLOWED_LINK_HOSTS\n` +
			`               in this script — deliberately, and with the reason in the commit.\n`
	);
	for (const [host, files] of [...unknown].sort()) {
		console.error(`  ${host.padEnd(34)} ${files.join(', ')}`);
	}
}

if (missing.length > 0) {
	failed = true;
	console.error(
		`\n[build-output] ${missing.length} sampled route(s) were not emitted: ${missing.join(', ')}`
	);
}

if (thin.length > 0) {
	failed = true;
	console.error(
		`\n[build-output] ${thin.length} route(s) prerendered without real content. A crawler that\n` +
			`               does not run JavaScript sees this much and no more.\n`
	);
	for (const { route, chars, hasHeading } of thin) {
		console.error(`  ${route.padEnd(30)} ${chars} chars${hasHeading ? '' : ', no <h1>'}`);
	}
}

if (llmsMissing.length > 0) {
	failed = true;
	console.error(
		`\n[build-output] llms.txt does not list ${llmsMissing.join(', ')}. It is written by hand\n` +
			`               (static/llms.txt): add an entry under "Interactive tools".`
	);
}

if (llmsFullMissing.length > 0) {
	failed = true;
	console.error(
		`\n[build-output] llms-full.txt ${llmsFullText ? `has no section for ${llmsFullMissing.join(', ')}` : 'was not emitted'}.\n` +
			`               It is generated by src/routes/llms-full.txt/+server.ts.`
	);
}

if (indexProblems.length > 0) {
	failed = true;
	console.error(
		`\n[build-output] ${indexProblems.length} tool×city pair(s) send the wrong index signals.\n` +
			`               Each covered pair needs exactly one indexable, self-canonical page (its\n` +
			`               default view) and every other view canonical on it — see mapPageMeta().\n`
	);
	for (const line of indexProblems.slice(0, 20)) console.error(`  ${line}`);
	if (indexProblems.length > 20) console.error(`  … and ${indexProblems.length - 20} more`);
}

if (!failed) {
	console.log(
		`[build-output] OK — no external asset origins, every sampled route has content, and the ` +
			`${mapPages} map pages index one default view per tool×city.`
	);
}
process.exit(failed ? 1 : 0);
