import { cityRedirectEntries, redirectToDefaultView } from '$lib/data/tool-redirect';
import { datasets } from '$lib/data/datasets';

const route = '/(app)/(map)/superblockify/[city]/[metric]/[type]' as const;

// No +page.svelte on purpose: `load` always throws a redirect, so no component is ever
// rendered. Adding one would be dead code.
export const entries = cityRedirectEntries;

export function load({ params }) {
	redirectToDefaultView('superblockify', params.city, datasets.superblockify ?? [], route);
}
