# BikeNetKit — repo guide for coding agents

## Project

Showroom website for the **BikeNetKit family of bicycle-network tools** (`bikenetkit.org`), with
interactive visualizations for the ones that have them. Audience: policy makers, sustainable-mobility
advocates, and city/transport planners. **Long-term-stable design goal** — the site must keep
working without updates for years, so it is built on stable technologies and relies on no external
runtime service. Treat that as a hard constraint, not an aspiration: no new runtime dependency on a
third-party origin may enter the build.

See [README.md](README.md) for what the project is and [www/README.md](www/README.md) for how to run it.

## Branches

| Branch     | Means                                                                | Deploys to            |
| ---------- | -------------------------------------------------------------------- | --------------------- |
| **`dev`**  | Work in progress; the integration branch. Target pull requests here. | The preview host      |
| **`main`** | What is live on `bikenetkit.org` right now.                          | The production server |

`main` is a record of what is deployed, not a second development branch — it moves when the site is
published, and only then. Going live is `dev` → `main` → deploy, in that order.

## Layout

- `www/` — the SvelteKit application (everything else lives here).
- [www/DESIGN.md](www/DESIGN.md) — visual system spec for AI agents. Read before generating UI.

## Key files

- [www/src/routes/layout.css](www/src/routes/layout.css) — **single source of truth** for design tokens (`@theme` block, fonts, custom CSS classes for hero/tool grids).
- [www/src/lib/colors.js](www/src/lib/colors.js) — hex constants for MapLibre paint generation (JS side).
- [www/src/lib/components/](www/src/lib/components/) — all reusable UI; landing-page parts under `landing/`.
- [www/src/lib/data/tools.ts](www/src/lib/data/tools.ts) — tool catalog driving sidebar and showcase.
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

- **Semantic color tokens only** in templates (`bg-brand`, `text-ink`, `border-brand-subtle`). Raw hex only in `$lib/colors.js`.
- Global styles live **exclusively** in `www/src/routes/layout.css`. There is no `app.css`.
- Routes inside `(app)/` get the sidebar layout; routes outside (`/`, `/design`) don't.
- Static screenshots are generated under `www/src/routes/screenshot/` via the Playwright config in `playwright.screenshots.config.js`.
- Atomic commits with clear messages; project follows existing prefixes (`feat:`, `fix:`, `chore:` etc.).
- Bumping `www/package.json` belongs to a release, not to a feature.
- User-facing copy is **American English** (`en-US`): spelling (color, neighborhood, kilometer,
  license, prioritize), dates (`Oct 6, 2026`, `October 6, 2026`) and 12-hour times
  (`2:32 PM UTC`). Published titles and license names stay as issued. Numbers keep their
  existing style (`1,234.5`, compact `254k` / `1.9m`), and metric values are plain decimals,
  never SI prefixes (`0.00015`, not `150µ`).

## Common commands (run from `www/`)

```
pnpm dev                      # vite dev server
pnpm build                    # static build (adapter-static)
pnpm preview                  # preview the build
pnpm lint                     # prettier + eslint
pnpm check                    # svelte-kit sync + svelte-check (type-checks .svelte too — see below)
pnpm check:hulls              # superblock hull geometry vs. the committed baseline (needs www/data/)
pnpm check:coverage           # city x tool: is anything recommended or featured that has no data? (run after update-data)
pnpm check:datasets           # zero-feature or misplaced-geometry datasets? (needs www/data/)
pnpm check:links              # every outbound paper/repo/docs URL still resolves
pnpm check:og-cards           # does every per-city OG card the manifest lists exist? (run after update-data)
pnpm check:search             # is every city findable by the spellings a reader types? (run after update-data)
pnpm check:map-tables         # the "View as table" builders over real data: no NaN cells, sane tables (needs www/data/)
pnpm check:a11y               # axe on every route family, aria snapshots, keyboard walks (reuses a running server)
pnpm check:build-output       # no third-party asset origin, and pages prerender with real content (needs a build)
pnpm check:privacy            # does the server match what /legal#privacy claims? (read-only SSH)
pnpm check:headers            # security + cache headers, site/tiles/data (no SSH; -- --base: preview)
pnpm format                   # prettier --write .
pnpm generate:screenshots     # regenerate per-variant images
pnpm generate:og              # regenerate the Open Graph cards -> static/og
pnpm generate:og-cards        # per-city OG cards -> www/screenshots/og + og-cards.json (dev server is fine)
pnpm generate:gif             # animated build-up GIF -> static/media (needs ffmpeg)
pnpm generate:video           # one 4K build-up video -> www/exports (gitignored, needs ffmpeg)
pnpm generate:videos          # the 4K videos for both target cities (copenhagen, podgorica)
pnpm generate:tutorial-thumbs # each tool's YouTube tutorial still -> src/lib/assets/media/tutorials (commit it)
pnpm update-data              # transform the pulled export into www/data + src/lib/data
pnpm pull-data                # rsync latest exports from the server, run update-data, then both imports below
pnpm pull-screenshots         # rsync the server's screenshots + OG cards into www/screenshots (fresh checkout; additive)
pnpm import:context           # rail stations + schools (OSM extract) -> www/data/context + manifest (run by pull-data)
pnpm import:contacts          # "Take action!" links (contact research + cycling orgs) -> contact-links.json (run by pull-data)
pnpm deploy:site              # build, then rsync build/ to the server (NOT `pnpm deploy` — pnpm builtin)
pnpm deploy:placeholder       # same, building the "coming soon" page into the placeholder dir
pnpm deploy:preview           # same, to the dir the password-gated preview vhost serves (staging)
pnpm deploy:data              # rsync www/data/ (off-repo GeoJSON) to the server's data dir
pnpm compress:data            # (re)build the .gz/.br siblings on the server, for gzip/brotli_static
pnpm basemap:build            # build the self-hosted basemap archive (dry run; -- --run to execute)
pnpm deploy:basemap           # rsync the basemap archive to the server's tiles dir
```

