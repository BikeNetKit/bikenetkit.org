import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// The accessibility suite: axe on every route family, aria snapshots of the structures a screen
// reader walks, and the keyboard paths. Separate from the smoke suite so `pnpm test` keeps its
// half-minute budget; it reuses the same server the same way.
export default defineConfig({
	...base,
	testMatch: '**/*.a11y.ts',
	// Freezes the hero and the map build-ups at their final frame, so the snapshots are stable — and
	// exercises the reduced-motion path on every run.
	use: { ...base.use, contextOptions: { reducedMotion: 'reduce' } }
});
