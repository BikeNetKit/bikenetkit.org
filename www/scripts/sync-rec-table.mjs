#!/usr/bin/env node
// Refresh 05_dev_data/cities/rec_table.csv from the canonical GitHub source,
// restricted to the cities we already ship. One-off maintenance step — the
// upstream table will eventually arrive via the normal data export.
//
//   pnpm sync-rec-table              # fetch, match, rewrite the local CSV
//   pnpm sync-rec-table -- --dry-run # show the diff, write nothing
//
// The upstream table (~560 cities) uses a different cityid format
// (`andorralavella_ad`, `amsterdam_nl`) and column order than our local copy
// (kebab slugs, `cityid,gbn,gbn+,lbn,fbn,sb`). We match rows by a dash-stripped
// name key, refresh only the flag values for our existing rows, and never add
// or remove cities. Downstream (update-data.mjs) reads flags by header name, so
// preserving the local header/order keeps the diff clean.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { WWW_ROOT, loadEnv } from './server-config.mjs';

// This script never loaded www/.env; REC_TABLE_CSV below would have been ignored without it.
loadEnv();

const REMOTE_URL =
	'https://raw.githubusercontent.com/BikeNetKit/dataexport/main/cities/rec_table.csv';
// Defaults to the retired 05_dev_data checkout, which only the maintainer still has; override with
// REC_TABLE_CSV.
const LOCAL_CSV = process.env.REC_TABLE_CSV
	? path.resolve(process.env.REC_TABLE_CSV)
	: path.resolve(WWW_ROOT, '..', '..', '05_dev_data', 'cities', 'rec_table.csv');
const FLAG_COLS = ['gbn', 'gbn+', 'lbn', 'fbn', 'sb']; // local column order after cityid
const dryRun = process.argv.slice(2).includes('--dry-run');

// Naive CSV — mirrors update-data.mjs parseCsv (no quoted fields in this data).
function parseCsv(text, delim = ',') {
	const lines = text
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((l) => l.length > 0);
	const headers = lines[0].split(delim).map((h) => h.trim());
	const rows = lines.slice(1).map((line) => {
		const cells = line.split(delim).map((c) => c.trim());
		return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
	});
	return { headers, rows };
}

// Local slug -> match key: drop dashes.  'andorra-la-vella' -> 'andorralavella'
const localKey = (slug) => slug.replace(/-/g, '');
// Remote cityid -> match key: drop a trailing 2-letter country code, then dashes.
//   'andorralavella_ad' -> 'andorralavella';  'amsterdam_nl' -> 'amsterdam'
const remoteKey = (id) => id.replace(/_[a-z]{2}$/i, '').replace(/-/g, '');

async function main() {
	if (!existsSync(LOCAL_CSV)) {
		console.error(`[sync-rec-table] No rec_table.csv at ${LOCAL_CSV}`);
		console.error("[sync-rec-table] That path defaults to the maintainer's retired 05_dev_data");
		console.error(
			'[sync-rec-table] checkout. Set REC_TABLE_CSV in www/.env to point at your copy.'
		);
		process.exit(1);
	}
	const localText = await readFile(LOCAL_CSV, 'utf8');
	const local = parseCsv(localText);

	const res = await fetch(REMOTE_URL);
	if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
	const remote = parseCsv(await res.text());

	// Validate the upstream shape up front (long-term stability guard).
	for (const col of ['cityid', ...FLAG_COLS]) {
		if (!remote.headers.includes(col)) throw new Error(`Remote CSV missing column: ${col}`);
	}

	// Build remote lookup by name key; flag duplicate keys (ambiguous match).
	const byKey = new Map();
	const dupes = new Set();
	for (const row of remote.rows) {
		const k = remoteKey(row['cityid']);
		if (byKey.has(k)) dupes.add(k);
		byKey.set(k, row);
	}

	const unmatched = [];
	const ambiguous = [];
	const changed = [];
	const outRows = local.rows.map((row) => {
		const slug = row['cityid'];
		const k = localKey(slug);
		const match = byKey.get(k);
		if (!match) {
			unmatched.push(slug); // keep old + warn
			return row;
		}
		if (dupes.has(k)) ambiguous.push(slug); // still applied, but flagged
		const next = { ...row };
		for (const col of FLAG_COLS) next[col] = match[col]; // refresh by header name
		if (FLAG_COLS.some((c) => next[c] !== row[c])) changed.push(slug);
		return next;
	});

	// Re-emit preserving the local header + row order, and the file's existing
	// line-ending convention (the vendored CSV uses CRLF) so the diff is limited
	// to the flag values that actually changed.
	const eol = localText.includes('\r\n') ? '\r\n' : '\n';
	const trailing = /\r?\n$/.test(localText) ? eol : '';
	const lines = [
		local.headers.join(','),
		...outRows.map((r) => local.headers.map((h) => r[h]).join(','))
	];
	const outText = lines.join(eol) + trailing;

	console.log(
		`[sync-rec-table] ${changed.length} row(s) changed: ${changed.join(', ') || '(none)'}`
	);
	if (unmatched.length)
		console.warn(`[warn] no remote match (kept local): ${unmatched.join(', ')}`);
	if (ambiguous.length)
		console.warn(`[warn] ambiguous remote key (used last seen): ${ambiguous.join(', ')}`);

	if (dryRun) {
		console.log('[sync-rec-table] --dry-run: not written');
		return;
	}
	await writeFile(LOCAL_CSV, outText, 'utf8');
	console.log(`[sync-rec-table] wrote ${path.relative(WWW_ROOT, LOCAL_CSV)}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
