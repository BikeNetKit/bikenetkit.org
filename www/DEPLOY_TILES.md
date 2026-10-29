# Self-hosted basemap (`tiles.bikenetkit.org`)

> **Placeholders.** `<SERVER_IP>`, `<SSH_USER>`, `<STATS_PATH>` and `<STATS_USER>` stand in for
> values deliberately kept out of this repo. Substitute your own. The maintainer's are recorded in
> `internal/AGENTS-internal.md`, which is not published.

The basemap is a single **PMTiles archive covering Europe plus the Atlantic archipelagos**
(Madeira, the Canaries, the Azores), built once from a Protomaps planet build and served as a
static file from the same server as the site. MapLibre reads it with HTTP byte ranges, so there is
no tile server, no API key, and no third-party service in the runtime path.

This matters more than it looks: the site must keep working for ~8 years with no maintenance.
Until 2026-08, tiles came from `api.protomaps.com` behind a key baked into the build — one
revocation or shutdown away from every map on the site going blank.

**Current archive:** `basemap-20260902.pmtiles`, built from
`https://build.protomaps.com/20260902.pmtiles` (OSM data of 2026-09-02 04:00 UTC).

---

## Storage volume

Since 2026-08-18 the tiles live on a **dedicated 100 GB OVH block volume** (`/dev/sdb1`, ext4,
UUID `1caa633d-91cd-42d9-a874-cc29d0f2e744`), not on the root filesystem — the root fs was 81 %
full with only ~14 GB spare. The volume is mounted at `/mnt/data`, and its `tiles/` subfolder is
**bind-mounted** onto the canonical serving path so nothing downstream had to change:

```
# /etc/fstab
UUID=1caa633d-91cd-42d9-a874-cc29d0f2e744  /mnt/data  ext4  defaults,nofail  0  2
/mnt/data/tiles  /home/<SSH_USER>/bikenetkit/tiles  none  bind,nofail  0  0
```

`nofail` on both lines keeps the server bootable if the volume ever detaches (an empty tiles dir
→ 404s, not a boot hang). Mounting the volume at `/mnt/data` (rather than directly at the tiles
path) leaves the rest of the disk free for other data; the bind mount means nginx `root`,
`DEPLOY_TILES_PATH` (`~/bikenetkit/tiles/`), and `PUBLIC_BASEMAP_URL` are all **unchanged**. The
volume was partitioned with `parted` (GPT, one partition) and formatted `mkfs.ext4`; get the UUID
back any time with `sudo blkid /dev/sdb1`.

---

## What the archive contains

| Property | Value                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Region   | `scripts/basemap-region.geojson` — Europe (`-25,34,40,72`) plus Madeira, the Canaries and the Azores; union envelope `-31.4,27.5,40,72` |
| Zoom     | z0–15                                                                                                                                   |
| Size     | ~46 GB                                                                                                                                  |
| Content  | Protomaps' tiles verbatim — nothing re-encoded                                                                                          |

