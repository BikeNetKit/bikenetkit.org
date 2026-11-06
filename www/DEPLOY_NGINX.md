# Serving the BikeNetKit site with nginx

> **Maintainers only — needs SSH access to the server.** This is the one-time web-server setup
> for `bikenetkit.org`. Redeploying is a `pnpm deploy:site` from `www/`, in the order
> [OPERATIONS.md](../OPERATIONS.md) § Deploying gives.

> **Placeholders.** `<SERVER_IP>`, `<SSH_USER>`, `<STATS_PATH>` and `<PREVIEW_HOST>` stand in for
> values kept out of this repository; substitute your own. The maintainers (listed in
> [.github/CODEOWNERS](../.github/CODEOWNERS)) hold the real values.

The site is served over TLS for `bikenetkit.org` (with `www.` redirecting to it) from
`~/bikenetkit/website/`, which `pnpm deploy:site` fills. The same nginx also serves the preview
host (§ The preview vhost), the data host ([DEPLOY_DATA.md](DEPLOY_DATA.md)), the tiles host
([DEPLOY_TILES.md](DEPLOY_TILES.md)) and the visitor stats ([DEPLOY_STATS.md](DEPLOY_STATS.md)).
Each has its own directory, never one inside the website directory, for the reason in
[OPERATIONS.md](../OPERATIONS.md) § Server layout.

## Launch state

Until launch, the apex vhost roots at `/home/<SSH_USER>/bikenetkit/placeholder-website`, not at
the `website` directory §2 shows. `pnpm deploy:placeholder` fills it with the "coming soon" page
and the unlisted `/design` reference, which needs no vhost change beyond §2's `location =
/DESIGN.md` (the spec file it links to): `try_files $uri.html …` resolves it, and the placeholder's
`404.html` redirects to `/`. `pnpm deploy:site` meanwhile fills
`website/`, where nothing serves it. Going live is an nginx change, not a deploy:

1. In `/etc/nginx/sites-available/bikenetkit`, set `root /home/<SSH_USER>/bikenetkit/website;`.
2. `sudo nginx -t && sudo systemctl reload nginx`.

Until then, the §6 checks marked "full site" answer from the placeholder. After going live, this
section can go, and `placeholder-website/` can be deleted from the server.

## Facts this config respects

- `adapter-static` emits clean-URL pages as `foo.html` (e.g. `growbikenet.html`) and nested
  pages as `foo/bar.html` (e.g. `growbikenet/amsterdam.html`), **not** `foo/index.html`. So
  `try_files` must try `$uri.html`.
- **Many page files have a directory of the same name next to them**: every page with nested
  pages below it (`growbikenet.html` beside `growbikenet/`), and every page with its own server
  `load`, whose `__data.json` the prerenderer writes into one. `try_files` must therefore put
  `$uri.html` **before** the bare `$uri`, or the directory matches and the request is normalised
  to a trailing slash that resolves to no index.
- The build emits a branded **`404.html`** (adapter-static `fallback`, rendered through
  `src/routes/+error.svelte`). `error_page 404 /404.html;` in the server block makes unmatched
  URLs get it instead of nginx's default page.
- That `404.html` is also the **SPA shell** the client-only routes boot from. `/embed/…` is not
  prerendered (it takes any dataset and a `?bbox=`), so no file exists per URL. A
  `location /embed/` serves the shell with a 200, rather than letting embeds answer 404 and get
  flagged as broken links. The root layout must carry no server `load` for this to work (see
  `src/hooks.server.ts`): one would make the client fetch an `/embed/…/__data.json` that does not
  exist.
- Asset URLs in the built pages are **absolute** (`/_app/immutable/…`), set by
  `kit.paths.relative = false` in `svelte.config.js`. That is what makes a page render correctly
  whether or not the host adds a trailing slash. Do not revert it while the same-named
  directories above exist.

## 1. Install nginx

```bash
ssh <SSH_USER>@<SERVER_IP>
sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
```

## 2. Write the vhost

Three pieces, in this order: `nginx -t` rejects a vhost that names a log format, a variable or an
include file that does not exist yet.

### Anonymised access log and page-view flag

The log format lives at http level so every vhost can use it. It is a privacy commitment the
published notice states as fact (`/legal#privacy` says the access log never contains a full IP
address), so it has to be in place before the first request is logged. The same file defines
`$is_navigation`, which marks browser page loads for the visitor stats
([DEPLOY_STATS.md](DEPLOY_STATS.md) § 2):

