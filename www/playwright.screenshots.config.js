import { defineConfig } from '@playwright/test';
import { isPortOpen, isViteDevServer } from './scripts/server-config.mjs';

// Static exports MUST be captured against a production build. Under `vite dev`,
// `import.meta.env.DEV` UI renders — MapDebugOverlay's zoom badge ends up burned
// into the bottom-right of every image (see 127c759). So there is no dev fallback:
// either reuse a preview already on the port, or build one.
//
// SCREENSHOT_PORT moves it. The reuse-an-existing-server behaviour below is a trap when two
// checkouts of this repo are open at once — a preview serving the *other* branch answers on 4173
// and gets captured without complaint. Give each worktree its own port.
const PORT = Number(process.env.SCREENSHOT_PORT) || 4173;
const baseURL = `http://localhost:${PORT}`;

// Playwright re-imports this config in every worker process, so an unguarded probe
// here runs once per worker and logs a stale verdict (workers load before the
// preview is up, so they all report "no server"). Only the runner decides whether
// to reuse or build, so only the runner probes. TEST_WORKER_INDEX is worker-only.
if (process.env.TEST_WORKER_INDEX === undefined) {
	if (await isPortOpen(PORT)) {
		const isDev = await isViteDevServer(baseURL);
		if (isDev) {
			throw new Error(
				`[screenshots] :${PORT} is a vite dev server, not a preview build.\n` +
					`              Capturing there bakes dev-only UI into the images.\n` +
					`              Stop it, then re-run — or serve a build with \`pnpm preview\`.`
			);
		}
		console.log(
			isDev === null
				? `[screenshots] reusing the server on :${PORT} (could not confirm it is a build)`
				: `[screenshots] reusing the preview build on :${PORT}`
		);
	} else {
		console.log(`[screenshots] no server on :${PORT} — building, then serving the build`);
	}
}

export default defineConfig({
	webServer: {
		// Only runs when nothing answers on the port; otherwise the server above is reused.
		command: `pnpm run build && pnpm run preview --port ${PORT} --strictPort`,
		url: baseURL,
		reuseExistingServer: true,
		// A cold build prerenders every route over the full dataset.
		timeout: 600000
	},
	use: { baseURL },
	testMatch: '**/generate-*.ts',
	timeout: 60000,
	// Retry flaky timeouts: the heaviest tiles (superblockify edges ~27MB, nodes ~6MB)
	// can blow the per-map wait budget under parallel GPU/memory contention.
	retries: 2,
	fullyParallel: true,
	// Capped below the former 6 to reduce simultaneous heavy WebGL renders.
	workers: 4
});
