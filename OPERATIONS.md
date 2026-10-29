# Operations runbook

For whoever keeps `bikenetkit.org` running, assuming no prior contact with this repository.

> **Maintainers only — needs SSH access to the server.** Almost everything here acts on the
> production server; § When the map stops working is the exception, since it starts in the
> browser. The scripts log in over key-based SSH to the host that `DEPLOY_HOST` in `www/.env`
> names.

Placeholders `<PREVIEW_HOST>`, `<STATS_PATH>` and `<STATS_USER>` stand for values kept out of this
repository. The maintainers (listed in [.github/CODEOWNERS](.github/CODEOWNERS)) hold the real
values.

> **Launch state.** Until launch, `bikenetkit.org` serves the "coming soon" placeholder. Its vhost
> roots at `~/bikenetkit/placeholder-website/`, which `pnpm deploy:placeholder` fills.
> `pnpm deploy:site` fills `~/bikenetkit/website/`, which nothing serves yet, so running it
> publishes nothing, and `main` records the placeholder, because that is what is live. Going live
> is an nginx change, not a deploy: repoint the vhost's `root` at `website/` and reload
> ([www/DEPLOY_NGINX.md](www/DEPLOY_NGINX.md) § Launch state).

## Server layout

One server runs nginx over static files. There is **no application process**: nothing to
restart, nothing that can crash. If the site is down, it is nginx, TLS, DNS or the disk.

| Host                   | Serves                                    | From                            |
| ---------------------- | ----------------------------------------- | ------------------------------- |
| `bikenetkit.org`       | The site                                  | `~/bikenetkit/website/`         |
| `<PREVIEW_HOST>`       | Staging copy of the site, Basic Auth      | `~/bikenetkit/preview-website/` |
| `data.bikenetkit.org`  | Per-city GeoJSON, screenshots, OG cards   | `~/bikenetkit/data/`            |
| `tiles.bikenetkit.org` | Basemap archive, map style, glyphs, media | `~/bikenetkit/tiles/`           |

The visitor stats live in `~/bikenetkit/stats/` and `~/bikenetkit/stats-db/`.

**Every directory is a sibling of the others, on purpose.** `deploy:site`, `deploy:preview`,
`deploy:placeholder` and `deploy:data` sync their target with `rsync --delete`, so anything placed
inside one of those directories (the basemap, the stats report, the data) is erased by the next
deploy. Give anything new its own sibling directory.

Setup per host: [www/DEPLOY_NGINX.md](www/DEPLOY_NGINX.md) (the site, preview and TLS),
[www/DEPLOY_DATA.md](www/DEPLOY_DATA.md), [www/DEPLOY_TILES.md](www/DEPLOY_TILES.md),
[www/DEPLOY_STATS.md](www/DEPLOY_STATS.md).

## Deploying

**`main` is what is live.** `dev` integrates work and is what gets staged on the preview host;
`main` records the state of the production site. Publishing is `dev` → `main` → deploy, staging
first and then shipping the same build:

```sh
cd www
pnpm deploy:preview                            # on dev: build, stage on <PREVIEW_HOST>, check it
git checkout main && git merge --ff-only dev
pnpm deploy:site -- --skip-build               # publish the build you just checked
git push origin main dev
```

Nothing in the tooling enforces the order, because a deploy uploads whatever is checked out.
Deploying from any other branch leaves `main` describing a site that is not live, and
`deploy:site` warns when you do. Branch rulesets for `main` and `dev` (no force-push or deletion;
`main` only through a reviewed pull request, with repository admins allowed to push the release
fast-forward) are prepared, and GitHub only allows them once the repository is public.

The deploy targets, all run from `www/`, all reading `www/.env` (copied from `.env.example`). Each
takes `-- --dry-run`.

| Command                   | What it does                                        | Server dir             |
| ------------------------- | --------------------------------------------------- | ---------------------- |
| `pnpm deploy:site`        | Builds, then syncs `build/`                         | `website/`             |
| `pnpm deploy:preview`     | The same build, for staging                         | `preview-website/`     |
| `pnpm deploy:placeholder` | Builds and syncs the "coming soon" page             | `placeholder-website/` |
| `pnpm deploy:data`        | Syncs `www/data/` and `www/screenshots/`            | `data/`                |
| `pnpm compress:data`      | Writes the `.gz`/`.br` siblings, on the server      | `data/`                |
| `pnpm deploy:basemap`     | Uploads the newest archive in `BASEMAP_WORK_DIR`    | `tiles/`               |
| `pnpm deploy:mapstyle`    | Rebuilds and uploads the map style and glyphs       | `tiles/`               |
| `pnpm deploy:media`       | Uploads the intro video from `MEDIA_SRC_DIR`        | `tiles/media/`         |

`deploy:site -- --skip-build` uploads the existing `build/` without rebuilding.

