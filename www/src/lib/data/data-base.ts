import { PUBLIC_DATA_URL } from '$env/static/public';

// Optional base for the off-repo GeoJSON host (e.g. https://data.bikenetkit.org). Empty in local
// dev, where static/ is the web root and the files sit at `/data/...`. Callers author every path
// as `/data/...` for that same-origin case; when an external host is set it serves the data dir at
// its own root, so the `/data` prefix is dropped. See www/DEPLOY_DATA.md.
const BASE = (PUBLIC_DATA_URL ?? '').replace(/\/$/, '');

export const dataUrl = (path: string): string =>
	BASE ? `${BASE}${path.replace(/^\/data/, '')}` : path;

// Origin only, for the root layout's `preconnect`. Empty when the data is same-origin, which is
// every local dev and preview run — a preconnect to our own origin is a wasted tag. Tested rather
// than parsed unconditionally so a malformed value degrades to "no preconnect" instead of throwing
// at module load and taking the build with it.
export const DATA_ORIGIN = /^https?:\/\//.test(BASE) ? new URL(BASE).origin : '';
