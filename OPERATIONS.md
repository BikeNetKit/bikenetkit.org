# Operations runbook

For whoever is keeping `bikenetkit.org` alive, assuming no prior contact with this repository.

Placeholders — `<SERVER_IP>`, `<SSH_USER>`, `<STATS_PATH>`, `<STATS_USER>` — stand for values kept
out of this repository. The maintainer holds the real ones.

## What is where

One server runs three vhosts off static files. There is **no application process** — nothing to
restart, nothing that can crash. If the site is down, it is nginx, TLS, DNS, or the disk.

| Host                   | Serves                          | From                    |
| ---------------------- | ------------------------------- | ----------------------- |
| `bikenetkit.org`       | The site                        | `~/bikenetkit/website/` |
| `data.bikenetkit.org`  | Per-city GeoJSON (~4.3 GB)      | `~/bikenetkit/data/`    |
| `tiles.bikenetkit.org` | Basemap archive (~46 GB), media | `~/bikenetkit/tiles/`   |

The three directories are siblings **on purpose**. A site deploy syncs the website directory with
`--delete`; anything underneath it would be erased on the next deploy.

Detail per vhost: [www/DEPLOY_NGINX.md](www/DEPLOY_NGINX.md),
[www/DEPLOY_DATA.md](www/DEPLOY_DATA.md), [www/DEPLOY_TILES.md](www/DEPLOY_TILES.md),
[www/DEPLOY_STATS.md](www/DEPLOY_STATS.md).

## Deploying

> **Pre-launch, the placeholder is what is served — and that is enforced by nginx, not by
> discipline.** `deploy:placeholder` writes to `placeholder-website/`, which the default vhost
> roots at; `deploy:site` writes to `website/`, which nothing serves yet, so running it is safe.
> **Going live is repointing that `root` and reloading**, not a deploy command.
>
> **To check a build before the public sees it, use `deploy:preview`**, before and after launch. It
> writes to `preview-website/`, which only the password-gated preview host serves.

**`main` is what is live.** Two branches: `dev` integrates work and is what `pnpm deploy:preview` puts on the preview host,
`main` records the state of the production site — which, until launch, means the placeholder.
Publishing is `dev` → `main` → deploy:

```sh
cd www && pnpm deploy:preview         # on dev: stage the build, check it on the preview host
git checkout main && git merge --ff-only dev
pnpm deploy:site -- --skip-build      # publish the build you just checked
git push origin main dev
```

Nothing in the tooling enforces the order — a deploy rsyncs whatever is checked out — so
deploying from another branch silently leaves `main` describing a site that is not live. It warns
when you do. Keeping the branch honest is what makes the rollback below possible: the previous
`main` commit is a known-good deployed state, rather than a guess.

All from `www/`, all needing `www/.env` (copy `.env.example`; auth is key-based SSH).

```sh
pnpm deploy:site         # build, then rsync build/ -> website/   (not served pre-launch)
pnpm deploy:placeholder  # build + rsync -> placeholder-website/   (what is served pre-launch)
pnpm deploy:preview      # build + rsync -> preview-website/       (preview host, Basic Auth)
pnpm deploy:site -- --skip-build    # rsync an existing build/
pnpm deploy:data         # rsync www/data/ -> data host
pnpm compress:data       # rebuild .gz/.br siblings on the server
pnpm deploy:basemap      # rsync the basemap archive -> tiles host
pnpm deploy:media        # self-hosted video
```

`pnpm deploy` is a pnpm builtin and is **not** this — always `deploy:site`.

Two gates will stop `deploy:site` and `deploy:preview`, both deliberate and neither firing on a
local build: unset contact addresses in `src/lib/site.js`, and a missing display font.

The site is a static prerender, so a deploy is a file sync. Rolling back means redeploying an
earlier commit of `main`:

```sh
git checkout main~1          # or whichever commit was last known good
cd www && pnpm deploy:site
```

Then move `main` back to that commit, so it keeps meaning what it says.

## Keeping it alive

These are the things that actually end a site meant to run untended for years, roughly in order of
likelihood:

**The domain lapses.** Nothing else matters if this happens. Know who renews it and when.

**TLS expires.** certbot should renew automatically. Verify rather than assume:

```sh
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

A dry run that fails is the warning you get. Put the expiry date in a calendar as a backstop, and
run an external uptime check that alerts on certificate expiry as well as on downtime.

**The disk fills.** The basemap is ~46 GB and the data ~4.3 GB and growing with the catalogue. The
archive lives on its own volume, bind-mounted, because the root filesystem could not hold it.

```sh
df -h
du -sh ~/bikenetkit/*
```

**Log rotation.** The privacy notice states 14-day retention with IPs masked at write time. That is
a factual claim on a published page — if `/etc/logrotate.d/nginx` drifts from it, the page becomes
wrong and needs updating, not just the config.

## When the map stops working

The map has several independent failure modes that look identical to a visitor: a page with a
header and a blank rectangle. Work down this list.

1. **Does the rest of the site render?** If not, it is nginx or TLS, not the map.
2. **Open the browser console.** Failed requests name which host is at fault.
3. **Basemap missing, network drawn?** The tiles host. Check the PMTiles archive is present, that
   the vhost serves byte ranges and CORS, and that `PUBLIC_BASEMAP_URL` was set at build time.
4. **Basemap drawn, no network?** The data host. Check `data.bikenetkit.org` serves the GeoJSON and
   that the `.gz`/`.br` siblings exist — `gzip_static`/`brotli_static` need them.
5. **One tool broken, others fine?** A data refresh problem. The manifest and the uploaded files
   have gone out of step: either uploaded without committing the regenerated manifest, or the
   reverse. See [ADD_A_CITY.md](ADD_A_CITY.md) § Upload and commit.
6. **Headings in the wrong typeface?** The display font is missing from the build. Cosmetic, but it
   means a deploy bypassed its own gate.

## Stats

GoAccess over the nginx logs — no client-side JavaScript, no cookies, no consent banner, IPs masked
at write time. Served at `/<STATS_PATH>/` behind basic auth as `<STATS_USER>`.
[www/DEPLOY_STATS.md](www/DEPLOY_STATS.md).

## Restoring from nothing

1. **Repository** — this repo. A clean clone builds the complete site: `pnpm install && pnpm build`.
   It needs neither the data on disk nor a reachable data host.
2. **Data** — from the archive (Zenodo, with a DOI), or regenerate from the tool exports.
3. **Basemap** — rebuild it from a current Protomaps planet build with `pnpm basemap:build`
   ([www/DEPLOY_TILES.md](www/DEPLOY_TILES.md) § Rebuilding). There is no backup of the served
   file, by design. A rebuild carries a newer OSM snapshot, and its schema version has to match the
   one the style is written for, which § Rebuilding records.
4. **Server** — nginx vhosts per the DEPLOY docs, certbot, then the three `deploy:*` targets.

## The constraint that shapes all of this

Nothing loads from a third-party origin at runtime. That is why the basemap is a 46 GB file you have
to rebuild and host yourself, and why there is no CDN to fall back on — it is also why an outage is always
one of the four things listed above, and never somebody else's API.
