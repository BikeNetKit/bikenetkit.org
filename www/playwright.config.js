import { defineConfig, devices } from '@playwright/test';

// The smoke suite. It exists because this site is meant to run for years without maintenance, so
// the cheapest thing that can go wrong is a route quietly breaking and nobody noticing.
//
// It runs against a *server that is already up* whenever there is one — `reuseExistingServer`. A
// suite that costs a six-minute production build every time is a suite nobody runs, and the whole
// point is that it gets run. `pnpm dev` is a legitimate target: unlike the screenshot generator
// (which must never capture dev, or dev-only UI is burned into the images), nothing here reads
// pixels. Point it somewhere else with PW_BASE_URL.
const PORT = Number(process.env.PW_PORT) || 4173;
const baseURL = process.env.PW_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
	testDir: 'tests',
	testMatch: '**/*.e2e.{ts,js}',
	// Nothing here writes to disk or shares state, so the only cost of parallelism is memory.
	fullyParallel: true,
	workers: process.env.CI ? 2 : 4,
	// A map page fetches multi-megabyte GeoJSON and then draws it. Generous, but a failure should
	// mean "it never drew", not "the machine was busy".
	timeout: 45_000,
	expect: { timeout: 15_000 },
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// Only starts a server when nothing answers on the port.
	webServer: {
		command: `pnpm run build && pnpm run preview --port ${PORT} --strictPort`,
		url: baseURL,
		reuseExistingServer: true,
		// A cold build prerenders every route in the catalogue.
		timeout: 600_000
	}
});
