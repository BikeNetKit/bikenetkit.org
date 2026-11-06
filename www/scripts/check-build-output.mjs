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
 * Hosts we run. The basemap, the GeoJSON, the docs and the FAQ: the only places the built site
 * may fetch from.
 */
const OWN_HOSTS = new Set([
	'bikenetkit.org',
	'www.bikenetkit.org',
	'tiles.bikenetkit.org',
	'data.bikenetkit.org',
	'docs.bikenetkit.org',
	'faq.bikenetkit.org'
]);

/**
 * Strings that sit in the bundle but that the site neither fetches nor links to, each for a reason
 * worth keeping. Everything else in a bundle has to be linked from a page to pass (see below).
 */
const NEVER_FETCHED = new Set([
	// Dead code: `svelte-maplibre-gl` injects a `<link>` to MapLibre's CSS from unpkg unless told
	// not to. Every `<MapLibre>` in this repo passes `autoloadGlobalCss={false}` (the CSS is
	// imported in layout.css instead). **Any new `<MapLibre>` must pass that prop.**
	'unpkg.com',
	// Inside MapLibre: the link in its "no WebGL2" error message, and a reserved `.invalid` base it
	// parses relative URLs against
	'wiki.openstreetmap.org',
	'maplibre.invalid',
	// Identifiers, not addresses: the SVG/XML namespaces, and JSON-LD's `@context` vocabulary
	'www.w3.org',
	'schema.org'
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
//
// A link and a dependency look the same as a string: `https://example.org` in an `<a href>` is a
// reader clicking away, the same string in a `<script src>` is the site failing when that host
// does. So the build is read by context rather than grepped:
//
// - **Fetch contexts** in HTML and CSS — `src`, `srcset`, `poster`, `<object data>`, `<link href>`,
//   SVG `<image>`/`<use>`/`<feImage>` `href`, a meta refresh, CSS `url()` and `@import` — must
//   name one of our own hosts. No exceptions.
// - **Links** (`<a href>`, `<area href>`, and JSON-LD, which crawlers read and browsers never
//   fetch) may name any host. They are not dependencies, so they are not listed anywhere.
// - **Strings in JavaScript** (the bundles, and inline scripts in the HTML) cannot be told apart
//   by context. One passes if its host is ours, linked from some page, or in NEVER_FETCHED. A CDN
//   is fetched and never linked, so it fails here.
//
// The hole is a host that is linked somewhere *and* fetched from JavaScript. tests/privacy.e2e.ts
// covers that: it records what the browser actually requests.

const URL_RE = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
const hostsIn = (text) => [...text.matchAll(URL_RE)].map((m) => m[1].toLowerCase());
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
const attrValue = (tag, name) => {
	const m = attr(tag, name);
	return m ? (m[2] ?? m[3]) : null;
};
/** A `data:` URI is inline content, not a request; an SVG inside one names the SVG namespace. */
const fetchedHostsIn = (value) => (value && !/^\s*data:/i.test(value) ? hostsIn(value) : []);

/** Fetch contexts in a stylesheet: `url(...)` and `@import "..."`. */
const cssFetchHosts = (css) =>
	[...css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)|@import\s+(['"])([^'"]*)\3/gi)].flatMap((m) =>
		fetchedHostsIn(m[2] ?? m[4])
	);

/** host -> the first few files it was seen in, per finding */
const fetched = new Map();
const unlinkedStrings = new Map();
const linked = new Set();
/** host -> files, for every URL string in JavaScript; resolved against `linked` once all is read */
const jsStrings = new Map();

const note = (map, host, file) => {
	const seen = map.get(host) ?? [];
	if (seen.length < 3 && !seen.includes(file)) seen.push(file);
	map.set(host, seen);
};
const noteFetch = (host, file) => {
	if (!OWN_HOSTS.has(host)) note(fetched, host, file);
};

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const TAG_RE = /<([a-z][a-z0-9:-]*)\b[^>]*>/gi;

for (const file of htmlFiles) {
	const rel = path.relative(BUILD, file);
	let html = readFileSync(file, 'utf8');

	// Scripts first, then cut out, so their contents are not read as markup below.
	html = html.replace(SCRIPT_RE, (_, attrs, body) => {
		for (const host of fetchedHostsIn(attrValue(`<script${attrs}>`, 'src'))) noteFetch(host, rel);
		const isJsonLd = /type\s*=\s*["']?application\/ld\+json/i.test(attrs);
		for (const host of hostsIn(body)) {
			if (isJsonLd) linked.add(host);
			else note(jsStrings, host, rel);
		}
		return '';
	});
	html = html.replace(STYLE_RE, (_, css) => {
		for (const host of cssFetchHosts(css)) noteFetch(host, rel);
		return '';
	});

	for (const [tag, name] of html.matchAll(TAG_RE)) {
		const el = name.toLowerCase();
		if (el === 'a' || el === 'area') {
			for (const host of hostsIn(attrValue(tag, 'href') ?? '')) linked.add(host);
			continue;
		}
		const sources = ['src', 'srcset', 'poster'];
		if (el === 'object') sources.push('data');
		if (['link', 'image', 'use', 'feimage'].includes(el)) sources.push('href', 'xlink:href');
		if (el === 'meta' && /http-equiv\s*=\s*["']?refresh/i.test(tag)) sources.push('content');
		for (const source of sources) {
			for (const host of fetchedHostsIn(attrValue(tag, source))) noteFetch(host, rel);
		}
		for (const host of cssFetchHosts(attrValue(tag, 'style') ?? '')) noteFetch(host, rel);
	}
}

for (const file of appFiles) {
	const rel = path.relative(BUILD, file);
	const text = readFileSync(file, 'utf8');
	// CSS names hosts in comments too (Tailwind's licence banner), and those fetch nothing.
	if (file.endsWith('.css')) for (const host of cssFetchHosts(text)) noteFetch(host, rel);
	else for (const host of hostsIn(text)) note(jsStrings, host, rel);
}

for (const [host, files] of jsStrings) {
	if (OWN_HOSTS.has(host) || NEVER_FETCHED.has(host) || linked.has(host)) continue;
	for (const file of files) note(unlinkedStrings, host, file);
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

if (fetched.size > 0) {
	failed = true;
	console.error(
		`\n[build-output] ${fetched.size} third-party host(s) the pages would fetch from.\n` +
			`               The site must not depend on a host it does not run: serve the file\n` +
			`               from static/ or tiles./data.bikenetkit.org instead.\n`
	);
	for (const [host, files] of [...fetched].sort()) {
		console.error(`  ${host.padEnd(34)} ${files.join(', ')}`);
	}
}

if (unlinkedStrings.size > 0) {
	failed = true;
	console.error(
		`\n[build-output] ${unlinkedStrings.size} third-party host(s) in JavaScript that no page links to.\n` +
			`               A string the site neither links nor serves is most likely fetched. If it\n` +
			`               provably is not, add it to NEVER_FETCHED in this script with the reason.\n`
	);
	for (const [host, files] of [...unlinkedStrings].sort()) {
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
