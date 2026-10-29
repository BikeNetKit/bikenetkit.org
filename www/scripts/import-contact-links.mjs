#!/usr/bin/env node
/**
 * The "Take action!" links: where a reader can take what they saw on the map — their city's
 * cycling pages and contact page, their transport ministry, a cycling organization.
 *
 * Two hand-researched sources, shipped on the server in `dataexports/context/contact_links/` and
 * pulled by `pnpm pull-data`, which runs this afterwards:
 *
 *   bnk_contact_links.csv   slug,city,country_code,type,url,language,confidence,notes,review_ok,review_comment
 *                           type ∈ city_contact | city_mobility | ministry_contact | excluded;
 *                           ministry rows use the slug `country_XX`
 *   cycling_orgs.csv        scope,name,url,lang,note — curated from the ECF member list;
 *                           scope is `country_XX` or a city slug
 *
 * Writes the committed `src/lib/data/contact-links.json`. Only reviewed rows (`review_ok = 1`)
 * survive, the first per (slug, type) wins, and a "Changed to <url>" review comment that was not
 * yet applied to `url` is applied here. An `excluded` city gets no links at all — country-level
 * ones included.
 *
 *   pnpm import:contacts                      # reads <pull root>/dataexports/context/contact_links
 *   pnpm import:contacts -- --src <dir>       # a local copy, to test an edit before uploading it
 *   pnpm import:contacts -- --dry-run         # report only, write nothing
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextSourceDir } from './server-config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW_ROOT = path.resolve(HERE, '..');
const OUT_PATH = path.join(WWW_ROOT, 'src/lib/data/contact-links.json');
const CITIES_PATH = path.join(WWW_ROOT, 'src/lib/data/cities.json');

const args = {
	src: path.join(contextSourceDir(), 'contact_links'),
	dryRun: false
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--src') args.src = path.resolve(argv[++i]);
	else if (argv[i] === '--dry-run') args.dryRun = true;
	else if (argv[i] !== '--') {
		console.error(
			`Unknown argument: ${argv[i]}\nUsage: import-contact-links [--src <dir>] [--dry-run]`
		);
		process.exit(1);
	}
}

const LINKS_CSV = path.join(args.src, 'bnk_contact_links.csv');
const ORGS_CSV = path.join(args.src, 'cycling_orgs.csv');
for (const f of [LINKS_CSV, ORGS_CSV]) {
	if (!existsSync(f)) {
		console.error(`[import-contacts] source not found: ${f} — run \`pnpm pull-data\` first.`);
		process.exit(1);
	}
}

/** RFC 4180: quoted fields may hold commas, newlines and doubled quotes. */
function parseCsv(text) {
	const rows = [];
	let row = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += ch;
	}
	if (cell || row.length) {
		row.push(cell);
		rows.push(row);
	}
	const [header, ...body] = rows;
	const keys = header.map((h) => h.replace(/^\uFEFF/, '').trim());
	return body
		.filter((cells) => cells.some((c) => c.trim()))
		.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}

const cityCountry = new Map(
	JSON.parse(readFileSync(CITIES_PATH, 'utf8')).map((c) => [c.slug, c.countryCode])
);

const warnings = [];
const warn = (msg) => warnings.push(msg);

/** @param {string} raw @param {string} where */
function cleanUrl(raw, where) {
	const url = raw.replace(/\\+$/, '').trim();
	try {
		const u = new URL(url);
		if (u.protocol === 'http:') warn(`http (not https): ${where} ${url}`);
		else if (u.protocol !== 'https:') throw new Error(u.protocol);
	} catch {
		warn(`invalid URL, dropped: ${where} ${raw}`);
		return null;
	}
	return url;
}

const TYPE_KEY = {
	city_mobility: 'mobility',
	city_contact: 'contact',
	ministry_contact: 'ministry'
};
const countries = {};
const cities = {};
const excluded = new Set();
const seen = new Set();
let corrections = 0;
let rejected = 0;

