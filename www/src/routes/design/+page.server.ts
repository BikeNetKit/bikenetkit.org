import designMd from '../../../DESIGN.md?raw';
import { renderMarkdown } from '$lib/design/markdown.js';

export const prerender = true;

// Rendered here rather than in the browser: the route is prerendered, so `marked` runs once at
// build time and never reaches the client bundle.
export const load = () => ({
	meta: { title: 'Design system', noindex: true },
	spec: renderMarkdown(designMd)
});
