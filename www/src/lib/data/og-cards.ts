import manifest from './og-cards.json';
import { OG_CARD_ORIGIN } from '$lib/site.js';

// Per-city Open Graph cards: one per city (`city`), and one per tool × covered city (keyed by the
// tool slug), captured by `pnpm generate:og-cards` into `www/screenshots/og/` and served from the
// data host with the screenshots. The committed manifest lists the cards that exist, written by
// the generator — a page uses its card only once it is listed, so a build never points og:image at
// an image that was not generated. Uploading the cards (`pnpm deploy:data`) is what makes a listed
// one resolve, so that has to happen before the site deploy that lists it.
const cards: Record<string, string[]> = manifest;
const listed = new Map(Object.entries(cards).map(([key, slugs]) => [key, new Set(slugs)]));

export const CITY_CARD_KEY = 'city';

export function ogCardPath(key: string, city: string): string {
	return `/screenshots/og/${key}/${city}.jpg`;
}

/** The absolute card URL for a city (`key` = `city`) or a tool's results in it, if it was generated. */
export function ogCardImage(key: string, city: string): string | undefined {
	return listed.get(key)?.has(city) ? `${OG_CARD_ORIGIN}${ogCardPath(key, city)}` : undefined;
}
