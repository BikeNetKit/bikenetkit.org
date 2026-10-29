import { formatMetric } from '$lib/data/metric-meta';
import { formatBlockArea } from '$lib/utils/formatters';
import { blockLabel, blockRows } from '$lib/utils/superblocks';
import { featureCenter, formatCount, formatShare, relativeLocation } from './sample';
import { LOCATION_COLUMN, LOCATION_NOTE, type MapTableInput, type MapTables } from './types';

const RANKED_ROWS = 10;
const TENTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function superblockifyTables(input: MapTableInput): MapTables {
	const blocks = blockRows(input.blocks).sort((a, b) => b.props.density - a.props.density);
	const B = blocks.length;
	if (!B) {
		return {
			kind: 'empty',
			summary: `The ${input.toolName} result for ${input.cityName} contains no superblocks, so there is nothing to tabulate.`
		};
	}

	const people = (n: number) => formatMetric('population', n);
	const P = blocks.reduce((sum, b) => sum + b.props.population, 0);
	const A = blocks.reduce((sum, b) => sum + b.props.areaKm2, 0);

	// Running totals over the densest-first order the playback reveals them in.
	const residents: number[] = [];
	const areas: number[] = [];
	blocks.forEach((b, i) => {
		residents[i] = (residents[i - 1] ?? 0) + b.props.population;
		areas[i] = (areas[i - 1] ?? 0) + b.props.areaKm2;
	});
	const counts = [...new Set(TENTHS.map((t) => Math.max(1, Math.ceil((B * t) / 10))))];
	const tenthShare = P ? residents[counts[0] - 1] / P : 0;

	const summary = `${input.toolName} divides ${input.cityName}'s streets into ${formatCount(B)} ${B === 1 ? 'superblock' : 'superblocks'}, home to ${people(P)} people on ${formatBlockArea(A)}.${B >= 10 ? ` The densest tenth of them hold ${formatShare(tenthShare)} of those residents.` : ''}`;

	const top = [...blocks]
		.sort((a, b) => b.props.population - a.props.population)
		.slice(0, RANKED_ROWS);

	return {
		kind: 'tables',
		summary,
		tables: [
			{
				id: 'density',
				title: 'Superblocks from the most to the least densely populated',
				caption: `Residents and area of ${input.cityName}'s superblocks, counted from the densest`,
				note: `All ${formatCount(B)} superblocks are counted, whatever the size filter on the map shows. The totals run from the densest block down, in the order the playback reveals them.`,
				columns: [
					{ label: 'Densest' },
					{ label: 'Blocks', numeric: true },
					{ label: 'Residents', numeric: true },
					{ label: 'Share of residents', numeric: true },
					{ label: 'Area', numeric: true }
				],
				rows: counts.map((k) => ({
					header: k === B ? 'All' : formatShare(k / B),
					cells: [
						formatCount(k),
						people(residents[k - 1]),
						formatShare(P ? residents[k - 1] / P : 0),
						formatBlockArea(areas[k - 1])
					]
				}))
			},
			{
				id: 'ranked',
				title: `The ${top.length} superblocks with the most residents`,
				caption: `The ${top.length} superblocks in ${input.cityName} with the most residents`,
				note: LOCATION_NOTE,
				columns: [
					{ label: 'Block' },
					{ label: 'Residents', numeric: true },
					{ label: 'Population density', numeric: true },
					{ label: 'Area', numeric: true },
					{ label: 'Street length', numeric: true },
					LOCATION_COLUMN
				],
				rows: top.map((b) => ({
					header: blockLabel(input.key.metric, b.props.classification),
					cells: [
						people(b.props.population),
						formatMetric('population_density', b.props.density),
						formatBlockArea(b.props.areaKm2),
						formatMetric('length', b.props.lengthM),
						relativeLocation(featureCenter(b.feature), input.center)
					]
				}))
			}
		]
	};
}
