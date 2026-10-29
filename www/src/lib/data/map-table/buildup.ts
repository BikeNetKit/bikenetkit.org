import {
	buildupFrames,
	buildupSeries,
	existingNetworkLength,
	stepIndexMap,
	type BuildupFrames,
	type BuildupSeries
} from '$lib/data/buildup-series';
import { formatMetric } from '$lib/data/metric-meta';
import { LINKBIKENET_LCC_SHARE, metricPropertyFor } from '$lib/data/metric-properties';
import { sortBikeNetLayerProps } from '$lib/data/sortbikenet';
import { importanceScore } from '$lib/map-style/importance.js';
import { metricScale } from '$lib/map-style/metric-scale.js';
import {
	featureCenter,
	formatCount,
	formatDate,
	formatShare,
	relativeLocation,
	sampleByShare
} from './sample';
import {
	LOCATION_COLUMN,
	LOCATION_NOTE,
	type Column,
	type DataTable,
	type MapTableInput,
	type MapTables,
	type Row
} from './types';

const RANKED_ROWS = 10;
const IMPORTANCE_RANGE: [number, number] = [1, 10];

const len = (m: number) => formatMetric('length', m);
const isOrdered = (f: GeoJSON.Feature) => typeof f.properties?.ordering === 'number';

type Buildup = {
	series: BuildupSeries;
	frames: BuildupFrames;
	steps: Map<number, number>;
	/** Newly built length at each frame. */
	builtM: number[];
	totalM: number;
	existingM: number;
};

function buildup(
	input: MapTableInput,
	options: {
		lccShareProperty?: string | null;
		qualityProperty?: string | null;
		qualityBaseline?: number | null;
	} = {}
): Buildup {
	const series = buildupSeries(input.geojson, options);
	const frames = buildupFrames(series, options.qualityBaseline ?? null);
	const builtM = frames.cumulative.map((v) => v - series.baselineM);
	return {
		series,
		frames,
		steps: stepIndexMap(series),
		builtM,
		totalM: builtM[builtM.length - 1] ?? 0,
		existingM: existingNetworkLength(input.geojson, input.existingNetwork, series.baselineM)
	};
}

const stepHeader = (frame: number) => (frame === 0 ? 'Start' : `Step ${formatCount(frame)}`);

/** The build step a feature belongs to, counted the way the scrubber and the tooltip count. */
const buildStep = (b: Buildup, f: GeoJSON.Feature) =>
	(b.steps.get(f.properties?.ordering) ?? 0) + 1;

/** The first step by which half of the new length is in place. */
const halfwayStep = (b: Buildup) => b.builtM.findIndex((v) => v >= b.totalM / 2);

function progressTable(
	b: Buildup,
	id: string,
	caption: string,
	extra: { column: Column; cell: (frame: number) => string }[],
	header: (frame: number) => string = stepHeader
): DataTable {
	const rows: Row[] = sampleByShare(b.builtM).map((i) => ({
		header: header(i),
		cells: [
			len(b.builtM[i]),
			formatShare(b.totalM ? b.builtM[i] / b.totalM : 0),
			...extra.map((e) => e.cell(i))
		]
	}));
	const sampled = rows.length < b.builtM.length;
	return {
		id,
		title: 'How the network builds up',
		caption,
		note: sampled
			? `The ${formatCount(b.series.steps.length)} steps are sampled at every tenth of the new length.`
			: undefined,
		columns: [
			{ label: 'Step' },
			{ label: 'Newly built', numeric: true },
			{ label: 'Share of new length', numeric: true },
			...extra.map((e) => e.column)
		],
		rows
	};
}

function emptyResult(input: MapTableInput, noun: string, existingM: number): MapTables {
	const existing =
		existingM > 0 ? ` ${input.cityName}'s existing bike network is ${len(existingM)} long.` : '';
	return {
		kind: 'empty',
		summary: `The ${input.toolName} result for ${input.cityName} contains no ${noun}, so there is nothing to tabulate.${existing}`
	};
}

