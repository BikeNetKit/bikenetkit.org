import type { City, CityRecommended } from './types';
import type { DatasetsByTool } from '$lib/data/datasets';
import { toolBySlug } from './tools';
import { growBikeNetVariantLabels } from './tool-paths';
import { pickDataset, toolCityHref } from './city-tools';

export interface CoverageColumn {
	/** Unique per column — GrowBikeNet appears twice, once per variant. */
	id: string;
	tool: string;
	/** GrowBikeNet only; other tools have a single flavor. */
	variant?: string;
	/** The city's recommendation flag — from `rec_table.csv`, or for SortBikeNet from
	 *  `SITE_RECOMMENDED`. */
	recKey?: keyof CityRecommended;
	label: string;
	sublabel?: string;
}

export const COVERAGE_COLUMNS: CoverageColumn[] = [
	{
		id: 'growbikenet:from_scratch',
		tool: 'growbikenet',
		variant: 'from_scratch',
		recKey: 'gbn',
		label: toolBySlug['growbikenet'].name,
		sublabel: growBikeNetVariantLabels['from_scratch']
	},
	{
		id: 'growbikenet:from_bikenw',
		tool: 'growbikenet',
		variant: 'from_bikenw',
		recKey: 'gbn_plus',
		label: toolBySlug['growbikenet'].name,
		sublabel: growBikeNetVariantLabels['from_bikenw']
	},
	{ id: 'linkbikenet', tool: 'linkbikenet', recKey: 'lbn', label: toolBySlug['linkbikenet'].name },
	{ id: 'fixbikenet', tool: 'fixbikenet', recKey: 'fbn', label: toolBySlug['fixbikenet'].name },
	{
		id: 'superblockify',
		tool: 'superblockify',
		recKey: 'sb',
		label: toolBySlug['superblockify'].name
	},
	// Last, not in catalog order: one city, so the column is almost all dots and reads better at
	// the edge than between two populated ones.
	{
		id: 'sortbikenet',
		tool: 'sortbikenet',
		recKey: 'sbn',
		label: toolBySlug['sortbikenet'].name,
		sublabel: 'Paris only'
	}
];

/** Sort weight, high to low: recommended (with data), available, nothing. A recommendation with
 *  no data behind it counts as nothing: since the 2026-09-15 freeze the export will not grow, so
 *  the table has no "coming" to promise. `pnpm check:coverage` still tracks those pairs. */
export type CoverageRank = 0 | 1 | 2;

export interface CoverageCellState {
	/** Set exactly when the cell is available — rank 1 or 2. */
	href?: string;
	rank: CoverageRank;
}

export interface CoverageRow {
	city: City;
	cells: Record<string, CoverageCellState>;
}

/** The two facts behind a cell, before the table collapses them into a rank. `check:coverage`
 *  reads these directly: the rank no longer tells a recommendation without data from nothing. */
export function coverageFacts(
	col: CoverageColumn,
	city: City,
	datasets: DatasetsByTool
): { recommended: boolean; hasData: boolean } {
	return {
		recommended: col.recKey !== undefined && city.recommended?.[col.recKey] === true,
		hasData: pickDataset(col.tool, city, datasets, col.variant) !== undefined
	};
}

function cellFor(col: CoverageColumn, city: City, datasets: DatasetsByTool): CoverageCellState {
	const { recommended, hasData } = coverageFacts(col, city, datasets);
	if (!hasData) return { rank: 0 };
	return {
		href: toolCityHref(col.tool, city, datasets, col.variant),
		rank: recommended ? 2 : 1
	};
}

export function buildCoverageRows(cities: City[], datasets: DatasetsByTool): CoverageRow[] {
	return cities.map((city) => ({
		city,
		cells: Object.fromEntries(COVERAGE_COLUMNS.map((col) => [col.id, cellFor(col, city, datasets)]))
	}));
}