```bash
sudo tee /etc/nginx/conf.d/anonymized-log.conf > /dev/null <<'LOGCONF'
# Truncate the client address *before* the log line is written: last IPv4 octet zeroed, IPv6 cut
# to its first two groups. Data minimisation at the source — no full address is ever stored, so
# there is no retention question about one.
map $remote_addr $ip_anon {
    ~(?P<v4>\d+\.\d+\.\d+)\.   "$v4.0";
    ~(?P<v6>[^:]+:[^:]+):      "$v6::";
    default                    "0.0.0.0";
}

# Deliberately COMBINED-shaped, with only $remote_addr swapped: GoAccess parses it with
# --log-format=COMBINED unchanged, and $http_referer is what feeds the "Referring Sites" panel.
log_format anonymized '$ip_anon - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" "$http_user_agent"';

# Browsers send Sec-Fetch-Mode: navigate when a person loads a page; scanners and scripts almost
# never do. The site vhost writes these requests to pageviews.log, the only input to GoAccess.
map $http_sec_fetch_mode $is_navigation {
    navigate 1;
    default  0;
}
LOGCONF
```

**The include order matters, and it is not obvious.** Debian's `nginx.conf` pulls in
`conf.d/*.conf` _after_ its own http-level `access_log` line, so naming the format there fails with
`unknown log format "anonymized"`. Move the include above that line first. Then the http-level
default can use the format too, which stops a _future_ vhost from silently logging full addresses
because someone forgot a line:

```nginx
# /etc/nginx/nginx.conf, inside http { } — include first, then log
include /etc/nginx/conf.d/*.conf;
access_log /var/log/nginx/access.log anonymized;
```

### Security headers

Every vhost, including tiles and data, sends three headers from one snippet, and every page except
`/embed/` sends a fourth from a second snippet:

```bash
sudo tee /etc/nginx/snippets/bikenetkit-security.conf > /dev/null <<'NGINXCONF'
# Security headers for every bikenetkit vhost. Included at server level AND inside every location
# that has its own add_header: on nginx < 1.29.3 a location-level add_header discards all the
# inherited ones. Deliberately no Strict-Transport-Security — see the repo's DEPLOY_NGINX.md
# § Security headers. Probe with `pnpm check:headers`.
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" always;
NGINXCONF

sudo tee /etc/nginx/snippets/bikenetkit-no-framing.conf > /dev/null <<'NGINXCONF'
# Pages may be framed by this origin only. location /embed/ deliberately does not include this:
# the embed route exists to be framed by other sites.
add_header Content-Security-Policy "frame-ancestors 'self'" always;
NGINXCONF
```

**The trap: a location's `add_header` replaces, it does not add.** Up to nginx 1.29.3 (the server
runs 1.28), any `add_header` inside a `location` drops every `add_header` inherited from the
server block. So the snippets are included at server level, for locations that set nothing of
their own (`/<STATS_PATH>/`, `location / { return 404; }`), _and_ again in every location that sets
CORS, cache or robots headers. When you add a location with an `add_header`, add the include with
it; `pnpm check:headers` (§6) notices a header that has gone missing. What each header is for, and
why there is no HSTS, is in § Background: security headers.

### The site vhost

This is the plain-HTTP form a fresh server starts from. `certbot --nginx` (§ Domain + TLS) later
rewrites it to listen on 443 and moves port 80 into a separate redirect block.

