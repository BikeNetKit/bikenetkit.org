#!/usr/bin/env node
// This repository is published. These patterns are things that must not be in it: production
// infrastructure detail, paths from a maintainer's machine, and files under licences that forbid
// public redistribution.
//
// Deliberately crude, and deliberately loud. A false positive costs one --no-verify; a false
// negative costs a force-push and an apology, and in the font case a licence violation that is
// public the moment it lands.
//
//   node scripts/check-public-safety.mjs            # staged files (pre-commit)
//   node scripts/check-public-safety.mjs --all      # the whole tracked tree
//   node scripts/check-public-safety.mjs --release  # same as --all; the name the release checklist uses
import { execSync, execFileSync } from 'node:child_process';

const REPO = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const ALL = process.argv.includes('--all') || process.argv.includes('--release');

// Addresses that are fine to publish: loopback, the any-address, and the RFC 5737 ranges reserved
// for documentation — /legal uses 203.0.113.0 as its example of a masked visitor IP, which is
// exactly what those ranges exist for.
const IP_OK =
	/^(127\.0\.0\.1|0\.0\.0\.0|192\.0\.2\.\d{1,3}|198\.51\.100\.\d{1,3}|203\.0\.113\.\d{1,3})$/;

// Not a plain regex: a four-group dotted number also matches SVG path data ("...5.004C17.51.242"),
// so every octet has to be a real one, and the match has to stand alone rather than sit inside a
// longer run of digits and dots. Nor may it follow a slash: user-agent strings carry versions like
// "Chrome/108.0.0.0" (DEPLOY_STATS.md's bot list), and an address never does.
function findIp(line) {
	for (const m of line.matchAll(/(?<![\d./])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])/g)) {
		const ip = m[1];
		if (IP_OK.test(ip)) continue;
		if (ip.split('.').every((o) => Number(o) <= 255)) return ip;
	}
	return null;
}

const PATTERNS = [
	[(l) => findIp(l), 'bare IP address — use a <PLACEHOLDER>'],
	[/\bubuntu@/, 'SSH username — use <SSH_USER>@'],
	[/\/home\/ubuntu\b/, 'server home directory — use /home/<SSH_USER>'],
	[/\/Users\/[a-z]+\//i, 'absolute path from a maintainer machine'],
	[/\/Volumes\//, 'local volume path'],
	[/Google Sans/, 'proprietary font, removed for the public release'],
	[/\.htpasswd-stats\s+admin\b/, 'stats credential detail — use <STATS_USER>']
];

// `05_dev_data` is deliberately NOT here. The sibling-checkout paths are now env-configurable and
// their defaults are documented on purpose, in .env.example and in each script's failure message.
// A directory name is not a disclosure, and flagging it would train people to ignore this check.

// Never tracked, whatever the contents. Bespoke Sans is here because its licence (ITF FFL § 01)
// forbids a publicly accessible repository; each contributor keeps their own copy (www/.gitignore).
const FORBIDDEN_PATHS = ['internal', 'CLAUDE.local.md', 'www/static/fonts/BespokeSans_Complete'];

// Files whose whole job is to describe these patterns.
const EXEMPT = [/scripts\/check-public-safety\.mjs$/, /^\.pre-commit-config\.yaml$/];

// Not text; a byte-scan produces noise, and none of them can carry a host detail meaningfully.
const BINARY = /\.(png|jpe?g|gif|webp|woff2?|ttf|otf|pbf|pmtiles|ico|mp4|webm|zip|gz|br)$/i;

const failures = [];

function tracked(pathspec) {
	return execFileSync('git', ['ls-files', '--', pathspec], { encoding: 'utf8', cwd: REPO })
		.split('\n')
		.filter(Boolean);
}

for (const p of FORBIDDEN_PATHS) {
	for (const f of tracked(p))
		failures.push(`  ${f} — ${p} must not be tracked; git rm -r --cached`);
}

const files = ALL
	? tracked('.')
	: execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
			encoding: 'utf8',
			cwd: REPO
		})
			.split('\n')
			.filter(Boolean);

const inForbidden = (f) => FORBIDDEN_PATHS.some((p) => f === p || f.startsWith(`${p}/`));

for (const file of files) {
	if (BINARY.test(file) || EXEMPT.some((re) => re.test(file))) continue;
	// Already reported as a forbidden path. Scanning its contents too would bury the one line that
	// matters under every host detail those files legitimately contain.
	if (inForbidden(file)) continue;
	let body;
	try {
		// Read the staged content, not the working tree: they can differ, and what gets committed
		// is what matters.
		body = ALL
			? execFileSync('git', ['show', `HEAD:${file}`], {
					encoding: 'utf8',
					cwd: REPO,
					maxBuffer: 2e8
				})
			: execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', cwd: REPO, maxBuffer: 2e8 });
	} catch {
		continue; // not in the index / not readable as text
	}
	const lines = body.split('\n');
	for (const [test, why] of PATTERNS) {
		const match = typeof test === 'function' ? test : (l) => (test.test(l) ? true : null);
		for (let i = 0; i < lines.length; i++) {
			const hit = match(lines[i]);
			if (hit) {
				const detail = typeof hit === 'string' ? ` (${hit})` : '';
				failures.push(`  ${file}:${i + 1} — ${why}${detail}`);
				break; // one report per pattern per file is enough to act on
			}
		}
	}
}

if (failures.length) {
	console.error(`\nThis repo is published. Refusing ${ALL ? 'the release' : 'this commit'}:\n`);
	console.error(failures.join('\n'));
	console.error('\nMove the content to internal/, or template it (see www/DEPLOY_NGINX.md).');
	console.error('Override with --no-verify only if you are certain.\n');
	process.exit(1);
}

console.log(`public-safety: clean (${files.length} file${files.length === 1 ? '' : 's'} checked)`);
