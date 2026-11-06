import contactLinks from './contact-links.json';
import { cityBySlug } from './cities';

type Link = { url: string; lang?: string };
type Org = Link & { name: string };
type Entry = { mobility?: Link; contact?: Link; ministry?: Link; orgs?: Org[] };

const data = contactLinks as {
	countries: Record<string, Entry>;
	cities: Record<string, Entry>;
	excluded: string[];
};
const excluded = new Set(data.excluded);

/**
 * Cities whose country-level links are filed under another country than the one their cityid
 * carries. The export names Pristina `pristina_rs`, so `cities.json` gives it `RS`, but the site
 * lists it under Kosovo and the reviewed contact research files its ministry under `XK`.
 */
const COUNTRY_OVERRIDES: Record<string, string> = { pristina_rs: 'XK' };

export type ActionLinkKind = 'mobility' | 'contact' | 'ministry' | 'org';

export type ActionLink = {
	kind: ActionLinkKind;
	label: string;
	url: string;
	lang?: string;
	detail?: string;
};

/**
 * The "Take action!" links for a city, in display order. Empty for a city the research excluded
 * (Belarus, occupied territories) and for one with nothing on file. City-scoped organizations
 * come before the country's.
 */
export function actionLinksFor(slug: string): ActionLink[] {
	if (excluded.has(slug)) return [];
	const own = data.cities[slug] ?? {};
	const nation =
		data.countries[COUNTRY_OVERRIDES[slug] ?? cityBySlug[slug]?.countryCode ?? ''] ?? {};
	const links: ActionLink[] = [];
	if (own.mobility)
		links.push({ kind: 'mobility', label: "Your city's cycling initiatives", ...own.mobility });
	if (own.contact) links.push({ kind: 'contact', label: 'Contact your city', ...own.contact });
	if (nation.ministry)
		links.push({ kind: 'ministry', label: 'Contact your transport ministry', ...nation.ministry });
	for (const org of [...(own.orgs ?? []), ...(nation.orgs ?? [])])
		links.push({
			kind: 'org',
			label: 'Join your local cycling organization',
			url: org.url,
			lang: org.lang,
			detail: org.name
		});
	return links;
}
