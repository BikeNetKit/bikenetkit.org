import type { Tool, GrowBikeNetConfig } from './types';
import toolsData from './tools.json';
import toolVersions from './tool-versions.json';
import { DEFAULT_LINE_WIDTH_RANGE } from '$lib/map-style/render-config.js';

export const tools = toolsData as Tool[];

export const interactiveTools = tools.filter((tool) => tool.category === 'interactive');
export const staticTools = tools.filter((tool) => tool.category === 'static');
// /more-tools splits these two ways: BikeNetLib is in the BikeNetKit organisation, the other six
// are related work from the same research community. Both preserve tools.json order, which is the
// display order.
export const kitStaticTools = staticTools.filter((tool) => !tool.external);
export const relatedTools = staticTools.filter((tool) => tool.external);
export const comingSoonTools = tools.filter((tool) => tool.status === 'coming-soon');
export const activeInteractiveTools = interactiveTools.filter((tool) => tool.status === 'active');

export const toolBySlug = Object.fromEntries(tools.map((tool) => [tool.slug, tool])) as Record<
	string,
	Tool
>;

export const growBikeNetConfig = toolBySlug['growbikenet'].config as GrowBikeNetConfig;

export const DOCS_BASE = 'https://docs.bikenetkit.org';

/**
 * Conventional docs URL for a tool — its `name` verbatim, trailing slash. For authoring
 * `tools.json` only: pages read `tool.docs`, so a tool whose docs page does not exist yet
 * carries no link rather than a 404.
 */
export function conventionalDocsUrl(name: string): string {
	return `${DOCS_BASE}/${name}/`;
}

export function lineWidthRangeFor(slug: string, type?: string): [number, number] {
	const cfg = toolBySlug[slug]?.renderConfig;
	if (cfg?.lineWidthRangeByType && type && cfg.lineWidthRangeByType[type]) {
		return cfg.lineWidthRangeByType[type];
	}
	return cfg?.lineWidthRange ?? (DEFAULT_LINE_WIDTH_RANGE as [number, number]);
}

export function fitToDataFor(slug: string): boolean {
	return toolBySlug[slug]?.renderConfig?.fitToData ?? false;
}

export type ToolVersion = { version: string; osmDataDate?: string };

/**
 * Release of the tool that produced the current export, plus the date of the OpenStreetMap
 * extract behind it. Written by `update-data` from the export's `meta/versions.csv`, so it
 * describes the shipped data — not the website. Undefined for tools the export does not cover.
 */
export function toolVersionFor(slug: string): ToolVersion | undefined {
	return (toolVersions as Record<string, ToolVersion>)[slug];
}