for (const row of parseCsv(readFileSync(LINKS_CSV, 'utf8'))) {
	const { slug, type } = row;
	if (type === 'excluded') {
		if (cityCountry.has(slug)) excluded.add(slug);
		else warn(`excluded slug not in catalog: ${slug}`);
		continue;
	}
	const key = TYPE_KEY[type];
	if (!key) {
		warn(`unknown type "${type}" for ${slug}`);
		continue;
	}
	const country = slug.match(/^country_([A-Z]{2})$/)?.[1];
	if (!country && !cityCountry.has(slug)) {
		warn(`slug not in catalog, skipped: ${slug}`);
		continue;
	}
	if (row.review_ok !== '1' || !row.url) {
		rejected++;
		continue;
	}
	const id = `${slug}|${key}`;
	if (seen.has(id)) {
		warn(`duplicate reviewed ${type} for ${slug}, kept the first`);
		continue;
	}
	seen.add(id);

	let raw = row.url;
	const fix = row.review_comment.match(/https?:\/\/\S+/)?.[0];
	if (fix && fix !== raw) {
		corrections++;
		console.log(`[import-contacts] applied review correction: ${slug} ${type} → ${fix}`);
		raw = fix;
	}
	const url = cleanUrl(raw, `${slug} ${type}`);
	if (!url) continue;
	const link = row.language ? { url, lang: row.language } : { url };
	if (country) (countries[country] ??= {})[key] = link;
	else (cities[slug] ??= {})[key] = link;
}

let orgCount = 0;
for (const row of parseCsv(readFileSync(ORGS_CSV, 'utf8'))) {
	const country = row.scope.match(/^country_([A-Z]{2})$/)?.[1];
	if (!country && !cityCountry.has(row.scope)) {
		warn(`org scope not in catalog, skipped: ${row.scope}`);
		continue;
	}
	const url = cleanUrl(row.url, `org ${row.scope}`);
	if (!url) continue;
	const org = { name: row.name, url, ...(row.lang ? { lang: row.lang } : {}) };
	const target = country ? (countries[country] ??= {}) : (cities[row.scope] ??= {});
	(target.orgs ??= []).push(org);
	orgCount++;
}

for (const slug of excluded) delete cities[slug];

const sortKeys = (obj) =>
	Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
const out = {
	countries: sortKeys(countries),
	cities: sortKeys(cities),
	excluded: [...excluded].sort()
};

let withLinks = 0;
const byKind = { mobility: 0, contact: 0, ministry: 0, org: 0 };
for (const [slug, cc] of cityCountry) {
	if (excluded.has(slug)) continue;
	const own = cities[slug] ?? {};
	const nation = countries[cc] ?? {};
	const has = {
		mobility: !!own.mobility,
		contact: !!own.contact,
		ministry: !!nation.ministry,
		org: !!(own.orgs?.length || nation.orgs?.length)
	};
	for (const k of Object.keys(byKind)) if (has[k]) byKind[k]++;
	if (Object.values(has).some(Boolean)) withLinks++;
}

for (const w of warnings) console.warn(`[import-contacts] [warn] ${w}`);
console.log(
	`[import-contacts] ${cityCountry.size} catalog cities: ${withLinks} with at least one link, ` +
		`${excluded.size} excluded. Per kind: mobility ${byKind.mobility}, contact ${byKind.contact}, ` +
		`ministry ${byKind.ministry}, organization ${byKind.org}. ` +
		`${Object.keys(countries).length} countries, ${orgCount} organization rows, ` +
		`${rejected} unreviewed rows dropped, ${corrections} review corrections applied.`
);

if (!args.dryRun) {
	const prettier = await import('prettier');
	const config = (await prettier.resolveConfig(OUT_PATH)) ?? {};
	writeFileSync(
		OUT_PATH,
		await prettier.format(JSON.stringify(out), { ...config, filepath: OUT_PATH })
	);
	console.log(`[import-contacts] → ${path.relative(WWW_ROOT, OUT_PATH)}`);
}
