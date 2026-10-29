export type ToolCategory = 'interactive' | 'static';
export type ToolStatus = 'active' | 'coming-soon';

export interface ToolConfig {
	metrics: readonly string[];
	types: readonly string[];
	defaultMetric: string;
	defaultType: string;
}

export interface GrowBikeNetConfig extends ToolConfig {
	/** Dataset flavor — e.g. `from_scratch`, `from_bikenw`. */
	variants: readonly string[];
	defaultVariant: string;
}

export interface ToolRenderConfig {
	/** Default line width range [min, max] in pixels at zoom 12. */
	lineWidthRange?: [number, number];
	/** Per-`type` overrides, e.g. `{ edges: [0.5, 2.5], nodes: [1, 2] }`. */
	lineWidthRangeByType?: Record<string, [number, number]>;
	/** Fit the map to the data bounds rather than the city bounds. */
	fitToData?: boolean;
}

export interface ToolReference {
	/** Paper title */
	title: string;
	/** Authors list */
	authors: string;
	/** Journal / venue */
	venue: string;
	/** Year of publication */
	year: number;
	/** URL to the paper (DOI or download link) */
	url: string;
}

/** A short, copy-pasteable shell/REPL sample shown as a terminal block on the tool's page. */
export interface ToolUsage {
	/** Heading above the block. Defaults to "Run it yourself". */
	title?: string;
	/** Shell/language label, informational only — there is no syntax highlighting. */
	language?: string;
	/** Interpreter and minimum version the sample assumes, e.g. `Python>=3.12`. Rendered verbatim
	 *  in a small line above the terminal, so it reads as the literal spec you'd put in a
	 *  requirements file. Absent = no line. */
	requirements?: string;
	/** The sample itself. Newlines are preserved verbatim when rendered. An empty string is
	 *  meaningful: it renders an empty terminal for a tool whose commands are not published yet,
	 *  which is why this is required — "no usage block" and "usage not published" differ. */
	code: string;
}

export interface Tool {
	name: string;
	/** Override for how `name` breaks into words for the logo word gap. Absent — the normal case —
	 *  means the camel-case splitter in `$lib/utils/word-mark.js` gets it right, which it does for
	 *  every tool shipping today. Only needed for a name it cannot parse. */
	nameParts?: string[];
	slug: string;
	shortDescription: string;
	/** The question this tool answers for a city, in a planner's words ("Where should a bike
	 *  network grow?"). Shown on the landing card in place of `shortDescription`. */
	questionAnswered: string;
	longDescription?: string;
	category: ToolCategory;
	status: ToolStatus;
	/** Not part of the BikeNetKit GitHub organisation — listed on /more-tools as related work by
	 *  the same research community, with no plan to incorporate it. Absent means part of the kit,
	 *  which is true of every interactive tool and of BikeNetLib. */
	external?: boolean;

	config?: ToolConfig;
	/** Optional per-tool map rendering overrides. */
	renderConfig?: ToolRenderConfig;
	/** URL of the original code repository (upstream, not BikeNetKit fork) */
	repo?: string;
	/** Commands for running the tool locally, taken from its own documentation. */
	usage?: ToolUsage;
	/** This tool's page on docs.bikenetkit.org, or its own docs site. Absent while the tool has no
	 *  docs page — the URL is recorded rather than derived so a missing page means no button, not
	 *  a 404. */
	docs?: string;
	/** Screencast tutorial on the BikeNetKit YouTube channel (`https://www.youtube.com/watch?v=…`).
	 *  Absent until the video is public, and the tool page then shows no tutorial button: a
	 *  scheduled or private video still resolves, as "Video unavailable". */
	tutorial?: string;
	/** Key academic publication behind this tool */
	paper?: ToolReference;
}

export type LngLatBounds = [[number, number], [number, number]];

export interface CityRecommended {
	gbn: boolean;
	gbn_plus: boolean;
	lbn: boolean;
	fbn: boolean;
	sb: boolean;
	/** Not in the export: set from `SITE_RECOMMENDED` when the cities load. */
	sbn?: boolean;
}

/** Per-city network structure metrics from the export's network_metrics.csv. */
export interface CityNetworkMetrics {
	cov_ratio?: number;
	l_ratio?: number;
	gcc1?: number;
	gcc2?: number;
	gcc3?: number;
}

export interface City {
	name: string;
	slug: string;
	bounds: LngLatBounds;
	country?: string;
	countryCode?: string;
	population?: number;
	recommended?: CityRecommended;
	metrics?: CityNetworkMetrics;
}
