#!/usr/bin/env node
// Build the static site and rsync it to the server's website dir.
//
//   pnpm deploy:site                  # vite build, then rsync build/ -> server website dir
//   pnpm deploy:site -- --skip-build  # rsync the existing build/ without rebuilding
//   pnpm deploy:site -- --dry-run     # show what rsync would transfer, change nothing
//   pnpm deploy:placeholder           # build with the "coming soon" placeholder on,
//                                     # rsync to the placeholder website dir (--placeholder)
//   pnpm deploy:preview               # full build, rsync to the dir the preview vhost
//                                     # serves behind Basic Auth (--preview)
//
// adapter-static outputs to build/ (no base path). --delete prunes stale files server-side.
// The GeoJSON and screenshots are served off-repo from data.bikenetkit.org (see www/DEPLOY_DATA.md),
// not from the site origin, and no longer live under static/ — so the build carries neither. Both
// flags below are baked in at build time, so --placeholder must rebuild.
//   - PUBLIC_LANDING_PLACEHOLDER shows the "coming soon" page instead of the full landing.
//   - PLACEHOLDER_ONLY (see svelte.config.js) additionally narrows prerendering to `/` and
//     `/design`, since the placeholder links to none of the map routes — without it the build
//     would prerender every city's GeoJSON into __data.json (~6 GB) for a page that never serves
//     it. `/design` is the hidden design-system reference page, shared with collaborators
//     pre-launch; it is unlisted but carries its own `noindex`.
//   - PUBLIC_DATA_URL is always forced to the data subdomain (www/.env leaves it empty for local
//     dev, which would 404 once data/ is excluded from the rsync below).
//   - A placeholder deploy also rewrites 404.html into a redirect to `/` (step 3 below), so the
//     deep links the docs site publishes land on the placeholder rather than a branded error page.
//     `/design` needs no exemption from that redirect: the stub only ever fires for URLs the build
//     did not emit, and `/design` is emitted.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { WWW_ROOT, getDeployConfig, run, withTrailingSlash } from './server-config.mjs';
import { CONTACT_EMAIL, REPORT_EMAIL } from '../src/lib/site.js';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const dryRun = args.includes('--dry-run');
const placeholder = args.includes('--placeholder');
const preview = args.includes('--preview');
if (placeholder && preview) {
	console.error('[deploy] --placeholder and --preview name different targets; pick one.');
	process.exit(1);
}

// `main` is meant to record what is live. Nothing here enforces that — this rsyncs whatever is
// checked out — so deploying from another branch is allowed but leaves `main` describing a site
// that is not the one being served. Warn rather than block: hotfixes and placeholder deploys are
// legitimate reasons to publish from elsewhere, and a hard stop would just get worked around.
// A preview deploy is exempt: it publishes nothing, and deploying it from `dev` is the normal case.
if (!placeholder && !preview && !dryRun) {
	let branch = '';
	try {
		branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
			encoding: 'utf8',
			cwd: WWW_ROOT
		}).trim();
	} catch {
		// Not a git checkout, or git is unavailable. Nothing to check against.
	}
	if (branch && branch !== 'main') {
		console.warn(`\n[deploy] Publishing from '${branch}', not 'main'.`);
		console.warn('[deploy] main is supposed to record what is live, so it will now be wrong.');
		console.warn('[deploy] Afterwards, bring it back in line:');
		console.warn(`[deploy]   git checkout main && git merge --ff-only ${branch}\n`);
	}
}

// Pre-launch, the two targets are different directories and only one of them is served:
//
//   deploy:site         -> DEPLOY_WEB_PATH             ~/bikenetkit/website/
//   deploy:placeholder  -> DEPLOY_PLACEHOLDER_WEB_PATH ~/bikenetkit/placeholder-website/
//
// A third, deploy:preview -> DEPLOY_PREVIEW_WEB_PATH (~/bikenetkit/preview-website/), is what the
// password-gated preview vhost serves, before and after launch. After launch the apex serves
// website/, so the preview is the only place a build can be looked at before it is live. To promote
// what was checked there, run `deploy:site -- --skip-build` straight after: it ships the same
// build/ rather than a rebuild of it.
//
// The default vhost roots at placeholder-website (DEPLOY_NGINX.md §2), so `deploy:site` stages the
// full site where nothing serves it. That is useful — it is how you check the real thing on the
// real server — and it cannot publish anything by accident.
//
// Going live is therefore not a command here at all: it is repointing the nginx root at website/
// and reloading. Keep it that way. A flag in this script would imply the switch lives in the repo,
// and someone would eventually believe it.

// The full site publishes /legal — a privacy notice, a controller address and an accessibility
// contact — plus a "report a problem" link on every page. Shipping any of those addresses while
// its constant is still the deliberately-broken placeholder would publish a notice nobody can
// write to, which is worse than having none. Deliberately a deploy-time gate, not a build-time
// one: local builds must keep working while an address is still outstanding.
const unsetAddresses = Object.entries({ CONTACT_EMAIL, REPORT_EMAIL })
	.filter(([, value]) => value.includes('REPLACE-ME'))
	.map(([name]) => name);