export function growBikeNetTables(input: MapTableInput): MapTables {
	const b = buildup(input);
	const S = b.series.steps.length;
	if (!S) return emptyResult(input, 'new segments', b.existingM);

	const { metric, type } = input.key;
	const property = metricPropertyFor('growbikenet', metric, type);
	const extent = metricScale(input.geojson, property, (f) => f.properties?.ordering != null).legend;
	const existing = b.existingM > 0;
	const halfway = halfwayStep(b);
	const summary = existing
		? `Starting from ${len(b.existingM)} of existing bike network, ${input.toolName} adds ${len(b.totalM)} of new network in ${formatCount(S)} steps, for ${len(b.existingM + b.totalM)} in all. Half of the new length is in place by step ${formatCount(halfway)}.`
		: `Starting from scratch, ${input.toolName} builds ${len(b.totalM)} of new network in ${formatCount(S)} steps. Half of it is in place by step ${formatCount(halfway)}.`;

	const progress = progressTable(
		b,
		'progress',
		`New network built at each step of ${input.toolName} in ${input.cityName}`,
		existing
			? [
					{
						column: { label: 'Whole network', numeric: true },
						cell: (i) => len(b.existingM + b.builtM[i])
					}
				]
			: []
	);

	const top = input.geojson.features
		.filter((f) => isOrdered(f) && typeof f.properties?.[property] === 'number')
		.sort(
			(a, c) =>
				c.properties?.[property] - a.properties?.[property] ||
				a.properties?.ordering - c.properties?.ordering
		)
		.slice(0, RANKED_ROWS);
	const ranked: DataTable = {
		id: 'ranked',
		title: `The ${top.length} most important new segments`,
		caption: `The ${top.length} new segments that matter most to the network, by importance`,
		note: `Importance runs from 1 to 10 within this result. ${LOCATION_NOTE}`,
		columns: [
			{ label: 'Rank' },
			{ label: 'Importance', numeric: true },
			{ label: 'Build step', numeric: true },
			{ label: 'Length', numeric: true },
			LOCATION_COLUMN
		],
		rows: top.map((f, i) => ({
			header: `#${i + 1}`,
			cells: [
				String(importanceScore(f.properties?.[property], extent, IMPORTANCE_RANGE) ?? '–'),
				formatCount(buildStep(b, f)),
				len(f.properties?.length ?? 0),
				relativeLocation(featureCenter(f), input.center)
			]
		}))
	};

	return { kind: 'tables', summary, tables: [progress, ranked] };
}

export function linkBikeNetTables(input: MapTableInput): MapTables {
	const b = buildup(input, { lccShareProperty: LINKBIKENET_LCC_SHARE });
	const S = b.series.steps.length;
	if (!S) return emptyResult(input, 'links', b.existingM);

	const share = (v: number) => formatShare(v, 1);
	const p0 = b.series.baselineShare;
	const p1 = b.frames.lccShare[b.frames.lccShare.length - 1] ?? p0;
	const links = input.geojson.features.filter(isOrdered);
	const noGain = links.filter((f) => !((f.properties?.lcc_gain ?? 0) > 0)).length;
	const summary = [
		`${input.cityName}'s existing bike network is ${len(b.existingM)} long, and ${share(p0)} of it is connected in one piece.`,
		`${input.toolName} adds ${formatCount(S)} ${S === 1 ? 'link' : 'links'}, ${len(b.totalM)} in all, which raises that share to ${share(p1)}.`,
		noGain > 0
			? `${formatCount(noGain)} of the links leave the share unchanged at the moment they are added.`
			: ''
	]
		.filter(Boolean)
		.join(' ');

	const progress = progressTable(
		b,
		'progress',
		`New links built and network connected at each step of ${input.toolName} in ${input.cityName}`,
		[
			{
				column: { label: 'Network connected', numeric: true },
				cell: (i) => share(b.frames.lccShare[i])
			}
		]
	);

	const top = links
		.filter((f) => typeof f.properties?.lcc_gain === 'number')
		.sort(
			(a, c) =>
				c.properties?.lcc_gain - a.properties?.lcc_gain ||
				a.properties?.ordering - c.properties?.ordering
		)
		.slice(0, RANKED_ROWS);
	const ranked: DataTable = {
		id: 'ranked',
		title: `The ${top.length} links that connect the most`,
		caption: `The ${top.length} links that raise the connected share the most`,
		note: `Connectivity gain is how much one link raises the share of the network that is connected in one piece. ${LOCATION_NOTE}`,
		columns: [
			{ label: 'Rank' },
			{ label: 'Connectivity gain', numeric: true },
			{ label: 'Build step', numeric: true },
			{ label: 'Length', numeric: true },
			LOCATION_COLUMN
		],
		rows: top.map((f, i) => ({
			header: `#${i + 1}`,
			cells: [
				formatMetric('lcc_gain', f.properties?.lcc_gain),
				formatCount(buildStep(b, f)),
				len(f.properties?.length ?? 0),
				relativeLocation(featureCenter(f), input.center)
			]
		}))
	};

	return { kind: 'tables', summary, tables: [progress, ranked] };
}

