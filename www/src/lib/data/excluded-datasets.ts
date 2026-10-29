import excluded from './excluded-datasets.json';

export type ExcludedDataset = { tool: string; city: string; reason: string; issue?: string };

export const excludedDatasets: ExcludedDataset[] = excluded.excluded;

const keys = new Set(excludedDatasets.map((e) => `${e.tool}:${e.city}`));

/** Whether the site deliberately ships nothing for this pair — see excluded-datasets.json. */
export function isExcludedDataset(tool: string, city: string): boolean {
	return keys.has(`${tool}:${city}`);
}
