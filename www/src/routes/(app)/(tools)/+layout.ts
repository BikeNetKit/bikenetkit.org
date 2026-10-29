import type { LayoutLoad } from './$types';
import { toolMeta } from '$lib/data/meta';

// The interactive tool index pages get their social card from here, by deriving the tool slug
// from the path. Their deep map routes live in the (map) group instead and set their own `meta`
// in each +page.ts, so they no longer inherit this. The static tools have no pages of their own —
// they're anchored sections of /more-tools, which sets its own `meta` via staticToolsMeta().
export const load: LayoutLoad = ({ url }) => {
	const [slug] = url.pathname.split('/').filter(Boolean);
	return { meta: toolMeta(slug) };
};
