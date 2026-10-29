import type { PageLoad } from './$types';

// Capture-only route, like /screenshot and /svg: rendered in a headless browser by
// `pnpm generate:og`, never part of the built site.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = ({ params }) => ({ name: params.name });
