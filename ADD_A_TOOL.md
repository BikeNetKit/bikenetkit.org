# Adding a tool

Tools reach the site in one of two shapes, and picking the wrong one is the expensive mistake here.

| | **Static** | **Interactive** |
| --- | --- | --- |
| Where | A section on `/more-tools` | Its own route under `(app)/(map)/` |
| Needs | Description, links, optionally a figure | Per-city exported results for every city it claims |
| Cost | An entry in `tools.json` | That, plus a render config, plus the data pipeline |

**Choose static unless the tool has per-city results worth exploring on a map.** Seven of the twelve
tools in the catalogue are static, and that is not a lesser status — a tool with one result, or one
whose output is a figure rather than a geography, reads better as a section than as an empty map.

## The catalogue entry

Everything starts in [www/src/lib/data/tools.json](www/src/lib/data/tools.json), typed by
[types.ts](www/src/lib/data/types.ts). The identity, copy and links mirror the organisation's
canonical catalogue at
[BikeNetKit/.github `meta/tools.json`](https://github.com/BikeNetKit/.github/blob/main/meta/tools.json)
— take them from there rather than writing new ones, so the two do not drift.

```jsonc
{
  "name": "SortBikeNet",
  "slug": "sortbikenet",
  "shortDescription": "One sentence. Appears on the landing grid, so keep them similar in length.",
  "longDescription": "A paragraph for the tool page.",
  "category": "interactive",        // or "static"
  "status": "active",               // "coming-soon" ships the entry without a route
  "repo":  "https://github.com/BikeNetKit/SortBikeNet",
  "docs":  "https://docs.bikenetkit.org/SortBikeNet/",
  "paper": { "title": "…", "authors": "…", "venue": "…", "year": 2026, "url": "…" },
  "usage": { "requirements": "Python>=3.12", "code": "…" }
}
```

`name` is the plain string — write `SortBikeNet`, never `Sort Bike Net`. The site sets the logo's
word gap between the parts itself, splitting the camel case at render time
(`www/src/lib/utils/word-mark.js`, see [DESIGN.md](www/DESIGN.md) § The word gap in rendered names),
and the same string goes unchanged into the page title, the Open Graph card and the JSON-LD. Add an
optional `"nameParts": ["Sort", "Bike", "Net"]` only if the splitter gets a name wrong — no tool
shipping today needs it.

Three keys are the website's own and have no upstream equivalent — do not expect them in the org
file, and do not drop them when syncing from it:

- **`external: true`** — the tool lives outside the BikeNetKit organisation. Drives the
  "Part of BikeNetKit" / "Related tools" split on `/more-tools` and in the sidebar.
- **`config`** — metrics, types, variants and their defaults. What the map's controls offer.
- **`renderConfig`** — line widths, fit behaviour. How the map draws it.

`status: "coming-soon"` is the useful half-way state: the tool appears in the catalogue and its data
can ship, but no route reads it. SortBikeNet sits there now, which makes it the worked example for
everything below.

## For a static tool

Add the entry with `"category": "static"`, and it appears as an anchored section on `/more-tools`
automatically. Add it to [www/static/llms.txt](www/static/llms.txt). That is the whole job.

## For an interactive tool

### 1. The data

Results must match the importer's contract — [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md) is the
specification, and worth agreeing with the tool authors *before* an export is generated rather than
normalising a surprise afterwards. Then teach `update-data` the tool's layer names, following the
per-tool `mirror…Dir()` functions in [www/scripts/update-data.mjs](www/scripts/update-data.mjs).

```sh
pnpm update-data --tool <slug> --dry-run
pnpm update-data --tool <slug>
```

The transform writes `www/data/<slug>/` and adds the tool to `src/lib/data/data-files.json`. That
manifest is what the build reads — there is a preflight in
[www/src/hooks.server.ts](www/src/hooks.server.ts) that fails the build, naming
the tool, if it is missing. Better a failed build than a site shipped short a tool.

### 2. The route

Interactive tools live under `src/routes/(app)/(map)/<slug>/`. Copy the closest existing one —
`growbikenet` if the tool has an ordered build-up, `superblockify` if it renders areas rather than
lines. The shared map shell, playback, tooltips and legend all come from the layout; a tool route is
mostly configuration.

Routes inside `(app)/` get the sidebar. Routes outside it — `/`, `/design` — do not.

### 3. Wire up the rest

- `config` and `renderConfig` in `tools.json`, which drive the controls and the paint.
- Metric labels and formatting in `src/lib/data/metric-meta.ts`, so the tooltip reads in words
  rather than column names.
- `src/routes/screenshot/` for the thumbnail variants, then `pnpm generate:screenshots`.
- `pnpm generate:og` for the Open Graph card, and `pnpm generate:og-cards` for the per-city cards
  of the new tool (they read its coverage from the dataset manifest).
- `www/static/llms.txt`. `pnpm check:build-output` fails while an active interactive tool is
  missing from it. The sitemap and the map pages' canonicals follow the catalog on their own.

### 4. Verify

```sh
pnpm lint && pnpm check
pnpm dev
```

Walk a map page end to end: the network draws, the playhead runs, the tooltip reads correctly, the
legend matches the paint, and a deep link to a specific metric/type/variant survives a cold reload.
Then check a city the tool has **no** data for, which is the case most likely to be broken and least
likely to be looked at.

A full `pnpm build` is the last step, not the first — it is slow, and it verifies the prerendered
route set rather than anything you can see.

## Keeping it honest

A tool advertised in a city's recommendation flags but missing from that city's export produces an
empty page rather than an error. When adding a tool, check `rec_table.csv` against what the export
actually contains before shipping.
