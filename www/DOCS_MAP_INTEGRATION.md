# Using the BikeNetKit map in the docs site

**Audience:** the team building `docs.bikenetkit.org` (Sphinx + Furo, notebook-driven).

The docs currently draw interactive maps with **Folium** (`gdf.explore()` → Leaflet + raster
CartoDB Positron tiles). That looks nothing like the maps on `bikenetkit.org`, which use **MapLibre
GL** over our **self-hosted vector basemap**. This guide is how to close that gap.

The main site's map is a set of Svelte components (`svelte-maplibre-gl`) and is **not portable** into
Sphinx. But everything _underneath_ those components is reusable, self-hosted, key-less and
CORS-open — you can render our exact basemap and color scheme from a notebook, from Folium, or from
an `<iframe>`. Three tiers below, cheapest last.

---

## 1. What you can reuse (the shared assets)

Everything is served from `tiles.bikenetkit.org` / `data.bikenetkit.org` with
`Access-Control-Allow-Origin: *`. There is no API key and no third-party runtime service — the whole
point is a stack that keeps working untouched for ~8 years.

| Asset                     | URL                                                                   | Notes                                                                                                             |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Basemap style**         | `https://tiles.bikenetkit.org/bikenetkit-map-style.json`              | Self-contained MapLibre style v8. Points at the PMTiles basemap + glyphs below.                                   |
| **Basemap tiles**         | `pmtiles://https://tiles.bikenetkit.org/basemap-YYYYMMDD.pmtiles`     | Vector PMTiles, Europe + Macaronesia, byte-range served. Referenced _by_ the style — you don't touch it directly. |
| **Glyphs (label fonts)**  | `https://tiles.bikenetkit.org/fonts/maplibre/{fontstack}/{range}.pbf` | Referenced by the style. Needed for map labels.                                                                   |
| **Precomputed tool data** | `https://data.bikenetkit.org/<tool>/<city>-<metric>-<type>.geojson`   | The exact GeoJSON the site draws, if you want canonical results instead of a notebook's own.                      |
| **Color ramp**            | see [§5](#5-the-color-ramp-reference)                                 | 4-stop quantile ramp used for every metric line layer.                                                            |

> **Why `tiles.bikenetkit.org` and not `bikenetkit.org`?** The tiles host is live and CORS-open
> today, independent of the main website — which serves only a placeholder until full launch. Point
> at the tiles host for the style, tiles and glyphs; do **not** depend on `bikenetkit.org` for them
> before launch.

### Attribution is mandatory

The basemap is OpenStreetMap data (ODbL) via Protomaps. The
`Protomaps | OpenStreetMap` credit must stay **visible on every map**. MapLibre shows it
automatically from the style's `attribution` field (keep the default `AttributionControl`). If you
render the basemap any other way, add the credit yourself.

### Pin everything for longevity

For the ~8-year no-maintenance goal, **vendor** the JS libraries (`maplibre-gl`, `pmtiles`) into the
docs' Sphinx `_static/` and reference them by exact version, rather than hot-linking a CDN's
`@latest`. The style, tiles and glyphs are already self-hosted and versioned; only the client
libraries need pinning. The examples below use a CDN for brevity — swap to `_static/` for production.

---

## 2. Tier 1 — MapLibre drop-in for notebook maps _(recommended for the MWE)_

The MWE renders the reader's _own_ GeoDataFrame. This tier is a near drop-in for `gdf.explore()`
that renders arbitrary notebook GeoJSON with our exact basemap and color ramp. Highest fidelity;
works for any result.

Drop this helper into a docs utility module (e.g. `growbikenet/_docs_map.py`) and call it from any
notebook cell:

```python
import json
from string import Template

from IPython.display import HTML

STYLE_URL = "https://tiles.bikenetkit.org/bikenetkit-map-style.json"
# Pin these — vendor into _static/ for production instead of hot-linking.
MAPLIBRE_JS  = "https://unpkg.com/maplibre-gl@5.23.0/dist/maplibre-gl.js"
MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@5.23.0/dist/maplibre-gl.css"
PMTILES_JS   = "https://unpkg.com/pmtiles@4.4.1/dist/pmtiles.js"

RAMP = ["#e7e1d1", "#d3d59c", "#65B81D", "#00676f"]  # coreColors.ramp0..ramp3
WIDTH_RANGE = (0.5, 3.0)                             # DEFAULT_LINE_WIDTH_RANGE
ZOOM_STOPS = [(10, 0.66), (12, 1.0), (17, 3.5)]      # ZOOM_SCALE_STOPS
LABEL_BEFORE = "address_label"                       # overlay draws beneath basemap labels


def _quantile(vals, q):
    i = q * (len(vals) - 1)
    lo, hi = int(i), min(int(i) + 1, len(vals) - 1)
    return vals[lo] + (vals[hi] - vals[lo]) * (i - lo)


def _ramp_stops(values, colors=RAMP, width_range=WIDTH_RANGE):
    """Quantile color+width stops, dropping duplicate inputs (interpolate needs ascending inputs)."""
    finite = sorted(v for v in values if isinstance(v, (int, float)) and v == v)
    if not finite:
        return []
    n, (wmin, wmax) = len(colors), width_range
    stops = []
    for i, c in enumerate(colors):
        p = i / (n - 1)
        inp = _quantile(finite, p)
        if not stops or inp > stops[-1][0]:
            stops.append((inp, c, wmin + p * (wmax - wmin)))
    return stops


def _zoom_scale(width):
    # ['zoom'] must be top-level; the data-driven width nests under the per-stop '*'.
    return ["interpolate", ["linear"], ["zoom"],
            *sum(([z, ["*", m, width]] for z, m in ZOOM_STOPS), [])]


# The page the iframe runs. Plain JavaScript with its braces intact: string.Template takes
# $-placeholders, so — unlike an f-string — nothing here has to be escaped or doubled.
MAP_PAGE = Template("""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link href="$maplibre_css" rel="stylesheet" />
    <script src="$maplibre_js"></script>
    <script src="$pmtiles_js"></script>
    <style>
      html, body, #map { margin: 0; height: 100%; width: 100%; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const cfg = $cfg;

      maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);

      const map = new maplibregl.Map({
        container: 'map',
        style: cfg.style,
        bounds: cfg.bounds,
        fitBoundsOptions: { padding: 24 }
      });

      map.on('load', () => {
        map.addSource('bnk', { type: 'geojson', data: cfg.geojson });
        map.addLayer(
          {
            id: 'bnk',
            type: 'line',
            source: 'bnk',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: cfg.paint
          },
          cfg.before
        );
      });
    </script>
  </body>
</html>
""")


def bikenetkit_map(gdf, metric="betweenness", *, height=480):
    """Render a GeoDataFrame with the BikeNetKit basemap + ramp. Drop-in for gdf.explore()."""
    g = gdf.to_crs(4326)
    gj = json.loads(g.to_json())
    stops = _ramp_stops([f["properties"].get(metric) for f in gj["features"]])

    if len(stops) >= 2:
        color = ["interpolate", ["linear"], ["get", metric],
                 *sum(([inp, c] for inp, c, _ in stops), [])]
        width = _zoom_scale(["interpolate", ["linear"], ["get", metric],
                             *sum(([inp, w] for inp, _, w in stops), [])])
    else:  # single/'no' value: fall back to the darkest ramp color, constant width
        color = stops[-1][1] if stops else RAMP[-1]
        width = _zoom_scale(stops[-1][2] if stops else WIDTH_RANGE[0])

    minx, miny, maxx, maxy = (float(v) for v in g.total_bounds)
    # Hand the JS one JSON blob rather than interpolating values into the source one by one —
    # json.dumps does all the quoting, so there is no hand-escaping to get wrong.
    cfg = json.dumps({
        "style": STYLE_URL,
        "bounds": [[minx, miny], [maxx, maxy]],
        "geojson": gj,
        "paint": {"line-color": color, "line-width": width, "line-opacity": 1},
        "before": LABEL_BEFORE,
    })

    # Render inside an <iframe srcdoc> — the same trick Folium uses — so the JS runs in JupyterLab
    # and `nbconvert --to html`, which strip bare <script> from HTML output. Each iframe is isolated,
    # so there is no unique-id juggling and no CSS bleed into the notebook page.
    doc = MAP_PAGE.substitute(
        maplibre_css=MAPLIBRE_CSS,
        maplibre_js=MAPLIBRE_JS,
        pmtiles_js=PMTILES_JS,
        cfg=cfg,
    )
    srcdoc = doc.replace('&', '&amp;').replace('"', '&quot;')
    # Wrap in a <div> so the string doesn't start with "<iframe " (which trips an IPython
    # "use IFrame instead" warning). srcdoc still runs the map's JS in JupyterLab / nbconvert.
    iframe = f'<iframe srcdoc="{srcdoc}" style="width:100%;height:{height}px;border:0"></iframe>'
    return HTML(f"<div>{iframe}</div>")
```

> **Runnable version:** `maplibre-basemap-demo.ipynb` in
> [BikeNetKit/docs-map-demo](https://github.com/BikeNetKit/docs-map-demo) is a minimal, verified
> Tier 1 notebook (basemap swap only, no ramp) — clone it, then `uv run jupyter lab`. The repo is
> private; ask for access.

Usage in a notebook, replacing `gdf.explore(...)`:

```python
from growbikenet._docs_map import bikenetkit_map
bikenetkit_map(gbn.gdf_edges, metric="betweenness")
```

Notes:

- The overlay is inserted **before** `address_label`, so basemap place names stay legible on top of
  the network — same as the site.
- `metric` is any numeric column on the GeoDataFrame; the ramp is cut at quantiles of its values,
  identical to the site's `makeLinePaint`.
- For point layers, swap the layer `type` to `circle` and paint `circle-color`/`circle-radius`.

---

## 3. Tier 2 — keep Folium, swap only the basemap

If you'd rather keep the `gdf.explore()` / Folium workflow and only change how the _background_ looks,
render our vector basemap in Leaflet with [`protomaps-leaflet`](https://github.com/protomaps/protomaps-leaflet),
injected via a `folium.MacroElement`. **A runnable, side-by-side demo** (current CartoDB look vs. the
BikeNetKit basemap, both on real Lyon data) is `folium-basemap-demo.ipynb` in
[BikeNetKit/docs-map-demo](https://github.com/BikeNetKit/docs-map-demo) (clone, then
`uv run jupyter lab`):

```python
import folium
from folium import MacroElement
from jinja2 import Template

class BikeNetKitBasemap(MacroElement):
    _template = Template("""
    {% macro script(this, kwargs) %}
      var layer = protomapsL.leafletLayer({
        url: "https://tiles.bikenetkit.org/basemap-20260902.pmtiles",
        // Re-express theme.js here as a protomaps-leaflet "paint rules" flavor (see caveat).
        flavor: "light", lang: "en"
      });
      layer.addTo({{ this._parent.get_name() }});
    {% endmacro %}
    """)

m = gdf.explore(column="betweenness", cmap="...", tiles=None)  # no default basemap
m.get_root().add_child(BikeNetKitBasemap())
```

**Caveat — lower fidelity.** `protomaps-leaflet` uses its own _flavor_ paint-rules format, **not**
the MapLibre style spec. Our theme lives in [src/lib/map-style/theme.js](src/lib/map-style/theme.js)
and [layers.js](src/lib/map-style/layers.js) as MapLibre layers; matching the site exactly means
hand-porting those rules into the flavor format and keeping the port in sync. Colors will only match
as closely as you maintain that port. Choose this tier only if staying in Folium matters more than a
pixel-perfect basemap. For the network coloring, still use the [§5](#5-the-color-ramp-reference) ramp
as your `explore()` colormap so the _data_ matches the site.

---

## 4. Tier 3 — iframe a canonical map _(post-launch, showcase only)_

For prose/landing pages of the docs that want a real, interactive BikeNetKit map (not the reader's
own data), embed the app's chromeless `/embed` route:

```html
<iframe
	src="https://bikenetkit.org/embed/growbikenet/lyon_fr/betweenness/grid/from_bikenw"
	title="GrowBikeNet results for Lyon"
	width="100%"
	height="480"
	style="border:0"
	loading="lazy"
></iframe>
```

The path mirrors the tool pages: `/embed/<tool>/<city>/<metric>/<type>/<variant>`. Trailing segments
are optional and fall back to the tool's defaults, so `/embed/growbikenet/lyon_fr` (or
`/embed/superblockify/amsterdam_nl/betweenness/edges`) also works. The route is client-only: every
`/embed/…` URL is answered with the same app shell (status 200), which then loads the dataset in
the browser.

- Pixel-identical to the site, zero JS in the notebook, and always current.
- **Showcase only:** it renders a canonical tool/city, **not** a notebook's MWE GeoDataFrame. Use it
  on overview pages, not in the MWE result cell.
- **Post-launch:** `/embed` ships with the full website, which is a placeholder until launch. Until
  then, use Tier 1 for live maps.

`metric`/`type`/`variant` are the same axes as the tool pages, just as path segments. Slugs are
`<base>_<cc>` cityids (e.g. `lyon_fr`); tool names are `growbikenet`, `linkbikenet`, `fixbikenet`,
`superblockify`, etc.

To open the map on part of a city rather than the whole of it, add
`?bbox=minLon,minLat,maxLon,maxLat` (the order GeoJSON and OSM use):

```
/embed/growbikenet/lyon_fr/betweenness/grid/from_bikenw?bbox=4.833,45.758,4.860,45.772
```

The box only sets the opening view. The embed fits it with the same padding it uses for the city,
and the reader can still pan and zoom out to the whole city. A malformed box is ignored, and the
map frames the city instead. The easiest way to get a URL is the **Embed this view** item in the
export menu on any tool page. It links to the embed for the dataset on screen, framed on the part
of the map not covered by the panels.

---

## 5. The color ramp reference

Every metric line layer on the site is colored with this 4-stop ramp, cut at evenly-spaced quantiles
of the metric's values, with a zoom-driven width scale. Source of truth:
[src/lib/colors.js](src/lib/colors.js), [src/lib/map-style/line-paint.js](src/lib/map-style/line-paint.js),
[src/lib/map-style/render-config.js](src/lib/map-style/render-config.js).

| stop | quantile | color     |
| ---- | -------- | --------- |
| 0    | 0.00     | `#e7e1d1` |
| 1    | 0.33     | `#d3d59c` |
| 2    | 0.67     | `#65B81D` |
| 3    | 1.00     | `#00676f` |

- **Width:** interpolated `0.5 → 3.0 px` across the same quantiles, then multiplied by a zoom factor
  (`×0.66 @ z10`, `×1.0 @ z12`, `×3.5 @ z17`).
- **Existing-network baseline** (fixbikenet/linkbikenet context lines): periwinkle `#9999cc`, drawn
  faint beneath the ramp so the green stays exclusive to newly-built links.

The Python port in [§2](#2-tier-1--maplibre-drop-in-for-notebook-maps-recommended-for-the-mwe)
(`_ramp_stops`, `_zoom_scale`) reproduces this exactly.

---

## 6. Choosing a tier

|                             | Fidelity                        | Effort                    | Draws MWE data?   | Runtime deps               |
| --------------------------- | ------------------------------- | ------------------------- | ----------------- | -------------------------- |
| **Tier 1** MapLibre helper  | Full                            | Medium (one helper)       | ✅ yes            | style + tiles + glyphs     |
| **Tier 2** Folium + basemap | Basemap approximate, data exact | Medium-high (flavor port) | ✅ yes            | tiles                      |
| **Tier 3** iframe `/embed`  | Pixel-identical                 | Low                       | ❌ canonical only | full website (post-launch) |

**Recommendation:** Tier 1 for the MWE and any cell that visualizes computed results; Tier 3 for
showcase maps on overview pages once the site is launched. Tier 2 only if the Folium workflow must be
preserved.

---

## Maintainer notes (this repo)

The published assets are generated and deployed from `www/`:

```sh
pnpm build:mapstyle    # write static/bikenetkit-map-style.json from the live style modules
pnpm deploy:mapstyle   # rsync the style + static/fonts/maplibre/ to tiles.bikenetkit.org
```

Rerun both after a basemap archive bump (the style embeds the dated `basemap-*.pmtiles` filename) or
any change to `layers.js` / `theme.js`. nginx `location`s and CORS details:
[DEPLOY_TILES.md](DEPLOY_TILES.md) → "Map style + glyphs for external consumers". The `/embed` route
lives at [src/routes/embed/[tool]/[city]/[[metric]]/[[type]]/[[variant]]/](src/routes/embed/) and reuses the same data loader as the
tool pages.