**Why a region, not one bbox.** The archive used to be a single bbox (`-25,34,40,72`, "Europe plus
near neighbours"). Funchal — at lat 32.64–32.73 — sits just south of it, so it had no basemap below
z8 (the zoom where the tile rows covering Europe stop reaching Madeira). Of the 400+ cities in
[src/lib/data/cities.json](src/lib/data/cities.json), Funchal was the only one outside the crop.
Widening the bbox south to include it (down to Canaries latitude, ~27.5°) would also sweep in the
whole North African and Levantine coast — real land data, gigabytes of it, for zero cities. A
`MultiPolygon` region (`pmtiles extract --region=`) adds the three archipelagos as small separate
boxes instead: **98 MB** total against the ~46 GB Europe box, negligible.

The header bounds MapLibre sees now widen to the region's union envelope
(`-31.4,27.5,40,72`), which includes open Atlantic and North African land the archive does not
actually contain. That's expected: a miss inside the PMTiles directory resolves to an empty tile,
not an error — see `Protocol.tilev4` in the `pmtiles` package, which returns `new Uint8Array()` for
a missing MVT tile.

**Why z15 and not 17.** Protomaps builds the planet to z15 and no deeper. `MAX_ZOOM` in
[src/lib/map-style/render-config.js](src/lib/map-style/render-config.js) is 17; those last two
levels are produced by MapLibre _overzooming_ z15 tiles. `api.protomaps.com` did exactly the same,
so the self-hosted archive renders identically. Going deeper would mean running Planetiler over an
OSM Europe extract — hundreds of GB, and detail the style does not use (its only z16+ layer is
`address_label` at `minzoom: 18`, which never renders below `MAX_ZOOM` 17).

**Why we do not strip unused layers.** The style only reads seven `source-layer` values —
`earth`, `landuse`, `roads`, `water`, `buildings`, `boundaries`, `places` — so dropping the rest
(`pois` above all) with tippecanoe's `tile-join -l` looks like free savings. It is not, and the
reasoning is worth recording because it is an easy mistake to repeat.

Sampling 20 hand-picked z15 tiles suggested `pois` was **43 %** of all bytes. Summing _every_ tile
in a bounding box instead gives the real figure:

| region          | verbatim | pois stripped | saving |
| --------------- | -------- | ------------- | ------ |
| Amsterdam z0–15 | 30.7 MB  | 28.7 MB       | −6.6 % |
| London z0–15    | 129.7 MB | 117.2 MB      | −9.6 % |

City-centre tiles are POI-dense and unrepresentative; most tiles are not. So the real saving is
**7–10 %**, and against that `tile-join` costs:

- **~4 hours** per rebuild (vs ~20 minutes for the extract alone).
- **The archive bounds**, which it resets to the whole world, so MapLibre would request tiles for
  places the archive does not cover. Recoverable with `pmtiles edit --header-json`, but a trap.
- **The PMTiles run-length encoding.** Protomaps writes tiles in Hilbert order so long runs of
  identical ocean tiles collapse into one directory entry. `tile-join` does not preserve those
  runs. On an Atlantic test region the directory went from 14,984 entries to 108,394 — a 7.2×
  blow-up for the same 211,244 addressed tiles. `pmtiles cluster` cannot repair it; it reports the
  archive as already clustered.

It is _not_ a compression problem — both archives gzip at ~41 %, and re-compressing a tile at
level 6 or 9 reproduces the stored size to within 0.5 %.

Shipping Protomaps' bytes verbatim keeps the ordering, the run-length encoding, the bounds and the
`planetiler:*` provenance metadata, at roughly the same size. Visitors download ~9 % more at z15;
that is the whole cost.

---

## Rebuilding

Needs `pmtiles` (go-pmtiles) on PATH and **~60 GB free** on `BASEMAP_WORK_DIR`. The build runs on
an external disk (the local Mac's SanDisk), not the server: the server's root fs has only ~14 GB
free, and even the dedicated tiles volume (~50 GB free beside the archive; see **Storage volume**)
has no room to stage a second copy for the extract.

```sh
pnpm basemap:build                    # dry run: reports the size, downloads nothing
pnpm basemap:build -- --run           # extract for real
pnpm basemap:build -- --run --date 20260902    # pin a planet build
```

`pmtiles extract --region=scripts/basemap-region.geojson` pulls Europe plus the three Macaronesian
archipelagos out of the 137 GB remote planet build over range requests — ~49 GB transferred, about
20–25 minutes at 36 MB/s. (The archipelagos add ~98 MB combined; the Europe box is ~99.8 % of the
transfer.)

The script ends with `pmtiles show` and `pmtiles verify`. Confirm **max zoom 15**, bounds
`-31.4,27.5,40,72` (the region's union envelope), and `clustered: true` before uploading anything.

> **The archive is not backed up. These instructions are what we archive.** Protomaps keeps only
> about a week of daily builds, so a rebuild cannot reproduce the served file byte for byte. It
> produces the same region and zoom range from a newer OSM snapshot, which is all the site needs.
>
> The one thing that can break is the **basemap schema version**. The served archive
> (`basemap-20260902.pmtiles`) carries `version: 4.15.2` in its metadata, and the style in
> `src/lib/map-style/` is written against that v4 schema. Before uploading a rebuild, check its
> version with `pmtiles show --metadata <file>`. A minor or patch bump within v4 is safe. A new major
> version means checking the layer and field names in `layers.js` and loading a tool page against
> the new archive locally before swapping `PUBLIC_BASEMAP_URL`.

---

## Uploading

```sh
pnpm deploy:basemap -- --dry-run
pnpm deploy:basemap
```

Uploads the newest `basemap-*.pmtiles` to `DEPLOY_TILES_PATH` (`~/bikenetkit/tiles/`). Expect
hours on a home connection; `--partial` resumes an interrupted run.

Two things to know:

- The target is deliberately **not** under `~/bikenetkit/website/`. `pnpm deploy:site` syncs that
  directory with `--delete` and would erase the archive on the next site deploy.
- It uses `rsync --inplace` rather than the default write-temp-then-rename, because the tiles
  volume (~50 GB free beside the current archive) cannot hold two full copies. The file is briefly
  inconsistent mid-transfer, so re-upload during a quiet window. After launch you can reclaim
  ~6 GB on the root fs by deleting `placeholder-website/` and `datadev/`.
- During a cutover, the 100 GB tiles volume briefly holds **two** ~46 GB archives (old + new).
  Check `df -h /mnt/data` before uploading; delete the superseded archive only after the new
  `PUBLIC_BASEMAP_URL` and the published map style (see below) are both verified live.

Then point the site at the new filename and redeploy:

```sh
# www/.env
PUBLIC_BASEMAP_URL=https://tiles.bikenetkit.org/basemap-20260902.pmtiles
pnpm deploy:site
```

Update the same line in `www/.env.example`, so a fresh checkout copied from it gets the live
archive.

Filenames are date-stamped so they can be cached forever and a half-written upload can never be
served under the live name. Delete the superseded archive by hand once the new one is verified.

---

## nginx

Lives at `/etc/nginx/sites-available/bikenetkit-tiles`, symlinked into `sites-enabled/`. The site
vhost is `server_name _` on `default_server`, and nginx prefers an exact `server_name` match, so
the two coexist with no change to the site config.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tiles.bikenetkit.org;

    root /home/<SSH_USER>/bikenetkit/tiles;

    # Security headers (DEPLOY_NGINX.md § Security headers), repeated in every location below:
    # each sets its own add_header, which discards the server-level ones.
    include snippets/bikenetkit-security.conf;

    # Truncate the client IP before it is logged, like the site vhost. The format is defined in
    # conf.d/anonymized-log.conf — see DEPLOY_NGINX.md; the privacy notice at /legal#privacy says
    # no full address is stored anywhere, and that has to hold on this host too.
    access_log /var/log/nginx/access.log anonymized;

    location ~ \.pmtiles$ {
        include snippets/bikenetkit-security.conf;
        # Must stay unfiltered: any content filter makes nginx drop Accept-Ranges, and
        # without byte ranges a client would have to fetch all 46 GB to draw one tile.
        # Nothing is lost — the tiles inside the archive are already gzipped.
        gzip off;
        default_type application/vnd.pmtiles;

        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Range" always;
        add_header Access-Control-Expose-Headers "Content-Length, Content-Range, ETag" always;

        # Archive filenames are date-stamped and never rewritten in place.
        add_header Cache-Control "public, max-age=31536000, immutable" always;

        if ($request_method = OPTIONS) { return 204; }

        try_files $uri =404;
    }

    # Published map style for external consumers (docs.bikenetkit.org — see DOCS_MAP_INTEGRATION.md).
    # Small file, regenerated in place by `pnpm deploy:mapstyle`, so a modest TTL, not immutable.
    location = /bikenetkit-map-style.json {
        include snippets/bikenetkit-security.conf;
        default_type application/json;
        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
        add_header Cache-Control "public, max-age=3600" always;
        if ($request_method = OPTIONS) { return 204; }
        try_files $uri =404;
    }

    # Glyph PDFs (label fonts) for the same consumers. Stable content, so a long cache. CORS `*` so
    # a cross-origin MapLibre may fetch them (same-origin site loads need no header, but it is
    # harmless). Already gzipped-ish protobuf; leave nginx gzip off to keep ranges clean.
    location /fonts/ {
        include snippets/bikenetkit-security.conf;
        gzip off;
        default_type application/x-protobuf;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Cache-Control "public, max-age=2592000" always;
        try_files $uri =404;
    }

    location / { return 404; }
}
```

```sh
sudo ln -sf /etc/nginx/sites-available/bikenetkit-tiles /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

TLS, once the DNS A record for `tiles.bikenetkit.org` points at `<SERVER_IP>`:

```sh
sudo certbot --nginx -d tiles.bikenetkit.org
sudo certbot renew --dry-run
```

---

## Map style + glyphs for external consumers

The interactive maps on `bikenetkit.org` build their MapLibre style in
[src/lib/map-style/style.js](src/lib/map-style/style.js), which imports `$env/static/public` and
registers the `pmtiles://` protocol — neither of which a non-SvelteKit consumer (the docs site, a
notebook, a partner) can run. So the style is also **published as one self-contained JSON on the
tiles host**, next to the PMTiles archive it already depends on. This is what lets
`docs.bikenetkit.org` render the exact same basemap — see
[DOCS_MAP_INTEGRATION.md](DOCS_MAP_INTEGRATION.md).

Why the tiles host and not `bikenetkit.org`: `tiles.bikenetkit.org` is live and CORS-open
independently of the website deploy, which serves the full site only at launch (before then it is a
placeholder). A consumer must not lean on `bikenetkit.org` for the style or glyphs until then.

```sh
pnpm deploy:mapstyle -- --dry-run
pnpm deploy:mapstyle         # rebuilds the style, then rsyncs it + static/fonts/maplibre/ to ~/bikenetkit/tiles/
```

`deploy:mapstyle` runs `build:mapstyle` first, so it can never ship a style that has drifted from the
current `layers.js` / `theme.js` — a module change shows up as a dirty `static/bikenetkit-map-style.json`
to commit. (Run `pnpm build:mapstyle` alone to just regenerate the committed file.) `build:mapstyle`
writes glyph URLs absolute to the tiles origin by default (derived from `PUBLIC_BASEMAP_URL`), so the
published file is self-contained; `--relative-glyphs` emits a root-relative path for a consumer that
vendors the glyphs instead. The style also embeds the dated `basemap-*.pmtiles` filename, so redeploy
after a basemap archive bump too. The nginx `location`s above (`/bikenetkit-map-style.json` and
`/fonts/`) serve them with `Access-Control-Allow-Origin: *`.

Verify cross-origin reachability:

```sh
curl -sI -H 'Origin: https://docs.bikenetkit.org' https://tiles.bikenetkit.org/bikenetkit-map-style.json
curl -sI https://tiles.bikenetkit.org/fonts/maplibre/Public%20Sans%20Regular/0-255.pbf
# expect: 200, Access-Control-Allow-Origin: *
```

---

## Self-hosted media (intro video)

The color-graded intro video is served the same self-hosted way as the tiles — a static MP4 under
the tiles vhost — so no third-party player (YouTube/Vimeo) sits in the runtime path. The landing
page reads its URL from `PUBLIC_VIDEO_URL`; when that is unset the page falls back to a poster
placeholder, so the site still builds without the asset.

Of the intro video, **only the WebVTT captions are committed** (`www/static/media/bikenetkit-intro.en.vtt`, a few KB,
same-origin with the page). The MP4 is large and lives outside the repo, in the gitignored working
dir `../../05_dev_data/media/`.

**Encode** the editor's delivery to a web-delivery MP4 (H.264 High, ~1080p, faststart for
progressive streaming, keep audio):

```sh
# 1080p (default rendition)
ffmpeg -i BikeNetKit_version_2_colorgraded.mp4 \
  -c:v libx264 -profile:v high -crf 20 -preset slow -vf "scale=-2:1080" \
  -c:a aac -b:a 128k -movflags +faststart \
  bikenetkit-intro.mp4
# ~130 MB source → ~46 MB. Drop to -crf 18 if the accepted moiré around 1:20 visibly worsens.

# 720p (served to narrow viewports)
ffmpeg -i BikeNetKit_version_2_colorgraded.mp4 \
  -c:v libx264 -profile:v high -crf 21 -preset slow -vf "scale=-2:720" \
  -c:a aac -b:a 128k -movflags +faststart \
  bikenetkit-intro-720p.mp4
# ~17 MB.
```

The landing page picks the rendition by viewport with `matchMedia('(max-width: 767px)')` (see
`ProblemSolutionExplainer.svelte`): the 720p file is derived from `PUBLIC_VIDEO_URL` by swapping
`.mp4` → `-720p.mp4`, so both must sit in the same media dir. `pnpm deploy:media` uploads both.

**Convert** the delivered SRT to WebVTT (native `<track>` only reads VTT): prepend a `WEBVTT`
header and change `,` to `.` in the timestamps (`ffmpeg -i subs.srt bikenetkit-intro.en.vtt` also
works).

**Upload** the MP4 to `DEPLOY_MEDIA_PATH` (`~/bikenetkit/tiles/media/`, under the tiles dir so
`deploy:site --delete` never touches it):

```sh
pnpm deploy:media -- --dry-run
pnpm deploy:media
# then confirm PUBLIC_VIDEO_URL resolves:
#   https://tiles.bikenetkit.org/media/bikenetkit-intro.mp4
```

Add a `/media/` location to the tiles vhost (range requests for scrubbing; long cache, filename is
stable):

```nginx
    location /media/ {
        include snippets/bikenetkit-security.conf;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Cache-Control "public, max-age=2592000" always;
        try_files $uri =404;
    }
```

## Verifying

**The archive**, before it goes anywhere:

```sh
# expect max zoom 15, clustered: true, and the planetiler:* metadata intact. Bounds read back as
# the region envelope (-31.4,27.5,40,72 — Europe plus the archipelagos), or slightly wider still:
# `pmtiles extract` rounds out to whole tiles. Neither means a bad build.
# The archive is Protomaps' output verbatim, so every source-layer is present —
# `pois` included. That is correct; see "Why we do not strip unused layers" above.
pmtiles show   "$BASEMAP_WORK_DIR/basemap-20260902.pmtiles"
pmtiles verify "$BASEMAP_WORK_DIR/basemap-20260902.pmtiles"
```

**Visually**, without uploading anything — serve the work dir locally and point the app at it:

```sh
npx --yes http-server "$BASEMAP_WORK_DIR" -p 8081 --cors   # serves byte ranges
# www/.env: PUBLIC_BASEMAP_URL=http://localhost:8081/basemap-20260902.pmtiles
pnpm dev
```

Check an interactive algorithm page, `/design`, and the landing page — those cover all four map
components (`Map`, `MapStatic`, `MapSuperblocks`, `AmbientMapPane`). Zoom to 17 in a city centre
and confirm buildings, minor roads and labels are there. Check Athens and Kyiv too: their labels
depend on the Noto fallback glyphs baked in by `pnpm build:glyphs`.

**The server** — before DNS exists, address the vhost by Host header:

```sh
curl -sI -H 'Host: tiles.bikenetkit.org' -r 0-16383 \
  http://<SERVER_IP>/basemap-20260902.pmtiles
# expect: 206 Partial Content, Access-Control-Allow-Origin: *, no Content-Encoding
```

**The whole point** — load the site with `api.protomaps.com` blocked in devtools and confirm every
map still draws. Then check nothing external crept back into the build:

```sh
grep -rhoE 'https?://[a-z0-9.-]+' build/_app build/*.html | sort -u
```

Only `bikenetkit.org`, `tiles.bikenetkit.org`, and the `protomaps.com` / `openstreetmap.org`
attribution links should appear.

---

## Attribution

The style carries `<a href="https://protomaps.com">Protomaps</a> | <a
href="https://openstreetmap.org">OpenStreetMap</a>`. Self-hosting does not change the obligation:
OSM data is ODbL and the attribution must stay visible on every map.
