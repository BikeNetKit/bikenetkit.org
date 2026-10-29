#!/usr/bin/env node
/**
 * Captures the per-city Open Graph cards (see og-cards.mjs) from the /og/map and /og/city capture
 * routes, then rewrites the committed manifest. The routes draw no map — a screenshot, the lockup
 * and text — so a dev server is as good as a preview build here.
 *
 *   pnpm generate:og-cards                                  # missing cards, against :5173
 *   pnpm generate:og-cards -- --base http://localhost:5187  # another server
 *   pnpm generate:og-cards -- --only "kerch_ua|braga_pt"    # new cities (matched on <key>/<city>)
 *   pnpm generate:og-cards -- --force                       # recapture everything
 *
 * Then `pnpm deploy:data` to upload them, before the site deploy that lists them.
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { cardFile, expectedCards, writeManifest } from './og-cards.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : args[i + 1];
};
const base = flag('--base') ?? process.env.PW_BASE_URL ?? 'http://localhost:5173';
const only = flag('--only') ? new RegExp(flag('--only')) : null;
const force = args.includes('--force');
const concurrency = Number(flag('--concurrency') ?? 4);

const OG = { width: 1200, height: 630 };

const cards = expectedCards();
const todo = cards.filter(
	({ key, city }) =>
		(!only || only.test(`${key}/${city}`)) && (force || !existsSync(cardFile(key, city)))
);
console.log(`[og-cards] ${todo.length} of ${cards.length} card(s) to capture from ${base}`);

const browser = await chromium.launch();
const failed = [];
let done = 0;

async function worker() {
	const page = await browser.newPage({ viewport: OG });
	for (let card = todo.shift(); card; card = todo.shift()) {
		try {
			await page.goto(base + card.route, { waitUntil: 'load' });
			// Set once the name is fitted and the screenshot has decoded — never on a timer, so an
			// unknown city or a missing screenshot fails here instead of writing a blank card.
			await page.waitForSelector('body[data-og-ready="true"]', { timeout: 30000 });
			const shot = await page.screenshot({ clip: { x: 0, y: 0, ...OG } });
			const file = cardFile(card.key, card.city);
			mkdirSync(path.dirname(file), { recursive: true });
			writeFileSync(file, await sharp(shot).jpeg({ quality: 80, mozjpeg: true }).toBuffer());
		} catch (err) {
			failed.push(`${card.key}/${card.city}: ${err.message.split('\n')[0]}`);
		}
		if (++done % 100 === 0) console.log(`[og-cards] ${done} captured`);
	}
	await page.close();
}

await Promise.all(Array.from({ length: concurrency }, worker));
await browser.close();

const manifest = await writeManifest(cards);
const listed = Object.values(manifest).reduce((n, slugs) => n + slugs.length, 0);
console.log(`[og-cards] manifest lists ${listed} of ${cards.length} card(s)`);
if (failed.length) {
	console.error(`[og-cards] ${failed.length} capture(s) failed:`);
	for (const line of failed.slice(0, 20)) console.error(`  ${line}`);
	process.exit(1);
}
