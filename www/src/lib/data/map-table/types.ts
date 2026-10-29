import type { DatasetKey } from '$lib/data/dataset-layers';
import type { Point } from '$lib/utils/geo';

export type Column = { label: string; numeric?: boolean };

/** One table row. `header` fills the first column, as a row header. */
export type Row = { header: string; cells: string[] };

export type DataTable = {
	id: string;
	title: string;
	caption: string;
	note?: string;
	columns: Column[];
	rows: Row[];
};

export type MapTables =
	{ kind: 'empty'; summary: string } | { kind: 'tables'; summary: string; tables: DataTable[] };

export type MapTableInput = {
	key: DatasetKey;
	toolName: string;
	cityName: string;
	/** The midpoint of the city's bounds, which the location column measures from. */
	center: Point | null;
	geojson: GeoJSON.FeatureCollection;
	existingNetwork?: GeoJSON.FeatureCollection | null;
	blocks?: GeoJSON.FeatureCollection | null;
};

export const LOCATION_COLUMN: Column = { label: 'From the city midpoint' };

export const LOCATION_NOTE =
	'Distances are straight-line, measured from the center of the rectangle that encloses the city.';
