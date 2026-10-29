export function metricPropertyFor(tool: string, metric: string, type: string): string {
	if (tool === 'fixbikenet') return 'benefit';
	// linkbikenet's `metric` axis selects a growth strategy, not a feature property.
	if (tool === 'linkbikenet') return 'lcc_gain';
	// sortbikenet's `metric` axis selects an ordering; every one is coloured by when it builds.
	if (tool === 'sortbikenet') return 'length_cumulative';
	if (tool === 'superblockify') {
		if (metric === 'betweenness') {
			return type === 'nodes' ? 'node_betweenness_linear' : 'edge_betweenness_linear';
		}
		if (metric === 'residential') {
			return type === 'nodes'
				? 'node_betweenness_linear_restricted'
				: 'edge_betweenness_linear_restricted';
		}
	}
	return metric;
}

/** LinkBikeNet's running share of the network in the largest connected component. */
export const LINKBIKENET_LCC_SHARE = 'lcc_share';
