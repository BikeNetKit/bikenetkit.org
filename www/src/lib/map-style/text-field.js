/**
 * Multilingual text-field expression builders for Protomaps basemap labels.
 *
 * These reproduce the output of get_multiline_name('en') and get_country_name('en')
 * from @protomaps/basemaps, but parameterized with custom fonts.
 */

const LANG = 'en';
const NAME_KEY = `name:${LANG}`;

/** Font expression that falls back to Devanagari when the script property matches. */
function scriptFont(scriptProp, fonts) {
	return [
		'case',
		['==', ['get', scriptProp], 'Devanagari'],
		['literal', [fonts.devanagari]],
		['literal', [fonts.regular]]
	];
}

/** Format block for one name segment with script-aware font. */
function nameBlock(nameIdx, fonts) {
	const suffix = nameIdx === 0 ? '' : `${nameIdx + 1}`;
	const nameProp = `name${suffix}`;
	const pgfProp = `pgf:name${suffix}`;
	const scriptProp = `script${suffix}`;
	return [
		['coalesce', ['get', pgfProp], ['get', nameProp]],
		{ 'text-font': scriptFont(scriptProp, fonts) }
	];
}

/** Single-name branch: has name/pgf:name but NOT name2/name3. */
function singleName(fonts) {
	return [
		'case',
		['has', 'script'],
		[
			'case',
			['any', ['is-supported-script', ['get', 'name']], ['has', 'pgf:name']],
			[
				'format',
				['coalesce', ['get', NAME_KEY], ['get', NAME_KEY]],
				{},
				'\n',
				{},
				[
					'case',
					['all', ['!', ['has', NAME_KEY]], ['has', NAME_KEY], ['!', ['has', 'script']]],
					'',
					['coalesce', ['get', 'pgf:name'], ['get', 'name']]
				],
				{ 'text-font': scriptFont('script', fonts) }
			],
			['get', NAME_KEY]
		],
		['format', ['coalesce', ['get', NAME_KEY], ['get', 'pgf:name'], ['get', 'name']], {}]
	];
}

/** Two-name branch: has name + name2, but NOT name3. */
function twoNames(fonts) {
	return [
		'case',
		['all', ['has', 'script'], ['has', 'script2']],
		[
			'format',
			['get', NAME_KEY],
			{},
			'\n',
			{},
			...nameBlock(0, fonts),
			'\n',
			{},
			...nameBlock(1, fonts)
		],
		[
			'case',
			['has', 'script2'],
			[
				'format',
				['coalesce', ['get', NAME_KEY], ['get', 'pgf:name'], ['get', 'name']],
				{},
				'\n',
				{},
				...nameBlock(1, fonts)
			],
			[
				'format',
				['coalesce', ['get', NAME_KEY], ['get', 'pgf:name2'], ['get', 'name2']],
				{},
				'\n',
				{},
				...nameBlock(0, fonts)
			]
		]
	];
}

/** Three-name branch: has name + name2 + name3. */
function threeNames(fonts) {
	return [
		'case',
		['all', ['has', 'script'], ['has', 'script2'], ['has', 'script3']],
		[
			'format',
			['get', NAME_KEY],
			{},
			'\n',
			{},
			...nameBlock(0, fonts),
			'\n',
			{},
			...nameBlock(1, fonts),
			'\n',
			{},
			...nameBlock(2, fonts)
		],
		[
			'case',
			['!', ['has', 'script']],
			[
				'format',
				['coalesce', ['get', NAME_KEY], ['get', 'pgf:name'], ['get', 'name']],
				{},
				'\n',
				{},
				...nameBlock(1, fonts),
				'\n',
				{},
				...nameBlock(2, fonts)
			],
			['!', ['has', 'script2']],
			[
				'format',
				['coalesce', ['get', NAME_KEY], ['get', 'pgf:name2'], ['get', 'name2']],
				{},
				'\n',
				{},
				...nameBlock(0, fonts),
				'\n',
				{},
				...nameBlock(2, fonts)
			],
			[
				'format',
				['coalesce', ['get', NAME_KEY], ['get', 'pgf:name3'], ['get', 'name3']],
				{},
				'\n',
				{},
				...nameBlock(0, fonts),
				'\n',
				{},
				...nameBlock(1, fonts)
			]
		]
	];
}

function hasName(idx) {
	const suffix = idx === 0 ? '' : `${idx + 1}`;
	return ['any', ['has', `name${suffix}`], ['has', `pgf:name${suffix}`]];
}

function notHasName(idx) {
	const suffix = idx === 0 ? '' : `${idx + 1}`;
	return ['!', ['any', ['has', `name${suffix}`], ['has', `pgf:name${suffix}`]]];
}

/**
 * Full multilingual text-field expression (equivalent to get_multiline_name('en')).
 * Handles 1, 2, or 3 name variants with Devanagari script fallback.
 */
export function multilineName(fonts) {
	return [
		'case',
		['all', hasName(0), notHasName(1), notHasName(2)],
		singleName(fonts),
		['all', hasName(0), hasName(1), notHasName(2)],
		twoNames(fonts),
		threeNames(fonts)
	];
}

/** Simple country name expression (equivalent to get_country_name('en')). */
export function countryName() {
	return ['format', ['coalesce', ['get', NAME_KEY], ['get', NAME_KEY]], {}];
}
