/**
 * The per-city Open Graph cards: which ones there should be, where they live, and the committed
 * manifest that says which ones exist. Shared by `generate-og-cards.mjs` and `check-og-cards.mjs`.
 * The app reads the manifest through `src/lib/data/og-cards.ts`.
 *
 * One card per tool × covered city (`<tool>/<city>.jpg`) and one per city (`city/<city>.jpg`), in
 * `www/screenshots/og/` — the screenshots directory, so `pnpm deploy:data` uploads them with the
 * screenshots they are built from. Coverage is read from the committed dataset manifest the same
 * way the sitemap lists the default map views, so a card exists for every indexable page.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '../src/lib/data');

export const CARDS_DIR = path.join(HERE, '../screenshots/og');
export const MANIFEST = path.join(DATA, 'og-cards.json');
export const CITY_KEY = 'city';

const read = (file) => JSON.parse(readFileSync(path.join(DATA, file), 'utf8'));

export const cardFile = (key, city) => path.join(CARDS_DIR, key, `${city}.jpg`);

/** Every card the current data calls for, as `{ key, city, route }`. */
export function expectedCards() {
	const tools = read('tools.json').filter(
		(t) => t.category === 'interactive' && t.status === 'active'
	);
	const catalog = new Set(read('cities.json').map((c) => c.slug));
	const files = read('data-files.json');
	const excluded = new Set(
		read('excluded-datasets.json').excluded.map((e) => `${e.tool}/${e.city}`)
	);

	const cards = [];
	const cities = new Set();
	for (const tool of tools) {
		// A dataset file is named `<city>-…`, and city slugs carry no hyphen.
		const covered = new Set(
			(files[tool.slug] ?? [])
				.map((file) => file.split('-')[0])
				.filter((city) => catalog.has(city) && !excluded.has(`${tool.slug}/${city}`))
		);
		for (const city of [...covered].sort()) {
			cards.push({ key: tool.slug, city, route: `/og/map/${tool.slug}/${city}` });
			cities.add(city);
		}
	}
	for (const city of [...cities].sort()) {
		cards.push({ key: CITY_KEY, city, route: `/og/city/${city}` });
	}
	return cards;
}

/** The committed manifest: key → city slugs with a card. */
export function readManifest() {
	return existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
}

/** Rewrites the manifest from the cards that are expected and present on disk, as `pnpm lint` wants it. */
export async function writeManifest(cards = expectedCards()) {
	const manifest = {};
	for (const { key, city } of cards) {
		if (!existsSync(cardFile(key, city))) continue;
		(manifest[key] ??= []).push(city);
	}
	const options = { ...(await resolveConfig(MANIFEST)), filepath: MANIFEST };
	writeFileSync(MANIFEST, await format(JSON.stringify(manifest), options));
	return manifest;
}
