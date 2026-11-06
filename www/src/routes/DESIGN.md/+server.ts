import designMd from '../../../DESIGN.md?raw';

export const prerender = true;

// The spec as a file of its own, so it can be linked and fetched rather than only downloaded
// from /design. Same `?raw` import that page renders, so the two cannot drift. Production nginx
// needs a MIME type for it: see DEPLOY_NGINX.md § 2.
export function GET() {
	return new Response(designMd, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
