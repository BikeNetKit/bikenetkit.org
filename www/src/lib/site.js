// Site-level identity, used for the head metadata and the social cards.
//
// SITE_URL is a constant rather than an env var on purpose: og:image and og:url have to be
// absolute, and an unset PUBLIC_SITE_URL would silently ship relative values that no crawler
// resolves. A preview build (`pnpm deploy:preview`) therefore emits production URLs — correct for
// the images (same files) and merely cosmetic for og:url on the preview host.
export const SITE_URL = 'https://bikenetkit.org';
export const SITE_NAME = 'BikeNetKit';
export const SITE_TAGLINE = 'The digital toolkit for bicycle networks';

// General enquiries: the publisher and controller address on /legal, the data-subject-rights
// address, and CitySearch's "suggest a city".
export const CONTACT_EMAIL = 'contact@bikenetkit.org';

// Problem reports: the "Report a problem" links in the footer and the sidebar, and the
// accessibility feedback address on /legal. Both addresses land in the same mailbox today; they
// are separate constants so that routing can change without touching a single template.
export const REPORT_EMAIL = 'report@bikenetkit.org';

// Public code home. Individual tool repos live on `tools.json`; this is the umbrella org.
export const GITHUB_ORG_URL = 'https://github.com/BikeNetKit';

// The research group the project is built at, credited in the Team card on the landing page. Here
// rather than inline in that component so `pnpm check:links` sees it — the check collects every
// string export from this file, and an affiliation URL going stale is exactly the quiet rot it
// exists to catch.
export const NERDS_URL = 'https://nerds.itu.dk/';

// The Paris cycling advocacy group whose data SortBikeNet's as-built order is based on, credited
// on the SortBikeNet tool page and on /legal. Here so `pnpm check:links` sees it.
export const PARIS_EN_SELLE_URL = 'https://parisenselle.fr/';

// The European Cyclists Federation members page whose links were collected, credited
// on /legal. Here so `pnpm check:links` sees it.
export const ECF_URL = 'https://www.ecf.com/en/community/members/';

// The plain-language summary of the license the tools ship under, linked from the AGPL circle in
// the landing page's stats block. Here so `pnpm check:links` sees it.
export const AGPL_SUMMARY_URL = 'https://choosealicense.com/licenses/agpl-3.0/';

// Site and logo design, credited on the landing page and on /legal. Here for the same reason as
// NERDS_URL, and so /legal does not pull in the landing data (and cities.json with it).
export const DESIGN_CREDIT_NAME = 'Moritz Stefaner / Truth & Beauty';
export const DESIGN_CREDIT_URL = 'https://truth-and-beauty.net';
export const LOGO_DESIGN_CREDIT_NAME = 'Andreas Brietzke';
export const LOGO_DESIGN_CREDIT_URL = 'http://brietzke.com/';

// Michael Szell is named as author, publisher and GDPR controller on /legal; ITU and the funders
// appear as credits only. Confirmed 2026-09-28: the site is published *privately*, so the university
// is not formally the publisher. That is what makes /legal §5's accessibility statement voluntary.
// The word left the public sentence on 2026-10-07 at the publisher's request; the basis did not
// change. See docs/legal/legal-review-draft.md before changing the framing on the page.
export const PUBLISHER_NAME = 'Michael Szell';

// Shown on /legal and mirrored in docs/legal/legal-review-draft.md. Bump both together whenever the
// legal text changes; the date is what a reader (or a regulator) uses to tell versions apart.
export const LEGAL_LAST_UPDATED = '2026-10-16';

// The FAQ lives on its own subdomain, not as a /faq route — it is
// maintained alongside the tools rather than in this repo. It is a site of its own, so no fragment
// is needed to skip past any surrounding chrome the way the previous GitHub blob URL required.
export const FAQ_URL = 'https://faq.bikenetkit.org';

// The project's YouTube channel: the promo film, the explainer and one tutorial per tool, linked
// from the landing page's "Learn more" card. Linked, never embedded, so no YouTube origin enters
// the build. Here so `pnpm check:links` sees it.
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@BikeNetKit';

// The promo film and the explainer on the channel. The explainer is the same film the landing
// page self-hosts; the YouTube copy is what readers share. Watch URLs, so `check:links` probes
// them through oEmbed and fails if either goes private.
export const PROMO_VIDEO_URL = 'https://www.youtube.com/watch?v=TJJGxs8fGLc';
export const EXPLAINER_VIDEO_URL = 'https://www.youtube.com/watch?v=sI1AtFLUdks';

// The press kit (logos, screenshots, press release), served from static/. Replace the file in
// place to update it — the URL is linked from press coverage and must stay stable.
export const PRESS_KIT_URL = '/media/bikenetkit-press-kit.zip';
export const SITE_DESCRIPTION =
	'Free, open-source Python tools for designing well-connected bicycle infrastructure, ' +
	'with interactive visualizations for cities worldwide.';

// Generated by `pnpm generate:og` from /og/[name] — see DESIGN.md § Banners.
export const DEFAULT_OG_IMAGE = '/og/bikenetkit.png';
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const DEFAULT_OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;

// Square brand mark for structured data (`Organization.logo`), which wants a square raster rather
// than the 1200×630 banner. Exported once from the square word mark in $lib/assets/brand.
export const SITE_LOGO = '/logo-512.png';

// Where the per-city OG cards are served (see $lib/data/og-cards.ts): the data host, alongside the
// screenshots they are built from. A constant rather than PUBLIC_DATA_URL for the same reason as
// SITE_URL — og:image must be absolute, and a dev build with that variable empty would emit a path.
export const OG_CARD_ORIGIN = 'https://data.bikenetkit.org';
