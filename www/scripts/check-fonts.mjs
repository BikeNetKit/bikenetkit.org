#!/usr/bin/env node
// Bespoke Sans (Fontshare, ITF Free Font License) is the display face. Its licence permits
// self-hosting for this site but forbids redistributing the files or putting them on a publicly
// accessible repository, so they are not committed and every clean clone arrives without them.
//
// Missing, the site still builds — and that is the problem. Headings fall back to a generic sans
// with no error anywhere, while /design's tool-logo generator and `pnpm generate:og` fail outright
// on the absent WOFF. That combination went unnoticed for weeks once already: local builds have the
// files, so only the online previews were wrong.
//
// So: warn on every dev/build/lint, and fail hard wherever a wrong-looking build must not ship.
//   pnpm fonts:check                      # warn only
//   REQUIRE_DISPLAY_FONT=1 pnpm fonts:check   # exit 1 if incomplete (set by deploy.mjs)
//   node scripts/check-fonts.mjs --build      # exit 1 unless build/ carries them (deploy.mjs,
//                                             # right before the upload)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WWW_ROOT } from './server-config.mjs';

// --build checks the artifact instead of the source: build/ is what gets uploaded, and
// `deploy:site -- --skip-build` ships whatever a plain, warn-only `pnpm build` left there.
const checkBuild = process.argv.includes('--build');
const DIR = `${checkBuild ? 'build' : 'static'}/fonts/BespokeSans_Complete`;

// Exactly these four, and no more: everything under static/ is served verbatim from the site, so
// shipping the full package would publish all 12 styles in 5 formats for download — past "your own
// site's use". The WOFF is not a duplicate of the WOFF2: opentype.js reads WOFF only, and
// src/lib/design/sublogo.js parses it to re-set the wordmark for the per-tool lockups.
const REQUIRED = [
	`${DIR}/Fonts/WEB/fonts/BespokeSans-Variable.woff2`,
	`${DIR}/Fonts/WEB/fonts/BespokeSans-VariableItalic.woff2`,
	`${DIR}/Fonts/WEB/fonts/BespokeSans-BoldItalic.woff`,
	`${DIR}/License/FFL.txt`
];

const missing = REQUIRED.filter((f) => !existsSync(path.join(WWW_ROOT, f)));
if (missing.length === 0) process.exit(0);

const strict = checkBuild || process.env.REQUIRE_DISPLAY_FONT === '1';
const log = strict ? console.error : console.warn;

log('');
log(`  Bespoke Sans is missing ${missing.length} of ${REQUIRED.length} files.`);
for (const f of missing) log(`    - ${f}`);
log('');
if (checkBuild) {
	console.error('  build/ was built without them. Install the font (below), then rebuild:');
	console.error('  deploy without --skip-build, or run `pnpm build` before it.');
	console.error('');
}
log('  The site will still build, but headings fall back to a generic sans and');
log('  /design + `pnpm generate:og` fail outright on the missing WOFF.');
log('');
log('  Fix: download BespokeSans_Complete.zip from');
log('    https://www.fontshare.com/fonts/bespoke-sans');
log(`  and unzip into static/fonts/. The zip's folder names already match the`);
log('  @font-face rules in src/routes/layout.css — nothing to rename. Keep only');
log('  the four files listed above.');
log('');
log('  Do not subset or convert them: § 02 of the ITF FFL forbids both. Serve the');
log('  files byte-for-byte as Fontshare delivered them.');
log('');

if (strict) {
	console.error(
		`  ${checkBuild ? 'Refusing to deploy this build' : 'REQUIRE_DISPLAY_FONT=1 — refusing to continue'}.\n`
	);
	process.exit(1);
}
