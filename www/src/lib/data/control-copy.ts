/**
 * What each control on a map page actually does, in the reader's language.
 *
 * Kept out of `metric-meta.ts` on purpose: that file describes *measurements* — a label, a unit and
 * a formatter for a number that appears in a tooltip or on a legend. Half the axes here are not
 * measurements at all (linkbikenet's "metrics" are linking strategies, GrowBikeNet's variants are
 * starting conditions), and filing them under metric metadata would blur two vocabularies that
 * happen to share a route parameter name.
 *
 * Drafts pending sign-off from the metric-interpretation session — see LAUNCH_PLAN W6.
 */

export type AxisCopy = {
	/** Panel heading. Describes the axis, not the parameter name. */
	title: string;
	/** One sentence per option, keyed by the route parameter's value. */
	options: Record<string, string>;
	/**
	 * Shorter labels for the segmented control. The panel heading already carries the axis, so the
	 * pill does not have to repeat it — and a label that wraps to two lines pushes the control to
	 * the full width of the panel.
	 */
	labels?: Record<string, string>;
};

/**
 * The one-line orientation each map page opens with. Deliberately not `tools.json`'s
 * `longDescription`: that text walks through the metrics and the seed types, which the control
 * panels below it now explain one option at a time — repeating it here would say everything twice
 * and bury the answer to the only question this panel has to settle, which is what the map shows.
 */
const INTRO: Record<string, string> = {
	growbikenet:
		'Grows a bicycle network, always adding next the street that helps the network most. Play the timeline to watch it build up.',
	linkbikenet:
		'Links up the fragmented pieces of an existing network in a specific order. Play the timeline to watch it build up.',
	fixbikenet:
		"Fixes a city's bike network by finding its missing links, ranked by how much closing each gap would help.",
	superblockify:
		'Divides the street network into superblocks: pockets of calm streets, bounded by the roads that carry the through-traffic.',
	sortbikenet:
		'Sorts links in a bike network plan for the best build order, to cover the city fast and with direct routes. Play the timeline to watch one ordering build the plan.'
};

/**
 * A short phrase per tool that completes the panel's "Apply when…" heading, naming the kind of city
 * and network it suits so a planner can tell at a glance whether to reach for it. Draft copy —
 * pending the same sign-off as the intros (LAUNCH_PLAN W6).
 */
const APPLY_WHEN: Record<string, string> = {
	growbikenet: 'you plan from an existing network or from scratch.',
	linkbikenet: 'bike lanes are in fragmented pieces to connect.',
	fixbikenet: 'a well connected network has some gaps to close.',
	superblockify: 'a dense city wants calmer through-streets.',
	sortbikenet: 'a city has a network plan and has to decide what to build first.'
};

