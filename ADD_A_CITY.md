# Adding a city

A city appears on the site when three things line up: its results are in the tool export, its row
is in the city metadata, and its screenshots are generated. This page walks that path for one city,
including what a wrong run looks like: the failure modes are quiet, and a city can end up
half-present without anything erroring.

**Maintainers only.** Steps 2, 4 and 6 need SSH access to the server, and the checks in step 3 need
the data step 2 fetches. Without that access, propose a city in an issue, or as a row in
[`cities/meta/cities.csv`](https://github.com/BikeNetKit/dataexport/blob/main/cities/meta/cities.csv)
in the public [BikeNetKit/dataexport](https://github.com/BikeNetKit/dataexport) repository.

Everything runs from `www/`. For a routine refresh of the whole export, follow
[README.md § For maintainers: updating the data](README.md#for-maintainers-updating-the-data)
instead; this page goes deeper on one city.

## 1. The export

Results are computed upstream by the tool teams. The site computes nothing, so a city with no
exported results cannot be added from this side: that is a request to the tool authors, not a
change here. [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md) is what their export has to match.

## 2. Pull and transform

```sh
pnpm pull-data -- --dry-run     # see what would change
pnpm pull-data                  # rsync, then transform into www/data + src/lib/data
```

`pull-data` copies the export into the pull root (`DATA_PULL_ROOT` in `www/.env`; the default, a
directory next to the repository checkout, is noted in `.env.example`) and hands it to
`update-data`. A bare `update-data`
reads the same directory, so you can re-run the transform without fetching again, or limit it to
one tool. `--data-root <dir>` points it at another copy of the export.

```sh
pnpm update-data --dry-run                     # names the files it would write
pnpm update-data --tool growbikenet --dry-run
pnpm update-data --date 20260915               # pin a specific dated export
```

`update-data` takes its flags without the `--` separator, which it rejects as an unknown argument.

**Always dry-run a new drop first.** The transform is where a renamed layer or a changed column
surfaces. A run limited with `--tool` leaves `cities.json` alone, so a new city only enters the
catalogue with an unfiltered run.

### When it refuses

`update-data` aborts when the export for any tool holds fewer than three quarters of the files
already in that tool's `www/data/` directory. That is a guard against a stale or half-synced
export, which would otherwise delete the difference. `--force` overrides it, and is right only when
you genuinely intend a smaller catalogue.

## 3. Check the city metadata

`update-data` reads `meta/cities.csv` from the export, so a new city needs a row there. The file is
semicolon-separated, with the columns
`cityid;name_en;country_en;nominatim_query;country_code;population;center_lat;center_lon`. The
site reads `cityid`, `name_en` (the display name), `country_en`, `country_code` and `population`.
The cityid (the city's stable key) is `<base>_<cc>`, for example `amsterdam_nl` or `aachen_de`.

Then run the coverage audit:

```sh
pnpm check:coverage
```

It fails on any _new_ city/tool pair that is recommended but has no data, and on any dataset whose
city is not in the catalogue. Known, tracked gaps are listed in
`scripts/check-coverage.known.json` and reported without failing. Once a new gap is confirmed as
expected, record it with `pnpm check:coverage -- --accept`.

Then the content audit, which catches two cases the coverage audit cannot see: a file that holds
no features, so the tool is listed and the map draws nothing; and a file whose features sit nowhere
near the city they are named for.

```sh
pnpm check:datasets -- --city <cityid>
```

A new city with little existing bike network is where the first happens. A place-name collision is
where the second does. If `update-data` throws "Data located outside the city it is named for"
while importing the city, that is the same check running earlier: quarantine the pair in
`src/lib/data/excluded-datasets.json` (with the reason and the upstream issue) rather than working
around it, and re-run. Known empties and confirmed misplacements live in
`scripts/check-datasets.known.json`, recorded with `pnpm check:datasets -- --accept`.

Afterwards, check two things by eye in `src/lib/data/cities.json`:

- **The recommendation flags.** `rec_table.csv` in the export's `meta/` decides which tools a city
  is recommended for. Its columns are `cityid,sb,gbn,gbn+,lbn,fbn`, each `1` or `0`: superblockify,
  GrowBikeNet grown from scratch, GrowBikeNet grown from the existing bike network (`gbn_plus` in
  `cities.json`), LinkBikeNet and FixBikeNet. SortBikeNet has no column; its one city is set in
  `src/lib/data/recommended.ts`. A flag set for a tool with no exported data for that city
  advertises a page that will be empty.

- **The display name.** It is the human name from `name_en`, for example `Newcastle-Upon-Tyne`, and
  may differ from what the basemap labels the same place. That is expected; see the note at the end.

## 4. Screenshots

```sh
pnpm pull-screenshots                    # fresh checkout only: fetch the server's set first
pnpm generate:screenshots -g "<cityid>"  # this city's images only
```

This renders the per-variant images under `www/screenshots/`, which the thumbnails on `/cities` and
the tool pages use. Without them the city shows broken thumbnails, which look like a bug and are
easy to miss on a page full of working ones.

The per-city Open Graph cards (the preview images shown when a page is shared) are built from those
screenshots. They are captured from a running `pnpm dev` (`http://localhost:5173` unless you pass
`--base`), so start it in a second terminal first:

```sh
pnpm generate:og-cards -- --only "/<cityid>$"
pnpm check:og-cards
```

A city without a card previews with its tool's card, which is generic but not broken.
`pnpm generate:og` regenerates the per-tool cards, and is only needed when the tool set changes.

## 5. Verify

```sh
pnpm dev
```

- `/cities`: the city appears and its thumbnail renders.
- `/cities/<cityid>`: every tool it is recommended for has data.
- One map page per tool: the network draws over the basemap, and the playhead (the build-up
  timeline) runs end to end.
- `/cities/table`: the coverage row matches what you just checked.

## 6. Upload and commit

```sh
pnpm deploy:data -- --dry-run   # look over any "deleting" lines first
pnpm deploy:data                # www/data/ and www/screenshots/ -> the data host
pnpm compress:data              # rebuild the .gz/.br copies on the server
git add src/lib/data            # every regenerated manifest, not a hand-picked list
```

Then commit and publish as [OPERATIONS.md § Deploying](OPERATIONS.md#deploying) describes, with the
data upload before the site deploy. **The data itself is not committed**: it is several GB and
lives on the data host. The build reads only the committed manifests, so an uploaded but
uncommitted refresh ships a site that does not know about the new files, and a committed but
unuploaded one ships 404s.

## A known rough edge

The basemap labels some cities differently from the catalogue: `Łódź` against `Lodz`,
`Newcastle upon Tyne` against `Newcastle-Upon-Tyne`, `Homel` against `Gomel`. Where they differ,
the city does not get its bold focus label on the map. It affects a few dozen cities and is
cosmetic. If a new city looks unemphasised, this is why, and the import did nothing wrong.
