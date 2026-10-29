#!/usr/bin/env node
/**
 * Does every card the manifest lists exist in www/screenshots/og/, and which cards does the
 * current data call for that are not generated yet? A listed card that is missing would ship as a
 * broken preview image, so that fails; an unlisted one only falls back to the tool's card, so that
 * is reported. Run after `update-data`, next to check:coverage.
 */
import { existsSync } from 'node:fs';
import { cardFile, expectedCards, readManifest } from './og-cards.mjs';

const cards = expectedCards();
const manifest = readManifest();
const expected = new Set(cards.map(({ key, city }) => `${key}/${city}`));

const listedMissing = [];
const listedStale = [];
for (const [key, slugs] of Object.entries(manifest)) {
	for (const city of slugs) {
		if (!existsSync(cardFile(key, city))) listedMissing.push(`${key}/${city}`);
		if (!expected.has(`${key}/${city}`)) listedStale.push(`${key}/${city}`);
	}
}
const listed = new Set(Object.entries(manifest).flatMap(([k, s]) => s.map((c) => `${k}/${c}`)));
const unlisted = [...expected].filter((id) => !listed.has(id));

console.log(`[og-cards] ${listed.size} listed, ${expected.size} called for by the data`);
if (unlisted.length) {
	console.log(
		`[og-cards] ${unlisted.length} not generated yet (those pages keep the tool's card), e.g. ` +
			`${unlisted.slice(0, 5).join(', ')}.\n           Run \`pnpm generate:og-cards\`.`
	);
}
if (listedStale.length) {
	console.log(
		`[og-cards] ${listedStale.length} listed for a page that no longer exists, e.g. ` +
			`${listedStale.slice(0, 5).join(', ')}. \`pnpm generate:og-cards\` rewrites the manifest.`
	);
}
if (listedMissing.length) {
	console.error(
		`[og-cards] ${listedMissing.length} listed card(s) missing from www/screenshots/og/, e.g. ` +
			`${listedMissing.slice(0, 5).join(', ')}.\n` +
			`           They would ship as broken preview images: regenerate them, or rewrite the\n` +
			`           manifest with \`pnpm generate:og-cards\`.`
	);
	process.exit(1);
}