```bash
sudo tee /etc/nginx/sites-available/bikenetkit > /dev/null <<'NGINXCONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    # The names are what certbot looks for when it installs the certificate (§ Domain + TLS).
    server_name bikenetkit.org www.bikenetkit.org;

    root /home/<SSH_USER>/bikenetkit/website;
    index index.html;

    # Anonymised access log (format defined in conf.d/anonymized-log.conf above).
    access_log /var/log/nginx/access.log anonymized;
    # Page views only (browser navigations), the sole input to the GoAccess stats. $is_navigation
    # is defined in conf.d/anonymized-log.conf above.
    access_log /var/log/nginx/pageviews.log anonymized if=$is_navigation;

    # Security headers (§ Security headers). Repeated in every location below that sets its own
    # add_header, because on nginx < 1.29.3 that discards these.
    include snippets/bikenetkit-security.conf;
    include snippets/bikenetkit-no-framing.conf;

    # Branded 404 (emitted by the build as /404.html).
    error_page 404 /404.html;

    # Clean URLs: pages are `foo.html`; nested as `foo/bar.html`.
    # `$uri.html` is tried *first*, deliberately: many a `foo.html` has a `foo/` sibling (nested
    # pages, or the page's `__data.json`). Try the bare `$uri` first and that directory wins, the
    # request gets normalised to a trailing slash, and there is no index to serve. The page file
    # has to take precedence.
    # A trailing slash is stripped with a 301 first: `/cities/` and `/cities` are one page, and only
    # the bare form is canonical. Inside this location rather than at server level, so it cannot
    # reach the stats alias below, which is a directory and must keep its slash.
    # HTML (and the few unhashed files served from here) revalidates on every visit, so a deploy
    # shows at once; the ETag makes that a 304.
    location / {
        rewrite ^/(.+)/$ /$1 permanent;
        try_files $uri.html $uri $uri/index.html =404;
        include snippets/bikenetkit-security.conf;
        include snippets/bikenetkit-no-framing.conf;
        add_header Cache-Control "no-cache" always;
    }

    # The design spec as a file (src/routes/DESIGN.md). Ubuntu's mime.types has no `md` entry, so
    # without this it goes out as application/octet-stream and browsers download it instead of
    # showing it. A `types {}` block would replace the whole MIME map, hence `default_type`, which
    # only applies to extensions the map does not know. `charset` needs the type listed in
    # `charset_types`, which by default covers only HTML, XML and plain text. Unlisted like the
    # `/design` page that links to it, which says noindex in a meta tag; a file can only say it in
    # a header.
    location = /DESIGN.md {
        default_type text/markdown;
        charset utf-8;
        charset_types text/markdown;
        include snippets/bikenetkit-security.conf;
        include snippets/bikenetkit-no-framing.conf;
        add_header X-Robots-Tag "noindex" always;
        add_header Cache-Control "no-cache" always;
    }

    # /embed is client-only: no HTML is emitted per URL. Serve the SPA shell (adapter-static's
    # fallback, 404.html) with a 200 so links to an embed are not reported broken. An embed is the
    # map page's content inside someone else's page, so it is kept out of search indexes; the shell
    # carries no meta tags of its own, which is why this is a header. Embeds are framed by other
    # sites by design, so this is the one location without the no-framing include.
    location /embed/ {
        include snippets/bikenetkit-security.conf;
        add_header X-Robots-Tag "noindex" always;
        add_header Cache-Control "no-cache" always;
        try_files /404.html =404;
    }

    # Content-hashed assets — cache forever. One Cache-Control, with no `expires` beside it (that
    # emits a second one), and no `always`: a 404 for a hashed file must not be cached for a year.
    location /_app/immutable/ {
        access_log off;
        include snippets/bikenetkit-security.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location /fonts/ {
        access_log off;
        include snippets/bikenetkit-security.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Private GoAccess visitor stats (cookieless log analysis) — see DEPLOY_STATS.md.
    # Kept outside the rsynced webroot so `deploy:site --delete` can't wipe it. No add_header, so
    # it inherits the server-level security headers. Not logged, so the report never counts itself.
    location /<STATS_PATH>/ {
        alias /home/<SSH_USER>/bikenetkit/stats/;
        index index.html;
        auth_basic "BikeNetKit stats";
        auth_basic_user_file /etc/nginx/.htpasswd-stats;
        access_log off;
    }

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/markdown text/css application/javascript application/json
               image/svg+xml application/geo+json application/x-protobuf;
}
NGINXCONF
```

