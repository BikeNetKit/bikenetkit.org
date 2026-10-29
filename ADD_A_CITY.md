# Adding a city

A city appears on the site when three things line up: its results are in the export, its row is in
the city metadata, and its screenshots are generated. This walks the whole path, including what a
wrong run looks like — the failure modes here are quiet, and a city can end up half-present without
anything erroring.

Everything runs from `www/`. For a routine refresh of the whole export, follow
[README.md § Updating the data](README.md#updating-the-data) instead; this page goes deeper on one
city.

## 1. The export

Results are computed upstream and land on the data server. The site does not compute anything, so a
city with no exported results cannot be added from this side — that is a request to the tool
authors, not a change here. [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md) is what they need to
match.

## 2. Pull and transform

```sh
pnpm pull-data -- --dry-run     # see what would change
pnpm pull-data                  # rsync, then transform into www/data + src/lib/data
```

`pull-data` rsyncs the export and hands it to `update-data`. To transform an export you already
have, or to limit the work to one tool:

```sh
pnpm update-data --tool growbikenet --dry-run
pnpm update-data --date 20260915          # pin a specific dated export
```

**Always dry-run a new drop first.** The transform is where a renamed layer or a changed column
surfaces, and the dry run names the files it would write.

### When it refuses

`update-data` aborts if an export would prune most of `www/data/`. That is a guard, not a bug: it
means the export you pointed at is smaller than what is already on disk, usually because it covers
one tool or one date rather than everything. `--force` overrides it and is right only when you
genuinely intend a smaller catalogue. Reach for `--tool` first.

## 3. Check the city metadata

`update-data` reads `meta/cities.csv` from the export, so a new city needs a row there —
`cityid`, `country_code`, `population`, semicolon-separated. The cityid is `<base>_<cc>`:
`amsterdam_nl`, `aachen_de`.

Then run the coverage audit, which is the check for the first of the two things below:

```sh
pnpm check:coverage
```

It fails on any _new_ city/tool pair that is recommended but has no data, and on any dataset whose
city is not in the catalogue. Gaps that are known and tracked are listed in
`scripts/check-coverage.known.json` and reported without failing; once one is confirmed expected,
record it with `pnpm check:coverage -- --accept`.

Then the content audit, which catches two cases coverage cannot see — a file that exists but holds
no features, so the tool is listed and the map draws nothing; and a file that exists, holds
features, but they sit nowhere near the city they are named for:

```sh
pnpm check:datasets -- --city <cityid>
```

A new city with little existing bike network is exactly where the first happens. A place-name
collision, or an export's own place lookup resolving to the wrong point, is where the second does —
if `pnpm update-data` throws with "Data located outside the city it is named for" while pulling this
city in, that is the same check running earlier and louder; quarantine the pair in
`src/lib/data/excluded-datasets.json` rather than trying to work around it, and re-run. Same
convention otherwise: known empties and confirmed-but-unfixable misplacements live in
`scripts/check-datasets.known.json`, recorded with `pnpm check:datasets -- --accept`.

Two things worth verifying by eye afterwards, in `src/lib/data/cities.json`:

- **The recommendation flags.** `rec_table.csv` drives which tools a city is recommended for. A
  flag set for a tool with no exported data for that city advertises a page that will be empty.
- **The display name.** It is the human name — `Newcastle-Upon-Tyne` — and may differ from what the
  basemap labels the same place. That is expected; see the note at the end.

## 4. Screenshots

```sh
pnpm pull-screenshots         # fresh checkout only: the server's set, so the steps below add to it
pnpm generate:screenshots
```

Regenerates the per-variant images under `www/screenshots/` — used for the thumbnails on `/cities`
and the tool pages. Without them the city appears with broken thumbnails, which looks like a bug
and is easy to miss on a page full of working ones.

The per-city Open Graph cards are built from those screenshots:

```sh
pnpm generate:og-cards -- --only "(<slug1>|<slug2>)"
pnpm check:og-cards
```

Commit the rewritten `www/src/lib/data/og-cards.json`, and run `pnpm deploy:data` before the site
deploy so the cards it lists are on the data host. A city without a card previews with its tool's
card, which is generic but not broken. `pnpm generate:og` regenerates the per-tool cards, and is
only needed if the tool set changed.

## 5. Verify

```sh
pnpm dev
```

- `/cities` — the city appears, thumbnail renders.
- `/cities/<cityid>` — every tool it is flagged for has data.
- One map page per tool — the network draws over the basemap, the playhead runs end to end.
- `/cities/table` — the coverage row matches what you just checked.

## 6. Upload and commit

```sh
pnpm deploy:data      # www/data/ -> the data host
pnpm compress:data    # rebuild the .gz/.br siblings on the server
```

Then commit the regenerated `src/lib/data/*.json` — `cities.json`, `data-files.json`,
`city-boundaries.json`, `site-stats.json`. **The data itself is not committed** (~4.3 GB, off-repo);
the manifest is what the build reads, so an uploaded-but-uncommitted refresh ships a site that does
not know about the new files, and a committed-but-unuploaded one ships 404s.

## A known rough edge

The basemap labels some cities differently from the catalogue — `Łódź` against `Lodz`,
`Newcastle upon Tyne` against `Newcastle-Upon-Tyne`, `Homel` against `Gomel`. Where they differ the
city does not get its bold focus label on the map. It affects roughly 55 of 403 cities and is
cosmetic. If a new city looks unemphasised, this is why, and it is not something the import did
wrong.
