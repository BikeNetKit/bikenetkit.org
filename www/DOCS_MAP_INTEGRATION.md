# Using the BikeNetKit map in the docs site

**Audience:** the team building `docs.bikenetkit.org` (Sphinx + Furo, notebook-driven).

The docs draw interactive maps with **Folium** (`gdf.explore()` → Leaflet + raster CartoDB
Positron tiles). That looks nothing like the maps on `bikenetkit.org`, which use **MapLibre GL**
over a **self-hosted vector basemap**. This guide is how to close that gap.

The site's map is a set of Svelte components (`svelte-maplibre-gl`) and cannot be ported into
Sphinx. Everything _underneath_ those components can be reused: it is self-hosted, needs no API
key and is CORS-open, so a notebook, Folium or an `<iframe>` can render the same basemap and
colour scheme. There are three tiers below, from highest fidelity to least effort.

> **Launch state.** `tiles.bikenetkit.org` and `data.bikenetkit.org` are live now, independently
> of the main website. `bikenetkit.org` itself serves a placeholder until the full site launches,
> so Tier 3 (`/embed`) works only after launch. Point at the tiles host for the style, tiles and
> glyphs, and never at `bikenetkit.org`.

## 1. What you can reuse

Everything is served from `tiles.bikenetkit.org` and `data.bikenetkit.org` with
`Access-Control-Allow-Origin: *`. There is no API key and no third-party runtime service: the
stack is meant to keep working untouched for years.

