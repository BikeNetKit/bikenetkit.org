// `__BUILD_TIME__` is replaced at transform time by the `define` entry in vite.config.js, so it is
// a string literal in the output rather than a global anyone could read at runtime. The declaration
// is deliberately module-scoped rather than living in a global `.d.ts`: that keeps the ambient
// binding from leaking into the rest of the app, and a `.ts` file sits outside this repo's ESLint
// file set (flat config matches only `**/*.js` and `**/*.svelte`), so no `globals` entry is needed
// either. This is the one module that may name it — everything else imports BUILD_TIME.
declare const __BUILD_TIME__: string;

/**
 * ISO 8601 UTC instant the running bundle was built. Render it with `formatIsoDateTime`, which
 * formats in UTC unless given the viewer's zone.
 */
export const BUILD_TIME: string = __BUILD_TIME__;

export { version as SITE_VERSION } from '../../package.json';