**`pnpm check` type-checks `.svelte` components too.** `jsconfig.json` sets `checkJs: true` (with
`noImplicitAny: false`, so untyped callback params are allowed but structural checks run).
Components are plain JS with no `lang="ts"`; props and state carry JSDoc types where the checker
needs them, so a renamed prop, a renamed `data.*` field or a wrong argument count fails
`pnpm check`. Stale Tailwind class names are not checked. Hand-built MapLibre paint, layout and
filter expressions that the strict spec union can't verify get a localized cast or a single-line
`// @ts-expect-error`, never a file-wide `@ts-nocheck`.

**`pnpm test` is a smoke suite, and it reuses a server that is already running.** `www/tests/*.e2e.ts`
covers every top-level route, each tool's default map, the degraded states, and navigation — around
30 checks in under half a minute. `playwright.config.js` sets `reuseExistingServer`, so a
`pnpm dev` or `pnpm preview` already on the port is used as-is and only a cold run pays for a build;
`PW_BASE_URL` points it elsewhere. Run it against dev while working:

```
pnpm dev &                                     # or pnpm preview
PW_BASE_URL=http://localhost:5173 pnpm test
```

It asserts on app state and the DOM, never on canvas pixels — per-dataset rendering is covered
exhaustively and separately by `pnpm generate:screenshots` and `pnpm check:hulls`. Two traps are
worth knowing before adding cases: the notice headings are `uppercase` in CSS, so match their text
case-insensitively or the assertion silently passes against a broken page; and routing `**/data/**`
to simulate a dead data host also catches Vite's own `/src/lib/data/…` modules on a dev server —
match on the pathname instead.

**Builds are slow.** `pnpm build` takes a long time — use `pnpm dev` to verify changes whenever
possible. Only run a full build when a dev server clearly can't verify the change, and ask before
running it.

## Data

**`www/data/` is off-repo (gitignored), served from `data.bikenetkit.org`.** It is several GB, and it
sits _outside_ `static/` so Vite's public-dir copy never duplicates it into `build/`. **The build
never reads it.** Datasets are enumerated from the committed `src/lib/data/data-files.json` manifest
(written by `update-data`, parsed by `src/lib/data/datasets.ts`), and the map pages fetch their
GeoJSON in the browser via `PUBLIC_DATA_URL`, not at prerender. So `pnpm build` needs neither the
files on disk nor a reachable data host, and a clean clone builds the identical set of pages. Dev
and preview serve `/data` and `/screenshots` from the sibling dirs via the `offRepoData` plugin in
`vite.config.js`, so local work stays offline-capable. Full details:
[www/DEPLOY_DATA.md](www/DEPLOY_DATA.md).

**Tool exports are normalized by the importer.** Each tool ships its results as GeoJSON in an export
on the server; `pnpm pull-data` fetches it and `pnpm update-data` maps every tool's own layer names
onto the app's `<cityid>-<metric>-<type>[-<variant>]` contract, writing `www/data/` and the
committed manifests in `src/lib/data/`. What an export must look like is in
[www/DATA_CONTRACT.md](www/DATA_CONTRACT.md). When a new export breaks, expect the naming to be the
cause, not the geometry. The importer matches known spellings rather than assuming one, and it
fails the run on the problems it can detect (a misplaced city, a baseline its step data doesn't
cover) rather than shipping a quietly wrong map.

**Not everything comes from the tool exports.** Rail stations and schools (`pnpm import:context`) and
the "Take action!" links (`pnpm import:contacts`) are separate inputs; `pull-data` runs both.

**After refreshing the data,** run `pnpm check:coverage` (is anything recommended or featured that
has no data?) and `pnpm check:datasets` (is anything listed that has no features, or is somewhere
else?), then `pnpm deploy:data`, and commit the regenerated `*.json`. Changes to the shape of the
data, a new tool, or a new route axis (`[metric]`/`[type]`/`[variant]`) multiply the prerendered
route set and the screenshot matrix, so agree them with the maintainer first; see
[ADD_A_TOOL.md](ADD_A_TOOL.md).

## When making visual changes

Follow [www/DESIGN.md](www/DESIGN.md). When in doubt, open `/design` in the dev server to see
the live tokens and components.
