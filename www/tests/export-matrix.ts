import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Tool, City, GrowBikeNetConfig } from '../src/lib/data/types';

// Duplicated from $lib/data/tools because importing that module pulls in
// `tools.json` via ESM JSON import, which Playwright's Node loader rejects.
function variantSuffix(variant: string): string {
	return variant === 'from_bikenw' ? '-from_bikenw' : '';
}

// Output pixels per side. The thumbnails are shown at ~300–350 CSS px (CityTeaser circles), so the
// map renders at SIZE / SCALE CSS px and SCALE× device pixels: MapLibre sizes lines in CSS px, and a
// 1080-CSS-px viewport left the network as hairlines once the image was shrunk into the circle (the
// same reasoning as scripts/generate-video.mjs).
export const SIZE = 1080;
export const SCALE = 2;
export const VIEWPORT = SIZE / SCALE;

export const tools: Tool[] = JSON.parse(readFileSync(resolve('src/lib/data/tools.json'), 'utf-8'));
export const cities: City[] = JSON.parse(
	readFileSync(resolve('src/lib/data/cities.json'), 'utf-8')
);

export const activeInteractiveTools = tools.filter(
	(tool) => tool.status === 'active' && tool.category === 'interactive'
);

export type Combo = { metric?: string; type?: string; variant?: string };

export function combosFor(tool: Tool): Combo[] {
	if (!tool.config) return [{}];
	const { metrics, types } = tool.config;
	const variants = (tool.config as GrowBikeNetConfig).variants ?? [undefined];
	const out: Combo[] = [];
	for (const metric of metrics) {
		for (const type of types) {
			for (const variant of variants) {
				out.push({ metric, type, variant });
			}
		}
	}
	return out;
}

// Mirrors `dataFilenameFor` / `geojsonPathFor` in $lib/data/tool-paths: SortBikeNet's files carry a
// constant `network` layer, and its as-built ordering ships once, under `from_2021`, for two views.
function stemFor(toolSlug: string, city: string, { metric, type, variant }: Combo): string {
	if (toolSlug === 'sortbikenet') return `${city}-${metric}-network-${type}`;
	const suffix = variant ? variantSuffix(variant) : '';
	return `${city}-${metric}-${type}${suffix}`;
}

export function outName(toolSlug: string, city: string, combo: Combo, ext = 'webp'): string {
	if (!combo.metric || !combo.type) return `${city}.${ext}`;
	return `${stemFor(toolSlug, city, combo)}.${ext}`;
}

export function dataFile(toolSlug: string, citySlug: string, combo: Combo): string {
	if (!combo.metric || !combo.type) return '';
	// No as-built view from 2026: that network *is* the last wave, so nothing is left to build.
	if (toolSlug === 'sortbikenet' && combo.metric === 'real') {
		if (combo.type === 'from_2026') return resolve('data', toolSlug, 'none');
		combo = { ...combo, type: 'from_2021' };
	}
	// www/data, not static/data: the off-repo trees moved out of the Vite public dir so the build
	// stops copying ~2.4 GB into build/ (see vite.config.js). This gate skips combos with no file on
	// disk, so a stale path here silently produces zero screenshots rather than failing.
	return resolve('data', toolSlug, `${stemFor(toolSlug, citySlug, combo)}.geojson`);
}

export function queryFor(size: number, { metric, type, variant }: Combo): string {
	const params = new URLSearchParams({ size: String(size) });
	if (metric) params.set('metric', metric);
	if (type) params.set('type', type);
	if (variant) params.set('variant', variant);
	return params.toString();
}
