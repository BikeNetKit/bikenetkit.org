# Cookieless visitor stats with GoAccess

> **Maintainers only — needs SSH access to the server.** Runbook for lightweight, **cookieless,
> no-consent-banner** visitor statistics on the server. Companion to
> [DEPLOY_NGINX.md](DEPLOY_NGINX.md).

> **Placeholders.** `<SERVER_IP>`, `<SSH_USER>`, `<STATS_PATH>` and `<STATS_USER>` stand in for
> values kept out of this repository; substitute your own. The maintainers (listed in
> [.github/CODEOWNERS](../.github/CODEOWNERS)) hold the real values.

## Why this approach

The site is a fully static build (`adapter-static`, no server runtime) served by nginx. A
client-side analytics script would mean a device-side store or a third-party request, and
therefore a GDPR consent banner. Instead, the server **analyses the nginx access logs it already
writes**. [GoAccess](https://goaccess.io) turns those logs into a static HTML report.

- **No client JavaScript, no cookies, nothing stored on the visitor's device.** Nothing to consent
  to, so no banner. This is log analysis of data the site already lawfully processes for operation
  and security, **not** new client-side tracking.
- **No external runtime service, no npm dependency.** A single Ubuntu package on the server the
  site already runs on, which fits the goal of running for years with no external runtime.
- IP addresses are personal data, so **nginx truncates them before writing the log line** (the
  `anonymized` log format in [DEPLOY_NGINX.md](DEPLOY_NGINX.md) § 2). GoAccess therefore never
  sees a full address; `--anonymize-ip` below stays on as a belt-and-braces no-op. The processing
  is disclosed at `/legal#privacy`. Legal basis: legitimate interest in aggregate usage statistics.
- **Referral tracking comes free.** The `anonymized` format keeps `$http_referer`, so GoAccess's
  "Referring Sites" panel answers "who links to us" without any extra field or client-side hop.

**Trade-offs (by design):**

- GoAccess counts server requests, so **client-side in-app navigations are not counted**. Moving
  between prerendered pages via SvelteKit's client router issues no new page request unless the
  visitor hard-loads or `data-sveltekit-preload-data="hover"` prefetches the next page's HTML.
  Hard loads, direct links and prefetches are counted; soft in-app route changes are not.
- **Only the site's page views are counted.** The preview, tiles and data vhosts log to their own
  files (`preview.access.log`, `tiles.access.log`, `data.access.log`) and write no
  `pageviews.log` line, so map tile range requests and staging traffic never reach the report.

## Paths

The report and its database live in sibling directories of the website directory, never inside it
([OPERATIONS.md](../OPERATIONS.md) § Server layout explains why):

- Report HTML: `~/bikenetkit/stats/index.html`
- Persistent aggregate DB: `~/bikenetkit/stats-db/`
- Generator script: `~/bikenetkit/gen-stats.sh`

## 1. Install GoAccess

```bash
ssh <SSH_USER>@<SERVER_IP>
sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y goaccess
```

## 2. Generator script

GoAccess writes a **static HTML file**: no long-running WebSocket daemon, no extra open port,
nothing to keep alive for years. The persistent on-disk DB (`--persist`/`--restore`) means totals
survive log rotation: each run folds the current log into what's already stored.

**GoAccess reads a page-view log, not the access log.** Browsers send `Sec-Fetch-Mode: navigate`
when a person loads a page; vulnerability scanners and scripts almost never do. A scanner that
fetches `/` with a current-looking browser user agent is otherwise indistinguishable from a person
in a single log line. So nginx writes navigations to `pageviews.log`, next to the full
`access.log`, and that file is the only thing GoAccess reads. The `$is_navigation` map and the
second `access_log` line are part of the nginx setup in [DEPLOY_NGINX.md](DEPLOY_NGINX.md) § 2.
The page-view log has the same format and the same truncated addresses as `access.log`, and
`/etc/logrotate.d/nginx` globs `*.log`, so it inherits the 14-day retention. The cost is browsers
too old to send `Sec-Fetch-*` (Safari before 16.4, 2023), which are not counted.

```bash
mkdir -p ~/bikenetkit/stats ~/bikenetkit/stats-db
tee ~/bikenetkit/gen-stats.sh > /dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail
goaccess /var/log/nginx/pageviews.log \
  --log-format=COMBINED \
  --anonymize-ip \
  --persist --restore --db-path /home/<SSH_USER>/bikenetkit/stats-db \
  --ignore-crawlers \
  --ignore-panel=HOSTS \
  --browsers-file=/home/<SSH_USER>/bikenetkit/goaccess-bots.list \
  --unknowns-as-crawlers \
  --ignore-status=400 --ignore-status=404 --ignore-status=405 \
  --exclude-ip=127.0.0.1 \
  -o /home/<SSH_USER>/bikenetkit/stats/index.html
SH
chmod +x ~/bikenetkit/gen-stats.sh
```

- `--anonymize-ip` zeroes the last IPv4 octet / IPv6 suffix. nginx already did this at write
  time, so this is redundant by design: it keeps the DB anonymous even if someone points GoAccess
  at an older, unmasked log file.
- `--persist` / `--restore` / `--db-path` make a cumulative store that outlives logrotate.
- `--ignore-crawlers` filters bots for cleaner human numbers. On its own it only catches bots that
  say so (Googlebot and the like). The next three flags are a second line of defence against
  headless browsers, which do send the navigation header.
- `--browsers-file` lists extra user-agent substrings classed as crawlers: the scanners seen in the
  log (zgrab, Censys, Palo Alto, Infrawatch, `python-requests`, `curl`, …), Mastodon/Fediverse
  link-preview fetchers, and the few fixed "browser" strings scanners pose as (Chrome 108 on
  macOS 13.1, Safari on iOS 13.2.3, MSIE). One `<substring><TAB>Crawlers` per line; see the list
  below.
- `--unknowns-as-crawlers` counts anything GoAccess cannot identify as a browser, including
  requests with no user agent, as a crawler.
- `--ignore-status=400/404/405` drops the vulnerability probes (`/.env`, `/wp-admin/…`,
  `/.git/config`), which all end in one of these and are most of the requests a public server
  sees. A real reader following a broken link is lost too, which is an acceptable trade.
- `--ignore-panel=HOSTS` drops the "Visitor Hostnames and IPs" panel, which stores every truncated
  address with its user agent and hit counts. Kept in the persistent DB, that is a per-visitor
  record with no expiry, which is not what `/legal` means by "statistics are kept indefinitely in
  anonymous form". Unique-visitor counts still work without it.
- `--exclude-ip=127.0.0.1` drops server-local health checks.

The scanner list, `~/bikenetkit/goaccess-bots.list`:

```bash
printf "%s\tCrawlers\n" \
  "zgrab" "CensysInspect" "Palo Alto Networks" "Infrawatch" "InternetMeasurement" \
  "Go-http-client" "python-requests" "libredtail" "ForestEngine" "OAI-SearchBot" \
  "Let's Encrypt validation" \
  "Mac OS X 13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0" \
  "iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3" \
  "Mastodon/" "Pleroma" "Akkoma" "Misskey" "curl/" "MSIE " \
  "Firefox/71.0" "Chrome/81.0.4044.129" "Edg/90.0.818.46" \
  > ~/bikenetkit/goaccess-bots.list
```

## 3. Schedule it (systemd timer)

```bash
sudo tee /etc/systemd/system/bikenetkit-stats.service > /dev/null <<'UNIT'
[Unit]
Description=Regenerate BikeNetKit GoAccess report
[Service]
Type=oneshot
User=<SSH_USER>
# Without this the unit fails: nginx logs are `www-data:adm 0640`, so the service user needs the
# `adm` group to read them. Pair it with `sudo usermod -aG adm <SSH_USER>` — the group has to
# exist on the account as well, or `SupplementaryGroups` has nothing to grant.
SupplementaryGroups=adm
ExecStart=/home/<SSH_USER>/bikenetkit/gen-stats.sh
UNIT

sudo tee /etc/systemd/system/bikenetkit-stats.timer > /dev/null <<'UNIT'
[Unit]
Description=Hourly BikeNetKit stats regeneration
[Timer]
OnCalendar=hourly
Persistent=true
[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now bikenetkit-stats.timer
```

Cadence is a preference; hourly is plenty for a low-traffic showcase. A cron entry works equally
well (`0 * * * * /home/<SSH_USER>/bikenetkit/gen-stats.sh`).

**Also run it just before rotation.** The timer reads only the live log, and logrotate runs at a
random minute after midnight, so without a hook everything written between the last hourly run and
rotation is never counted. Debian's `/etc/logrotate.d/nginx` already runs
`/etc/logrotate.d/httpd-prerotate/*` before rotating, so a hook there closes the gap:

```bash
sudo mkdir -p /etc/logrotate.d/httpd-prerotate
sudo tee /etc/logrotate.d/httpd-prerotate/bikenetkit-stats > /dev/null <<'SH'
#!/bin/sh
# Never block rotation on a stats failure.
systemctl start bikenetkit-stats.service || true
SH
sudo chmod 755 /etc/logrotate.d/httpd-prerotate/bikenetkit-stats
run-parts --test /etc/logrotate.d/httpd-prerotate     # lists the hook; no dot in the name
```

`systemctl start` on a oneshot unit waits for it to finish, so rotation starts after the DB is up
to date. The hook runs as root; the unit still runs GoAccess as `<SSH_USER>`.

## 4. Serve the report behind Basic Auth

The report is **private**. The `location /<STATS_PATH>/` block that serves it, with
`auth_basic` and its own access log switched off, is already part of the site vhost in
[DEPLOY_NGINX.md](DEPLOY_NGINX.md) § 2. Create the credential file it names (the secret lives only
on the box, never in the repo):

```bash
sudo apt-get install -y apache2-utils
(umask 077; openssl rand -base64 24 | tr -d '/+=\n' > ~/bikenetkit/.stats-credentials)
sudo htpasswd -i -B -C 12 -c /etc/nginx/.htpasswd-stats <STATS_USER> < ~/bikenetkit/.stats-credentials
sudo chown root:www-data /etc/nginx/.htpasswd-stats && sudo chmod 640 /etc/nginx/.htpasswd-stats
sudo nginx -t && sudo systemctl reload nginx
```

nginx (`www-data`) must be able to traverse into `~/bikenetkit/stats/`, so the `chmod o+x`
home-dir caveat in [DEPLOY_NGINX.md](DEPLOY_NGINX.md) § 3 applies. `~/bikenetkit` is already
`0775`; make sure `~/bikenetkit/stats` is `0755`.

## 5. Verify

```bash
# On the box: report exists and is non-empty
~/bikenetkit/gen-stats.sh && test -s ~/bikenetkit/stats/index.html && echo OK

# Auth: 401 without creds, 200 with
curl -sI https://bikenetkit.org/<STATS_PATH>/ | head -1              # 401
curl -sI -u <STATS_USER>:PASS https://bikenetkit.org/<STATS_PATH>/ | head -1  # 200
```

Open `https://bikenetkit.org/<STATS_PATH>/` in a browser (credentials prompt), generate some page
hits, re-run the script, and confirm views increase and **no full IPs are shown** (last octet
zeroed). Force a rotation (`sudo logrotate -f /etc/logrotate.d/nginx`), add traffic and re-run:
totals should **grow from the prior total**, not reset, which proves the persistent DB works.

## Rebuilding the DB

Only the last 14 days of logs survive on disk, so a rebuild loses everything older. Don't empty
the DB without a reason. When there is one, the five steps are:

```bash
sudo systemctl stop bikenetkit-stats.timer                  # 1. no hourly run in the middle
rm -rf ~/bikenetkit/stats-db && mkdir ~/bikenetkit/stats-db # 2. empty the DB

# 3. fold in the rotated logs
zcat -f /var/log/nginx/pageviews.log.* | goaccess - \
  --log-format=COMBINED --anonymize-ip \
  --persist --restore --db-path /home/<SSH_USER>/bikenetkit/stats-db \
  --ignore-crawlers --ignore-panel=HOSTS \
  --browsers-file=/home/<SSH_USER>/bikenetkit/goaccess-bots.list --unknowns-as-crawlers \
  --ignore-status=400 --ignore-status=404 --ignore-status=405 --exclude-ip=127.0.0.1 \
  -o /home/<SSH_USER>/bikenetkit/stats/index.html

~/bikenetkit/gen-stats.sh                                   # 4. add the live log
sudo systemctl start bikenetkit-stats.timer                 # 5. resume the schedule
```

## Retention & privacy

The published notice is [`/legal#privacy`](src/routes/legal/+page.svelte). It states these as
facts, so the server has to match them. `pnpm check:privacy` (read-only, over SSH) checks the
first one, masking and retention, against the running config.

- **Access logs carry truncated IPs only**, on every vhost (site, preview, tiles, data), because
  nginx masks at write time. Retention is pinned to **14 days** in `/etc/logrotate.d/nginx`
  ([DEPLOY_NGINX.md](DEPLOY_NGINX.md) § 5); the notice quotes that number.
- **`error_log` still contains full IPs**, because nginx cannot format it. Same 14-day rotation;
  disclosed in the notice; don't archive it anywhere longer-lived.
- The GoAccess `stats-db` holds **only anonymised aggregates** (no per-address panel, see
  `--ignore-panel=HOSTS` in § 2), so it is not a second copy of personal data and is safe to keep
  long-term.
- No consent banner is required because nothing is stored on or read from the visitor's device.
  That argument breaks the moment any client-side analytics, third-party embed or CDN font is
  added.
