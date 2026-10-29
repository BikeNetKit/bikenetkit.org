# Adding a tool

Tools reach the site in one of two shapes, and picking the wrong one is the expensive mistake here.

| Aspect | **Static** | **Interactive** |
| --- | --- | --- |
| Where | A section on `/more-tools` | A tool page under `(app)/(tools)/(interactive)/<slug>/` and map pages under `(app)/(map)/<slug>/` |
| Needs | Description, links, optionally a figure | Per-city exported results for every city it claims |
| Cost | An entry in `tools.json` | That, plus a render config, plus the data pipeline |

**Choose static unless the tool has per-city results worth exploring on a map.** Most tools in the
catalogue are static, and that is not a lesser status: a tool with one result, or one whose output
is a figure rather than a geography, reads better as a section than as an empty map.

A new interactive tool multiplies the prerendered pages and the screenshots, so it needs a
decision from the maintainers before any work starts. Open an issue first.

## The catalogue entry

Everything starts in [www/src/lib/data/tools.json](www/src/lib/data/tools.json), typed by
[types.ts](www/src/lib/data/types.ts). Start a new entry from the organisation's catalogue at
[BikeNetKit/.github `meta/tools.json`](https://github.com/BikeNetKit/.github/blob/main/meta/tools.json),
which carries the identity, links, `config`, `renderConfig` and `external`. Nothing syncs the two
files, and the site's descriptions have been edited for the site, so expect their wording to differ.

```jsonc
{
  "name": "ExampleBikeNet",
  "slug": "examplebikenet",
  "shortDescription": "One sentence. Used in meta descriptions and on the city pages.",
  "questionAnswered": "The question it answers, in a planner's words. Shown on the landing grid.",
  "longDescription": "A paragraph for the tool page.",
  "category": "interactive",        // or "static"
  "status": "active",               // or "coming-soon"
  "config": { "metrics": ["…"], "types": ["…"], "defaultMetric": "…", "defaultType": "…" },
  "renderConfig": { "lineWidthRange": [2, 4] },
  "repo": "https://github.com/BikeNetKit/ExampleBikeNet",
  "docs": "https://docs.bikenetkit.org/ExampleBikeNet/",
  "tutorial": "https://www.youtube.com/watch?v=…",   // optional
  "paper": { "title": "…", "authors": "…", "venue": "…", "year": 2026, "url": "…" },
  "usage": { "requirements": "Python>=3.12", "code": "…" }
}
```

`update-data` validates the file on every run: `name`, `slug`, `shortDescription`,
`questionAnswered`, `category` and `status` are required, and `tutorial` must be a
`https://www.youtube.com/watch?v=` URL. A tutorial also needs its thumbnail: run
`pnpm generate:tutorial-thumbs` and commit the image it writes to
`www/src/lib/assets/media/tutorials/`.

`name` is the plain string: write `SortBikeNet`, never `Sort Bike Net`. The site sets the logo's
word gap between the parts itself, splitting the camel case at render time
(`www/src/lib/utils/word-mark.js`, see [DESIGN.md](www/DESIGN.md) § The word gap in rendered names),
and the same string goes unchanged into the page title, the Open Graph card and the JSON-LD.

Three keys are the website's own and have no upstream equivalent. Do not expect them in the
organisation's file, and do not drop them when copying from it:

- **`questionAnswered`** (required): the question on the tool's landing card.
- **`tutorial`** (optional): the screencast linked from the tool page.
- **`nameParts`** (optional): `["Sort", "Bike", "Net"]`, only if the camel-case splitter gets a
  name wrong. No tool in the catalogue needs it.

`status: "coming-soon"` is the half-way state for an interactive tool: it appears on the landing
grid and in the sidebar without a link, and its data can ship, but no page links to it yet.
Switching it to `active` is what makes its pages reachable.

## For a static tool

Add the entry with `"category": "static"`, and it appears as an anchored section on `/more-tools`
automatically. Add it to [www/static/llms.txt](www/static/llms.txt). That is the whole job.

## For an interactive tool

### 1. The data

Results must match the importer's contract. [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md) is the
specification, and worth agreeing with the tool authors _before_ an export is generated rather than
normalising a surprise afterwards. Then teach `update-data` the tool's layer names, following the
per-tool `mirror…Dir()` functions in [www/scripts/update-data.mjs](www/scripts/update-data.mjs).
Importing needs SSH access to the server, so this step is the maintainers'.

```sh
pnpm update-data --tool <slug> --dry-run
pnpm update-data --tool <slug>
```

The transform writes `www/data/<slug>/` and adds the tool to `src/lib/data/data-files.json`. That
manifest is what the build reads: a preflight in [www/src/hooks.server.ts](www/src/hooks.server.ts)
fails the build, naming the tool, if an active interactive tool has no datasets in it.

### 2. The routes

An interactive tool has two route directories:

- **The tool page**, `src/routes/(app)/(tools)/(interactive)/<slug>/`: a `+page.svelte` with the
  tool's header and a city picker, and a `+page.server.ts` that marks it for prerendering.
- **The map pages**, `src/routes/(app)/(map)/<slug>/[city]/…`: one directory level per axis of the
  dataset (`[metric]/[type]`, plus `[variant]` for GrowBikeNet), and a `[city]/+page.ts` that
  redirects to the default view.

Copy the closest existing tool: `growbikenet` if the tool has an ordered build-up,
`superblockify` if it renders areas rather than lines. The shared map shell, playback, tooltips
and legend come from the layout, so a tool route is mostly configuration. Routes inside `(app)/`
get the sidebar; routes outside it, such as `/` and `/design`, do not.

### 3. Wire up the rest

The fastest way to find every place a tool is named is to list the files that name an existing
one:

```sh
git grep -l -i superblockify -- www/src www/scripts www/tests
```

The ones a new tool usually needs:

| Area | Files (under `www/`) |
| --- | --- |
| URLs and filenames | `src/lib/data/tool-paths.ts` (route axes ↔ dataset filenames), `src/lib/data/tool-redirect.ts`, `src/lib/data/datasets.ts` (only if its filenames break the usual pattern) |
| Copy | `src/lib/data/control-copy.ts` (map page intro, control labels), `src/lib/data/metric-meta.ts` (legend and tooltip labels, units), `src/lib/data/metric-help.ts` (the (?) popover), `static/llms.txt` |
| Drawing | `config` and `renderConfig` in `tools.json`, `src/lib/map-style/render-config.js`, `src/lib/colors.js`, `src/lib/data/metric-properties.ts`, `src/lib/data/dataset-layers.ts` |
| Tables and coverage | `src/lib/data/map-table/` (the "View as table" builders), `src/lib/data/coverage.ts` (the `/cities/table` columns), `src/lib/data/featured-cities.ts` |
| Recommendation flag | `CityRecommended` in `src/lib/data/types.ts`, `src/lib/data/recommended.ts`, and the column parser in `scripts/update-data.mjs` (if the export's `rec_table.csv` carries a column for the tool; otherwise `SITE_RECOMMENDED`, as for SortBikeNet) |
| Embeds, screenshots, cards | `src/routes/embed/[tool]/…` and `src/routes/screenshot/[tool]/[city]/` (per-tool layer props), `tests/export-matrix.ts` (which views get a screenshot), then `pnpm generate:screenshots`; `pnpm generate:og` for the tool card and `pnpm generate:og-cards` for the per-city cards |
| Checks | `scripts/check-coverage.mjs`, `scripts/screenshot-coverage.mjs`, `scripts/check-map-tables.mjs`, `scripts/check-build-output.mjs` |

`pnpm check:build-output` fails while an active interactive tool is missing from
`static/llms.txt`. The sitemap, the generated `llms-full.txt` and the map pages' canonical URLs
follow the catalogue on their own.

### 4. Verify

```sh
pnpm lint && pnpm check
pnpm test
pnpm dev
```

Walk a map page end to end: the network draws, the playhead (the build-up timeline) runs, the
tooltip reads correctly, the legend matches the paint, and a deep link to a specific
metric/type/variant survives a cold reload. Then check a city the tool has **no** data for, which
is the case most likely to be broken and least likely to be looked at.

A full `pnpm build` is the last step, not the first: it is slow, and it verifies the prerendered
route set rather than anything you can see.

## Keeping it honest

A tool advertised in a city's recommendation flags but missing from that city's export produces an
empty page rather than an error. Run `pnpm check:coverage` after importing a tool, and fix a flag
it reports before shipping.