const COPY: Record<string, Record<string, AxisCopy>> = {
	sortbikenet: {
		metric: {
			title: 'Ordering',
			options: {
				betweenness:
					'Builds the segments that the most shortest paths run through first, so the busiest through-routes come first.',
				closeness:
					'Builds the most central segments first, so the network grows outward from the middle of the city.',
				coverage: 'Always builds the segment that adds the most newly covered area next.',
				directness:
					'Always builds the segment that makes trips across the network most direct next.',
				dual_betweenness:
					'Betweenness measured between street segments rather than intersections: the segments on the most routes come first. It beats the as-built order on both area covered and directness.',
				dual_closeness:
					'Closeness measured between street segments rather than intersections: the most central segments come first.',
				hierarchy:
					'Builds the plan tier by tier: the main routes first, then the secondary ones, etc.',
				hierarchy_coverage:
					'Builds tier by tier, and within each tier the segment that covers the most new area first. It beats the as-built order on both area covered and directness.',
				hierarchy_directness:
					'Builds tier by tier, and within each tier the segment that makes trips most direct first.',
				random:
					'Builds the segments in random order. The baseline every other ordering has to beat.',
				real: 'The order Paris actually built its network in, wave by wave from 2021 to 2026, based on data from the cycling advocacy group Paris en Selle. Segments not yet built stay in the faint plan outline.'
			},
			labels: {
				betweenness: 'Betweenness',
				closeness: 'Closeness',
				coverage: 'Coverage',
				directness: 'Directness',
				dual_betweenness: 'Betweenness (dual)',
				dual_closeness: 'Closeness (dual)',
				hierarchy: 'Hierarchy',
				hierarchy_coverage: 'Hierarchy + coverage',
				hierarchy_directness: 'Hierarchy + directness',
				random: 'Random',
				real: 'As built'
			}
		},
		type: {
			title: 'Starting point',
			options: {
				from_scratch:
					'Builds the whole plan from nothing, as if the city had no bike network at all.',
				from_2021: 'Starts from the network Paris had in 2021 and builds the rest of the plan.',
				from_2026: 'Starts from the network Paris has today and builds what is still missing.'
			},
			labels: {
				from_scratch: 'From scratch',
				from_2021: 'From 2021',
				from_2026: 'From 2026'
			}
		}
	},
	growbikenet: {
		metric: {
			title: 'Growth metric',
			options: {
				betweenness:
					'Builds the corridors that the most shortest paths run through first, so the network grows along the city’s busiest through-routes.',
				closeness:
					'Builds outward from the most central locations first, so the network grows as a compact area around the center.'
			},
			labels: {
				betweenness: 'Betweenness',
				closeness: 'Closeness'
			}
		},
		type: {
			title: 'Focus',
			options: {
				grid: 'Grows an even blanket of coverage across the whole city, with no particular focus. Choose "rail" or "schools" if you want to prioritize those.',
				rail: 'Grows the bike network toward rail and metro stations, extending the reach of public transit. The station symbols mark every station in the city, and the black dots mark the seeds the network grew from.',
				school:
					'Grows the network to prioritize safe routes to schools, kindergartens, and universities. The symbols mark each of them in the city, and the black dots mark the seeds the network grew from.'
			},
			labels: {
				grid: 'Area coverage',
				rail: 'Rail',
				school: 'Schools'
			}
		},
		variant: {
			title: 'Starting point',
			options: {
				from_scratch: 'Plans the whole network from scratch, ignoring what is already built.',
				from_bikenw: 'Grows the new network on top of the existing network.'
			}
		}
	},
	linkbikenet: {
		metric: {
			title: 'Linking strategy',
			options: {
				largest:
					'Largest — connects the largest disconnected pieces first: builds up a large network first, but needs long links and the most kilometers to finish.',
				closest:
					'Closest — connects the closest pairs of pieces first: short links and the fewest kilometers needed to finish, but delaying build-up of a large network.',
				largest_closest:
					'Largest to closest — connects the largest piece to the next close piece: a middle course between the other two strategies.'
			},
			labels: {
				largest: 'L',
				closest: 'C',
				largest_closest: 'L2C'
			}
		}
	},
	fixbikenet: {
		metric: {
			title: 'Gap severity',
			options: {
				gap: 'Each missing link is colored by how many safely cycled meters the network would gain if that one gap were closed.'
			}
		}
	},
	superblockify: {
		metric: {
			title: 'Classification',
			options: {
				betweenness:
					'Streets ranked by how much through-traffic they carry — the candidates for superblock boundaries.',
				residential: 'Blocks derived from residential streets.'
			}
		}
	}
};

/**
 * What a GrowBikeNet seed point is, per focus — the map tooltip on a seed dot. The seeds are not the
 * places themselves: each one starts from a real place (or grid point) and is then fitted to the
 * existing street network, which is why they do not sit exactly on the station and school symbols.
 */
const SEED_POINT: Record<string, string> = {
	grid: 'A point on an even grid laid over the city, adjusted to the existing street network so the bike network can reach it.',
	rail: 'Based on an actual rail or metro station, but adjusted to the existing street network so the bike network can reach it.',
	school:
		'Based on an actual school, kindergarten, or university, but adjusted to the existing street network so the bike network can reach it.'
};

/** The seed-point tooltip text for a GrowBikeNet focus, or null for an unknown one. */
export function seedPointCopy(focus: string): string | null {
	return SEED_POINT[focus] ?? null;
}

/** The map page's opening line for a tool, or null where none is written yet. */
export function toolIntro(toolSlug: string): string | null {
	return INTRO[toolSlug] ?? null;
}

/** The tool's "apply when" line — which city and network it suits — or null where none is written. */
export function toolApplyWhen(toolSlug: string): string | null {
	return APPLY_WHEN[toolSlug] ?? null;
}

/**
 * The tool's options relabelled for a control panel, where a heading already names the axis.
 * Options without an override keep the label the loader gave them.
 */
export function labelOptions<T extends { value: string; label: string }>(
	toolSlug: string,
	axis: string,
	options: T[]
): T[] {
	const labels = COPY[toolSlug]?.[axis]?.labels;
	if (!labels) return options;
	return options.map((o) => ({ ...o, label: labels[o.value] ?? o.label }));
}

/** One option's short label, where the copy gives one. */
export function optionLabel(toolSlug: string, axis: string, option: string): string {
	return COPY[toolSlug]?.[axis]?.labels?.[option] ?? option;
}

/** One option's description — the panel body. */
export function optionCopy(toolSlug: string, axis: string, option: string): string | null {
	return COPY[toolSlug]?.[axis]?.options[option] ?? null;
}

/** An axis's panel heading, falling back to a readable default. */
export function axisTitle(toolSlug: string, axis: string, fallback: string): string {
	return COPY[toolSlug]?.[axis]?.title ?? fallback;
}
