import { resolve } from '$app/paths';
import { DESIGN_CREDIT_NAME, DESIGN_CREDIT_URL, NERDS_URL } from '$lib/site.js';
import { toolBySlug, growBikeNetConfig, interactiveTools } from './tools';
import { cities } from './cities';
import { screenshotFor } from './tool-paths';
import siteStats from './site-stats.json';
import type { City } from './types';
import { formatCompact } from '../utils/formatters';

export interface FeaturedExample {
	city: string;
	tool: string;
	href: string;
	screenshot: string;
}

export function toolExamplesFor(toolSlug: string, cities: readonly City[]): FeaturedExample[] {
	const tool = toolBySlug[toolSlug];
	if (!tool) return [];

	if (toolSlug === 'growbikenet') {
		return cities.map((c) => {
			const dataset = {
				city: c.slug,
				metric: growBikeNetConfig.defaultMetric,
				type: growBikeNetConfig.defaultType,
				variant: growBikeNetConfig.defaultVariant
			};
			return {
				city: c.name,
				tool: tool.name,
				href: resolve('/(app)/(map)/growbikenet/[city]/[metric]/[type]/[variant]', dataset),
				screenshot: screenshotFor('growbikenet', dataset)
			};
		});
	}

	const config = tool.config;
	if (!config) return [];
	return cities.map((c) => {
		const dataset = { city: c.slug, metric: config.defaultMetric, type: config.defaultType };
		return {
			city: c.name,
			tool: tool.name,
			href: `/${toolSlug}/${c.slug}/${config.defaultMetric}/${config.defaultType}`,
			screenshot: screenshotFor(toolSlug, dataset)
		};
	});
}

export interface Stat {
	value: string;
	label: string;
	href?: string;
}

export interface NewsItem {
	date: string;
	text: string;
}

export interface Sponsor {
	name: string;
	url?: string;
	logo?: string;
	/** Intrinsic aspect ratio (width / height) of the logo file. Logo boxes are derived from it
	 *  instead of a hand-tuned height. */
	ratio?: number;
	/** Vertical extent of the part that lines up across the sponsors card's logo row, as fractions
	 *  of the image height: IFD's two text lines, JUST STREETS' two thick rules. Defaults to the
	 *  whole image (the EU flag). Measured from the files — re-measure if a logo is replaced. */
	band?: [top: number, bottom: number];
}

/** Equal-area sizing weight for a funder logo in the placeholder page's "Supported by" bar: width
 *  grows with `sqrt(ratio)`, height shrinks by the same factor, so the wide Innovation Fund
 *  wordmark (~5:1) and the near-square marks read at a similar size. */
export function logoWeight(ratio = 1): number {
	return Math.sqrt(ratio);
}

/** Layout for a sponsor logo whose `band` lines up with every other logo's band.
 *  - `width`: the logo's width per unit of band height. Logo widths in proportion to it give
 *    every logo the same band height.
 *  - `ratio` / `position`: the image box is padded on one side so the band sits at the box's
 *    vertical center. `items-center` on the row then puts every band on one center line. */
export function logoBox({ ratio = 1, band = [0, 1] }: Sponsor) {
	const [top, bottom] = band;
	const center = (top + bottom) / 2;
	const half = Math.max(center, 1 - center);
	return {
		width: ratio / (bottom - top),
		ratio: ratio / (2 * half),
		position: center < 0.5 ? 'bottom' : 'top'
	};
}

export interface TeamMember {
	name: string;
	/** Rendered as "(Lead)" after the name. The grid carries one role for everyone — see `teamRole`
	 *  — so the org README's second credit for Michael Szell is the only per-person distinction. */
	lead?: boolean;
	url?: string;
}

export interface SocialLink {
	label: string;
	href: string;
	icon: 'bluesky' | 'github' | 'mastodon' | 'linkedin';
}

// The tools stat counts the tools with a map, and opens the first of them: there is no page that
// lists only those, and its sidebar reaches the rest.
export const stats: Stat[] = [
	{ value: String(cities.length), label: 'cities analyzed', href: resolve('/cities') },
	{
		value: String(interactiveTools.length),
		label: 'tools',
		href: resolve(`/${interactiveTools[0].slug}` as '/growbikenet')
	},
	{ value: formatCompact(siteStats.totalNetworkLengthKm), label: 'km of bike trails' }
];

