import { PUBLIC_BASEMAP_URL } from '$env/static/public';
import './pmtiles-protocol.js';
import './maplibre-worker.js';
import { makeLayers } from './layers.js';
import {
	CLIPPED_LABEL_LAYERS,
	clippedFilter,
	FOCUS_EMPHASIS_LAYERS,
	focusTextField,
	focusTextFont,
	focusTextColor
} from './label-clip.js';
import { fonts, theme } from './theme.js';

const SOURCE = 'protomaps';

export const mapStyle = {
	version: 8,
	glyphs: '/fonts/maplibre/{fontstack}/{range}.pbf',
	sources: {
		[SOURCE]: {
			type: 'vector',
			// One self-hosted archive, read via range requests. The pmtiles protocol derives
			// minzoom/maxzoom from the archive header, so MapLibre keeps overzooming z15 up to
			// MAX_ZOOM 17 exactly as the hosted API did.
			url: `pmtiles://${PUBLIC_BASEMAP_URL}`,
			// The ODbL attribution OSM asks for is "© OpenStreetMap contributors", not a bare link to
			// the project — the credit names the contributors, who hold the rights. See /legal#credits.
			attribution:
				'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> | <a href="https://protomaps.com">Protomaps</a>'
		}
	},
	layers: makeLayers(SOURCE, theme, fonts)
};

/**
 * The lowest basemap label layer. Data overlays are inserted beneath it so labels stay legible on
 * top of the network. Hiding labels only switches their visibility, so this layer is on the map in
 * every mode — which is what makes it safe as a `beforeId` (MapLibre throws on one that is not).
 */
const LOWEST_LABEL_LAYER = 'address_label';

/** Every basemap symbol layer — the "labels" that `labels: false` and the reader's toggle cover. */
const LABEL_LAYER_IDS = mapStyle.layers.filter((layer) => layer.type === 'symbol').map((l) => l.id);

/** Where a data overlay belongs in the layer stack. */
export function overlayBeforeId() {
	return LOWEST_LABEL_LAYER;
}

/**
 * The basemap style for one city.
 *
 * Baked in at map construction rather than applied afterwards, because `/screenshot` captures on
 * the map's first `idle`, which can fire before a Svelte effect has run.
 *
 * @param {object} [options]
 * @param {GeoJSON.FeatureCollection | null} [options.cityBoundary]  clip place labels to this
 * @param {boolean} [options.labels]  false hides every symbol layer — static exports are read at
 *   thumbnail size, where basemap text is illegible noise over the network, and the tool pages let
 *   the reader switch it off. Hidden rather than removed, so the layer stack keeps its shape and
 *   the state can be toggled later — see `setLabelVisibility`.
 */
export function makeMapStyle({ cityBoundary = null, labels = true } = {}) {
	if (labels && !cityBoundary) return mapStyle;
	return {
		...mapStyle,
		layers: mapStyle.layers.map((layer) => {
			let next = layer;
			if (cityBoundary && CLIPPED_LABEL_LAYERS.includes(layer.id)) {
				const base = 'filter' in layer ? layer.filter : undefined;
				next = /** @type {import('maplibre-gl').LayerSpecification} */ ({
					...next,
					filter: clippedFilter(layer.id, base, cityBoundary)
				});
			}
			if (cityBoundary && FOCUS_EMPHASIS_LAYERS.includes(layer.id)) {
				next = /** @type {import('maplibre-gl').LayerSpecification} */ ({
					...next,
					layout: {
						...('layout' in next ? next.layout : {}),
						'text-field': focusTextField(cityBoundary),
						'text-font': focusTextFont(cityBoundary)
					},
					paint: {
						...('paint' in next ? next.paint : {}),
						'text-color': focusTextColor(cityBoundary)
					}
				});
			}
			if (!labels && layer.type === 'symbol') {
				next = { ...next, layout: { ...next.layout, visibility: 'none' } };
			}
			return next;
		})
	};
}

/**
 * Append site-level credit HTML to the basemap attribution, e.g. the link to `/legal`. The
 * interactive map shell uses it because the full-screen map view drops the sidebar and has no
 * footer, so the attribution control is the one piece of persistent chrome that can carry the
 * privacy link. Exports, embeds and screenshots pass nothing and get the plain credit.
 *
 * Clones the source rather than mutating it: `makeMapStyle()` returns the shared `mapStyle` object
 * in its fast path, and an in-place edit there would leak into every other map on the page.
 *
 * @param {import('maplibre-gl').StyleSpecification} style
 * @param {string} [extra]  HTML appended after a separator; empty returns the style untouched
 */
export function withAttributionExtra(style, extra) {
	if (!extra) return style;
	const source = style.sources[SOURCE];
	if (!('attribution' in source)) return style;
	return {
		...style,
		sources: {
			...style.sources,
			[SOURCE]: { ...source, attribution: `${source.attribution} | ${extra}` }
		}
	};
}

/**
 * Show or hide every basemap label on a live map. The initial state comes from `makeMapStyle()`;
 * this is only for a later change — the reader's Labels checkbox — which can land before the style
 * has finished loading, where `setLayoutProperty` would throw.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} visible
 */
export function setLabelVisibility(map, visible) {
	if (!map.isStyleLoaded()) {
		map.once('idle', () => setLabelVisibility(map, visible));
		return;
	}
	for (const id of LABEL_LAYER_IDS) {
		if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
	}
}
