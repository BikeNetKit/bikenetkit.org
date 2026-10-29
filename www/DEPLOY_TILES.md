# Self-hosted basemap (`tiles.bikenetkit.org`)

> **Maintainers only — needs SSH access to the server** for § Storage volume, § Uploading,
> § nginx, § Map style and § Self-hosted media. Building and checking the archive locally needs
> no server access.

> **Placeholders.** `<SERVER_IP>` and `<SSH_USER>` stand in for values kept out of this
> repository; substitute your own. The maintainers (listed in
> [.github/CODEOWNERS](../.github/CODEOWNERS)) hold the real values.

The basemap is a single **PMTiles archive covering Europe plus the Atlantic archipelagos**
(Madeira, the Canaries, the Azores), built once from a Protomaps planet build and served as a
static file from the same server as the site. MapLibre reads it with HTTP byte ranges, so there is
no tile server, no API key, and no third-party service in the runtime path.

This matters more than it looks: the site must keep working for years with no maintenance, and a
hosted tile API would put a key, and someone else's service, between the site and every map.

The archive in service is the one `PUBLIC_BASEMAP_URL` in [.env.example](.env.example) names.
Its filename carries the date of the Protomaps planet build it was cut from.

## Storage volume

The tiles live on a **dedicated block volume**, not on the root filesystem, which cannot hold the
archive. The volume is mounted at `/mnt/data`, and its `tiles/` subfolder is **bind-mounted** onto
the serving path, so nginx `root`, `DEPLOY_TILES_PATH` (`~/bikenetkit/tiles/`) and
`PUBLIC_BASEMAP_URL` all stay the same:

```
# /etc/fstab
UUID=<volume UUID>  /mnt/data  ext4  defaults,nofail  0  2
/mnt/data/tiles  /home/<SSH_USER>/bikenetkit/tiles  none  bind,nofail  0  0
```

`nofail` on both lines keeps the server bootable if the volume ever detaches (an empty tiles
directory gives 404s, not a boot hang). Mounting the volume at `/mnt/data` rather than directly at
the tiles path leaves the rest of it free for other data. Get the UUID with `sudo blkid` on the
volume's partition.

## What the archive contains

| Property | Value                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Region   | `scripts/basemap-region.geojson` — Europe (`-25,34,40,72`) plus Madeira, the Canaries and the Azores; union envelope `-31.4,27.5,40,72` |
| Zoom     | z0–15                                                                                                                                   |
| Size     | ~46 GB                                                                                                                                  |
| Content  | Protomaps' tiles verbatim — nothing re-encoded                                                                                          |

**Why a region, not one bbox.** Every city in the catalogue has to sit inside the archive, and
Funchal, on Madeira, lies south of the Europe box. A single bbox reaching south to the Canaries
(~27.5°) would also sweep in the whole North African and Levantine coast: gigabytes of land data
for no city. A `MultiPolygon` region (`pmtiles extract --region=`) adds the three archipelagos as
small separate boxes instead, at about 100 MB against the ~46 GB Europe box.

The header bounds MapLibre sees are the region's union envelope (`-31.4,27.5,40,72`), which
includes open Atlantic and North African land the archive does not contain. That is expected: a
miss inside the PMTiles directory resolves to an empty tile, not an error (see `Protocol.tilev4`
in the `pmtiles` package, which returns `new Uint8Array()` for a missing MVT tile).

**Why z15 and not 17.** Protomaps builds the planet to z15 and no deeper. `MAX_ZOOM` in
[src/lib/map-style/render-config.js](src/lib/map-style/render-config.js) is 17; those last two
levels are produced by MapLibre _overzooming_ z15 tiles. Going deeper would mean running
Planetiler over an OSM Europe extract: hundreds of GB, and detail the style does not use (its only
z16+ layer is `address_label` at `minzoom: 18`, which never renders below `MAX_ZOOM` 17).

**Why we do not strip unused layers.** The style reads only seven `source-layer` values (`earth`,
`landuse`, `roads`, `water`, `buildings`, `boundaries`, `places`), so dropping the rest (`pois`
above all) with tippecanoe's `tile-join -l` looks like free savings. It is not, and it is an easy
mistake to repeat. A few POI-dense city-centre tiles suggest `pois` is a large share of the bytes;
summed over every tile in a city's bounding box, stripping saves only 7–10 %. Against that,
`tile-join`:

- takes **hours** per rebuild, against minutes for the extract alone;
- resets **the archive bounds** to the whole world, so MapLibre would request tiles for places the
  archive does not cover (recoverable with `pmtiles edit --header-json`, but a trap);
- breaks **the PMTiles run-length encoding.** Protomaps writes tiles in Hilbert order, so long runs
  of identical ocean tiles collapse into one directory entry. `tile-join` does not preserve those
  runs, and the directory grows about sevenfold. `pmtiles cluster` cannot repair it; it reports the
  archive as already clustered.

Shipping Protomaps' bytes verbatim keeps the ordering, the run-length encoding, the bounds and the
`planetiler:*` provenance metadata, at roughly the same size.

## Rebuilding

Needs `pmtiles` (go-pmtiles) on `PATH` and **~60 GB free** on `BASEMAP_WORK_DIR` (a scratch disk
named in `www/.env`, not a repo path). The build runs on a workstation, not the server, which has
no room to stage a second copy of the archive.

```sh
pnpm basemap:build                    # dry run: reports the size, downloads nothing
pnpm basemap:build -- --run           # extract for real
pnpm basemap:build -- --run --date 20260902    # pin a planet build
```

`pmtiles extract --region=scripts/basemap-region.geojson` pulls Europe plus the three archipelagos
out of the remote planet build over range requests, so only the bytes the archive keeps cross the
network. Expect well under an hour on a fast connection.