`pnpm deploy` is a pnpm builtin and is **not** any of these. The full script list is in
[AGENTS.md](AGENTS.md) § Common commands. Refreshing the data has its own runbook:
[README.md](README.md#for-maintainers-updating-the-data) § For maintainers: updating the data.

Every site deploy refuses to upload a build without the display font (Bespoke Sans, which is not
in the repository; see [www/README.md](www/README.md#fonts) § Fonts). A build without it still
looks plausible, which is why the gate exists.

### Rolling back

The site is a static prerender, so a deploy is a file sync, and rolling back means deploying a
known-good commit:

```sh
git checkout <good-sha>          # the last main commit known to be good
cd www && pnpm deploy:site       # warns "Publishing from 'HEAD', not 'main'": expected here
```

Then revert the bad commits on `dev` (`git revert <bad-sha>…`) and release the revert through the
flow above, so `main` fast-forwards to it and again describes what is live. That needs no
force-push.

## Keeping it alive

These are the things that actually end a site meant to run untended for years, roughly in order
of likelihood.

**The domain lapses.** Nothing else matters if this happens. Know who renews it and when.

**TLS expires.** certbot should renew automatically. Verify rather than assume:

```sh
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

A dry run that fails is the warning you get. Put the expiry date in a calendar as a backstop, and
run an external uptime check that alerts on certificate expiry as well as on downtime.

**The disk fills.** The basemap archive is about 46 GB, and the data is several GB and grows with
the catalogue. The archive lives on its own volume, bind-mounted, because the root filesystem
cannot hold it ([www/DEPLOY_TILES.md](www/DEPLOY_TILES.md) § Storage volume).

```sh
df -h
du -sh ~/bikenetkit/*
```

**The server drifts from what the privacy notice says.** `/legal#privacy` states facts about the
server, listed in [www/DEPLOY_STATS.md](www/DEPLOY_STATS.md) § Retention & privacy. If the nginx or
logrotate config drifts from them, the page becomes wrong. Run both checks from `www/` after any
nginx or logrotate change:

```sh
pnpm check:privacy    # read-only, over SSH: anonymised access logs on every vhost, 14-day rotation
pnpm check:headers    # no SSH: security and cache headers on the site, tiles and data hosts
```

## When the map stops working

The map has several independent failure modes that look identical to a visitor: a page with a
header and a blank rectangle. Work down this list.

1. **Does the rest of the site render?** If not, it is nginx or TLS, not the map.
2. **Open the browser console.** Failed requests name which host is at fault.
3. **Basemap missing, network drawn?** The tiles host. Check that the PMTiles archive is present,
   that the vhost serves byte ranges and CORS, and that `PUBLIC_BASEMAP_URL` was set at build time.
4. **Basemap drawn, no network?** The data host. Check that `data.bikenetkit.org` serves the
   GeoJSON and that the `.gz`/`.br` siblings exist, since `gzip_static`/`brotli_static` need them.
5. **One tool broken, others fine?** A data refresh problem. The manifest and the uploaded files
   have gone out of step: either the files were uploaded without committing the regenerated
   manifest, or the reverse. See [ADD_A_CITY.md](ADD_A_CITY.md) § Upload and commit.
6. **Headings in the wrong typeface?** The display font is missing from the build. Cosmetic, but it
   means a deploy bypassed its own gate.

## Stats

GoAccess over the nginx logs: no client-side JavaScript, no cookies, no consent banner, IPs masked
at write time. Served at `/<STATS_PATH>/` behind Basic Auth as `<STATS_USER>`. Setup and the
retention rules: [www/DEPLOY_STATS.md](www/DEPLOY_STATS.md).

## Restoring from nothing

1. **Repository.** Clone it, copy `www/.env.example` to `www/.env` and fill in the deploy keys, and
   add the display font ([www/README.md](www/README.md#fonts) § Fonts). A clean clone builds the
   complete site with `pnpm install && pnpm build`; it needs neither the data on disk nor a
   reachable data host ([www/DEPLOY_DATA.md](www/DEPLOY_DATA.md) § The build is independent of the
   data).
2. **Server.** nginx per [www/DEPLOY_NGINX.md](www/DEPLOY_NGINX.md), then the data and tiles vhosts
   ([www/DEPLOY_DATA.md](www/DEPLOY_DATA.md), [www/DEPLOY_TILES.md](www/DEPLOY_TILES.md)),
   certbot, and the stats ([www/DEPLOY_STATS.md](www/DEPLOY_STATS.md)).
3. **Data.** Regenerate it from the tool exports with `pnpm pull-data`, per
   [README.md](README.md#for-maintainers-updating-the-data) § For maintainers: updating the data,
   then `pnpm deploy:data` and `pnpm compress:data`. `pull-data` reads the raw exports from
   `DEPLOY_DATA_PATH` on the server; if the server is lost, they have to be uploaded there again
   from the tool teams' exports first. An archived copy of the data on Zenodo is planned but does
   not exist yet.
4. **Screenshots and OG cards.** If the data host still has them, `pnpm pull-screenshots` fetches
   them. Otherwise regenerate them with `pnpm generate:screenshots` (it takes hours) and
   `pnpm generate:og-cards`, then upload with `pnpm deploy:data`.
5. **Basemap.** Rebuild it from a current Protomaps planet build with `pnpm basemap:build`
   ([www/DEPLOY_TILES.md](www/DEPLOY_TILES.md) § Rebuilding), then `pnpm deploy:basemap` and
   `pnpm deploy:mapstyle`. There is no backup of the served file, by design. A rebuild carries a
   newer OSM snapshot, and its schema version has to match the one the style is written for, which
   § Rebuilding explains how to check.
6. **Media.** The intro video is not in the repository; the maintainers hold the source files
   ([www/DEPLOY_TILES.md](www/DEPLOY_TILES.md) § Self-hosted media). Upload it with
   `pnpm deploy:media`. Without it, leave `PUBLIC_VIDEO_URL` unset and the landing page shows a
   poster instead.
7. **Site.** `pnpm deploy:site`.

## Why there is no CDN to fall back on

Nothing loads from a third-party origin at runtime ([www/README.md](www/README.md) § No external
runtime dependencies), which is why the basemap is a file you rebuild and host yourself, and why an
outage is always one of the causes listed above, never somebody else's API.
