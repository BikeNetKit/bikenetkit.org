# BikeNetKit — repo guide for coding agents

## Project

Showroom website for the **BikeNetKit family of bicycle-network tools** (`bikenetkit.org`), with
interactive visualisations for the ones that have them. Audience: policy makers, sustainable-mobility
advocates, and city/transport planners. **Long-term-stable design goal** — the site must keep
working without updates for years, so it is built on stable technologies and relies on no external
runtime service. Treat that as a hard constraint, not an aspiration: no new runtime dependency on a
third-party origin may enter the build. What that rules out and how it is checked:
[www/README.md § No external runtime dependencies](www/README.md#no-external-runtime-dependencies).

See [README.md](README.md) for what the project is and [www/README.md](www/README.md) for how to run it.

## Branches

| Branch     | Means                                                                | How it reaches a server                       |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------- |
| **`dev`**  | Work in progress; the integration branch. Target pull requests here. | Staged by maintainers (`pnpm deploy:preview`) |
| **`main`** | What is live on `bikenetkit.org` right now.                          | Published by maintainers (`pnpm deploy:site`) |

`main` is a record of what is deployed, not a second development branch — it moves when the site is
published, and only then. Going live is `dev` → `main` → deploy, in that order; the full release
flow is in [OPERATIONS.md § Deploying](OPERATIONS.md#deploying).

## Layout

- `www/` — the SvelteKit application (everything else lives here).
- [www/DESIGN.md](www/DESIGN.md) — visual system spec for AI agents. Read before generating UI.
  The build also serves it verbatim at `/DESIGN.md` (`src/routes/DESIGN.md/+server.ts`).

## Key files

- [www/src/routes/layout.css](www/src/routes/layout.css) — **single source of truth** for design tokens (`@theme` block, fonts, custom CSS classes for hero/tool grids).
- [www/src/lib/colors.js](www/src/lib/colors.js) — hex constants for MapLibre paint generation (JS side).
- [www/src/lib/components/](www/src/lib/components/) — all reusable UI; landing-page parts under `landing/`.
- [www/src/lib/data/tools.json](www/src/lib/data/tools.json) — the tool catalogue driving sidebar and showcase, typed by `types.ts` and loaded through `tools.ts`.
- [www/src/routes/(app)/+layout.svelte](<www/src/routes/(app)/+layout.svelte>) — sidebar nav layout for tool/city pages.
- [www/src/routes/design/+page.svelte](www/src/routes/design/+page.svelte) — hidden design-system reference page (live companion to `DESIGN.md`).
- [www/DEPLOY_TILES.md](www/DEPLOY_TILES.md) — self-hosted basemap: what the archive contains, how to rebuild, upload, and serve it.
- [www/DEPLOY_NGINX.md](www/DEPLOY_NGINX.md) — serving the static site with nginx (vhost, clean URLs, 404, TLS, security headers).
- [www/DEPLOY_STATS.md](www/DEPLOY_STATS.md) — cookieless visitor stats via GoAccess log analysis (no client JS, no consent banner).
- [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md) — what a tool export must look like for the site to import it.
- [www/DEPLOY_DATA.md](www/DEPLOY_DATA.md) — off-repo GeoJSON data (`data.bikenetkit.org`): how the manifest + `PUBLIC_DATA_URL` decouple the build, how to upload and serve it.

## Stack

- SvelteKit + Svelte 5 (runes — `$props`, `$state`, `$derived`).
- Tailwind CSS v4 via `@theme` in `layout.css`. **No `tailwind.config.js`.**
- Plugins: `@tailwindcss/forms`, `@tailwindcss/typography`.
- MapLibre GL (+ `svelte-maplibre-gl`), `bits-ui`.
- Package manager: **pnpm**.

## Conventions

- **Semantic colour tokens only** in templates (`bg-brand`, `text-ink`, `border-brand-subtle`). Raw hex only in `$lib/colors.js` (and the basemap palette in `$lib/map-style/theme.js`).
- Global styles live **exclusively** in `www/src/routes/layout.css`. There is no `app.css`.
- Routes inside `(app)/` get the sidebar layout; routes outside (`/`, `/design`) don't.
- Static screenshots are rendered by `www/src/routes/screenshot/[tool]/[city]/` and captured into
  `www/screenshots/` by `playwright.screenshots.config.js`; which combinations get captured is
  defined in `www/tests/export-matrix.ts`.
- Atomic commits with clear messages; project follows existing prefixes (`feat:`, `fix:`, `chore:` etc.).
- Bumping `www/package.json` belongs to a release, not to a feature.
- **Site copy is American English (`en-US`).** This covers everything a visitor reads on the site
  (templates, `tools.json`, page metadata), not the repository's docs, which use British spelling.
  In site copy: spelling (color, neighborhood, kilometer, license, prioritize), dates
  (`Oct 6, 2026`, `October 6, 2026`) and 12-hour times (`2:32 PM UTC`). Published titles and
  licence names stay as issued. Numbers keep their existing style (`1,234.5`, compact `254k` /
  `1.9m`), and metric values are plain decimals, never SI prefixes (`0.00015`, not `150µ`).

## Common commands (run from `www/`)

Anyone can run these with a clone, `www/.env` and the display font:

```sh
pnpm dev                      # vite dev server on :5173
pnpm build                    # static build (adapter-static) into build/; slow, see below
pnpm preview                  # serve build/ on :4173
pnpm lint                     # fonts:check, then prettier --check + eslint
pnpm format                   # prettier --write .
pnpm check                    # svelte-kit sync + svelte-check (type-checks .svelte too — see below)
pnpm test                     # Playwright smoke suite against PW_BASE_URL (default :4173 — see below)
pnpm check:a11y               # axe on every route family, aria snapshots, keyboard walks (same server as test)
pnpm check:build-output       # no third-party asset origin, and pages prerender with real content (needs a build)
pnpm check:links              # every outbound paper/repo/docs URL still resolves
pnpm check:search             # is every city findable by the spellings a reader types?
pnpm check:coverage           # city x tool: is anything recommended or featured that has no data?
pnpm check:headers            # security + cache headers on the live site, tiles and data hosts (-- --base <url>: another host)
pnpm fonts:check              # is Bespoke Sans in static/fonts/? (warns; dev, build and lint run it too)
pnpm generate:og              # regenerate the per-tool Open Graph cards -> static/og
pnpm generate:gif             # animated build-up GIF -> static/media (needs ffmpeg)
pnpm generate:video           # one 4K build-up video -> www/exports (gitignored, needs ffmpeg)
pnpm generate:videos          # the 4K videos for Copenhagen and Podgorica
pnpm generate:hero-clips      # 20 per-city hero clips, 1080p60 ProRes + H.264 -> www/exports/hero-clips (needs ffmpeg)
pnpm generate:tutorial-thumbs # each tool's YouTube tutorial still -> src/lib/assets/media/tutorials (commit it)
pnpm build:glyphs             # merge Noto Sans into the MapLibre glyph stacks in static/fonts/maplibre
pnpm build:geo                # regenerate the landing-page land and border geometry in src/lib/data
pnpm build:mapstyle           # write the published map style -> static/bikenetkit-map-style.json
```

Maintainers only: these need SSH to the server, or the `www/data/` and `www/screenshots/` it fills:

```sh
pnpm pull-data                # rsync the latest export from the server, run update-data, then both imports below
pnpm update-data              # transform the pulled export (at DATA_PULL_ROOT) into www/data + src/lib/data
pnpm import:context           # rail stations + schools -> www/data/context + manifest (run by pull-data)
pnpm import:contacts          # "Take action!" links -> contact-links.json (run by pull-data)
pnpm pull-screenshots         # rsync the server's screenshots + OG cards into www/screenshots (additive)
pnpm check:datasets           # zero-feature or misplaced-geometry datasets? (needs www/data/)
pnpm check:hulls              # superblock hull geometry vs. the committed baseline (needs www/data/)
pnpm check:map-tables         # the "View as table" builders over real data: no NaN cells, sane tables (needs www/data/)
pnpm check:og-cards           # does every per-city OG card the manifest lists exist in www/screenshots/og?
pnpm check:privacy            # does the server match what /legal#privacy claims? (read-only SSH)
pnpm generate:screenshots     # per-variant map images -> www/screenshots (against a preview build, never dev)
pnpm generate:og-cards        # per-city OG cards -> www/screenshots/og + og-cards.json (needs a running pnpm dev)
pnpm deploy:preview           # build, then rsync build/ to the dir the preview host serves
pnpm deploy:site              # build, then rsync build/ to the production dir (NOT `pnpm deploy` — pnpm builtin)
pnpm deploy:placeholder       # same, building the "coming soon" page into the placeholder dir
pnpm deploy:data              # rsync www/data/ (off-repo GeoJSON) to the server's data dir
pnpm compress:data            # (re)build the .gz/.br siblings on the server, for gzip/brotli_static
pnpm deploy:mapstyle          # build:mapstyle, then upload the style + glyphs to the tiles host
pnpm deploy:media             # upload the intro video renditions to the tiles host's media dir
pnpm basemap:build            # build the self-hosted basemap archive (dry run; -- --run to execute)
pnpm deploy:basemap           # rsync the basemap archive to the server's tiles dir
```

**`pnpm check` type-checks `.svelte` components too.** `jsconfig.json` sets `checkJs: true` (with
`noImplicitAny: false`, so untyped callback params are allowed but structural checks run).
Components are plain JS with no `lang="ts"`; props and state carry JSDoc types where the checker
needs them, so a renamed prop, a renamed `data.*` field or a wrong argument count fails
`pnpm check`. Stale Tailwind class names are not checked. Hand-built MapLibre paint, layout and
filter expressions that the strict spec union can't verify get a localised cast or a single-line
`// @ts-expect-error`, never a file-wide `@ts-nocheck`.

**`pnpm test` reuses whatever answers at `PW_BASE_URL`**, which defaults to `http://localhost:4173`
(`pnpm preview`); only when nothing answers does it build and start a preview, which is slow. To
run it against a dev server, say so: `PW_BASE_URL=http://localhost:5173 pnpm test`. It asserts on
app state and the DOM, never on canvas pixels; per-dataset rendering is covered separately by
`pnpm generate:screenshots` and `pnpm check:hulls`. Two traps are worth knowing before adding
cases: the notice headings are `uppercase` in CSS, so match their text case-insensitively or the
assertion silently passes against a broken page; and routing `**/data/**` to simulate a dead data
host also catches Vite's own `/src/lib/data/…` modules on a dev server — match on the pathname
instead. Everything else about the suite: [CONTRIBUTING.md § Testing](CONTRIBUTING.md#testing).

**Builds are slow.** `pnpm build` takes a long time — use `pnpm dev` to verify changes whenever
possible. Only run a full build when a dev server clearly can't verify the change, and ask before
running it.

## Data

**`www/data/` is off-repo (gitignored), served from `data.bikenetkit.org`, and the build never reads
it.** Datasets are enumerated from the committed `src/lib/data/data-files.json` manifest (written by
`update-data`, parsed by `src/lib/data/datasets.ts`), and the map pages fetch their GeoJSON in the
browser via `PUBLIC_DATA_URL`. Dev and preview serve `/data` and `/screenshots` from the sibling
dirs via the `offRepoData` plugin in `vite.config.js`. Details:
[www/DEPLOY_DATA.md § The build is independent of the data](www/DEPLOY_DATA.md#the-build-is-independent-of-the-data).

**Tool exports are normalised by the importer.** `pnpm update-data` maps every tool's own layer
names onto the app's `<cityid>-<metric>-<type>[-<variant>]` contract (a cityid is the city slug,
e.g. `amsterdam_nl`), writing `www/data/` and the committed manifests in `src/lib/data/`. What an
export must look like is in [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md). When a new export breaks,
expect the naming to be the cause, not the geometry. The importer fails the run on the problems it
can detect (a misplaced city, a baseline its step data doesn't cover) rather than shipping a
quietly wrong map. Rail stations, schools and the "Take action!" links are separate inputs
(`pnpm import:context`, `pnpm import:contacts`), which `pull-data` runs too.

**Refreshing the data** is a maintainer runbook:
[README.md § For maintainers: updating the data](README.md#for-maintainers-updating-the-data).
Changes to the shape of the data, a new tool, or a new route axis (`[metric]`/`[type]`/`[variant]`)
multiply the prerendered route set and the screenshot matrix, so open an issue first; see
[ADD_A_TOOL.md](ADD_A_TOOL.md).

## When making visual changes

Follow [www/DESIGN.md](www/DESIGN.md). When in doubt, open `/design` in the dev server to see
the live tokens and components.
