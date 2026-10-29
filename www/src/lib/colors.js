/**
 * Color constants — raw hex values for JS contexts (e.g. MapLibre paint).
 * For CSS, use the named @theme tokens in layout.css instead.
 */
export const coreColors = {
	// Brand green. Mirrored as --color-base-eden / --color-brand in layout.css,
	// and used as the wordmark fill in the brand SVGs — keep all three in sync.
	brand: '#096a51',

	// Ink
	ink: '#274d1a',
	inkWeaker: '#607858',

	// Surface
	paperBase: '#f7f7f0',
	paperWhite: '#ffffff',

	// Viz ramp anchors
	ramp0: '#e7e1d1',
	ramp1: '#d3d59c',
	ramp2: '#65B81D',
	ramp3: '#00676f',

	// Existing bike network baseline (from_bikenw variant).
	// Mirrored as --color-existing-network* in layout.css — keep both in sync.
	existingNetwork: '#9999cc',
	existingNetworkHover: '#7a7aa3',
	// SortBikeNet's lighter baseline: the two above, 30% of the way to paperBase. JS-only (map
	// paint and legend swatches), so there is no CSS token to keep in sync.
	existingNetworkLight: '#b5b5d7',
	existingNetworkLightHover: '#a0a0ba',
	// Existing network wired into the largest connected component (linkbikenet).
	// Same periwinkle family as the baseline so the green ramp stays exclusive to
	// newly built links — connectedness is encoded as saturation, not hue.
	existingNetworkConnected: '#4c4c99'
};
