#!/usr/bin/env node
// Pre-compress the served GeoJSON so nginx can hand out `.br`/`.gz` with no per-request CPU.
//
//   pnpm compress:data                 # compress whatever is stale on the server
//   pnpm compress:data -- --dry-run    # report what would be compressed, change nothing
//   pnpm compress:data -- --gzip-only  # skip brotli (see the runtime note below)
//   pnpm compress:data -- --print      # print the remote script and exit, without connecting
//
// `--print` is how this gets reviewed and syntax-checked without touching the server:
//   pnpm compress:data -- --print | sh -n
//
// Runs *on the server*, over ssh, against the data dir `pnpm deploy:data` already populated. The
// data is ~2.13 GB across ~11 500 files; generating the siblings locally and rsyncing them would
// push several hundred MB of derived bytes over the wire for no reason.
//
// nginx's `gzip on;` alone defaults to `gzip_comp_level 1`, the weakest setting — the largest
// SuperBlockify layer goes out at 3.21 MB. Pre-compressed, the same file is 2.53 MB gzip -9 and
// 1.85 MB brotli, and nginx spends nothing compressing it per request. See DEPLOY_DATA.md for the
// `gzip_static` / `brotli_static` vhost block this pairs with; without it these files are inert.
//
// Brotli quality 10, not 11: 11 runs at 0.7 MB/s against 10's 2.0 MB/s for a further 4% off the
// file (1.77 vs 1.85 MB on the largest layer). Over 2.13 GB that trades ~18 minutes for ~50.
//
// Incremental: a file is recompressed only when its sibling is missing or its source is strictly
// newer, so a re-run after a partial data refresh touches just what changed. The test is
// `source -nt sibling`, not `sibling -nt source` — gzip and brotli both copy the source's mtime
// onto their output, so the two are equal on success and the latter would never be true, making
// every run a full 2.13 GB rebuild. Orphaned siblings (source deleted) are pruned first.
import { getDeployConfig, run } from './server-config.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const gzipOnly = args.includes('--gzip-only');
const printOnly = args.includes('--print');

const { host, dataWebPath } = getDeployConfig();

// The path is quoted inside the remote script, so one containing a quote would break out.
if (dataWebPath.includes("'") || dataWebPath.includes('"')) {
	console.error(`[compress] DEPLOY_DATA_WEB_PATH contains a quote, refusing: ${dataWebPath}`);
	process.exit(1);
}

// `~` does not expand inside quotes, and the default DEPLOY_DATA_WEB_PATH is `~/bikenetkit/data/`.
// rsync gets away with passing it through because the remote shell expands the whole argument;
// a quoted `cd '~/…'` here would just fail. Rewrite the leading `~/` to `$HOME/` instead of
// dropping the quotes, which would reintroduce word splitting.
const remoteDir = dataWebPath.startsWith('~/')
	? `"$HOME/${dataWebPath.slice(2)}"`
	: `'${dataWebPath}'`;

// POSIX sh, run by the remote login shell — no bashisms, so it behaves the same under dash.
//
// Newline-delimited file lists: every path here is a generated `<cityid>-<metric>-<type>.geojson`
// slug, so none contains whitespace or a newline. `update-data` is what produces them.
//
// `set -eu` with explicit `if`/`else` rather than `&&` chains: a failing `&&` test as the last
// command of a loop body aborts the whole run under `set -e`.
//
// `-k` on both compressors is load-bearing — gzip and brotli each delete their input on success
// by default, which here would eat the served GeoJSON.
//
// Only ever `rm`s a path that `find` matched as `*.geojson.gz` / `*.geojson.br`, so the prune can
// never reach a `.geojson`.
const remote = `
set -eu
cd ${remoteDir} || { echo "[compress] no such dir: ${dataWebPath}" >&2; exit 1; }

jobs=$(nproc 2>/dev/null || echo 4)
have_brotli=1
command -v brotli >/dev/null 2>&1 || have_brotli=0
if [ "$have_brotli" = 0 ]; then
  echo "[compress] brotli not installed - skipping .br (apt install brotli). gzip still runs." >&2
fi
${gzipOnly ? 'have_brotli=0' : ''}

orphans=$(mktemp)
stale_gz=$(mktemp)
stale_br=$(mktemp)
trap 'rm -f "$orphans" "$stale_gz" "$stale_br"' EXIT

find . \\( -name '*.geojson.gz' -o -name '*.geojson.br' \\) -print |
  while IFS= read -r s; do
    if [ -f "\${s%.*}" ]; then :; else echo "$s" >> "$orphans"; fi
  done

find . -name '*.geojson' -print |
  while IFS= read -r f; do
    if [ -f "$f.gz" ] && [ ! "$f" -nt "$f.gz" ]; then :; else echo "$f" >> "$stale_gz"; fi
    if [ "$have_brotli" = 1 ]; then
      if [ -f "$f.br" ] && [ ! "$f" -nt "$f.br" ]; then :; else echo "$f" >> "$stale_br"; fi
    fi
  done

total=$(find . -name '*.geojson' | wc -l | tr -d ' ')
n_orphan=$(wc -l < "$orphans" | tr -d ' ')
n_gz=$(wc -l < "$stale_gz" | tr -d ' ')
n_br=$(wc -l < "$stale_br" | tr -d ' ')
echo "[compress] $total geojson, $n_orphan orphaned sibling(s), $n_gz stale .gz, $n_br stale .br, $jobs jobs"
${
	dryRun
		? 'echo "[compress] dry run - nothing written."'
		: `
if [ "$n_orphan" -gt 0 ]; then xargs -r rm -f < "$orphans"; fi
if [ "$n_gz" -gt 0 ]; then
  echo "[compress] gzip -9 ..."
  xargs -r -P "$jobs" -I{} gzip -9 -k -f {} < "$stale_gz"
fi
if [ "$n_br" -gt 0 ]; then
  echo "[compress] brotli -q 10 ..."
  xargs -r -P "$jobs" -I{} brotli -q 10 -k -f -o {}.br {} < "$stale_br"
fi
echo "[compress] done."
`
}
`;

if (printOnly) {
	console.log(remote);
	process.exit(0);
}

console.log(
	`[compress] ${dryRun ? 'inspecting' : 'compressing'} ${host}:${dataWebPath}` +
		(gzipOnly ? ' (gzip only)' : '')
);
await run('ssh', [host, remote]);

if (!dryRun) {
	console.log(
		`\n[compress] Serve them with \`gzip_static on;\` + \`brotli_static on;\` — ` +
			`see www/DEPLOY_DATA.md.\n` +
			`           Re-run after every \`pnpm deploy:data\`: the rsync leaves existing siblings\n` +
			`           in place but does not refresh them.`
	);
}
