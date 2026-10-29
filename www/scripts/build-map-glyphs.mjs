// Bake Noto Sans fallback glyphs into the self-hosted Public Sans glyph stacks.
//
// Public Sans (the basemap label font) has no Greek alphabet and no Cyrillic, so
// non-Latin city labels — Athens (Greek), Belgrade/Kyiv/etc. (Cyrillic) — render as
// `.notdef` tofu boxes. A MapLibre `text-font` fallback array can't help here because
// glyphs are served as static single-font files (`/fonts/maplibre/{fontstack}/{range}.pbf`)
// and MapLibre would request a comma-joined composite stack that static hosting can't merge.
//
// Fix: merge Noto Sans glyphs *into* each single-named "Public Sans …" stack, so the
// fontstack names stay unchanged (no style/expression edits) and each label still requests
// one font. Public Sans wins per codepoint (Latin look preserved); Noto fills the gaps.
//
// Source fonts live in ./glyph-src (build-time only, never served). Run with:
//   pnpm build:glyphs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import fontnik from 'fontnik';
import glyphCompose from 'glyph-pbf-composite';

const range = promisify(fontnik.range);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'glyph-src');
const OUT = join(__dirname, '..', 'static', 'fonts', 'maplibre');

// Each hosted Public Sans stack ← the matching-weight Noto Sans TTF that fills its gaps.
const PAIRS = [
	{ stack: 'Public Sans Regular', ttf: 'NotoSans-Regular.ttf' },
	{ stack: 'Public Sans Bold', ttf: 'NotoSans-Bold.ttf' },
	{ stack: 'Public Sans Italic', ttf: 'NotoSans-Italic.ttf' }
];

const RANGE_SIZE = 256;
const MAX_CODEPOINT = 65535; // Basic Multilingual Plane — matches the 256 hosted range files.

for (const { stack, ttf } of PAIRS) {
	const noto = readFileSync(join(SRC, ttf));
	let merged = 0;
	for (let start = 0; start <= MAX_CODEPOINT; start += RANGE_SIZE) {
		const end = start + RANGE_SIZE - 1;
		const dest = join(OUT, stack, `${start}-${end}.pbf`);
		// Only fill ranges the Public Sans stack already hosts (all 256 exist today).
		if (!existsSync(dest)) continue;

		const publicSansPbf = readFileSync(dest);
		const notoPbf = await range({ font: noto, start, end });

		// Public Sans listed first => it wins per glyph id; Noto only fills missing codepoints.
		const combined = glyphCompose.combine([publicSansPbf, notoPbf], stack);
		writeFileSync(dest, combined);
		merged++;
	}
	console.log(`${stack}: merged Noto fallback from ${ttf} into ${merged} ranges`);
}