## 3. Fix home-dir traversal permissions

nginx runs as `www-data` and must be able to _traverse_ into `/home/<SSH_USER>`, which defaults to
`0750` and would otherwise cause a **403**. Execute-only on the directory (does not expose file
contents to listing):

```bash
sudo chmod o+x /home/<SSH_USER>
# ~/bikenetkit (0775) and ~/bikenetkit/website (0755) are already traversable.
```

> Cleaner long-term alternative: move the webroot to `/var/www/bikenetkit` and update
> `DEPLOY_WEB_PATH` in `www/.env`. Then no home-dir permission change is needed.

## 4. Enable the site and reload

```bash
sudo rm -f /etc/nginx/sites-enabled/default          # drop stock welcome page (default_server clash)
sudo ln -sf /etc/nginx/sites-available/bikenetkit /etc/nginx/sites-enabled/bikenetkit
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Pin the log retention period

The privacy notice at `/legal#privacy` states **14 days** ([DEPLOY_STATS.md](DEPLOY_STATS.md)
§ Retention & privacy), so make it explicit rather than inheriting whatever the distro ships. Both
`access.log` and `error.log` are covered by the same stanza:

```bash
sudo sed -i 's/^\trotate .*/\trotate 14/' /etc/logrotate.d/nginx
grep -A2 'daily\|rotate' /etc/logrotate.d/nginx      # confirm: daily + rotate 14
sudo logrotate -d /etc/logrotate.d/nginx             # dry run, no changes
```

## 6. Verify

```bash
# On the server. Once TLS is installed, address the site by name: the port-80 default_server is
# certbot's redirect block, which answers the bare IP and `localhost` with a 404.
SITE='--resolve bikenetkit.org:443:127.0.0.1 https://bikenetkit.org'
curl -sI $SITE/ | head -1                             # HTTP/1.1 200 OK

# The logged client address must be truncated, and the referrer must be present:
curl -s -H 'Referer: https://example.org/article' $SITE/ > /dev/null
sudo tail -1 /var/log/nginx/access.log               # starts with x.y.z.0, ends with the referrer

# From your laptop (also exercises the provider's firewall):
curl -sI http://bikenetkit.org/ | head -1                           # 301 to https://
curl -sI https://bikenetkit.org/ | head -1                          # 200
# Full site: the next three need `root` at website/ (§ Launch state).
curl -sI https://bikenetkit.org/growbikenet | head -1               # 200, resolves growbikenet.html
curl -sI https://bikenetkit.org/growbikenet/amsterdam_nl | head -1  # 200, redirect stub to the default view
curl -sI https://bikenetkit.org/embed/growbikenet/amsterdam_nl | grep -iE '^HTTP|x-robots'  # 200 + noindex

# One host name, no trailing slashes:
curl -sI https://www.bikenetkit.org/legal | grep -iE '^HTTP|^location'  # 301 to https://bikenetkit.org/legal
curl -sI https://bikenetkit.org/legal/ | grep -iE '^HTTP|^location'     # 301 to /legal

# No page may 301 to a trailing slash — that is a same-named directory (nested pages, or a
# `__data.json`) winning over the page file, and it means the `try_files` order in §2 did not take:
curl -sI https://bikenetkit.org/growbikenet/amsterdam_nl/betweenness/grid/from_bikenw | head -1
```

Then the headers and the logs, from `www/` on your laptop. `check:headers` covers the page, the
404, the trailing-slash and `www` redirects, `/embed/`, a hashed asset, a font, and the tiles and
data hosts, and exits non-zero on any miss. `check:privacy` reads the running config over SSH,
read-only, and confirms that every `access_log` uses the `anonymized` format and that logs rotate
after 14 days:

```bash
pnpm check:headers                                            # bikenetkit.org + tiles + data
pnpm check:headers -- --base https://<PREVIEW_HOST>           # PREVIEW_AUTH in www/.env only while gated
pnpm check:privacy
```

Then open `https://bikenetkit.org/` in a browser, navigate into a tool and a city, and confirm the
map tiles draw.

