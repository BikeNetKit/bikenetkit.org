import adapter from '@sveltejs/adapter-static';

// `deploy:placeholder` builds the "coming soon" page and the hidden `/design` reference page, not
// the site: prerendering every map route would bake each city's GeoJSON into __data.json (~6 GB)
// for a landing that links to none of them (see scripts/deploy.mjs). Deliberately a separate flag
// from PUBLIC_LANDING_PLACEHOLDER, which is also `true` for plain local dev builds and would
// otherwise gut those too.
//
// Narrowing `entries` below only stops the crawl-discovered routes (the static tool/city listing
// pages) — SvelteKit always invokes a route's own exported `entries()` and prerenders its output
// regardless of this config, so the dynamic map/city routes are additionally skipped inside their
// own `entries()` via `placeholderOnly` from `$lib/data/prerender-mode`.
const placeholderOnly = process.env.PLACEHOLDER_ONLY === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Absolute asset URLs. SvelteKit defaults `paths.relative` to true, which emits
		// `../../../../_app/…` on a page nested four deep — correct only while the browser sits on the
		// exact no-trailing-slash URL. But many a page has a directory of the same name beside it
		// (`growbikenet.html` beside `growbikenet/`, for nested pages or the page's `__data.json`),
		// and a static host normalises `/x` to `/x/` when `x/` exists. One base-path level later the
		// stylesheet and the whole JS bundle 404, and a deep link renders unstyled. The site is always
		// served from the domain root, so relative paths buy nothing here.
		paths: { relative: false },
		// `fallback` emits a `404.html` rendered through src/routes/+error.svelte; nginx serves it via
		// `error_page 404 /404.html;` (see DEPLOY_NGINX.md). It is also the SPA shell the client-only
		// /embed boots from, which the vhost rewrites to with a 200.
		adapter: adapter({ strict: false, fallback: '404.html' }),
		prerender: {
			// `/design` ships with the placeholder so the design system can be shared with
			// collaborators pre-launch, together with the spec file it links to (`/DESIGN.md`). It
			// needs no exemption from the 404.html redirect stub that scripts/deploy.mjs writes — that
			// only ever fires for URLs the build did not emit.
			entries: placeholderOnly ? ['/', '/design', '/DESIGN.md'] : ['*'],
			// In placeholder mode `entries` is the whole contract. `/design` links only to itself,
			// `#anchors`, `/DESIGN.md` (a leaf, listed above) and external URLs today; leave the
			// crawler on and one future in-site link there would silently drag the entire map
			// section — and its ~6 GB of __data.json — back into a "coming soon" deploy. The full
			// build still crawls, and still link-checks.
			crawl: !placeholderOnly,
			// Every route still carries `export const prerender = true` (inherited from the root
			// layout), so with entries narrowed above, SvelteKit's default `handleUnseenRoutes`
			// would fail the build over routes the placeholder deliberately never crawls to.
			handleUnseenRoutes: placeholderOnly ? 'ignore' : 'fail',
			handleHttpError: ({ path, message }) => {
				if (path.startsWith('/screenshots/')) {
					console.warn(`[prerender] missing screenshot: ${path}`);
					return;
				}
				// No `/data/…` branches: the map pages no longer fetch their GeoJSON during
				// prerender (it is fetched in the browser — see $lib/data/active-dataset), so the
				// prerenderer never requests a dataset and these could only ever be dead code.
				// The one invariant they carried — linkbikenet's existing-network baseline is
				// mandatory, unlike fixbikenet's — moved to the manifest preflight in
				// src/hooks.server.ts, where it fails in seconds rather than mid-crawl.
				throw new Error(message);
			}
		}
	},
	vitePlugin: { inspector: { toggleKeyCombo: 'alt-shift' } }
};

export default config;
