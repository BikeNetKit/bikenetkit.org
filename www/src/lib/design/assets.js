const svgUrls = import.meta.glob('../assets/brand/*.svg', {
	eager: true,
	query: '?url',
	import: 'default'
});
const svgRaw = import.meta.glob('../assets/brand/*.svg', {
	eager: true,
	query: '?raw',
	import: 'default'
});
const pngUrls = import.meta.glob('../assets/brand/*@2x.png', {
	eager: true,
	query: '?url',
	import: 'default'
});

const GROUPS = {
	logos: [
		'logo-colors',
		'logo-white-padded',
		'logo-white-padded-narrow',
		'logo-mono',
		'logo-badge',
		'logo-round-badge',
		'logo-round-teal'
	],
	wordmarks: ['word-mark', 'logo-word-mark-horizontal', 'logo-word-mark-square'],
	backgrounds: ['banner', 'city-bg']
};

const LABELS = {
	'logo-colors': 'Logo (color)',
	'logo-white-padded': 'Logo on white (25% padding)',
	'logo-white-padded-narrow': 'Logo on white (12.5% padding)',
	'logo-mono': 'Logo (mono)',
	'logo-badge': 'Logo badge',
	'logo-round-badge': 'Round badge (green)',
	'logo-round-teal': 'Round badge (teal)',
	'word-mark': 'Wordmark',
	'logo-word-mark-horizontal': 'Logo + wordmark (horizontal)',
	'logo-word-mark-square': 'Logo + wordmark (square)',
	banner: 'Banner',
	'city-bg': 'City background'
};

// Square avatar-style variants, derived from logo-colors.svg rather than kept as their own
// files so the mark can never drift from the source. The padding is applied on every side;
// the mark is fitted inside that box and centred, so the taller axis simply gets more air.
const PADDED = { size: 512, background: '#ffffff' };
const PADDED_VARIANTS = {
	'logo-white-padded': 0.25,
	'logo-white-padded-narrow': 0.125
};

function paddedOnWhite(raw, padding) {
	const root = raw.match(/<svg[^>]*>/)?.[0];
	const width = Number(root?.match(/\bwidth="([\d.]+)"/)?.[1]);
	const height = Number(root?.match(/\bheight="([\d.]+)"/)?.[1]);
	if (!width || !height) {
		throw new Error('logo-colors.svg: could not read its intrinsic size for the padded variants.');
	}
	const box = PADDED.size * (1 - 2 * padding);
	const scale = Math.min(box / width, box / height);
	const x = round((PADDED.size - width * scale) / 2);
	const y = round((PADDED.size - height * scale) / 2);
	const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
	return [
		`<svg width="${PADDED.size}" height="${PADDED.size}" viewBox="0 0 ${PADDED.size} ${PADDED.size}" fill="none" xmlns="http://www.w3.org/2000/svg">`,
		`<rect width="${PADDED.size}" height="${PADDED.size}" fill="${PADDED.background}"/>`,
		`<g transform="translate(${x} ${y}) scale(${round(scale, 4)})">`,
		inner.trim(),
		'</g>',
		'</svg>',
		''
	].join('\n');
}

function round(value, places = 2) {
	return Number(value.toFixed(places));
}

function basename(path) {
	return path
		.split('/')
		.pop()
		.replace(/\.[^.]+$/, '');
}

function byBasename(map) {
	const out = {};
	for (const [path, value] of Object.entries(map)) out[basename(path)] = value;
	return out;
}

function buildCatalog() {
	const urls = byBasename(svgUrls);
	const raws = byBasename(svgRaw);
	const pngs = byBasename(pngUrls);
	for (const [name, padding] of Object.entries(PADDED_VARIANTS)) {
		raws[name] = paddedOnWhite(raws['logo-colors'], padding);
		urls[name] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raws[name])}`;
	}
	const catalog = [];
	for (const [group, names] of Object.entries(GROUPS)) {
		for (const name of names) {
			const svgUrl = urls[name] ?? null;
			const pngUrl = pngs[`${name}@2x`] ?? null;
			if (!svgUrl && !pngUrl) continue;
			catalog.push({
				name,
				group,
				label: LABELS[name] ?? name,
				svgUrl,
				rawSvg: raws[name] ?? null,
				pngUrl
			});
		}
	}
	return catalog;
}

export const brandAssets = buildCatalog();
export const assetGroups = Object.keys(GROUPS);
