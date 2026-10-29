// Inherited by every route in the app — none of the map routes, the `(map)` layout or the
// `/<tool>/<city>` redirect stubs declares its own. Do not move or remove it: without it
// adapter-static silently emits nothing for the whole map section.
export const prerender = true;

// A universal file on purpose, and no `+layout.server.ts` beside it: any server file on the root
// layout (the dev manifest counts one even without a `load`) makes the client fetch
// `<path>/__data.json` first, which a static host lacks for the client-only routes. The manifest
// preflight that lived there runs in src/hooks.server.ts.
