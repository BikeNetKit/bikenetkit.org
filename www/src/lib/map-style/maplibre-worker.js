// Point MapLibre at its worker before any map is created.
//
// MapLibre 6 is ESM-only and loads its worker from a URL computed relative to its own module, a
// file Vite neither pre-bundles in dev nor emits in the build — every map fails with "Worker failed
// to load". `?worker&url` makes the build emit the worker as a `.js` chunk on our own origin.
// `.js` matters: the production nginx maps no MIME type to `.mjs`, and a module worker served as
// `application/octet-stream` is refused, so a plain `?url` copy of the `.mjs` would break every
// map there and nowhere else. In dev, the `maplibreWorker` plugin in vite.config.js serves the
// worker untransformed.
//
// Replaces `svelte-maplibre-gl/vite`, which does the same from inside a dependency, where the
// query breaks Vite's dependency optimizer. Imported for its side effect by style.js, like
// pmtiles-protocol.js.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

if (typeof window !== 'undefined') {
	setWorkerUrl(workerUrl);
}
