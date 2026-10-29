/**
 * How the number each metric panel shows is arrived at — the copy behind the (?) button on a map
 * page's metric panel.
 *
 * Kept apart from its two neighbours on purpose. `control-copy.ts` says what each *option* on a
 * control does, one sentence per option; `metric-meta.ts` gives a measurement its label, unit and
 * formatter. This file answers the question neither of them is shaped for: where the headline
 * number comes from — what the tool computes, what the site does to it (the 1–10 log score, the
 * share delta, the unit conversion), and whether it can be compared across cities.
 *
 * The public FAQ at faq.bikenetkit.org carries the longer version of each answer, with the
 * formulas. When a paragraph here changes, tell whoever maintains the FAQ.
 */

import { toolBySlug } from './tools';
import { FAQ_URL } from '$lib/site.js';

export type HelpLink = { label: string; href: string };

export type MetricHelp = {
	/** The popover's title, phrased as the question it answers. */
	heading: string;
	/** Plain-text paragraphs, no markup. Two or three, so the popover fits a phone without scrolling. */
	paragraphs: string[];
	/** "Read more" targets: the tool's docs and paper from the catalogue, then the FAQ. */
	links: HelpLink[];
};

const HELP: Record<string, Omit<MetricHelp, 'links'>> = {
	growbikenet: {
		heading: 'How is importance calculated?',
		paragraphs: [
			'GrowBikeNet grows a bike network one street at a time, always adding the street that helps the network most. With betweenness, that is the street the most routes would pass through; with closeness, the one nearest the center.',
			'The importance score puts those values on a scale from 1 to 10 for this map, so 10 marks the streets that matter most here. Scores are relative to one city and setting: compare streets within a map, not between cities.'
		]
	},
	fixbikenet: {
		heading: 'How is gap severity calculated?',
		paragraphs: [
			'FixBikeNet finds gaps in the bike network of a city and estimates how much the whole network would gain if they were closed.',
			'Gap severity puts that gain on a scale from 1 to 10 for this city, so 10 is the gap worth closing first, and the top spots list the highest-scoring gaps. Scores are relative to one city: compare gaps within a map, not between cities.'
		]
	},
	linkbikenet: {
		heading: 'How is connectivity gain calculated?',
		paragraphs: [
			'LinkBikeNet joins the fragmented pieces of a city’s bike network one link at a time, following existing streets. The chart shows how much of the network is connected after each link: the share of all bike-lane length that sits in the largest connected piece.',
			'A link’s connectivity gain is how many percentage points that share rises when the link is built. A small dip is possible when a link only joins two minor pieces.'
		]
	},
	sortbikenet: {
		heading: 'How are the build order and area covered calculated?',
		paragraphs: [
			'SortBikeNet takes a finished bike network plan and puts its segments in an order: each ordering decides which segment to build next, considering area coverage, directness of routes, or following the road hierarchy. The colors show when a segment is built, darkest first.',
			'Area covered is how much of the city lies within reach of the network built so far, in km². It is plotted against kilometers built, so switching ordering compares the same spend. The as-built order shows what Paris actually built between 2021 and January 2026, based on data from the cycling advocacy group Paris en Selle.',
			'Area covered is only one of the two metrics the research weighs. The other is directness: how direct trips across the built network are. The starred orderings, hierarchy + coverage and betweenness (dual), beat the as-built order on both.'
		]
	},
	superblockify: {
		heading: 'How are superblocks and density calculated?',
		paragraphs: [
			'superblockify divides the streets into superblocks: pockets of calm streets, bounded by the streets that carry the through traffic. Those boundaries are either the busiest streets by the routes they carry (betweenness) or every street not tagged residential in OpenStreetMap.',
			'Population density is the number of people living in a block divided by its area, in people per km², taken from the 100 m population grid GHS-POP. The block colors only tell neighboring blocks apart.'
		]
	}
};

/**
 * Derived from the catalogue rather than retyped, so the URLs stay the ones `check:links` covers
 * and a tool without a docs page (LinkBikeNet) simply lists none.
 */
function linksFor(toolSlug: string): HelpLink[] {
	const tool = toolBySlug[toolSlug];
	const candidates: Array<{ label: string; href: string | undefined }> = [
		{ label: 'Documentation', href: tool?.docs },
		{ label: 'Paper', href: tool?.paper?.url },
		{ label: 'FAQ', href: FAQ_URL }
	];
	return candidates.filter((l): l is HelpLink => typeof l.href === 'string' && l.href.length > 0);
}

/** The (?) copy for a tool's metric panel, or null where none is written — as `toolIntro()` does. */
export function metricHelp(toolSlug: string): MetricHelp | null {
	const entry = HELP[toolSlug];
	return entry ? { ...entry, links: linksFor(toolSlug) } : null;
}