The script ends with `pmtiles show` and `pmtiles verify`. Confirm **max zoom 15**, bounds
`-31.4,27.5,40,72` (the region's union envelope), and `clustered: true` before uploading anything.

> **The archive is not backed up. These instructions are what we archive.** Protomaps keeps only
> about a week of daily builds, so a rebuild cannot reproduce the served file byte for byte. It
> produces the same region and zoom range from a newer OSM snapshot, which is all the site needs.
>
> The one thing that can break is the **basemap schema version**. The style in
> `src/lib/map-style/` is written against Protomaps' v4 schema, and the served archive carries a
> v4 `version` in its metadata. Before uploading a rebuild, check its version with
> `pmtiles show --metadata <file>`. A minor or patch bump within v4 is safe. A new major version
> means checking the layer and field names in `layers.js` and loading a tool page against the new
> archive locally before swapping `PUBLIC_BASEMAP_URL`.

## Uploading

Before uploading, check `df -h /mnt/data`: during a cutover the volume holds the live archive and
the new one side by side, so it needs **~46 GB free**.

```sh
pnpm deploy:basemap -- --dry-run
pnpm deploy:basemap
```

`deploy:basemap` uploads the newest `basemap-*.pmtiles` in `BASEMAP_WORK_DIR` to
`DEPLOY_TILES_PATH` (`~/bikenetkit/tiles/`), a sibling of the website directory
([OPERATIONS.md](../OPERATIONS.md) § Server layout). Expect hours on a home connection. It uses
`rsync --inplace --partial`, so an interrupted transfer resumes into the same file instead of
staging a second copy. The filename is new, so nothing serves the file until `PUBLIC_BASEMAP_URL`
names it, and a half-written upload is never visible.

Then switch to the new archive:

1. Point `PUBLIC_BASEMAP_URL` at the new filename in both `www/.env` and `www/.env.example`, so a
   fresh checkout copied from the example gets the live archive:

   ```sh
   PUBLIC_BASEMAP_URL=https://tiles.bikenetkit.org/basemap-YYYYMMDD.pmtiles
   ```

2. Run `pnpm deploy:mapstyle`. The published style embeds the archive filename, so it has to be
   rebuilt and republished after every bump (§ Map style). Commit the regenerated
   `static/bikenetkit-map-style.json` with the `.env.example` change.
3. Release the site as usual ([OPERATIONS.md](../OPERATIONS.md) § Deploying).
4. Once the site and the published style both load the new archive, delete the superseded archive
   from `~/bikenetkit/tiles/` by hand.

Filenames are date-stamped, so they can be cached forever and a half-written upload can never be
served under the live name.

## nginx

Lives at `/etc/nginx/sites-available/bikenetkit-tiles`, symlinked into `sites-enabled/`. The site
vhost names only `bikenetkit.org` and `www.bikenetkit.org`, so nginx routes requests for
`tiles.bikenetkit.org` here by its exact `server_name`, with no change to the site config.

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
    # no full address is stored anywhere, and that has to hold on this host too. A log of its own,
    # so tile range requests never count as page views (DEPLOY_STATS.md).
    access_log /var/log/nginx/tiles.access.log anonymized;

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

    # Glyph PBFs (label fonts) for the same consumers. Stable content, so a long cache. CORS `*` so
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

    # Self-hosted intro video (§ Self-hosted media). Range requests for scrubbing; long cache,
    # since the filename is stable.
    location /media/ {
        include snippets/bikenetkit-security.conf;
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
sudo certbot --nginx -d tiles.bikenetkit.org
sudo certbot renew --dry-run
```

`tiles.bikenetkit.org` resolves through the zone's wildcard record
([DEPLOY_NGINX.md](DEPLOY_NGINX.md) § DNS), so certbot can issue the certificate as soon as this
vhost answers on port 80.

## Map style + glyphs for external consumers

The interactive maps on `bikenetkit.org` build their MapLibre style in
[src/lib/map-style/style.js](src/lib/map-style/style.js), which imports `$env/static/public` and
registers the `pmtiles://` protocol, neither of which a non-SvelteKit consumer (the docs site, a
notebook, a partner) can run. So the style is also **published as one self-contained JSON on the
tiles host**, next to the PMTiles archive it already depends on. This is what lets
`docs.bikenetkit.org` render the exact same basemap; see
[DOCS_MAP_INTEGRATION.md](DOCS_MAP_INTEGRATION.md).

The tiles host rather than `bikenetkit.org`, because it is CORS-open and independent of the
website deploys, and every consumer depends on it for the archive anyway.

```sh
pnpm deploy:mapstyle -- --dry-run
pnpm deploy:mapstyle         # rebuilds the style, then rsyncs it + static/fonts/maplibre/ to ~/bikenetkit/tiles/
```

`deploy:mapstyle` runs `build:mapstyle` first, so it can never ship a style that has drifted from
the current `layers.js` / `theme.js`; a module change shows up as a modified
`static/bikenetkit-map-style.json` to commit. (Run `pnpm build:mapstyle` alone to just regenerate
the committed file.) `build:mapstyle` writes glyph URLs absolute to the tiles origin by default
(derived from `PUBLIC_BASEMAP_URL`), so the published file is self-contained; `--relative-glyphs`
emits a root-relative path for a consumer that vendors the glyphs instead. The style also embeds
the dated `basemap-*.pmtiles` filename, so redeploy it after every archive bump (§ Uploading). The
nginx `location`s above (`/bikenetkit-map-style.json` and `/fonts/`) serve both with
`Access-Control-Allow-Origin: *`.

Verify cross-origin reachability:

```sh
curl -sI -H 'Origin: https://docs.bikenetkit.org' https://tiles.bikenetkit.org/bikenetkit-map-style.json
curl -sI https://tiles.bikenetkit.org/fonts/maplibre/Public%20Sans%20Regular/0-255.pbf
# expect: 200, Access-Control-Allow-Origin: *
```

## Verifying

**The archive**, before it goes anywhere (`basemap-YYYYMMDD.pmtiles` is the file
`pnpm basemap:build` wrote):

```sh
# expect max zoom 15, clustered: true, and the planetiler:* metadata intact. Bounds read back as
# the region envelope (-31.4,27.5,40,72 — Europe plus the archipelagos), or slightly wider still:
# `pmtiles extract` rounds out to whole tiles. Neither means a bad build.
# The archive is Protomaps' output verbatim, so every source-layer is present —
# `pois` included. That is correct; see "Why we do not strip unused layers" above.
pmtiles show   "$BASEMAP_WORK_DIR/basemap-YYYYMMDD.pmtiles"
pmtiles verify "$BASEMAP_WORK_DIR/basemap-YYYYMMDD.pmtiles"
```

**Visually**, without uploading anything: serve the work directory locally and point the app at
it.

```sh
npx --yes http-server "$BASEMAP_WORK_DIR" -p 8081 --cors   # serves byte ranges
# www/.env: PUBLIC_BASEMAP_URL=http://localhost:8081/basemap-YYYYMMDD.pmtiles
pnpm dev
```

Check an interactive tool map and the landing page. Those cover both map renderers: `MapHost`,
which every tool map, embed and screenshot mounts, and the landing page's `AmbientMapPane`. Zoom
to 17 in a city centre and confirm buildings, minor roads and labels are there. Check Athens and
Kyiv too: their labels depend on the Noto fallback glyphs baked in by `pnpm build:glyphs`.

**The server**: byte ranges and CORS on the served archive.

```sh
curl -sI -r 0-16383 https://tiles.bikenetkit.org/basemap-YYYYMMDD.pmtiles
# expect: 206 Partial Content, Access-Control-Allow-Origin: *, no Content-Encoding
```

On a new server that has no certificate yet, add `--resolve tiles.bikenetkit.org:80:<SERVER_IP>`
and use `http://`. Once certbot has run, port 80 only redirects.

**Nothing external in the build**: after `pnpm build`, run `pnpm check:build-output`. It fails if
the built site names any third-party origin it would load from at runtime.

## Attribution

The style carries `© OpenStreetMap contributors | Protomaps`, linked to
`https://www.openstreetmap.org/copyright` and `https://protomaps.com`, the same credit the app's
own style shows ([src/lib/map-style/style.js](src/lib/map-style/style.js)). Self-hosting does not
change the obligation: OSM data is ODbL, and the attribution must stay visible on every map.

## Self-hosted media (intro video)

The colour-graded intro video is served the same self-hosted way as the tiles, as a static MP4
under the tiles vhost (the `/media/` location in § nginx), so no third-party player
(YouTube/Vimeo) sits in the runtime path. The landing page reads its URL from `PUBLIC_VIDEO_URL`;
when that is unset the page falls back to a poster placeholder, so the site still builds without
the asset.

Of the intro video, **only the WebVTT captions are committed**
(`www/static/media/bikenetkit-intro.en.vtt`, a few KB, same-origin with the page). The MP4 is large
and lives outside the repository, in the directory `MEDIA_SRC_DIR` in `www/.env` names; the
maintainers hold the source files.

**Encode** the editor's delivery (`<source.mp4>`) to a web-delivery MP4 (H.264 High, ~1080p,
faststart for progressive streaming, keep audio):