export const news: NewsItem[] = [
	{ date: '2026-10-29', text: 'Project launched — stay tuned for updates.' }
];

// Mirrors the "Supported by" section of the BikeNetKit org profile README
// (github.com/BikeNetKit/.github). Entries without a logo render as text links.
export const sponsors: Sponsor[] = [
	{
		name: 'Innovation Fund Denmark',
		url: 'https://innovationsfonden.dk/en',
		logo: '/funders/logo_innovationfund.svg',
		ratio: 462.24 / 87.42,
		band: [2.2 / 87.42, 85.2 / 87.42]
	},
	{
		name: 'European Union',
		url: 'https://commission.europa.eu/index_en',
		logo: '/funders/logo_eu.svg',
		ratio: 900 / 600
	},
	{
		name: 'JUST STREETS',
		url: 'https://www.just-streets.eu/',
		logo: '/funders/logo_juststreets.png',
		ratio: 750 / 763,
		band: [141 / 763, 559 / 763]
	},
	{
		name: 'Data Science Section, IT University of Copenhagen',
		url: 'https://en.itu.dk/Research/Sections-and-research-groups/Data-Science'
	}
];

// Credits mirror the BikeNetKit org profile README (github.com/BikeNetKit#credits): software
// development alphabetically by surname, then lead. Michael Szell is credited there under both
// "Software development" and "Lead"; the two are merged into one entry at his alphabetical
// position, because the grid in InfoGrid keys on `name` and a second entry would be a duplicate
// key. Design sits outside this grid — see `designCredit`.
/** Heading for the grid below it: every name in it holds this role, so it is stated once rather
 *  than repeated in each cell. */
export const teamRole = 'Software development';

/** The research group the project is built at, credited in the Team card with its own mark.
 *  Separate from `sponsors`: NERDS hosts the work rather than funding it, and ITU's Data Science
 *  Section — the department NERDS sits in — is already a text entry there.
 *
 *  The asset is the official SVG as NERDS issued it, unmodified. `ratio` is its viewBox, used the
 *  same way the sponsor logos use theirs: as an `aspect-ratio` style, so the image reserves its box
 *  before it loads. The artwork fills that viewBox edge to edge — unlike the PNG this replaced,
 *  there is no built-in padding, so the rendered width is the mark's own width. */
export const hostGroup = {
	name: 'NERDS',
	fullName: 'NERDS — Network Science and Data Science group, IT University of Copenhagen',
	url: NERDS_URL,
	logo: '/partners/logo_nerds.svg',
	ratio: 332.06 / 97.69
};

export const team: TeamMember[] = [
	{ name: 'Carlson M. Büth', url: 'https://github.com/cbueth' },
	{ name: 'Manuel Knepper', url: 'https://github.com/Manuel-Knepper' },
	{ name: 'Mariana Pessoa', url: 'https://github.com/marianamirandapessoa' },
	{ name: 'Clément Sebastiao', url: 'https://github.com/csebastiao' },
	{ name: 'Michael Szell', lead: true, url: 'https://github.com/mszell' },
	{ name: 'Anastassia Vybornova', url: 'https://github.com/anastassiavybornova' }
];

/** Design credit, rendered as its own line under the team grid rather than as a cell in it: the
 *  role is singular and studio-attributed, which the square name/role cells can't carry. */
export const designCredit = {
	role: 'Design and visualization',
	name: DESIGN_CREDIT_NAME,
	url: DESIGN_CREDIT_URL
};

export const socialLinks: SocialLink[] = [
	{ label: 'Bluesky', href: 'https://bsky.app/profile/bikenetkit.bsky.social', icon: 'bluesky' },
	{ label: 'GitHub', href: 'https://github.com/BikeNetKit', icon: 'github' },
	{ label: 'Mastodon', href: 'https://fosstodon.org/@bikenetkit', icon: 'mastodon' },
	{ label: 'LinkedIn', href: 'https://www.linkedin.com/company/bikenetkit', icon: 'linkedin' }
];