export function sortBikeNetTables(input: MapTableInput): MapTables {
	const { qualityProperty, qualityBaseline } = sortBikeNetLayerProps(input.geojson);
	const b = buildup(input, { qualityProperty, qualityBaseline });
	const S = b.series.steps.length;
	if (!S) return emptyResult(input, 'segments to build', b.existingM);

	const area = (v: number | undefined) =>
		typeof v === 'number' ? formatMetric(qualityProperty, v) : '–';
	const q0 = area(b.frames.quality[0]);
	const q1 = area(b.frames.quality[b.frames.quality.length - 1]);
	const areaColumn = {
		column: { label: 'Area covered', numeric: true },
		cell: (i: number) => area(b.frames.quality[i])
	};

	if (input.key.metric === 'real') {
		const waveDate = new Map<number, string>();
		for (const f of input.geojson.features) {
			const step = f.properties?.ordering;
			const date = f.properties?.built_in;
			if (typeof step === 'number' && typeof date === 'string' && !waveDate.has(step)) {
				waveDate.set(step, formatDate(date));
			}
		}
		const dateOf = (frame: number) =>
			frame === 0 ? 'Start' : (waveDate.get(b.frames.steps[frame]) ?? stepHeader(frame));
		const first = dateOf(1);
		const last = dateOf(S);
		const summary = `As built, ${input.cityName} added ${len(b.totalM)} of its plan in ${S} construction ${S === 1 ? 'wave' : 'waves'}${S > 1 ? ` between ${first} and ${last}` : `, on ${first}`}. The area the network covers grew from ${q0} to ${q1}.`;
		const waves = progressTable(
			b,
			'waves',
			`Network built in each construction wave in ${input.cityName}`,
			[areaColumn],
			dateOf
		);
		waves.title = 'How the network was built';
		waves.columns[0] = { label: 'Wave' };
		return { kind: 'tables', summary, tables: [waves] };
	}

	const summary = `This ordering builds ${len(b.totalM)} of ${input.cityName}'s bike network plan in ${formatCount(S)} steps, on top of ${len(b.existingM)} already built. The area the network covers grows from ${q0} to ${q1}.`;
	const progress = progressTable(
		b,
		'progress',
		`New network built and area covered at each step of this ordering in ${input.cityName}`,
		[areaColumn]
	);

	const first = input.geojson.features
		.filter(isOrdered)
		.sort((a, c) => a.properties?.ordering - c.properties?.ordering)
		.slice(0, RANKED_ROWS);
	const ranked: DataTable = {
		id: 'ranked',
		title: `The first ${first.length} segments built`,
		caption: `The first ${first.length} segments this ordering builds`,
		note: LOCATION_NOTE,
		columns: [
			{ label: 'Build step' },
			{ label: 'Length', numeric: true },
			{ label: 'Area covered after', numeric: true },
			LOCATION_COLUMN
		],
		rows: first.map((f) => {
			const step = buildStep(b, f);
			return {
				header: formatCount(step),
				cells: [
					len(f.properties?.length ?? 0),
					area(b.series.quality[step - 1]),
					relativeLocation(featureCenter(f), input.center)
				]
			};
		})
	};

	return { kind: 'tables', summary, tables: [progress, ranked] };
}