```sh
# 1080p (default rendition)
ffmpeg -i <source.mp4> \
  -c:v libx264 -profile:v high -crf 20 -preset slow -vf "scale=-2:1080" \
  -c:a aac -b:a 128k -movflags +faststart \
  bikenetkit-intro.mp4
# Drop to -crf 18 if the accepted moiré around 1:20 visibly worsens.

# 720p (served to narrow viewports)
ffmpeg -i <source.mp4> \
  -c:v libx264 -profile:v high -crf 21 -preset slow -vf "scale=-2:720" \
  -c:a aac -b:a 128k -movflags +faststart \
  bikenetkit-intro-720p.mp4
```

The landing page picks the rendition by viewport with `matchMedia('(max-width: 767px)')` (see
`ProblemSolutionExplainer.svelte`): the 720p file is derived from `PUBLIC_VIDEO_URL` by swapping
`.mp4` → `-720p.mp4`, so both must sit in the same media directory. `pnpm deploy:media` uploads
both.

**Convert** the delivered SRT to WebVTT (native `<track>` only reads VTT): prepend a `WEBVTT`
header and change `,` to `.` in the timestamps (`ffmpeg -i subs.srt bikenetkit-intro.en.vtt` also
works).

**Upload** both renditions to `DEPLOY_MEDIA_PATH` (`~/bikenetkit/tiles/media/`, under the tiles
directory so a site deploy never touches it):

```sh
pnpm deploy:media -- --dry-run
pnpm deploy:media
# then confirm PUBLIC_VIDEO_URL resolves:
#   https://tiles.bikenetkit.org/media/bikenetkit-intro.mp4
```
