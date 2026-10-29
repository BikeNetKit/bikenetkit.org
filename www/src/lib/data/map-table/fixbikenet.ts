import { rankGaps } from '$lib/data/fixbikenet';
import { formatMetric } from '$lib/data/metric-meta';
import { metricScale } from '$lib/map-style/metric-scale.js';
import { featureCenter, relativeLocation } from './sample';
import { LOCATION_COLUMN, LOCATION_NOTE, type MapTableInput, type MapTables } from './types';

const UNNAMED = 'Unnamed street';

export function fixBikeNetTables(input: MapTableInput): MapTables {
	const gaps = rankGaps(input.geojson, metricScale(input.geojson, 'benefit').legend);
	const S = gaps.length;
	if (!S) {
		return {
			kind: 'empty',
			summary: `The ${input.toolName} result for ${input.cityName} contains no missing links, so there is nothing to tabulate.`
		};
	}

	const totalM = gaps.reduce((sum, g) => sum + (g.feature.properties?.length ?? 0), 0);
	const worst = gaps[0].label ? `on ${gaps[0].label}` : 'on an unnamed street';
	const summary =
		S === 1
			? `${input.toolName} finds one missing link in ${input.cityName}'s bike network, ${formatMetric('length', totalM)} long. It is ${worst}.`
			: `${input.toolName} finds ${S} missing links in ${input.cityName}'s bike network, ${formatMetric('length', totalM)} in all. The most severe is ${worst}.`;

	return {
		kind: 'tables',
		summary,
		tables: [
			{
				id: 'gaps',
				title: 'Missing links, most severe first',
				caption: `All ${S} missing links ${input.toolName} finds in ${input.cityName}, by severity`,
				note: `Gap severity runs from 1 to 10 within this city. ${LOCATION_NOTE}`,
				columns: [
					{ label: 'Rank' },
					{ label: 'Street' },
					{ label: 'Gap severity', numeric: true },
					{ label: 'Length', numeric: true },
					LOCATION_COLUMN
				],
				rows: gaps.map((g) => ({
					header: `#${g.rank}`,
					cells: [
						g.label ?? UNNAMED,
						String(g.score ?? '–'),
						formatMetric('length', g.feature.properties?.length ?? 0),
						relativeLocation(featureCenter(g.feature), input.center)
					]
				}))
			}
		]
	};
}
