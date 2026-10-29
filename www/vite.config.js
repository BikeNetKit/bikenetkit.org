import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import sirv from 'sirv';

/**
 * Serve the off-repo GeoJSON and per-dataset screenshots in dev and preview.
 *
 * They live in `www/data/` and `www/screenshots/` rather than under `static/`, so Vite's public-dir
 * copy no longer duplicates ~2.4 GB into `build/` on every single build — including placeholder
 * builds, which prerender one page and copied the whole dataset anyway. In production these paths
 * resolve to PUBLIC_DATA_URL (data.bikenetkit.org); locally this middleware stands in for that host,
 * which keeps `pnpm dev` working offline and lets `pnpm generate:screenshots` capture against
 * `pnpm preview`. See www/DEPLOY_DATA.md.
 */
function offRepoData() {
	const mounts = [
		['/data', path.resolve('data')],
		['/screenshots', path.resolve('screenshots')]
	];
	/** @param {{ middlewares: import('vite').Connect.Server }} server */
	const mount = (server) => {
		for (const [route, dir] of mounts) {
			// Absent in a fresh clone until `pnpm pull-data` runs; the app 404s on the fetch and shows
			// its "could not load" state rather than the dev server failing to start.
			if (!existsSync(dir)) continue;
			server.middlewares.use(
				route,
				sirv(dir, {
					dev: true,
					etag: true,
					// `dev: true` otherwise sends no-store, which would make hover-prefetching a no-op
					// locally — the prefetched bytes would simply be fetched again on navigation, so the
					// feature would look broken everywhere except production. Mirrors the nginx vhost's
					// `public, max-age=3600`, shortened so a `pnpm pull-data` mid-session is picked up
					// quickly. See www/DEPLOY_DATA.md.
					setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=60')
				})
			);
		}
	};
	return {
		name: 'bikenetkit:off-repo-data',
		configureServer: mount,
		configurePreviewServer: mount
	};
}

/**
 * Serve MapLibre's worker untransformed in dev.
 *
 * src/lib/map-style/maplibre-worker.js imports it with `?worker&url`, and the browser then fetches
 * `…/maplibre-gl-worker.mjs?worker_file&type=module`. Vite would answer that with the file run
 * through import analysis, which rewrites the worker's one dynamic `import()` to pull in
 * `/@vite/client` — and that throws on `document` inside a worker, so no map would render under
 * `pnpm dev`. The worker has no imports of its own, so its bytes as they are are what it needs.
 */
function maplibreWorker() {
	const file = '/maplibre-gl/dist/maplibre-gl-worker.mjs';
	return {
		name: 'bikenetkit:maplibre-worker',
		/** @param {import('vite').ViteDevServer} server */
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				// Only the worker fetch itself: the `?worker&url` import must still reach Vite, which
				// answers it with the module that exports the worker's URL.
				const [pathname, query = ''] = (req.url ?? '').split('?');
				if (!pathname.endsWith(file) || !query.includes('worker_file')) return next();
				res.setHeader('Content-Type', 'text/javascript');
				createReadStream(path.resolve('node_modules' + file)).pipe(res);
			});
		}
	};
}

// The moment this Vite process started, inlined into the bundle by `define` below and rendered as
// the landing footer's "Last deployed on …" note. `pnpm deploy:site` builds and then immediately
// rsyncs, so the build instant and the deploy are the same minute — a `--skip-build` deploy is the
// one case where they diverge. Evaluated once per Vite process, so under `pnpm dev` it reads as the
// dev server's start time rather than tracking the clock.
const buildTime = new Date().toISOString();

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), offRepoData(), maplibreWorker()],
	// Consumed by src/lib/build-info.ts, which is the only module allowed to name this literal.
	define: {
		__BUILD_TIME__: JSON.stringify(buildTime)
	},
	ssr: {
		noExternal: ['@lucide/svelte']
	}
});
