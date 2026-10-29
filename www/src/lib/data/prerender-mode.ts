// Guards route-level `entries()` exports so `pnpm deploy:placeholder` doesn't prerender every
// city x metric x type x variant combo into __data.json (~6 GB) for a page that links to none of
// them. SvelteKit always invokes an exported `entries()` and enqueues its output for prerendering,
// regardless of the `prerender.entries` config (see svelte.config.js), so the skip has to happen
// inside each `entries()` body instead. `entries()` only ever runs at build time in Node — never
// in the browser. The module still *loads* in the browser, though: dev serves `+page.ts` unstripped,
// so a bare `process.env` here throws `ReferenceError: process is not defined` before the route can
// hydrate, and every map page loses its map. Hence the `typeof` guard — identical at build time in
// Node, inert in a browser.
export const placeholderOnly =
	typeof process !== 'undefined' && process.env.PLACEHOLDER_ONLY === 'true';
