import { fitToDataFor, lineWidthRangeFor } from '$lib/data/tools';
import { metricPropertyFor } from '$lib/data/metric-properties';

// Derives the `NetworkSvg` props from an `(app)/(map)` route's `page.data`, so the map download
// control renders the same vector the map draws.
export function networkSvgPropsFromData(data, size = 1080) {
	const tool = data.toolSlug;
	const isLink = tool === 'linkbikenet';
	const mode =
		tool === 'growbikenet' || isLink
			? 'ordered'
			: tool === 'superblockify' && data.type === 'edges'
				? 'superblock-edges'
				: 'default';
	return {
		geojson: data.geojson,
		bounds: data.bounds,
		metricProperty: metricPropertyFor(tool, data.metric, data.type),
		existingNetwork: isLink ? data.existingNetwork : null,
		lccStepProperty: isLink ? `lcc_step_${data.metric}` : null,
		lineWidthRange: lineWidthRangeFor(tool, data.type),
		fitToData: fitToDataFor(tool),
		size,
		mode
	};
}

export function exportFilename(data, ext, suffix) {
	const parts = [data.toolSlug, data.city, data.metric, data.type, data.variant, suffix].filter(
		Boolean
	);
	return `bikenetkit-${parts.join('-')}.${ext}`;
}
