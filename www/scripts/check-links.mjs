#!/usr/bin/env node
/**
 * Every outbound link the catalogue and the site constants carry, checked for real.
 *
 *   pnpm check:links              # the tool catalogue + site constants
 *   pnpm check:links -- --build   # also every href in build/ (needs `pnpm build` first)
 *   pnpm check:links -- --contacts  # also the ~750 "Take action!" links (contact-links.json)
 *
 * These are the links a reader follows to the actual research: the paper behind each tool, its
 * repository, its documentation. The 2026-09-15 catalogue sync moved every paper off personal PDFs
 * onto publisher landing pages and DOIs — more durable, and also *entirely unverified*. A dead
 * citation is both the easiest thing to prevent and the most embarrassing thing to be told about.
 *
 * Deliberately separate from `check:build-output`, which asks a different question: that one is
 * "does the build reference a host it must not", this one is "do our outbound links still resolve".
 *
 * **Network flakiness is not a finding.** A timeout or a connection reset is reported as UNKNOWN
 * and does not fail the run; only a definite 4xx/5xx does. A check that cries wolf on a flaky
 * connection gets ignored, and this one is meant to be run before a launch and believed.
 */
import module from 'node:module';
import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
module.register(pathToFileURL(path.join(HERE, 'lib-alias-hook.mjs')));

const { tools } = await import('../src/lib/data/tools.ts');
const contactLinks = JSON.parse(
	readFileSync(path.join(HERE, '../src/lib/data/contact-links.json'), 'utf8')
);
const CONTACT_URLS = new Set();
const site = await import('../src/lib/site.js');

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;

/**
 * Hosts that answer a bare HEAD with a block page or a 403 while the URL is perfectly good —
 * publishers fronted by bot protection, mostly. They get a GET with a browser-shaped UA, and a 403
 * from them is reported rather than failed: the alternative is a check that is red forever for a
 * link a human can open fine.
 */
const BOT_GUARDED = [
	/sciencedirect\.com$/,
	/tandfonline\.com$/,
	/onlinelibrary\.wiley\.com$/,
	/royalsocietypublishing\.org$/,
	/journals\.sagepub\.com$/
];

const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
	'Chrome/125.0 Safari/537.36 BikeNetKit-link-check';

/** Where each URL came from, so a failure names the file to edit rather than just the URL. */
function collectTargets() {
	const seen = new Map();
	const add = (url, source) => {
		if (!url || !/^https?:/.test(url)) return;
		if (!seen.has(url)) seen.set(url, new Set());
		seen.get(url).add(source);
	};

	for (const tool of tools) {
		add(tool.repo, `tools.json ${tool.slug} repo`);
		add(tool.docs, `tools.json ${tool.slug} docs`);
		add(tool.paper?.url, `tools.json ${tool.slug} paper`);
		add(tool.tutorial, `tools.json ${tool.slug} tutorial`);
	}
	for (const [key, value] of Object.entries(site)) {
		if (typeof value === 'string') add(value, `site.js ${key}`);
	}

	// Opt-in: hundreds of municipal and ministry sites, slow to walk and many behind bot protection.
	// Those are probed like the publishers above — a 403 is reported, not failed.
	if (process.argv.includes('--contacts')) {
		const link = (entry, source) => {
			if (!entry) return;
			add(entry.url, source);
			CONTACT_URLS.add(entry.url);
		};
		for (const [scope, entries] of [
			...Object.entries(contactLinks.countries),
			...Object.entries(contactLinks.cities)
		]) {
			for (const kind of ['mobility', 'contact', 'ministry'])
				link(entries[kind], `contact-links.json ${scope} ${kind}`);
			for (const org of entries.orgs ?? []) link(org, `contact-links.json ${scope} org`);
		}
	}

	if (process.argv.includes('--build')) {
		const build = path.resolve(HERE, '..', 'build');
		if (!existsSync(build)) {
			console.error('[links] --build given but there is no build/. Run `pnpm build` first.');
			process.exit(1);
		}
		const walk = (dir) => {
			for (const entry of readdirSync(dir)) {
				const full = path.join(dir, entry);
				if (statSync(full).isDirectory()) walk(full);
				else if (full.endsWith('.html')) {
					const html = readFileSync(full, 'utf8');
					for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
						add(m[1].replace(/&amp;/g, '&'), `build ${path.relative(build, full)}`);
					}
				}
			}
		};
		walk(build);
	}
	return [...seen].map(([url, sources]) => ({ url, sources: [...sources] }));
}

