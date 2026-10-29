# Cookieless visitor stats with GoAccess

> **Placeholders.** `<SERVER_IP>`, `<SSH_USER>`, `<STATS_PATH>` and `<STATS_USER>` stand in for
> values deliberately kept out of this repo. Substitute your own. The maintainer's are recorded in
> `internal/AGENTS-internal.md`, which is not published.

Runbook for lightweight, **cookieless, no-consent-banner** visitor statistics on the `bikenetkit`
server (`<SSH_USER>@<SERVER_IP>`). Companion to [DEPLOY_NGINX.md](DEPLOY_NGINX.md).

## Why this approach

The site is a fully static build (`adapter-static`, no server runtime) served by nginx. Rather than
add a client-side analytics script — which would mean a device-side store or a third-party request,
and therefore a GDPR consent banner (see `LAUNCH_PLAN.md` W11) — we simply **analyse the nginx
access logs the server already writes**. [GoAccess](https://goaccess.io) turns those logs into a
static HTML report.

- **No client JavaScript, no cookies, nothing stored on the visitor's device.** Nothing to consent
  to → no banner. This is log analysis of data the site already lawfully processes for operation and
  security, **not** new client-side tracking, so it does not trigger the "analytics added later ⇒
  consent mechanism" clause in W11.
- **No external runtime service, no npm dependency.** A single Ubuntu package on the box we already
  run — fits the project's 8-year, no-external-runtime goal.
- IP addresses are personal data, so **nginx truncates them before writing the log line** — see the
  `anonymized` log format in [DEPLOY_NGINX.md](DEPLOY_NGINX.md). GoAccess therefore never sees a full
  address; `--anonymize-ip` below stays on as a belt-and-braces no-op. The processing is disclosed at
  `/legal#privacy`. Legal basis: legitimate interest in aggregate usage statistics.
- **Referral tracking comes free.** The `anonymized` format keeps `$http_referer`, so GoAccess's
  "Referring Sites" panel answers "who links to us" without any extra field or client-side hop.

**Trade-offs (by design):**

- GoAccess counts server requests, so **client-side SPA in-app navigations are not counted** —
  moving between prerendered pages via SvelteKit's client router issues no new page request unless
  the visitor hard-loads or `data-sveltekit-preload-data="hover"` prefetches the next page's HTML.
  Hard loads, direct links, and prefetches are counted; soft in-app route changes are not.
- **Preview traffic is not counted.** The preview vhost logs to its own `preview.access.log` and
  writes no `pageviews.log` line, so its visits never reach the GoAccess report.

## Paths (kept out of the rsync webroot)

`pnpm deploy:site` rsyncs with `--delete` into `~/bikenetkit/website/`, so anything placed there is
wiped on each deploy (same hazard [DEPLOY_TILES.md](DEPLOY_TILES.md) flags for the tiles archive).
Keep the report and the persistence DB in sibling directories:

- Report HTML: `~/bikenetkit/stats/index.html`
- Persistent aggregate DB: `~/bikenetkit/stats-db/`
- Generator script: `~/bikenetkit/gen-stats.sh`

## 1. Install GoAccess

```bash
ssh bikenetkit
sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y goaccess
```

## 2. Generator script

GoAccess writes a **static HTML file** — no long-running WebSocket daemon, no extra open port,
nothing to keep alive for 8 years. The persistent on-disk DB (`--persist`/`--restore`) means totals
survive log rotation: each run folds the current log into what's already stored.

**GoAccess reads a page-view log, not the access log.** Browsers send `Sec-Fetch-Mode: navigate`
when a person loads a page; vulnerability scanners and scripts almost never do. So nginx writes
those requests to a second file next to the full `access.log`, and that file is the only thing
GoAccess reads. Define the flag at http level (next to the `anonymized` format) and add the second
`access_log` to the site vhost, after the existing one:

```nginx
# /etc/nginx/conf.d/anonymized-log.conf
map $http_sec_fetch_mode $is_navigation {
    navigate 1;
    default  0;
}

# /etc/nginx/sites-available/bikenetkit, in the server block
access_log /var/log/nginx/pageviews.log anonymized if=$is_navigation;
```

Same format and same truncated addresses as `access.log`, and `/etc/logrotate.d/nginx` globs
`*.log`, so it inherits the 14-day retention: the privacy notice needs no change. The cost is
browsers too old to send `Sec-Fetch-*` (Safari before 16.4, 2023), which are not counted.

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

- `--anonymize-ip` — zeroes the last IPv4 octet / IPv6 suffix. nginx already did this at write time
  (see [DEPLOY_NGINX.md](DEPLOY_NGINX.md)), so this is redundant by design: it keeps the DB anonymous
  even if someone points GoAccess at an older, pre-masking log file.
- `--persist` / `--restore` / `--db-path` — cumulative store that outlives logrotate.
- `--ignore-crawlers` — bot filtering for cleaner human numbers. On its own it only catches bots
  that say so (Googlebot and the like). The next three flags date from when GoAccess still read the
  full `access.log`; with `pageviews.log` they are a second line of defence against headless
  browsers, which do send the navigation header.
- `--browsers-file` — extra user-agent substrings classed as crawlers: the scanners seen in the log
  (zgrab, Censys, Palo Alto, Infrawatch, `python-requests`, `curl`, …), Mastodon/Fediverse
  link-preview fetchers, and the few fixed "browser" strings scanners pose as (Chrome 108 on
  macOS 13.1, Safari on iOS 13.2.3, MSIE). One `<substring><TAB>Crawlers` per line; see the list
  below.
- `--unknowns-as-crawlers` — anything GoAccess cannot identify as a browser, including requests
  with no user agent, is counted as a crawler.
- `--ignore-status=400/404/405` — the vulnerability probes (`/.env`, `/wp-admin/…`,
  `/.git/config`) all end in one of these. On the 2026-09-30 log they were 82% of all requests. A
  real reader following a broken link is lost too, which is an acceptable trade.
- `--ignore-panel=HOSTS` — the "Visitor Hostnames and IPs" panel stores every truncated address
  with its user agent and hit counts. Kept in the persistent DB, that is a per-visitor record with
  no expiry, which is not what `/legal` means by "statistics are kept indefinitely in anonymous
  form". Unique-visitor counts still work without it. Added 2026-09-30, when the DB was rebuilt
  from the logs still on disk so no per-host data survives from before.
- `--exclude-ip=127.0.0.1` — drop server-local health checks.

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

> **Why the page-view log exists.** Until 2026-09-30 GoAccess read `access.log`, and even with
> all the filters above, Sep 17–30 came out at 747 unique visitors, while only about 100 clients
> loaded the page's own assets (`/_app/immutable/`, the funder logos), as a real browser does. The
> rest were scanners that fetch `/` alone with a current-looking Chrome user agent, which nothing in
> one log line tells apart from a person. That report is kept at
> `~/bikenetkit/stats/access-log-2026-09-17_30.html`; the DB was started empty when GoAccess moved
> to `pageviews.log`, so counts begin 2026-09-30.

**Rebuilding the DB** (stop the timer, empty `stats-db/`, fold in the rotated logs, run
`gen-stats.sh` for the live file, start the timer):

```bash
zcat -f /var/log/nginx/pageviews.log.* | goaccess - \
  --log-format=COMBINED --anonymize-ip \
  --persist --restore --db-path /home/<SSH_USER>/bikenetkit/stats-db \
  --ignore-crawlers --ignore-panel=HOSTS \
  --browsers-file=/home/<SSH_USER>/bikenetkit/goaccess-bots.list --unknowns-as-crawlers \
  --ignore-status=400 --ignore-status=404 --ignore-status=405 --exclude-ip=127.0.0.1 \
  -o /home/<SSH_USER>/bikenetkit/stats/index.html
```

Only the last 14 days survive on disk, so a rebuild loses everything older. Don't empty the DB
without a reason.

> **Give the tiles and data hosts their own logs, or the numbers are not page views.** This is the
> single biggest thing between a working GoAccess install and a useful one. Measured on the real
> server before the split: 243,685 requests, of which **230,839 were byte-range requests for one
> basemap `.pmtiles` file** — and the top referrer was the Netlify preview, with three `localhost`
> dev servers behind it. The "page views" were almost entirely our own development traffic.
>
> So each vhost logs to its own file, and GoAccess reads only the website's:
>
> ```nginx
> access_log /var/log/nginx/tiles.access.log anonymized;   # in the tiles vhost
> access_log /var/log/nginx/data.access.log  anonymized;   # in the data vhost
> ```
>
> Better than `access_log off;` for those hosts: the operational record survives, it just stops
> being counted as somebody reading a page. `/etc/logrotate.d/nginx` globs `/var/log/nginx/*.log`,
> so the new files inherit the same 14-day retention with no extra config.

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

Cadence is a preference — hourly is plenty for a low-traffic showcase. A cron entry works equally
well if you prefer (`0 * * * * /home/<SSH_USER>/bikenetkit/gen-stats.sh`).

**Also run it just before rotation.** The timer reads only the live log, and logrotate runs at a
random minute after midnight, so everything written between the last hourly run and rotation was
never counted: 1,655 requests over Sep 17–30, up to 709 on one night. Debian's
`/etc/logrotate.d/nginx` already runs `/etc/logrotate.d/httpd-prerotate/*` before rotating, so a
hook there closes the gap:

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

The report is **private**, not public. Add this `location` to
`/etc/nginx/sites-available/bikenetkit` (the vhost in [DEPLOY_NGINX.md](DEPLOY_NGINX.md)), **before**
the catch-all `location /`:

```nginx
    location /<STATS_PATH>/ {
        alias /home/<SSH_USER>/bikenetkit/stats/;
        index index.html;
        auth_basic "BikeNetKit stats";
        auth_basic_user_file /etc/nginx/.htpasswd-stats;
        access_log off;                 # don't let the stats page count itself
    }
```

Create the credential file (the secret lives only on the box — never in the repo):

```bash
sudo apt-get install -y apache2-utils
(umask 077; openssl rand -base64 24 | tr -d '/+=\n' > ~/bikenetkit/.stats-credentials)
sudo htpasswd -i -B -C 12 -c /etc/nginx/.htpasswd-stats <STATS_USER> < ~/bikenetkit/.stats-credentials
sudo chown root:www-data /etc/nginx/.htpasswd-stats && sudo chmod 640 /etc/nginx/.htpasswd-stats
sudo nginx -t && sudo systemctl reload nginx
```

> **Before TLS, this password crosses the network in the clear.** Basic Auth sends
> base64 — encoding, not encryption — and until a certificate is attached
> ([DEPLOY_NGINX.md](DEPLOY_NGINX.md) § Later) the report is reachable only over plain HTTP on the
> bare IP. Use a password that is not reused anywhere else, and re-check once HTTPS is live.

nginx (`www-data`) must be able to traverse into `~/bikenetkit/stats/` — the same `chmod o+x`
home-dir caveat documented in [DEPLOY_NGINX.md](DEPLOY_NGINX.md) §3 applies. `~/bikenetkit` is
already `0775`; ensure `~/bikenetkit/stats` is `0755`.

## 5. Verify

```bash
# On the box: report exists and is non-empty
~/bikenetkit/gen-stats.sh && test -s ~/bikenetkit/stats/index.html && echo OK

# Auth: 401 without creds, 200 with
curl -sI https://bikenetkit.org/<STATS_PATH>/ | head -1              # 401
curl -sI -u <STATS_USER>:PASS https://bikenetkit.org/<STATS_PATH>/ | head -1  # 200
```

Open `https://bikenetkit.org/<STATS_PATH>/` in a browser (credentials prompt), generate some page hits,
re-run the script, and confirm views increase and **no full IPs are shown** (last octet zeroed).
Force a rotation (`sudo logrotate -f /etc/logrotate.d/nginx`), add traffic, re-run → totals should
**grow from the prior total**, not reset — proving the persistent DB works.

## Retention & privacy

The published notice is [`/legal#privacy`](src/routes/legal/+page.svelte) (review copy:
[docs/legal/legal-review-draft.md](../docs/legal/legal-review-draft.md)). It states these as facts,
so the server has to match them:

- **Access logs carry truncated IPs only**, because nginx masks at write time. Retention is pinned to
  **14 days** in `/etc/logrotate.d/nginx` (DEPLOY_NGINX.md § 5) — the notice quotes that number.
- **`error_log` still contains full IPs** — nginx cannot format it. Same 14-day rotation; disclosed
  in the notice; don't archive it anywhere longer-lived.
- The GoAccess `stats-db` holds **only anonymised aggregates** — no per-address panel, see
  `--ignore-panel=HOSTS` in § 2 — so it is not a second copy of
  personal data — safe to retain long-term for the 8-year usage picture.
- No consent banner is required because nothing is stored on or read from the visitor's device. That
  argument breaks the moment any client-side analytics, third-party embed or CDN font is added.
