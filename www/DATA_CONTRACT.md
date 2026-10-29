# Data contract — what the site expects from a tool export

The website renders results computed in advance. No algorithm runs in the browser, so everything
the map can show has to be present in the exported GeoJSON. This describes the shape the importer
([scripts/update-data.mjs](scripts/update-data.mjs)) expects, what it normalises, and which
mismatches fail a run rather than shipping a quietly wrong map.

Read this before adding a tool ([../ADD_A_TOOL.md](../ADD_A_TOOL.md)) or when a new export drop
changes shape.

## Filenames

The organisation's convention
([NAMING_CONVENTIONS.md](https://github.com/BikeNetKit/.github/blob/main/NAMING_CONVENTIONS.md))
is the upstream form:

```text
<city>-<tool>-<algorithm>-<layer>[-<variant>].geojson      lowercase, single extension
amsterdam_nl-growbikenet-betweenness-grid-with_bikenw.geojson
```

The importer writes the site's own form under `www/data/<tool>/`, dropping the tool infix because
the directory already carries it:

```text
<cityid>-<metric>-<type>[-<variant>].geojson
aachen_de-betweenness-grid-from_bikenw.geojson
```

`<cityid>`, the city's stable key, is `<base>_<cc>`: `amsterdam_nl`, `aachen_de`. Generate it with
the organisation's `slugify()`, in
[BikeNetLib `bikenetlib/io.py`](https://github.com/BikeNetKit/BikeNetLib/blob/main/bikenetlib/io.py).

**Layer names drift between drops.** That, rather than the geometry, is what usually breaks when a
new export lands, so the importer matches known spellings rather than assuming one. Per-tool
specifics live in the `mirror…Dir()` functions of [scripts/update-data.mjs](scripts/update-data.mjs).

## Geometry and units

| Property            | Expected                                                              |
| ------------------- | --------------------------------------------------------------------- |
| CRS                 | **EPSG:4326** (WGS84 lon/lat), full precision. No `crs` member needed |
| Geometry            | `LineString` per edge; polygons for block-like layers                 |
| `length`            | **metres**, geodesic — not projected units                            |
| `length_cumulative` | metres, **newly built only** — excludes the baseline network          |

Absolute network length is therefore `baseline length + length_cumulative`, which is what lets every
scenario share one axis. Getting `length` wrong is the most consequential error possible here: it
propagates into the headline figures on the landing page with nothing to flag it.

## Per-feature properties

An ordered result layer carries:

| Property            | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `ordering`          | Dense `0…n-1` build order. The playhead counts these       |
| `length`            | Edge length in metres                                      |
| `length_cumulative` | Running total of newly built length                        |
| _metric_            | The tool's own ranking value — `betweenness`, `benefit`, … |

Keep column types stable across a drop: one null in a numeric column turns the whole column into
strings, and the map then colours nothing.

## Baselines

Most tools ship the existing network as its own layer, so the map can draw new work over the
current state. Where a tool has per-strategy baselines (LinkBikeNet), ship **one per strategy**: a
single shared baseline cannot carry a per-strategy column, and the map recolours the baseline per
strategy.

For LinkBikeNet, the importer joins each strategy's `lcc_step` (the step at which an edge joins the
largest connected component, LCC) onto that strategy's baseline as
`lcc_step_<strategy>`, and **throws when fewer than 99% of baseline edges receive it**. A mismatch
is otherwise invisible: the map renders, and shows most of the network as permanently
disconnected. A city and strategy listed in `LCC_STEP_GUARD_EXEMPT` in `update-data.mjs` gets a
warning instead; an entry there means the data ships knowingly as it is, and is removed once a
corrected export lands.

## Metadata

`meta/` ships alongside the tool directories:

| File                  | Delimiter | Carries                                                                                   |
| --------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `cities.csv`          | `;`       | `cityid;name_en;country_en;nominatim_query;country_code;population;center_lat;center_lon` |
| `rec_table.csv`       | `,`       | `cityid,sb,gbn,gbn+,lbn,fbn`: per-city recommendation flags per tool (`1` or `0`)         |
| `network_metrics.csv` | `,`       | Per-city network statistics                                                               |
| `versions.csv`        | `,`       | `tool,version,osm_data_date`                                                              |

From `cities.csv` the site reads `cityid`, `name_en` (the display name), `country_en`,
`country_code` and `population`. The `rec_table.csv` columns are superblockify (`sb`), GrowBikeNet
from scratch (`gbn`) and from the existing network (`gbn+`), LinkBikeNet (`lbn`) and FixBikeNet
(`fbn`). `versions.csv` is what the tool pages and the hero display, so those surfaces describe the
_data_ and the age of its OpenStreetMap extract, not the website's own version.

## Things that fail a run

Deliberately loud, because each of these would otherwise ship a quietly wrong or incomplete site.

`pnpm update-data` stops on:

- A **tool export much smaller than what is on disk**: fewer than 75% of the files already in that
  tool's `www/data/` directory (`PRUNE_GUARD_RATIO`). A stale or partial export would otherwise
  delete the difference. `--force` overrides it.
- A **LinkBikeNet baseline/step mismatch** below 99%, as above, or a city without a LinkBikeNet
  baseline.
- **Data outside the city it is named for**, compared with the export's own `city_boundary` layer.
  Quarantine the pair in `src/lib/data/excluded-datasets.json` and re-run.
- A **missing `city_boundary` layer** for a GrowBikeNet, FixBikeNet or LinkBikeNet city, or a
  missing `cities.csv`.
- An **invalid `tools.json`**: a missing required field, an unknown category or status, or a
  duplicate slug.

`pnpm build` stops, in the preflight in `src/hooks.server.ts`, on:

- A **manifest missing a tool**: an active interactive tool with no datasets in
  `src/lib/data/data-files.json`.
- A **LinkBikeNet city with no existing-network baseline** in the manifest.

## Running the import

The refresh itself needs SSH access to the server, and is described in
[README.md § For maintainers: updating the data](../README.md#for-maintainers-updating-the-data).
A run limited with `--tool` leaves the city catalogue alone and updates only that tool's entries,
while the dataset manifest and the city boundaries are always rebuilt from the whole of
`www/data/`.
