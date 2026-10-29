#!/usr/bin/env node
// Do the site, tiles and data hosts send the security and cache headers DEPLOY_NGINX.md
// § Security headers says they do? Reads the raw header list over node:https rather than fetch:
// fetch joins repeated headers into one comma-separated value, and a repeated Cache-Control is
// exactly what this has to catch.
//
//   pnpm check:headers                                            # bikenetkit.org + tiles + data
//   pnpm check:headers -- --base https://<PREVIEW_HOST>   # auth from PREVIEW_AUTH in www/.env
import https from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, WWW_ROOT } from './server-config.mjs';

loadEnv();

const DEFAULT_BASE = 'https://bikenetkit.org';
const argBase = process.argv.indexOf('--base');
const baseArg = argBase === -1 ? DEFAULT_BASE : process.argv[argBase + 1];
if (!baseArg) {
	console.error('[headers] --base needs a URL, e.g. --base https://<PREVIEW_HOST>');
	process.exit(2);
}
const base = baseArg.replace(/\/$/, '');
const siteAuth = base !== DEFAULT_BASE ? process.env.PREVIEW_AUTH?.trim() : '';

const SECURITY = {
	'x-content-type-options': (v) => v === 'nosniff',
	'referrer-policy': (v) => v === 'strict-origin-when-cross-origin',
	'permissions-policy': (v) => v.includes('geolocation=(self)')
};
// Left out on purpose (DEPLOY_NGINX.md § Security headers): asserting its absence keeps a later
// edit, or a certbot option, from switching it on unnoticed.
const MUST_NOT = ['strict-transport-security'];

const IMMUTABLE = /^public, max-age=31536000, immutable$/;

/**
 * @param {string} url
 * @param {{ auth?: string, method?: string }} [opts]
 * @returns {Promise<{ status: number, headers: Map<string, string[]>, body: string }>}
 */
function request(url, { auth, method = 'HEAD' } = {}) {
	return new Promise((resolve, reject) => {
		const req = https.request(url, { method, auth: auth || undefined, timeout: 20000 }, (res) => {
			const headers = new Map();
			for (let i = 0; i < res.rawHeaders.length; i += 2) {
				const name = res.rawHeaders[i].toLowerCase();
				headers.set(name, [...(headers.get(name) ?? []), res.rawHeaders[i + 1]]);
			}
			let body = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => (body += chunk));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, headers, body }));
		});
		req.on('timeout', () => req.destroy(new Error('timed out')));
		req.on('error', reject);
		req.end();
	});
}

function firstDataFile() {
	const manifest = JSON.parse(
		readFileSync(path.join(WWW_ROOT, 'src/lib/data/data-files.json'), 'utf8')
	);
	const [tool, files] = Object.entries(manifest)[0];
	return `/${tool}/${files[0]}`;
}

let home;
try {
	home = await request(`${base}/`, { auth: siteAuth, method: 'GET' });
} catch (err) {
	console.error(`[headers] FAIL ${base}/ — ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
const asset = home.body.match(/\/_app\/immutable\/[^"']+\.js/)?.[0];

const site = (p) => ({ url: `${base}${p}`, auth: siteAuth });
const CASES = [
	{ ...site('/'), frame: 'self', cache: /^no-cache$/ },
	{ ...site('/does-not-exist'), status: 404, frame: 'self', cache: /^no-cache$/ },
	{ ...site('/legal/'), status: 301, location: /\/legal$/ },
	{ ...site('/embed/growbikenet/copenhagen_dk'), frame: 'open', robots: /noindex/ },
	asset ? { ...site(asset), cache: IMMUTABLE } : null,
	{ ...site('/fonts/Public_Sans/PublicSans-Variable-latin.woff2'), cache: IMMUTABLE },
	base === DEFAULT_BASE
		? {
				url: 'https://www.bikenetkit.org/legal',
				status: 301,
				location: /^https:\/\/bikenetkit\.org\/legal$/
			}
		: null,
	{ url: 'https://tiles.bikenetkit.org/bikenetkit-map-style.json', cors: true },
	{ url: `https://data.bikenetkit.org${firstDataFile()}`, cors: true }
].filter((c) => c !== null);

let failed = 0;
if (!asset) {
	failed++;
	console.error(
		`[headers] FAIL ${base}/ — no /_app/immutable/*.js referenced (status ${home.status})`
	);
}

for (const c of CASES) {
	const problems = [];
	let res;
	try {
		res = await request(c.url, { auth: c.auth });
	} catch (err) {
		problems.push(err instanceof Error ? err.message : String(err));
	}
	if (res) {
		const one = (name) => res.headers.get(name) ?? [];
		const expected = c.status ?? 200;
		if (res.status !== expected) problems.push(`status ${res.status}, want ${expected}`);

		for (const [name, ok] of Object.entries(SECURITY)) {
			const values = one(name);
			if (values.length !== 1) problems.push(`${name} sent ${values.length}×`);
			else if (!ok(values[0])) problems.push(`${name}: ${values[0]}`);
		}
		for (const name of MUST_NOT) if (one(name).length) problems.push(`${name} must not be sent`);

		const cache = one('cache-control');
		if (cache.length > 1)
			problems.push(`cache-control sent ${cache.length}×: ${cache.join(' | ')}`);
		if (c.cache && !(cache.length === 1 && c.cache.test(cache[0])))
			problems.push(`cache-control: ${cache.join(' | ') || '(none)'}, want ${c.cache}`);

		const csp = one('content-security-policy').join('; ');
		if (c.frame === 'self' && !csp.includes("frame-ancestors 'self'"))
			problems.push(`no frame-ancestors 'self' (csp: ${csp || 'none'})`);
		if (c.frame === 'open' && (csp.includes('frame-ancestors') || one('x-frame-options').length))
			problems.push('framing restricted, but this route exists to be framed');

		if (c.robots && !c.robots.test(one('x-robots-tag').join(' ')))
			problems.push(`x-robots-tag: ${one('x-robots-tag').join(' ') || '(none)'}`);
		if (c.location && !c.location.test(one('location')[0] ?? ''))
			problems.push(`location: ${one('location')[0] ?? '(none)'}`);
		if (c.cors && one('access-control-allow-origin')[0] !== '*')
			problems.push('access-control-allow-origin is not *');
	}

	if (problems.length) {
		failed++;
		console.error(`[headers] FAIL ${c.url}\n           ${problems.join('\n           ')}`);
	} else {
		console.log(`[headers] ok   ${c.url}`);
	}
}

if (failed) {
	console.error(
		`\n[headers] ${failed} of ${CASES.length} failed. See DEPLOY_NGINX.md § Security headers.`
	);
	process.exit(1);
}
console.log(`\n[headers] all ${CASES.length} clean.`);
