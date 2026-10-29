#!/usr/bin/env node
/**
 * Verify the server-side claims `/legal#privacy` makes to visitors.
 *
 *   pnpm check:privacy
 *
 * The notice states three things as fact, and a reader has no way to check any of them:
 *
 *   1. Every request is logged with the last block of the IP zeroed — the address is truncated
 *      *before* the line is written, so no full address is ever stored.
 *   2. That applies to the whole site: `bikenetkit.org`, `tiles.` and `data.`.
 *   3. Logs are kept for 14 days.
 *
 * This exists because those claims were once recorded as done while one vhost
 * (`data.bikenetkit.org`) was still logging full addresses. A privacy notice is the wrong place for
 * an assumption, so the answer is a command rather than a memory.
 *
 * **Read-only.** It runs `nginx -T`, reads the logrotate config, and looks at one access-log line.
 * It changes nothing. Fixing anything it finds is a deliberate, separate act — see DEPLOY_NGINX.md.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDeployConfig } from './server-config.mjs';

const run = promisify(execFile);
const { host } = getDeployConfig();

/** One SSH round trip per check, each returning text we can assert on. */
async function ssh(command) {
	try {
		const { stdout } = await run('ssh', [host, command], { maxBuffer: 10 * 1024 * 1024 });
		return stdout;
	} catch (error) {
		return `__SSH_FAILED__ ${error.stderr || error.message}`;
	}
}

const findings = [];
const ok = [];

console.log(`[privacy] checking ${host} — read-only\n`);

// The rendered config, with every include expanded: what nginx is actually running, not what a
// file on disk suggests it might be running.
const conf = await ssh('sudo nginx -T 2>/dev/null');
if (conf.startsWith('__SSH_FAILED__')) {
	console.error(`[privacy] could not read the nginx config over SSH:\n${conf}\n`);
	console.error(
		'         Needs key-based SSH to the deploy host and passwordless `sudo nginx -T`.'
	);
	process.exit(2);
}

// 1. Is the truncating map + log_format defined at all?
const hasMap = /map\s+\$remote_addr\s+\$ip_anon/.test(conf);
const hasFormat = /log_format\s+anonymized/.test(conf);
if (hasMap && hasFormat) ok.push('`anonymized` log_format and the $ip_anon map are defined');
else {
	findings.push(
		`the anonymized log format is NOT fully defined (map: ${hasMap ? 'yes' : 'no'}, ` +
			`log_format: ${hasFormat ? 'yes' : 'no'}). Every request is being logged with a full IP ` +
			`address, which /legal#privacy states is never stored. See DEPLOY_NGINX.md § Anonymised access log and page-view flag.`
	);
}

// 2. Does every server block that logs actually use it? A vhost with a bare `access_log path;`
//    silently falls back to `combined`, which carries the full address — that is how
//    data.bikenetkit.org once logged full addresses.
const accessLogLines = [...conf.matchAll(/^\s*access_log\s+([^;]+);/gm)].map((m) => m[1].trim());
const logging = accessLogLines.filter((l) => l !== 'off' && !l.startsWith('off'));
const unanonymised = logging.filter((l) => !/\banonymized\b/.test(l));
if (logging.length === 0) {
	findings.push('no `access_log` directive found at all — is this the right host?');
} else if (unanonymised.length > 0) {
	findings.push(
		`${unanonymised.length} of ${logging.length} access_log directive(s) do not name the ` +
			`anonymized format, so they log full IP addresses:\n` +
			unanonymised.map((l) => `             access_log ${l};`).join('\n')
	);
} else {
	ok.push(`all ${logging.length} access_log directive(s) use the anonymized format`);
}

// 3. The proof: a real logged line should end its address in `.0`.
//
// Scoped to *today's* lines. The log keeps 14 days, so a run shortly after the format is applied
// would otherwise sample lines written before the fix and report a config that is now correct as
// broken — which is exactly what happened the first time this ran after the change.
const sample = await ssh(
	`sudo grep -F "$(date '+%d/%b/%Y')" /var/log/nginx/access.log 2>/dev/null | tail -n 40`
);
if (!sample.startsWith('__SSH_FAILED__') && sample.trim()) {
	const addresses = sample
		.split('\n')
		.map((line) => line.match(/^(\S+)/)?.[1])
		.filter((a) => a && /^\d+\.\d+\.\d+\.\d+$/.test(a));
	const full = addresses.filter((a) => !a.endsWith('.0'));
	if (addresses.length === 0) ok.push('no IPv4 lines logged today to sample');
	else if (full.length > 0) {
		findings.push(
			`${full.length} of ${addresses.length} IPv4 addresses logged TODAY are not truncated ` +
				`(e.g. ${full[0].replace(/\.\d+$/, '.x')}) — the notice says the last block is zeroed. ` +
				`If the format was applied today, some of these may predate the reload; re-run tomorrow ` +
				`to be sure.`
		);
	} else {
		ok.push(`all ${addresses.length} IPv4 addresses logged today end in .0`);
	}
}

// 4. Retention. The notice commits to 14 days.
const rotate = await ssh('cat /etc/logrotate.d/nginx 2>/dev/null');
if (!rotate.startsWith('__SSH_FAILED__') && rotate.trim()) {
	const rotateCount = /^\s*rotate\s+(\d+)/m.exec(rotate)?.[1];
	const daily = /^\s*daily\s*$/m.test(rotate);
	if (daily && rotateCount === '14') ok.push('logrotate keeps 14 daily files, matching the notice');
	else {
		findings.push(
			`log retention is \`${daily ? 'daily' : 'not daily'}\`, rotate ${rotateCount ?? '?'} — ` +
				`/legal#privacy says logs are kept for 14 days. Pin it in /etc/logrotate.d/nginx.`
		);
	}
}

for (const line of ok) console.log(`  ok    ${line}`);
if (findings.length === 0) {
	console.log('\n[privacy] OK — the server matches what /legal#privacy tells visitors.');
	process.exit(0);
}
console.error('');
for (const f of findings) console.error(`  FAIL  ${f}`);
console.error(
	`\n[privacy] ${findings.length} finding(s). /legal#privacy states these as fact to visitors, ` +
		`so either the server changes or the notice does.`
);
process.exit(1);