async function probe(url) {
	const { hostname, pathname } = new URL(url);

	// A DOI is checked by asking doi.org whether it resolves, *without* following to the publisher.
	// That is the meaningful question — is this identifier registered and pointing somewhere — and it
	// is the only one answerable, because the publishers at the end of the chain sit behind
	// Cloudflare and return 403 to any automated client, headless browsers included.
	if (hostname === 'doi.org' || hostname === 'dx.doi.org') {
		try {
			const res = await fetch(url, {
				method: 'HEAD',
				redirect: 'manual',
				headers: { 'user-agent': UA },
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
			const target = res.headers.get('location');
			if (res.status >= 300 && res.status < 400 && target)
				return { state: 'ok', status: res.status };
			if (res.status === 404) return { state: 'dead', status: 404, note: 'DOI not registered' };
			return { state: 'unknown', status: res.status, note: 'doi.org gave no redirect' };
		} catch (error) {
			return {
				state: 'unknown',
				status: 0,
				note: error.name === 'TimeoutError' ? 'timeout' : error.message
			};
		}
	}

	// A YouTube video is checked through oEmbed, because the watch page answers 200 for a private,
	// scheduled or deleted video too. oEmbed answers 401 or 404 for all three, so "not public yet"
	// is a failure here rather than a link that looks fine and plays nothing.
	const youtubeVideo = hostname === 'www.youtube.com' && pathname === '/watch';
	if (youtubeVideo) {
		try {
			const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
			const res = await fetch(oembed, {
				headers: { 'user-agent': UA },
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
			if (res.ok) return { state: 'ok', status: res.status };
			if (res.status === 401 || res.status === 403 || res.status === 404)
				return { state: 'dead', status: res.status, note: 'video not public' };
			return { state: 'unknown', status: res.status, note: 'oEmbed gave no answer' };
		} catch (error) {
			return {
				state: 'unknown',
				status: 0,
				note: error.name === 'TimeoutError' ? 'timeout' : error.message
			};
		}
	}

	const guarded = CONTACT_URLS.has(url) || BOT_GUARDED.some((re) => re.test(hostname));
	const attempt = async (method) => {
		const res = await fetch(url, {
			method,
			redirect: 'follow',
			headers: { 'user-agent': UA, accept: '*/*' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		return res.status;
	};
	try {
		// HEAD first — cheap, and most hosts answer it. Several answer 403/405 to HEAD alone, so a
		// failure there is retried as GET before it counts.
		let status = guarded ? await attempt('GET') : await attempt('HEAD');
		if (!guarded && status >= 400) status = await attempt('GET');
		if (status < 400) return { state: 'ok', status };
		if (status === 403 && guarded) return { state: 'guarded', status };
		if (status === 429) return { state: 'unknown', status, note: 'rate limited' };
		return { state: 'dead', status };
	} catch (error) {
		return {
			state: 'unknown',
			status: 0,
			note: error.name === 'TimeoutError' ? 'timeout' : error.message
		};
	}
}

const targets = collectTargets();
console.log(`[links] checking ${targets.length} URL(s)\n`);

const results = [];
const queue = [...targets];
await Promise.all(
	Array.from({ length: CONCURRENCY }, async () => {
		for (let job = queue.shift(); job; job = queue.shift()) {
			results.push({ ...job, ...(await probe(job.url)) });
		}
	})
);

const dead = results.filter((r) => r.state === 'dead');
const unknown = results.filter((r) => r.state === 'unknown');
const guarded = results.filter((r) => r.state === 'guarded');

console.log(`  ok        ${results.filter((r) => r.state === 'ok').length}`);
if (guarded.length) console.log(`  guarded   ${guarded.length} (bot protection; open one by hand)`);
if (unknown.length) console.log(`  unknown   ${unknown.length} (network, not the link)`);

for (const r of guarded) console.log(`\n  guarded   ${r.url}\n            ${r.sources.join(', ')}`);
for (const r of unknown) {
	console.log(`\n  unknown   ${r.url}\n            ${r.note} — ${r.sources.join(', ')}`);
}

if (dead.length === 0) {
	console.log('\n[links] OK — every outbound link resolves.');
	process.exit(0);
}
console.error(`\n[links] ${dead.length} dead link(s):\n`);
for (const r of dead) {
	const note = r.note ? ` (${r.note})` : '';
	console.error(`  ${r.status}  ${r.url}${note}\n       ${r.sources.join(', ')}`);
}
process.exit(1);
