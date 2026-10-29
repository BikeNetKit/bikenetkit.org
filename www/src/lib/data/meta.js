import { staticTools, toolBySlug } from './tools';
import { cityBySlug } from './cities';
import { SITE_NAME, SITE_URL } from '$lib/site.js';
import { formatCompact, joinList } from '$lib/utils/formatters';
import { CITY_CARD_KEY, ogCardImage } from './og-cards';

// Head metadata for a tool page. Returned as `meta` from the route's load; the single <Meta> in
// the root layout renders it.
export function toolMeta(slug) {
	const tool = toolBySlug[slug];
	return {
		title: tool.name,
		description: tool.shortDescription,
		image: `/og/${slug}.png`,
		imageAlt: `${tool.name} — BikeNetKit`,
		jsonLd: toolJsonLd(tool)
	};
}

// Head metadata for one map view (see mapPageMeta in tool-page-loader.ts, which works out the
// labels and the default view). Only the tool×city default view is meant to be indexed: every
// other view names it as canonical, and keeps a title of its own so a shared link still says what
// it shows. A city the tool has no data for renders the "not available" state, which is noindexed.
/**
 * @param {{ toolSlug: string, city: string, view: string[],
 *   isDefault: boolean, canonical: string, covered: boolean }} args
 */
export function mapMeta({ toolSlug, city, view, isDefault, canonical, covered }) {
	const tool = toolBySlug[toolSlug];
	const c = cityBySlug[city];
	const viewLabel = view.join(' · ');
	const base = toolMeta(toolSlug);
	// Every view of the pair shares the card of its default view; without one, the tool's card.
	const card = covered ? ogCardImage(toolSlug, city) : undefined;
	return {
		...base,
		...(card && { image: card, imageAlt: `${tool.name} results for ${c.name}` }),
		jsonLd: [
			...base.jsonLd,
			breadcrumbJsonLd([
				['Cities', '/cities'],
				[c.name, `/cities/${city}`],
				[tool.name, canonical]
			])
		],
		title:
			isDefault || !viewLabel
				? `${tool.name} · ${c.name}`
				: `${tool.name} · ${c.name} · ${viewLabel}`,
		description: `${tool.shortDescription} Interactive map for ${c.name}, ${c.country}${viewLabel ? `: ${viewLabel}` : ''}.`,
		canonical,
		noindex: !covered
	};
}

// Head metadata for a city page. The description is built from the facts the page shows — where
// the city is, how large, which tools have results for it — so each of the 412 says something of
// its own. `toolNames` are the tools that cover the city, in catalog order.
/**
 * @param {import('./types').City} city
 * @param {string[]} toolNames
 */
export function cityMeta(city, toolNames) {
	const place = city.country ? `${city.name}, ${city.country}` : city.name;
	const pop = city.population ? ` (pop. ${formatCompact(city.population)})` : '';
	const card = ogCardImage(CITY_CARD_KEY, city.slug);
	return {
		title: city.name,
		...(card && { image: card, imageAlt: `Bicycle-network analyses for ${city.name}` }),
		description: toolNames.length
			? `${place}${pop}: interactive bicycle-network analyses from ${joinList(toolNames)}.`
			: `Bicycle-network analyses for ${city.name} across the BikeNetKit tools.`,
		jsonLd: [
			breadcrumbJsonLd([
				['Cities', '/cities'],
				[city.name, `/cities/${city.slug}`]
			]),
			{
				'@context': 'https://schema.org',
				'@type': 'WebPage',
				name: `${city.name} · ${SITE_NAME}`,
				url: `${SITE_URL}/cities/${city.slug}`,
				about: {
					'@type': 'City',
					name: city.name,
					...(city.country && {
						containedInPlace: { '@type': 'Country', name: city.country }
					})
				}
			}
		]
	};
}

// Home › … trail for structured data, as [name, path] pairs below the home page.
/** @param {[string, string][]} trail */
export function breadcrumbJsonLd(trail) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [['Home', '/'], ...trail].map(([name, path], i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name,
			item: new URL(path, SITE_URL).href
		}))
	};
}

// Head metadata for /more-tools: one card and one description for the page, but a
// SoftwareApplication (+ ScholarlyArticle) block per tool, each anchored at its section — the
// static tools live there rather than on pages of their own.
export function staticToolsMeta() {
	return {
		title: 'More tools',
		description:
			'BikeNetLib, the shared Python library behind the BikeNetKit tools, plus related work by ' +
			'the same research community — BikeDNA, MoveBikeNet, HoodBikeNet, StretchBikeNet, ' +
			'BikeNodePlanner and LoopBikeNet — shipping as code and papers rather than interactive maps.',
		image: '/og/more-tools.png',
		imageAlt: 'More tools — BikeNetKit',
		jsonLd: staticTools.flatMap((tool) => toolJsonLd(tool, `${SITE_URL}/more-tools#${tool.slug}`))
	};
}

// JSON-LD for a tool: the software itself, plus the paper it implements when there is one.
// Rendered as <script type="application/ld+json"> blocks by <Meta>. Makes the tools and papers
// legible to search engines and LLMs. `url` overrides the canonical
// `${SITE_URL}/${slug}` for tools that live as an anchored section rather than their own page.
export function toolJsonLd(tool, url = `${SITE_URL}/${tool.slug}`) {
	/** @type {Record<string, string | number | boolean | object>[]} */
	const blocks = [
		{
			'@context': 'https://schema.org',
			'@type': 'SoftwareApplication',
			name: tool.name,
			description: tool.shortDescription,
			applicationCategory: 'GIS / bicycle network planning',
			operatingSystem: 'Cross-platform',
			url,
			isAccessibleForFree: true,
			...(tool.repo ? { sameAs: [tool.repo] } : {}),
			// Related work by the same community is listed, not published, here: only BikeNetKit's own
			// tools claim it as author and publisher, and only they are known to be AGPL-3.0.
			...(tool.external
				? {}
				: {
						author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
						publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
						license: 'https://www.gnu.org/licenses/agpl-3.0.html'
					})
		}
	];

	if (tool.paper) {
		blocks.push({
			'@context': 'https://schema.org',
			'@type': 'ScholarlyArticle',
			headline: tool.paper.title,
			name: tool.paper.title,
			author: tool.paper.authors
				.split(',')
				.map((name) => ({ '@type': 'Person', name: name.trim() })),
			...(tool.paper.year ? { datePublished: String(tool.paper.year) } : {}),
			...(tool.paper.venue ? { isPartOf: { '@type': 'Periodical', name: tool.paper.venue } } : {}),
			...(tool.paper.url ? { url: tool.paper.url } : {})
		});
	}

	return blocks;
}