if (!placeholder && unsetAddresses.length > 0) {
	console.error(
		`[deploy] still the placeholder in src/lib/site.js: ${unsetAddresses.join(', ')}.\n` +
			'         /legal (privacy notice, accessibility feedback) and every "report a problem"\n' +
			'         link would ship with an unreachable address. Set the real address first, or\n' +
			'         deploy the placeholder site with `pnpm deploy:placeholder`.'
	);
	process.exit(1);
}

const { host, webPath, placeholderWebPath, previewWebPath, publicDataUrl } = getDeployConfig();
const targetPath = placeholder ? placeholderWebPath : preview ? previewWebPath : webPath;

// 1. Build (unless skipped). process.env wins over www/.env in Vite, so these override the local
// defaults for this build only.
if (!skipBuild) {
	// REQUIRE_DISPLAY_FONT turns check-fonts.mjs from a warning into a hard failure. A build missing
	// Bespoke Sans still succeeds and still looks plausible — headings just fall back to a generic
	// sans — so nothing about the output would tell you before visitors did.
	const buildEnv = { ...process.env, PUBLIC_DATA_URL: publicDataUrl, REQUIRE_DISPLAY_FONT: '1' };
	if (placeholder) {
		buildEnv.PUBLIC_LANDING_PLACEHOLDER = 'true';
		buildEnv.PLACEHOLDER_ONLY = 'true';
	}
	await run('pnpm', ['build'], { env: buildEnv });
}

// 2. Verify the build exists before syncing.
const buildDir = path.join(WWW_ROOT, 'build');
if (!existsSync(path.join(buildDir, 'index.html'))) {
	console.error(
		`[deploy] No build found at ${path.relative(WWW_ROOT, buildDir)}/index.html.\n` +
			`         Run \`pnpm deploy\` (without --skip-build) or \`pnpm build\` first.`
	);
	process.exit(1);
}

// 3. Placeholder only: PLACEHOLDER_ONLY narrows prerendering to `/` and `/design`, so every other
// URL — including the deep map links the docs site publishes — falls through to 404.html. Until
// launch that should land the reader on the placeholder, not on a branded error page offering
// links that 404 too.
// A body-level redirect rather than an nginx `error_page … return 302`: this way the artifact
// carries its own behavior instead of depending on a vhost line. The HTTP status stays 404 on purpose — none of these
// URLs are public yet, and a crawler should be told so.
//
// Until 2026-09-30 the apex resolved to OVH shared hosting, which served a hand-uploaded copy of
// this build through Apache, so this step also wrote a `.htaccess` for it. The apex now points at
// the nginx server, so that file is gone.
const placeholderRedirect = '<meta http-equiv="refresh" content="0; url=/">';
const notFoundPage = path.join(buildDir, '404.html');
if (placeholder) {
	writeFileSync(
		notFoundPage,
		`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>BikeNetKit</title>
${placeholderRedirect}
<script>location.replace('/');</script>
</head>
<body><p>Redirecting to <a href="/">bikenetkit.org</a>…</p></body>
</html>
`
	);
	console.log('[deploy] placeholder: / and /design prerendered, 404.html redirects to /');
} else if (
	skipBuild &&
	existsSync(notFoundPage) &&
	readFileSync(notFoundPage, 'utf8').includes(placeholderRedirect)
) {
	// The stub above is written into build/, so a `deploy:site --skip-build` straight after a
	// placeholder deploy would publish it as the real site's 404 — every unmatched URL silently
	// bouncing to the landing instead of showing the branded page. Rebuild rather than guess.
	console.error(
		'[deploy] build/ is left over from a placeholder deploy (its 404.html redirects to /).\n' +
			'         It holds only the placeholder page set — shipping it as the real site would\n' +
			'         replace the branded 404 with a bounce to the landing. Re-run without --skip-build.'
	);
	process.exit(1);
}

// 4. rsync the build to the server. Exclude macOS / VCS cruft that adapter-static may leave.
// No data/ or screenshots/ exclusions any more: those trees moved out of static/ (to www/data/ and
// www/screenshots/, see vite.config.js), so the build never contains them in the first place rather
// than copying ~2.4 GB in only for this rsync to drop it again.
const rsyncArgs = [
	'-az',
	'--delete',
	'--progress',
	'--exclude=.DS_Store',
	'--exclude=.git',
	'-e',
	'ssh'
];
if (dryRun) rsyncArgs.push('--dry-run');
rsyncArgs.push(withTrailingSlash(buildDir), `${host}:${withTrailingSlash(targetPath)}`);
await run('rsync', rsyncArgs);

console.log(`\n[deploy] done${placeholder ? ' (placeholder)' : preview ? ' (preview)' : ''}.`);
