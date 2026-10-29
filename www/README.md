# www

Website for [BikeNetKit](https://bikenetkit.org), a showroom for the BikeNetKit family of
bicycle-network tools, with interactive maps for five of them. See [../README.md](../README.md) for
what the project is.

![GrowBikeNet growing a bicycle network for Paris from a rail seed, ranked by betweenness centrality](static/media/growbikenet-paris.gif)

## Stack

- [SvelteKit 2](https://svelte.dev/docs/kit) + [Svelte 5](https://svelte.dev/) (runes)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [MapLibre GL](https://maplibre.org/) via [svelte-maplibre-gl](https://github.com/MIERUNE/svelte-maplibre-gl)
- [`@sveltejs/adapter-static`](https://svelte.dev/docs/kit/adapter-static) (fully static build, deploys without a Node runtime)
- [pnpm](https://pnpm.io/)

## Getting started

```sh
cp .env.example .env     # required: PUBLIC_* vars are statically imported
pnpm install
pnpm dev
```

Without `.env`, `pnpm build` fails with `"PUBLIC_BASEMAP_URL" is not exported by
"$env/static/public"`. The example values are enough to build and browse; none of them is secret.
A clean clone with them copied builds the full site in about a minute, needing no data on disk and
no reachable data host.

## Fonts

All of the type ships in the repo **except Bespoke Sans, the display face**. Its licence
([ITF FFL](https://www.fontshare.com/licenses/itf-ffl)) permits self-hosting it for this site but
not putting it on a publicly accessible repository, so you need your own copy: download
`BespokeSans_Complete.zip` from <https://www.fontshare.com/fonts/bespoke-sans> and unzip into
`static/fonts/`, where `.gitignore` keeps it out of commits. The zip's folder
names already match the `@font-face` rules in [src/routes/layout.css](src/routes/layout.css), and
you only need the two `.woff2` variables, `BespokeSans-BoldItalic.woff`, and `License/FFL.txt`. **Do
not subset or convert them**, since § 02 of the licence forbids both. `pnpm fonts:check` runs on
`dev`, `build` and `lint` and tells you exactly this when a file is missing.

The other families are all [SIL OFL](https://openfontlicense.org/) and are committed: Public Sans,
IBM Plex Mono, and the Noto Sans sources under [scripts/glyph-src/](scripts/glyph-src/) that
`pnpm build:glyphs` merges into the MapLibre glyph stacks.

## Scripts

| Script                      | Description                                  |
| --------------------------- | -------------------------------------------- |
| `pnpm dev`                  | Start Vite dev server                        |
| `pnpm build`                | Build static site to `build/`                |
| `pnpm preview`              | Preview the production build                 |
| `pnpm lint`                 | Run Prettier check + ESLint                  |
| `pnpm format`               | Apply Prettier formatting                    |
| `pnpm test`                 | Run Playwright end-to-end tests              |
| `pnpm check:search`         | Audit city search against typeable spellings |
| `pnpm check:a11y`           | Accessibility: axe, aria snapshots, keyboard |
| `pnpm pull-screenshots`     | Fetch the data host's screenshots (additive) |
| `pnpm generate:screenshots` | Capture reference screenshots via Playwright |
| `pnpm generate:og-cards`    | Capture the per-city Open Graph cards        |
| `pnpm check:og-cards`       | Every listed per-city card exists on disk    |
| `pnpm generate:gif`         | Capture the animated build-up GIF (ffmpeg)   |
| `pnpm generate:video`       | Render one 4K build-up video (ffmpeg)        |
| `pnpm generate:videos`      | Render the 4K videos for both target cities  |
| `pnpm update-data`          | Sync data assets (see [scripts/](scripts/))  |
| `pnpm basemap:build`        | Build the self-hosted basemap archive        |
| `pnpm deploy:basemap`       | Upload the basemap archive to the server     |

## No external runtime dependencies

The site should keep working for a long time without maintenance, so **nothing may load from a
third-party origin at runtime**: no CDN scripts, fonts, tiles, or iframes. The basemap is
self-hosted ([DEPLOY_TILES.md](DEPLOY_TILES.md)); fonts and glyphs are served from `static/`.

Treat this as a standing invariant. It is checked by a command rather than by eye:

```sh
pnpm build
pnpm check:build-output
```

`scripts/check-build-output.mjs` walks the built HTML and bundle for external origins and fails on
any it does not recognise, holding two explicit lists: hosts that may serve **assets** (ours), and
hosts that may appear as **human-facing links** (papers, repos, socials — not fetched, so they
cannot break the site). Adding to either list is a deliberate act; do it in a commit that says why.
The same run also checks that prerendered pages carry real text, not an empty shell.

The definitive check is still what the browser actually requests:

```sh
pnpm preview   # then, against the running preview:
```

```js
page.on('request', (r) => console.log(new URL(r.url()).hostname));
```

Only the site's own origin, `tiles.bikenetkit.org` and `data.bikenetkit.org` should be contacted.
Two entries the script allows are _not_ runtime dependencies, and the reasons are worth keeping:

- `unpkg.com`, because `svelte-maplibre-gl` will inject a `<link>` to MapLibre's CSS from unpkg
  unless told not to. Every `<MapLibre>` in this repo passes `autoloadGlobalCss={false}`, and the
  CSS is imported in [src/routes/layout.css](src/routes/layout.css) instead. The string survives in
  the bundle as dead code. **Any new `<MapLibre>` must pass that prop.**
- `protomaps.com` and `openstreetmap.org`, which are attribution links in the map control.

## Structure

```
src/
  app.html
  routes/
    +layout.svelte
    +page.svelte                  # root showroom page
    (app)/
      more-tools/                 # static tools, one page, anchored sections
      (tools)/
        growbikenet/              # interactive viz
    screenshot/                   # screenshot route for generators
    og/                           # social-card routes for generators (per tool, per city)
    animation/                    # chrome-free build-up route for the GIF and video exports
  lib/
    components/                   # shared UI
    data/                         # static datasets + loaders
    map-style/                    # MapLibre style fragments
    assets/                       # images, fonts, icons
    colors.js
scripts/                          # data sync + tooling
static/                           # files served as-is
```

## Animated exports

`/animation/[tool]/[city]` is a chrome-free render of an ordered build-up, with no legend, HUD,
playback bar or nav control. Two Playwright drivers step it frame by frame (each frame waits for
MapLibre's `idle`) and hand the frames to ffmpeg; shared plumbing lives in
[scripts/capture-common.mjs](scripts/capture-common.mjs).

| Query param                   | Default  | Effect                                           |
| ----------------------------- | -------- | ------------------------------------------------ |
| `size`                        | `800`    | Square shorthand, sets both `width` and `height` |
| `width`                       | `size`   | Frame width in **CSS** px                        |
| `height`                      | `size`   | Frame height in **CSS** px                       |
| `labels`                      | `1`      | `0` hides every basemap symbol layer             |
| `attribution`                 | `1`      | `0` removes the MapLibre attribution control     |
| `padding`                     | `40`     | `fitBounds` padding in CSS px                    |
| `weight`                      | `1`      | Multiplies line widths and the seed-dot radius   |
| `seeds`                       | `1`      | `0` hides the seed dots                          |
| `metric` / `type` / `variant` | per tool | Which dataset to load                            |

`pnpm generate:gif` writes an 800×800 GIF to `static/media/`. Its unchanged defaults are paris,
betweenness / rail / default, labels on.

`pnpm generate:video` writes 3840×2160 H.264 to the gitignored `exports/`. Its defaults are
growbikenet / copenhagen / betweenness_centrality / grid / with-bikenw, labels **off**, attribution
**off**. `pnpm generate:videos` renders both target cities (Copenhagen and Podgorica).

```
pnpm generate:video --city podgorica
pnpm generate:video --city podgorica --per-step --no-seeds   # one frame per build step, no seed dots
pnpm generate:video --city paris --type rail --variant default --labels
pnpm generate:video --codec prores --duration 30 --fps 60
pnpm generate:video --width 960 --height 540 --scale 1 --duration 4   # fast smoke test
```

Length is `--duration` × `--fps` by default, so the frame count is independent of how many build
steps the dataset has: Copenhagen's 1202 steps get subsampled, Podgorica's 173 get held for several
frames each. `--per-step` overrides that with exactly one frame per step, and the run then lasts
`steps / fps` seconds (Podgorica: 174 frames ≈ 5.8 s at 30 fps, plus the `--hold` tail).

Three things to know before changing it:

- Resolution comes from `--scale`, and not from a bigger viewport. MapLibre sizes line widths in CSS
  pixels, so a 3840-wide viewport fits the same bounds ~2.3 zoom stops higher and renders the
  network as hairlines. 1920×1080 at `deviceScaleFactor: 2` gives a true 3840×2160 backing store at
  the designed weights. MapLibre's `maxCanvasSize` caps this at 4096²; the script refuses anything
  larger rather than let it be silently downscaled.
- Attribution is off in videos, and that is a licensing obligation rather than a free choice. The
  basemap is OSM/ODbL via Protomaps. Wherever a video is published the credit has to appear, in the
  edit, on an end card or in the description. `--attribution` puts it back in-frame.
- Don't edit files under `www/` during a run. Both drivers reuse a running `vite dev` server, and an
  HMR reload destroys the capture bridge mid-render. `generate-video.mjs` detects this and fails
  with a message; `--base-url` against a `pnpm preview` build avoids it entirely.

## License

The BikeNetKit code is licensed under the **GNU Affero General Public License v3.0**,
© 2026 Moritz Stefaner ([../LICENSE](../LICENSE)). Fonts: Public Sans, IBM Plex Mono and Noto Sans
are **SIL OFL**, bundled and committed, and their licence texts must be reproduced in the site's
licences block. Bespoke Sans is **ITF FFL**, self-hosted, not committed, and requires no attribution;
see [§ Fonts](#fonts) for where to get it. Map data is
© OpenStreetMap contributors (ODbL) with Protomaps basemap tiles, credited in the map UI and in
[DEPLOY_TILES.md](DEPLOY_TILES.md).

## Related docs

| Document                                 | Covers                                       |
| ---------------------------------------- | -------------------------------------------- |
| [DESIGN.md](DESIGN.md)                   | Visual spec and design tokens                |
| [DATA_CONTRACT.md](DATA_CONTRACT.md)     | What the importer expects from a tool export |
| [DEPLOY_NGINX.md](DEPLOY_NGINX.md)       | Serving the site                             |
| [DEPLOY_TILES.md](DEPLOY_TILES.md)       | Building and serving the self-hosted basemap |
| [DEPLOY_DATA.md](DEPLOY_DATA.md)         | The off-repo GeoJSON host                    |
| [DEPLOY_STATS.md](DEPLOY_STATS.md)       | Cookieless visitor stats                     |
| [../OPERATIONS.md](../OPERATIONS.md)     | Server layout, deploys, TLS, triage          |
| [../EDIT_CONTENT.md](../EDIT_CONTENT.md) | Changing the text, without touching the data |
| [../ADD_A_CITY.md](../ADD_A_CITY.md)     | Adding a city to the catalogue               |
| [../ADD_A_TOOL.md](../ADD_A_TOOL.md)     | Adding a tool                                |
