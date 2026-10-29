/**
 * Basemap theme — colors and fonts for map layers.
 *
 * Override any value to customize the map appearance.
 * Color keys match the Protomaps Flavor interface.
 */
import { coreColors } from '$lib/colors.js';

// ── Fonts ──────────────────────────────────────────────
export const fonts = {
	regular: 'Public Sans Regular',
	bold: 'Public Sans Bold',
	italic: 'Public Sans Italic',
	devanagari: 'Noto Sans Devanagari Regular v1'
};

// ── Protomaps WHITE palette — the base the theme overrides ──
export const BASE_PALETTE = {
	background: '#ffffff',
	earth: '#ffffff',

	// Landuse
	park_a: '#fcfcfc',
	wood_a: '#fafafa',
	scrub_a: '#fafafa',
	glacier: '#fcfcfc',
	sand: '#fafafa',
	hospital: '#f8f8f8',
	industrial: '#fcfcfc',
	school: '#f8f8f8',
	beach: '#f6f6f6',
	zoo: '#f7f7f7',
	military: '#f7f7f7',
	aerodrome: '#fdfdfd',
	pedestrian: '#fdfdfd',
	runway: '#efefef',

	// Water
	water: '#dcdcdc',

	// Structures
	pier: '#efefef',
	buildings: '#efefef',

	// Tunnels — casing
	tunnel_other_casing: '#d6d6d6',
	tunnel_minor_casing: '#fcfcfc',
	tunnel_link_casing: '#fcfcfc',
	tunnel_major_casing: '#fcfcfc',
	tunnel_highway_casing: '#fcfcfc',

	// Tunnels — fill
	tunnel_other: '#d6d6d6',
	tunnel_minor: '#d6d6d6',
	tunnel_link: '#d6d6d6',
	tunnel_major: '#d6d6d6',
	tunnel_highway: '#d6d6d6',

	// Roads — casing
	minor_service_casing: '#ffffff',
	minor_casing: '#ffffff',
	link_casing: '#ffffff',
	major_casing_late: '#ffffff',
	highway_casing_late: '#ffffff',
	major_casing_early: '#ffffff',
	highway_casing_early: '#ffffff',

	// Roads — fill
	other: '#f5f5f5',
	minor_service: '#f5f5f5',
	minor_a: '#ebebeb',
	minor_b: '#f5f5f5',
	link: '#ebebeb',
	major: '#ebebeb',
	highway: '#ebebeb',
	railway: '#d6d6d6',

	// Boundaries
	boundaries: '#adadad',

	// Bridges — casing
	bridges_other_casing: '#ffffff',
	bridges_link_casing: '#ffffff',
	bridges_minor_casing: '#ffffff',
	bridges_major_casing: '#ffffff',
	bridges_highway_casing: '#ffffff',

	// Bridges — fill
	bridges_other: '#f5f5f5',
	bridges_minor: '#f5f5f5',
	bridges_link: '#f5f5f5',
	bridges_major: '#ebebeb',
	bridges_highway: '#ebebeb',

	// Labels
	address_label: '#adadad',
	address_label_halo: '#ffffff',
	roads_label_minor: '#777',
	roads_label_minor_halo: '#ffffff',
	roads_label_major: '#555',
	roads_label_major_halo: '#ffffff',
	ocean_label: '#adadad',
	subplace_label: '#333',
	subplace_label_halo: '#ffffff',
	city_label: '#5c5c5c',
	city_label_halo: '#ffffff',
	locality_label: '#777',
	locality_label_halo: '#ffffff',
	state_label: '#5c5c5c',
	state_label_halo: '#ffffff',
	country_label: '#b8b8b8'
};

// ── Theme overrides ────────────────────────────────────
export const theme = {
	...BASE_PALETTE,

	background: coreColors.paperBase, // match app's --color-paper
	earth: '#FFF',
	water: '#e9F0f9', // ⚠ not in Figma — map-specific blue tint
	city_label: '#000000'
};