| Asset                     | URL                                                                               | Notes                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Basemap style**         | `https://tiles.bikenetkit.org/bikenetkit-map-style.json`                          | Self-contained MapLibre style (spec v8). Points at the PMTiles basemap and the glyphs below.                                                                                       |
| **Basemap tiles**         | the style's `sources.protomaps.url`                                               | Vector PMTiles covering Europe and the Atlantic archipelagos, served with byte ranges. The archive name is dated and changes on a rebuild, so read it from the style.              |
| **Glyphs (label fonts)**  | `https://tiles.bikenetkit.org/fonts/maplibre/{fontstack}/{range}.pbf`             | Referenced by the style. Needed for map labels.                                                                                                                                    |
| **Precomputed tool data** | `https://data.bikenetkit.org/<tool>/<cityid>-<metric>-<type>[-<variant>].geojson` | The exact GeoJSON the site draws, if you want canonical results instead of a notebook's own. The pattern is defined in [DATA_CONTRACT.md § Filenames](DATA_CONTRACT.md#filenames). |
| **Colour ramp**           | see [§5](#5-the-colour-ramp-reference)                                            | The 4-stop quantile ramp of GrowBikeNet's metric lines. The other tools vary it.                                                                                                   |

### Attribution is mandatory

The basemap is OpenStreetMap data (ODbL) via Protomaps. The credit
"© OpenStreetMap contributors | Protomaps" must stay **visible on every map**. MapLibre shows it
automatically from the style's `attribution` field, as long as you keep the default
`AttributionControl`. If you render the basemap any other way, add the credit yourself.

### Pin everything for longevity

**Vendor** the JavaScript libraries (`maplibre-gl`, `pmtiles`) into the docs' Sphinx `_static/` and
reference them by exact version, rather than hot-linking a CDN's `@latest`. The style, tiles and
glyphs are already self-hosted and versioned, so only the client libraries need pinning. The
examples below pin the versions the site itself runs (`maplibre-gl` 6.16.0 and `pmtiles` 4.5.0, in
`www/package.json`) and load them from a CDN for brevity; swap to `_static/` for production.

MapLibre 6 ships only as an ES module and loads its worker from a file next to its own module.
Vendor `maplibre-gl.mjs`, `maplibre-gl-worker.mjs` and `maplibre-gl.css` from the same release,
side by side.

## 2. Tier 1 — MapLibre drop-in for notebook maps _(recommended for the MWE)_

The MWE (the docs' minimal working example) renders the reader's _own_ GeoDataFrame. This tier is
a near drop-in for `gdf.explore()` that renders arbitrary notebook GeoJSON with the site's
basemap and colour ramp. It has the highest fidelity and works for any result.

Put this helper in a docs utility module (e.g. `growbikenet/_docs_map.py`) and call it from any
notebook cell:

```python
import json
from string import Template

from IPython.display import HTML

STYLE_URL = "https://tiles.bikenetkit.org/bikenetkit-map-style.json"
# The versions in www/package.json. Vendor into _static/ for production instead of hot-linking.
MAPLIBRE = "https://unpkg.com/maplibre-gl@6.16.0/dist"
MAPLIBRE_JS  = f"{MAPLIBRE}/maplibre-gl.mjs"  # an ES module; the worker loads from next to it
MAPLIBRE_CSS = f"{MAPLIBRE}/maplibre-gl.css"
PMTILES_JS   = "https://unpkg.com/pmtiles@4.5.0/dist/pmtiles.js"

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
    <script src="$pmtiles_js"></script>
    <style>
      html, body, #map { margin: 0; height: 100%; width: 100%; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script type="module">
      import * as maplibregl from '$maplibre_js';

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
> [BikeNetKit/docs-map-demo](https://github.com/BikeNetKit/docs-map-demo) (private; ask the
> maintainers for access) is a minimal, verified Tier 1 notebook (basemap swap only, no ramp).
> Clone it, then run `uv run jupyter lab`.

Usage in a notebook, replacing `gdf.explore(...)`:

```python
from growbikenet._docs_map import bikenetkit_map
bikenetkit_map(gbn.gdf_edges, metric="betweenness")
```

Notes:

- The overlay is inserted **before** `address_label`, so basemap place names stay legible on top
  of the network, as on the site.
- `metric` is any numeric column on the GeoDataFrame. The ramp is cut at quantiles of its values,
  as the site's `makeLinePaint()` does.
- For point layers, change the layer `type` to `circle` and paint `circle-color` and
  `circle-radius`.
- The page that holds the iframe must be served over http(s), as JupyterLab and a published Sphinx
  site are. Under a `file://` page (an nbconvert export opened straight from disk) MapLibre 6
  cannot start its worker, and the map stays blank.

## 3. Tier 2 — keep Folium, swap only the basemap

If you would rather keep the `gdf.explore()` / Folium workflow and change only how the
_background_ looks, render the vector basemap in Leaflet with
[`protomaps-leaflet`](https://github.com/protomaps/protomaps-leaflet), injected through a
`folium.MacroElement`. A runnable side-by-side demo (the CartoDB look against the BikeNetKit
basemap, both on real Lyon data) is `folium-basemap-demo.ipynb` in
[BikeNetKit/docs-map-demo](https://github.com/BikeNetKit/docs-map-demo) (private; ask the
maintainers for access). The snippet below is a condensed version. It renders the basemap, but in
protomaps-leaflet's stock `light` flavor, which looks visibly different from the site (see the
caveat below).

```python
import json
import urllib.request

import folium
from folium import MacroElement
from jinja2 import Template

STYLE_URL = "https://tiles.bikenetkit.org/bikenetkit-map-style.json"
# protomaps-leaflet is not loaded by Folium; the page needs its script. Pin and vendor it too.
PROTOMAPS_LEAFLET_JS = "https://unpkg.com/protomaps-leaflet@5.1.0/dist/protomaps-leaflet.js"

# The archive name is dated and changes on a rebuild, so read it from the published style.
with urllib.request.urlopen(STYLE_URL) as r:
    PMTILES_URL = json.load(r)["sources"]["protomaps"]["url"].removeprefix("pmtiles://")

class BikeNetKitBasemap(MacroElement):
    _template = Template("""
    {% macro script(this, kwargs) %}
      var layer = protomapsL.leafletLayer({
        url: {{ this.url | tojson }},
        // Re-express theme.js here as a protomaps-leaflet "paint rules" flavor (see caveat).
        flavor: "light", lang: "en",
        attribution: "© OpenStreetMap contributors | Protomaps"
      });
      layer.addTo({{ this._parent.get_name() }});
    {% endmacro %}
    """)

    def __init__(self, url=PMTILES_URL):
        super().__init__()
        self.url = url

m = gdf.explore(column="betweenness", cmap="...", tiles=None)  # no default basemap
m.get_root().header.add_child(folium.JavascriptLink(PROTOMAPS_LEAFLET_JS))
m.add_child(BikeNetKitBasemap())  # added to the map, so `this._parent` is the Leaflet map
```

Leaflet does not read the MapLibre style, so the credit is passed to the layer, which shows it in
Leaflet's attribution control.

**Caveat: lower fidelity.** `protomaps-leaflet` uses its own _flavor_ paint-rules format, **not**
the MapLibre style spec. The site's theme lives in
[src/lib/map-style/theme.js](src/lib/map-style/theme.js) and
[layers.js](src/lib/map-style/layers.js) as MapLibre layers, so matching the site exactly means
hand-porting those rules into the flavor format and keeping the port in sync. Colours match only
as closely as that port is maintained. Choose this tier only if staying in Folium matters more than
a pixel-perfect basemap. For the network itself, still use the [§5](#5-the-colour-ramp-reference)
ramp as the `explore()` colour map, so the _data_ matches the site.

## 4. Tier 3 — iframe a canonical map _(showcase only, after launch)_

For prose and landing pages of the docs that want a real, interactive BikeNetKit map (not the
reader's own data), embed the site's chrome-free `/embed` route:

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

The path mirrors the map pages: `/embed/<tool>/<cityid>/<metric>/<type>/<variant>`. Trailing
segments are optional and fall back to the tool's defaults, so `/embed/growbikenet/lyon_fr` (or
`/embed/superblockify/amsterdam_nl/betweenness/edges`) also works. The route is client-only: every
`/embed/…` URL is answered with the same app shell (status 200), which then loads the dataset in
the browser.

- It is pixel-identical to the site, needs no JavaScript in the notebook, and stays current.
- **Showcase only:** it renders a canonical tool and city, **not** the MWE's GeoDataFrame. Use it
  on overview pages, not in the MWE result cell.
- It ships with the full website, so it works only after launch (see the launch note at the top).
  Until then, use Tier 1 for live maps.

`metric`, `type` and `variant` are the same axes as on the map pages, as path segments. A `cityid`
is `<base>_<cc>` (e.g. `lyon_fr`). The five interactive tools are `growbikenet`, `linkbikenet`,
`fixbikenet`, `sortbikenet` (Paris only) and `superblockify`.

To open the map on part of a city rather than the whole of it, add
`?bbox=minLon,minLat,maxLon,maxLat` (the order GeoJSON and OSM use):

```text
/embed/growbikenet/lyon_fr/betweenness/grid/from_bikenw?bbox=4.833,45.758,4.860,45.772
```

The box only sets the opening view. The embed fits it with the same padding it uses for the city,
and the reader can still pan and zoom out to the whole city. A malformed box is ignored, and the
map frames the city instead. The easiest way to get a URL is the **Embed this view** item in the
export menu on any map page. It links to the embed for the dataset on screen, framed on the part of
the map the panels do not cover.

## 5. The colour ramp reference

GrowBikeNet's metric lines are coloured with this 4-stop ramp, cut at evenly spaced quantiles of
the metric's values, with a zoom-driven width scale. It is the ramp the Tier 1 helper reproduces.
Source of truth: [src/lib/colors.js](src/lib/colors.js),
[src/lib/map-style/line-paint.js](src/lib/map-style/line-paint.js) and
[src/lib/map-style/render-config.js](src/lib/map-style/render-config.js).

| Stop | Quantile | Colour    |
| ---- | -------- | --------- |
| 0    | 0.00     | `#e7e1d1` |
| 1    | 0.33     | `#d3d59c` |
| 2    | 0.67     | `#65B81D` |
| 3    | 1.00     | `#00676f` |

- **Width:** interpolated from 0.5 to 3.0 px across the same quantiles, then multiplied by a zoom
  factor (×0.66 at z10, ×1.0 at z12, ×3.5 at z17).
- **Other tools differ.** LinkBikeNet's connectivity gain starts part-way between stops 1 and 2;
  FixBikeNet uses stops 1–3; SortBikeNet runs 3 → 1, so the first-built segments are darkest;
  SuperBlockify colours blocks categorically. Their line widths differ too. The per-tool table is
  in [DESIGN.md § Metric ramp](DESIGN.md#metric-ramp), and the widths are each tool's
  `renderConfig` in `src/lib/data/tools.json`.
- **Existing-network baseline** (the context lines under FixBikeNet, LinkBikeNet and SortBikeNet):
  periwinkle `#9999cc`, drawn faint beneath the ramp so the green stays exclusive to new links.

The Python port in [§2](#2-tier-1--maplibre-drop-in-for-notebook-maps-recommended-for-the-mwe)
(`_ramp_stops`, `_zoom_scale`) reproduces the GrowBikeNet ramp exactly.

## 6. Choosing a tier

| Tier                        | Fidelity                        | Effort                    | Draws MWE data?    | Runtime dependencies        |
| --------------------------- | ------------------------------- | ------------------------- | ------------------ | --------------------------- |
| **Tier 1** MapLibre helper  | Full                            | Medium (one helper)       | Yes                | style, tiles, glyphs        |
| **Tier 2** Folium + basemap | Basemap approximate, data exact | Medium-high (flavor port) | Yes                | tiles                       |
| **Tier 3** iframe `/embed`  | Pixel-identical                 | Low                       | No, canonical only | full website (after launch) |

**Recommendation:** Tier 1 for the MWE and any cell that visualises computed results; Tier 3 for
showcase maps on overview pages once the site has launched. Tier 2 only if the Folium workflow must
be preserved.

## Maintaining the published assets

The style and glyphs are built and published from `www/` with `pnpm build:mapstyle` and
`pnpm deploy:mapstyle` (maintainers only, SSH to the server). [DEPLOY_TILES.md](DEPLOY_TILES.md)
says when to rerun them and how the tiles host serves them. The `/embed` route lives in
`src/routes/embed/` and uses the same data loader as the map pages.