## Notes & gotchas

- **The provider's firewall.** Host `ufw` is inactive, but the hosting provider's firewall must
  allow inbound TCP **80** and **443**. Symptom: a `curl` on the server returns 200 but one from
  your laptop hangs, so open the ports in the provider's panel.
- **Blank maps.** Tiles come from the self-hosted basemap archive on `tiles.bikenetkit.org`, which
  has its own vhost ([DEPLOY_TILES.md](DEPLOY_TILES.md)). Blank maps mean `PUBLIC_BASEMAP_URL` is
  wrong, the archive is missing from `~/bikenetkit/tiles/`, or that vhost is dropping byte ranges.
- **`.DS_Store` may get rsynced** into the webroot from macOS; harmless. Remove with
  `sudo rm ~/bikenetkit/website/.DS_Store` if desired.
- **`error_log` still records full IPs.** nginx has no `log_format` for the error log, so a failing
  request writes `client: <full address>` there regardless of the `anonymized` format. This is
  disclosed in the privacy notice; keep the error log under the same 14-day rotation, and don't
  copy it anywhere longer-lived.
- **IP-based blocking is what the masking costs.** `fail2ban`-style rules over `access.log` cannot
  see a usable address (the error log and live `$remote_addr` in nginx still do). Accepted
  trade-off: the site is static, so there is little to brute-force. If real abuse appears,
  rate-limit with `limit_req` on `$binary_remote_addr`, which works on the live variable and stores
  nothing.
- **Every vhost logs separately, and every one must anonymise.** The site logs to `access.log`
  (plus `pageviews.log`), the preview to `preview.access.log`, the tiles host to
  `tiles.access.log` and the data host to `data.access.log`, all with the `anonymized` format. A
  vhost with a bare `access_log path;` writes full addresses in the combined default format;
  `pnpm check:privacy` catches one.

## Domain + TLS

### DNS

The zone holds a **wildcard plus the apex**, not one record per hostname:

```
*.bikenetkit.org.   A      <SERVER_IP>
bikenetkit.org.     A      <SERVER_IP>
bikenetkit.org.     AAAA   <the server's IPv6 address>
www.bikenetkit.org. A      <SERVER_IP>
```

The wildcard saves going back to the registrar for every new hostname: _which_ hostnames resolve
stops being a DNS question and becomes a `server_name` line on the server. `tiles.`, `data.` and
the preview host have no records of their own; they resolve through the wildcard. `www` has an
explicit record, which takes precedence over the wildcard and points at the same address.

### DNS change checklist

- **`MX` and `SPF` are untouched** by an `A` record change, so mail keeps working. This is the
  question a cautious admin asks first.
- **Change the `AAAA` record together with `A`.** A stale `AAAA` sends IPv6 visitors to the old
  host, and Let's Encrypt, which prefers IPv6 for HTTP-01 validation, cannot issue the certificate.
- **Replace explicit subdomain records with the wildcard in the same edit, never before.** Removing
  them without the wildcard in place makes those names `NXDOMAIN`, which breaks every map at once,
  and resolvers cache the negative answer for up to an hour after the fix.
- **Verify against the authoritative nameservers, not a resolver**, and watch the SOA serial move:

```bash
NS=$(dig +short NS bikenetkit.org | head -1)       # one of the zone's authoritative nameservers
dig +short SOA bikenetkit.org @"$NS"               # serial changes when the edit is published
dig +short A tiles.bikenetkit.org @"$NS"           # must answer, via the wildcard
```

### Certificates

A wildcard _DNS record_ is not a wildcard _certificate_. A real `*.bikenetkit.org` certificate
needs DNS-01 validation and therefore registrar API credentials, a much larger ask and a standing
secret to keep for years. Don't. Issue one certificate per hostname over HTTP-01, which works the
moment the name resolves here and the port-80 vhost answers the challenge:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d bikenetkit.org -d www.bikenetkit.org
sudo certbot --nginx -d <PREVIEW_HOST> --redirect
```

`certbot --nginx` edits the vhost itself: it adds `listen 443 ssl` and the certificate paths to
the §2 block, and moves port 80, `default_server` included, into a new block that 301s the two
names to HTTPS and answers everything else with a 404. From then on the server answers by name
only: `http://<SERVER_IP>/` returns 404.

