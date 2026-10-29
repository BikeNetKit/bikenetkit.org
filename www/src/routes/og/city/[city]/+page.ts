import type { PageLoad } from './$types';

// Capture-only route, like /og/[name]: rendered in a headless browser by `pnpm generate:og-cards`,
// never part of the built site.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = ({ params }) => params;
