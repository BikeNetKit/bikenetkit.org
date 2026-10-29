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

```
<city>-<tool>-<algorithm>-<layer>[-<variant>].geojson      lowercase, single extension
amsterdam_nl-growbikenet-betweenness-grid-with_bikenw.geojson
```

The importer writes the site's own form under `www/data/<tool>/`, dropping the tool infix because
the directory already carries it:

```
<cityid>-<metric>-<type>[-<variant>].geojson
aachen_de-betweenness-grid-from_bikenw.geojson
```

`<cityid>` is `<base>_<cc>` — `amsterdam_nl`, `aachen_de`. Generate it with the organisation's
`slugify()`, currently in
[GrowBikeNet/functions.py](https://github.com/BikeNetKit/GrowBikeNet/blob/main/growbikenet/functions.py).

**Layer names drift between drops.** In practice that, rather than the geometry, is what breaks when
a new export lands, so the importer matches known spellings rather than assuming one. Per-tool
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
current state. Where a tool has per-strategy baselines, ship **one per strategy** — a single shared
baseline cannot carry a per-strategy column, and the map recolours the baseline per strategy.

The importer **throws when fewer than 99% of baseline edges join** their per-strategy column. That
guard exists because a mismatch is otherwise invisible: the map renders, and simply shows most of
the network as permanently disconnected.

## Metadata

`meta/` ships alongside the tool directories:

| File                  | Delimiter | Carries                                |
| --------------------- | --------- | -------------------------------------- |
| `cities.csv`          | `;`       | `cityid`, `country_code`, `population` |
| `rec_table.csv`       | `,`       | Per-city recommendation flags per tool |
| `network_metrics.csv` | `,`       | Per-city network statistics            |
| `versions.csv`        | `,`       | `tool,version,osm_data_date`           |

`versions.csv` is what the tool pages and the hero display — so those surfaces describe the _data_
and the age of its OpenStreetMap extract, not the website's own version.

## Things that fail a run

Deliberately loud, because each was once silent:

- A **manifest missing a tool** fails a preflight in `src/hooks.server.ts` that names it,
  rather than deploying a site short a tool.
- A **baseline/step mismatch** below 99% throws, as above.
- An export that would **prune most of `www/data/`** aborts unless `--force` is passed. A partial
  export otherwise silently deletes cities.

## Adding a tool's data

```sh
pnpm pull-data                  # rsync the export, then transform
pnpm update-data --tool <name>  # transform only, from an export already pulled
pnpm update-data --dry-run      # inspect first; always worth it on a new drop
pnpm deploy:data                # upload www/data/ to the data host
```

A filtered run leaves the city catalogue alone and updates only its own entries, while the manifest
and the boundaries are always rebuilt whole. Commit the regenerated `src/lib/data/*.json`.

---

_This describes the contract as it stands. The reasoning behind individual rules — why `length`
must be geodesic, why baselines are per strategy — lives with the project maintainer rather than
here, since most of it is a record of specific drops rather than a rule anyone needs to apply._