The wildcard sends _every_ subdomain here, and on 443 an unknown name would otherwise fall
through to the first server nginx loaded, which is `data.`, and get that certificate plus a 404.
A browser shows that as a certificate error. A catch-all refuses the handshake instead:

```bash
sudo tee /etc/nginx/sites-available/bikenetkit-default-tls > /dev/null <<'NGINXCONF'
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
    access_log off;
}
NGINXCONF
sudo ln -s /etc/nginx/sites-available/bikenetkit-default-tls /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### One host name: www → apex

The certificate covers both names, but the site should answer on one: two hosts serving the same
pages split their search ranking, and canonical tags only hint at which one to keep. Take
`www.bikenetkit.org` out of the apex block's `server_name` and give it a block that only redirects.
The certificate paths are the ones certbot wrote into the apex block:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.bikenetkit.org;
    ssl_certificate /etc/letsencrypt/live/bikenetkit.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bikenetkit.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include snippets/bikenetkit-security.conf;
    access_log off;
    return 301 https://bikenetkit.org$request_uri;
}
```

certbot's port-80 block keeps sending `http://www.` to `https://www.`, which then lands here, so
that block needs no change. Renewal is unaffected: the certificate still names both hosts.

### The preview vhost

The apex serves whatever was last deployed to it, so without a second vhost there is no place to
see a build on the real stack before the public does. That leaves the config's own behaviour
untested: the `try_files $uri.html $uri $uri/index.html` ordering, the branded 404 on a real
build, and the immutable-asset headers.

A second vhost closes that gap. It roots at its own directory, `preview-website/`, which
`pnpm deploy:preview` fills with the same full build `deploy:site` makes. It can be password-gated
(it was, from 2026-10-05 until it was opened for the preview launch on 2026-11-02); either way it
sends `X-Robots-Tag: noindex`, so it never competes with the apex in search results:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <PREVIEW_HOST>;
    access_log /var/log/nginx/preview.access.log anonymized;

    root /home/<SSH_USER>/bikenetkit/preview-website;
    index index.html;

    # Uncomment both to gate the preview (§ below); comment out to open it.
    # auth_basic "BikeNetKit preview";
    # auth_basic_user_file /etc/nginx/.htpasswd-preview;

    # Keep it out of search results: the apex is the canonical site.
    add_header X-Robots-Tag "noindex, nofollow" always;
    # Security headers, as on the apex (§ Security headers).
    include snippets/bikenetkit-security.conf;
    include snippets/bikenetkit-no-framing.conf;

    error_page 404 /404.html;
    location / {
        rewrite ^/(.+)/$ /$1 permanent;
        try_files $uri.html $uri $uri/index.html =404;
        include snippets/bikenetkit-security.conf;
        include snippets/bikenetkit-no-framing.conf;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-cache" always;
    }
    # As on the apex (§ 2): without it the spec is served as application/octet-stream.
    location = /DESIGN.md {
        default_type text/markdown;
        charset utf-8;
        charset_types text/markdown;
        include snippets/bikenetkit-security.conf;
        include snippets/bikenetkit-no-framing.conf;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-cache" always;
    }
    # Framed by design, so no no-framing include.
    location /embed/ {
        include snippets/bikenetkit-security.conf;
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-cache" always;
        try_files /404.html =404;
    }
    # Plus /_app/immutable/ and /fonts/ exactly as on the apex (§2), each with the security
    # include and the X-Robots-Tag line added.
}
```

As deployed, the vhost also repeats the apex's gzip settings, so the preview exercises the
config that goes live. `pnpm check:headers -- --base https://<PREVIEW_HOST>` probes it.

**Gating the preview.** To put it behind a password, create the password file on the box (the
password lives only there, never in the repo), with `<user>` the preview login, then uncomment the
two `auth_basic` lines and reload. To open it again, comment them out and reload; the password
file can stay.

