// Minimal ESM resolve hook: rewrites the SvelteKit `$lib/…` alias to `src/lib/…` so plain-Node
// build scripts can import the map-style modules. `build-map-style.mjs` needs `theme.js`, whose
// only non-relative import is `$lib/colors.js`; Node has no idea what `$lib` is, so it dies on the
// specifier. Registered via `module.register()` before the dynamic imports that use it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib');

// SvelteKit synthesises `$env/static/public` at build time from the `PUBLIC_*` variables in the
// environment. Node has no such module, so anything reaching `data-base.ts` dies on the specifier.
// Stubbed from the real `.env` where there is one, and from empty strings otherwise — which is
// exactly what a local dev build sees, and what the scripts that import these modules need.
const ENV_STATIC_PUBLIC = 'bikenetkit:env-static-public';

function envStaticPublicSource() {
	const names = new Set([
		'PUBLIC_BASEMAP_URL',
		'PUBLIC_DATA_URL',
		'PUBLIC_LANDING_PLACEHOLDER',
		'PUBLIC_SITE_URL',
		'PUBLIC_VIDEO_URL'
	]);
	const envPath = path.resolve(LIB_DIR, '../../.env');
	const values = {};
	if (existsSync(envPath)) {
		for (const line of readFileSync(envPath, 'utf8').split('\n')) {
			const match = /^\s*(PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
			if (!match) continue;
			names.add(match[1]);
			values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
		}
	}
	return [...names]
		.map((name) => `export const ${name} = ${JSON.stringify(values[name] ?? '')};`)
		.join('\n');
}

// `$app/paths` is the other SvelteKit virtual module these data modules reach. `base` is '' for
// this site (it is served from a domain root, not a subpath), and `resolve` is identity on an
// already-resolved path, so the stub is faithful rather than merely convenient.
const APP_PATHS = 'bikenetkit:app-paths';
const APP_PATHS_SOURCE = [
	"export const base = '';",
	"export const assets = '';",
	'export const resolve = (p) => p;',
	'export const resolveRoute = (p) => p;'
].join('\n');

export async function resolve(specifier, context, next) {
	if (specifier === '$env/static/public') {
		return { url: ENV_STATIC_PUBLIC, format: 'module', shortCircuit: true };
	}
	if (specifier === '$app/paths') {
		return { url: APP_PATHS, format: 'module', shortCircuit: true };
	}
	if (specifier.startsWith('$lib/')) {
		// `withExtension` too: `$lib/data/tools` is as extensionless as `./tools` is, and Node
		// resolves both literally.
		const abs = withExtension(path.join(LIB_DIR, specifier.slice('$lib/'.length)));
		return {
			url: pathToFileURL(abs).href,
			shortCircuit: true,
			...jsonAttributes(abs)
		};
	}
	const extensionless = resolveExtensionless(specifier, context.parentURL);
	if (extensionless) return { url: extensionless, shortCircuit: true };

	const resolved = await next(specifier, context);
	return { ...resolved, ...jsonAttributes(resolved.url) };
}

// TypeScript source imports siblings without an extension (`./tools`, `./types`); Node resolves
// specifiers literally and ENOENTs on them. Try the extensions the app actually uses, in the order
// TypeScript would.
const EXTENSIONS = ['.ts', '.js', '.mjs'];

function withExtension(base) {
	if (path.extname(base)) return base;
	for (const ext of EXTENSIONS) {
		if (existsSync(base + ext)) return base + ext;
	}
	return base;
}

function resolveExtensionless(specifier, parentURL) {
	if (!specifier.startsWith('.') || !parentURL || path.extname(specifier)) return null;
	const base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
	const resolved = withExtension(base);
	return resolved === base ? null : pathToFileURL(resolved).href;
}

// Vite lets `import data from './x.json'` stand on its own; Node requires `with { type: 'json' }`
// and throws ERR_IMPORT_ATTRIBUTE_MISSING without it. The app's modules are written for Vite, so
// the attribute is supplied here rather than littering source files with a syntax only these
// scripts need. Lets `check-coverage.mjs` import the real `datasets.ts` and `cities.ts`.
function jsonAttributes(url) {
	return url.endsWith('.json') ? { importAttributes: { type: 'json' } } : {};
}

export function load(url, context, next) {
	if (url === ENV_STATIC_PUBLIC) {
		return { format: 'module', source: envStaticPublicSource(), shortCircuit: true };
	}
	if (url === APP_PATHS) {
		return { format: 'module', source: APP_PATHS_SOURCE, shortCircuit: true };
	}
	return next(url, context);
}
