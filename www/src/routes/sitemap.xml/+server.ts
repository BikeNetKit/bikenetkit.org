import { cities } from '$lib/data/cities';
import { activeInteractiveTools } from '$lib/data/tools';
import { datasets } from '$lib/data/datasets';
import { defaultViewFor } from '$lib/data/tool-page-loader';
import { SITE_URL } from '$lib/site.js';

export const prerender = true;

// Canonical, crawlable pages only. The interactive map routes
// (`/<tool>/<city>/<metric>/<type>[/<variant>]`) number about ten thousand, and all but one view per
// tool×city name another as canonical (see mapPageMeta), so only those default views are listed:
// one per city a tool covers. An uncovered city's "not available" page is noindexed and left out.
// The static tools have no paths of their own — they're anchored sections of /more-tools, and a
// fragment is not a distinct URL, so they add nothing beyond that one entry.
//
// The tool *landing* pages are listed too: each has its own title, description, OG card and
// `SoftwareApplication` JSON-LD, which is exactly what a sitemap entry is for. Tools and map views
// are enumerated from the catalogue and the dataset manifest rather than written out, so a tool
// that later flips to `active` cannot be forgotten here.
function buildPaths(): string[] {
	const paths = ['/', '/cities', '/cities/table', '/legal', '/more-tools'];
	for (const tool of activeInteractiveTools) paths.push(`/${tool.slug}`);
	for (const city of cities) paths.push(`/cities/${city.slug}`);
	for (const tool of activeInteractiveTools) {
		const toolDatasets = datasets[tool.slug] ?? [];
		const withVariant = tool.slug === 'growbikenet';
		for (const city of cities) {
			if (!toolDatasets.some((d) => d.city === city.slug)) continue;
			const { metric, type, variant } = defaultViewFor(
				tool.slug,
				city.slug,
				toolDatasets,
				withVariant
			);
			paths.push(`/${[tool.slug, city.slug, metric, type, variant].filter(Boolean).join('/')}`);
		}
	}
	return paths;
}

export async function GET() {
	const urls = buildPaths()
		.map((path) => `\t<url><loc>${new URL(path, SITE_URL).href}</loc></url>`)
		.join('\n');

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

	return new Response(body, {
		headers: { 'Content-Type': 'application/xml' }
	});
}
