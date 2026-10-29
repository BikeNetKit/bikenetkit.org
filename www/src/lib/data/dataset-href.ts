import { toolBySlug } from '$lib/data/tools';
import type { DatasetKey } from '$lib/data/dataset-layers';

/**
 * The dataset a link points at, or null if it is not a fully-specified map route.
 *
 * Every in-map link is built with all its parameters — `buildToolPageData`'s city menu,
 * `toolSwitchOptions`' tool tabs, the `ControlPanel` axis links, `UnavailableNotice`'s suggestions
 * and the links on /cities all go through `resolve()` with the full parameter set — so reading the
 * href is enough to know the dataset without every component having to declare it.
 *
 * Each segment is validated against the tool's own config rather than trusted by position. That
 * rejects `/cities/<slug>`, the `/<tool>/<city>` redirect stubs (whose target depends on coverage)
 * and anything else that would otherwise turn into a prefetch of a file that does not exist.
 */
export function datasetKeyFromHref(href: string | null): DatasetKey | null {
	if (!href || href.startsWith('http')) return null;
	const [path] = href.split(/[?#]/);
	const seg = path.split('/').filter(Boolean);
	const tool = seg[0];
	const config = toolBySlug[tool]?.config;
	if (!config) return null;
	// growbikenet is the only tool with a variant axis, so the only five-segment map route.
	const wantsVariant = tool === 'growbikenet';
	if (seg.length !== (wantsVariant ? 5 : 4)) return null;
	const [, city, metric, type, variant] = seg;
	if (!config.metrics.includes(metric) || !config.types.includes(type)) return null;
	if (wantsVariant && !(config as { variants?: readonly string[] }).variants?.includes(variant)) {
		return null;
	}
	return { tool, city, metric, type, variant: wantsVariant ? variant : 'default' };
}