```bash
(umask 077; openssl rand -base64 24 | tr -d '/+=\n' > ~/bikenetkit/.preview-credentials)
sudo htpasswd -i -B -C 12 -c /etc/nginx/.htpasswd-preview <user> < ~/bikenetkit/.preview-credentials
sudo chown root:www-data /etc/nginx/.htpasswd-preview && sudo chmod 640 /etc/nginx/.htpasswd-preview
sudo nginx -t && sudo systemctl reload nginx
```

**Do not rely on an obscure hostname.** Every name a certificate is issued for is published to
public Certificate Transparency logs within minutes, so the name is discoverable by design. While
the preview is meant to be private, the `auth_basic` is the protection; the hostname is just a
label. An open preview is public, full stop.

**Every release is staged here first.** The build checked on the preview is then shipped
unchanged with `pnpm deploy:site -- --skip-build`; the full sequence is in
[OPERATIONS.md](../OPERATIONS.md) § Deploying. The data is not staged: both builds read
`data.bikenetkit.org`, so `pnpm deploy:data` reaches the preview and production at the same
moment.

## Background: security headers

What each header in § Security headers is for:

- **`X-Content-Type-Options: nosniff`.** The browser runs a script or applies a stylesheet only if
  it is served with the matching type, so an uploaded or mistyped file can't be executed as code.
  Everything here is already served with the right type (`application/javascript`, `text/css`,
  `font/woff2`, `application/geo+json`). `fetch()`, which is how the map loads tiles and GeoJSON,
  is unaffected.
- **`Referrer-Policy: strict-origin-when-cross-origin`.** This is the browser default, made
  explicit so it can't drift. Other sites, such as the municipal pages behind "Take action!", get
  only `https://bikenetkit.org`, never the path. Same-origin navigations keep the full referrer,
  and that is what GoAccess's "Referring Sites" panel and `/legal` ("the referrer if sent") rely
  on.
- **`Permissions-Policy`.** Geolocation is allowed for this origin only: the opt-in "find a
  nearby city" in the city search uses it, and a site framing `/embed/` cannot. Camera,
  microphone, payment and USB are off, since nothing uses them.
- **`Content-Security-Policy: frame-ancestors 'self'`.** Pages can be framed only by this site
  (`/design` frames its own embeds), which rules out clickjacking under the site's name.
  `/embed/` is the exception because it exists to be framed by other sites, so its location leaves
  this snippet out. There is no `X-Frame-Options`: every current browser honours
  `frame-ancestors`, and XFO cannot express the exception.

What is **deliberately not sent**:

- **No `Strict-Transport-Security`, by decision.** HSTS makes browsers refuse plain HTTP for the
  domain, which stops an attacker on the network from intercepting the first request before the
  redirect to HTTPS. The site has no logins, forms or personal data, so all it would protect is
  integrity, and the 80→443 redirect already covers every normal visit. The cost doesn't fit a
  site meant to run untended for years. With HSTS, a failed certificate renewal leaves visitors no
  click-through, so the site becomes unreachable for everyone who has been there before. With
  `includeSubDomains`, the same holds for hosts this server doesn't run. `pnpm check:headers`
  fails if the header ever appears. Revisit only if the site starts handling accounts or form
  input.
- **No full Content-Security-Policy yet.** One would enforce the "no third-party runtime origin"
  rule in the browser, which is attractive. But it needs SvelteKit's `kit.csp` hashes for the
  inline bootstrap script, `worker-src blob:` for MapLibre, `'unsafe-inline'` styles for Svelte's
  style attributes, and the tiles and data hosts in `connect-src`/`img-src`. Getting any of that
  wrong means a blank page. If it comes, it should arrive as `Content-Security-Policy-Report-Only`
  first, watched in the browser console, before it enforces anything.

**Caching rules that go with them.** Each response carries exactly one `Cache-Control`:
`expires` and `add_header Cache-Control` side by side send two. Pages get `no-cache`, so they
revalidate on every visit and a deploy shows at once; the ETag makes that revalidation a 304.
Hashed assets and fonts get `public, max-age=31536000, immutable`, **without** `always`, so a 404
for a hashed file during a deploy is not cached for a year.
