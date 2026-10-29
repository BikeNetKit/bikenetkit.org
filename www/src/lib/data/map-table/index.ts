import { growBikeNetTables, linkBikeNetTables, sortBikeNetTables } from './buildup';
import { fixBikeNetTables } from './fixbikenet';
import { superblockifyTables } from './superblockify';
import type { MapTableInput, MapTables } from './types';

export type { Column, DataTable, MapTableInput, MapTables, Row } from './types';

const BUILDERS: Record<string, (input: MapTableInput) => MapTables> = {
	growbikenet: growBikeNetTables,
	linkbikenet: linkBikeNetTables,
	sortbikenet: sortBikeNetTables,
	fixbikenet: fixBikeNetTables,
	superblockify: superblockifyTables
};

/**
 * The map in words and tables: a summary of the finished result, how it builds up, and its most
 * important parts. Built from the same layers the map paints, with the same series and formatters
 * as the HUD and the tooltips, so the numbers agree.
 */
export function buildMapTables(input: MapTableInput): MapTables | null {
	return BUILDERS[input.key.tool]?.(input) ?? null;
}
