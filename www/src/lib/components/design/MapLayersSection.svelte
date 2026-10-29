<script>
	import BasemapSpecimen from './BasemapSpecimen.svelte';
	import EmbedSpecimen from './EmbedSpecimen.svelte';
	import LineSpecimen from './LineSpecimen.svelte';
	import { coreColors } from '$lib/colors.js';
	import { fonts, theme } from '$lib/map-style/theme.js';
	import { overlayBeforeId } from '$lib/map-style/style.js';
	import { renderContextIcon, CONTEXT_ICON_PIXEL_RATIO } from '$lib/map-style/context-icons.js';
	import {
		BOUNDARY_LINE_OPACITY,
		BOUNDARY_LINE_WIDTH,
		BOUNDARY_MASK_OPACITY,
		CONTEXT_DOT_RADIUS,
		CONTEXT_ICON_MIN_ZOOM,
		DEFAULT_LINE_WIDTH_RANGE,
		DOT_LINE_CROSSFADE,
		DOT_MARKER_RADIUS,
		DOT_MARKER_RADIUS_REST,
		DOT_MARKER_RADIUS_TOP,
		DOT_RANK_TEXT_SIZE,
		EXISTING_NETWORK_FRAGMENTED_OPACITY,
		EXISTING_NETWORK_LINE_WIDTH,
		EXISTING_NETWORK_OPACITY,
		HIGHLIGHT_LINE_WIDTH,
		HIGHLIGHT_OUTLINE_INSET,
		HIGHLIGHT_WIDTH_FACTOR,
		PLAN_UNDERLAY_LINE_WIDTH,
		PLAN_UNDERLAY_OPACITY,
		ROAD_LABEL_MIN_ZOOM,
		ROAD_SHIELD_MIN_ZOOM,
		SEED_CIRCLE_RADIUS,
		SELECTION_WIDTH_STEP,
		SUBPLACE_ZOOM,
		SUPERBLOCK_BOUNDARY_WIDTH,
		SUPERBLOCK_EDGE_OPACITY,
		SUPERBLOCK_HOVER_WIDTH,
		SUPERBLOCK_HULL_OPACITY
	} from '$lib/map-style/render-config.js';
	import { lineWidthRangeFor, growBikeNetConfig } from '$lib/data/tools';
	import { FIXBIKENET_RAMP } from '$lib/data/fixbikenet';
	import { SORTBIKENET_EXISTING_STYLE } from '$lib/data/sortbikenet';
	import {
		ABOVE_LABELS,
		OVERLAY_STACK,
		ZOOM_SAMPLES,
		basemapLayerBands,
		basemapPaletteGroups,
		toolRampSpecimens
	} from '$lib/design/map-specs.js';

	const paletteGroups = basemapPaletteGroups();
	const overrideCount = paletteGroups.flatMap((g) => g.entries).filter((e) => e.overridden).length;
	const bands = basemapLayerBands();
	const rampRows = toolRampSpecimens();

	const labelTiers = [
		[
			'places_subplace — city district',
			'population_rank ≥ 8',
			`SUBPLACE_ZOOM.district`,
			SUBPLACE_ZOOM.district
		],
		[
			'places_subplace — quarter',
			'kind = macrohood',
			'SUBPLACE_ZOOM.quarter',
			SUBPLACE_ZOOM.quarter
		],
		[
			'places_subplace — neighborhood',
			'everything else',
			'SUBPLACE_ZOOM.neighbourhood',
			SUBPLACE_ZOOM.neighbourhood
		],
		['roads_labels_major', 'major road names', 'ROAD_LABEL_MIN_ZOOM', ROAD_LABEL_MIN_ZOOM],
		['roads_shields', 'motorway badges', 'ROAD_SHIELD_MIN_ZOOM', ROAD_SHIELD_MIN_ZOOM],
		['roads_labels_minor', 'minor road names', 'layers.js', 15]
	];

	const topWidth = DEFAULT_LINE_WIDTH_RANGE[1];

	// Hover and selection derive their width from the tool's own widest line; FixBikeNet is the tool
	// that has both.
	const fixRange = lineWidthRangeFor('fixbikenet');
	const highlightWidth = Math.max(HIGHLIGHT_LINE_WIDTH, fixRange[1] * HIGHLIGHT_WIDTH_FACTOR);
	const selectionWidth = highlightWidth + SELECTION_WIDTH_STEP;
	const casing = { color: coreColors.ink, inset: HIGHLIGHT_OUTLINE_INSET };
	const highlightSamples = [
		{ color: FIXBIKENET_RAMP[0], width: fixRange[0] },
		{ color: FIXBIKENET_RAMP[FIXBIKENET_RAMP.length - 1], width: fixRange[1] }
	];

	const existingSamples = [
		{
			label: 'Baseline',
			color: coreColors.existingNetwork,
			width: EXISTING_NETWORK_LINE_WIDTH,
			opacity: EXISTING_NETWORK_OPACITY,
			spec: `existingNetwork · ${EXISTING_NETWORK_LINE_WIDTH}px · ${EXISTING_NETWORK_OPACITY}`
		},
		{
			label: 'Hovered',
			color: coreColors.existingNetworkHover,
			width: EXISTING_NETWORK_LINE_WIDTH,
			opacity: EXISTING_NETWORK_OPACITY,
			spec: 'existingNetworkHover'
		},
		{
			label: 'LinkBikeNet, fragmented',
			color: coreColors.existingNetwork,
			width: EXISTING_NETWORK_LINE_WIDTH,
			opacity: EXISTING_NETWORK_FRAGMENTED_OPACITY,
			spec: `existingNetwork · ${EXISTING_NETWORK_FRAGMENTED_OPACITY}`
		},
		{
			label: 'LinkBikeNet, connected',
			color: coreColors.existingNetworkConnected,
			width: EXISTING_NETWORK_LINE_WIDTH,
			opacity: 1,
			spec: 'existingNetworkConnected · 1'
		},
		{
			label: 'SortBikeNet baseline',
			color: SORTBIKENET_EXISTING_STYLE.color,
			width: SORTBIKENET_EXISTING_STYLE.width,
			opacity: EXISTING_NETWORK_OPACITY,
			spec: `existingNetworkLight · ${SORTBIKENET_EXISTING_STYLE.width.toFixed(2)}px`
		},
		{
			label: 'SortBikeNet plan underlay',
			color: coreColors.ink,
			width: PLAN_UNDERLAY_LINE_WIDTH,
			opacity: PLAN_UNDERLAY_OPACITY,
			spec: `ink · ${PLAN_UNDERLAY_LINE_WIDTH}px · ${PLAN_UNDERLAY_OPACITY}`
		}
	];

	const overviewDots = [
		{ label: 'Rest', r: DOT_MARKER_RADIUS_REST, color: FIXBIKENET_RAMP[0], rank: null },
		{ label: 'Default', r: DOT_MARKER_RADIUS, color: FIXBIKENET_RAMP[1], rank: null },
		{ label: 'Top-ranked', r: DOT_MARKER_RADIUS_TOP, color: FIXBIKENET_RAMP[2], rank: 1 }
	];

	const categories = [0, 1, 2, 3, 4].map((i) => `var(--color-category-${i})`);

	const city = 'copenhagen_dk';
	const embeds = [
		{
			path: `/embed/growbikenet/${city}/${growBikeNetConfig.defaultMetric}/${growBikeNetConfig.defaultType}/from_bikenw`,
			title: 'GrowBikeNet · Copenhagen',
			caption:
				'The default ramp over the periwinkle existing network, which is drawn because this is the from_bikenw variant. Press play to watch the build-up reveal the network.'
		},
		{
			path: `/embed/fixbikenet/${city}`,
			title: 'FixBikeNet · Copenhagen',
			caption:
				'The gap ramp without ramp-0, at the tool’s wider width range. Hovering a gap shows the ink casing. The tool page adds the overview dots; the embed does not.'
		},
		{
			path: `/embed/linkbikenet/${city}`,
			title: 'LinkBikeNet · Copenhagen',
			caption:
				'The gain ramp. Its baseline turns from pale to saturated periwinkle as the build-up wires each piece into the largest connected component.'
		},
		{
			path: '/embed/superblockify/podgorica_me',
			title: 'SuperBlockify · Podgorica',
			caption:
				'Hashed category fills under the street edges, with the size filter as the legend. Copenhagen has no SuperBlockify result, so this uses the other target city.'
		},
		{
			path: '/embed/sortbikenet/paris_fr',
			title: 'SortBikeNet · Paris',
			caption:
				'The reversed ramp at a constant width, over the lighter, doubled baseline and the faint ink plan underlay. Paris is the only SortBikeNet city.'
		},
		{
			path: `/embed/growbikenet/${city}/${growBikeNetConfig.defaultMetric}/${growBikeNetConfig.defaultType}/from_bikenw?bbox=12.545,55.669,12.557,55.675`,
			title: 'GrowBikeNet · Copenhagen, street level',
			caption:
				'The same map framed at about z15, where the zoom scale has thickened every line and the basemap shows minor road names.'
		}
	];

	/** @param {string} kind */
	const drawIcon = (kind) => /** @param {HTMLCanvasElement} canvas */ (canvas) => {
		const image = renderContextIcon(kind);
		if (!image) return;
		canvas.width = image.width;
		canvas.height = image.height;
		canvas.style.width = `${image.width / CONTEXT_ICON_PIXEL_RATIO}px`;
		canvas.style.height = `${image.height / CONTEXT_ICON_PIXEL_RATIO}px`;
		canvas.getContext('2d')?.putImageData(image, 0, 0);
	};
</script>

{#snippet subheading(title)}
	<h3 class="mt-12 mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
		{title}
	</h3>
{/snippet}

{#snippet source(text)}
	<p class="mt-3 font-mono text-xs text-ink-weaker">{text}</p>
{/snippet}

<header class="mb-6">
	<h2 id="maps" class="font-display text-2xl font-bold text-brand">Maps</h2>
	<p class="mt-1 text-sm text-ink-weaker">
		A quiet, self-hosted Protomaps basemap with the tool’s GeoJSON overlays on top. The network is
		the subject, and the basemap is there for orientation. Every specimen below is drawn from the
		constants the map itself paints with, so it changes when they do.
	</p>
</header>

<h3 class="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">Layer stack</h3>
<p class="mb-3 text-sm text-ink-weaker">
	Top to bottom. Every overlay is inserted beneath
	<code class="font-mono text-xs">overlayBeforeId()</code>
	(<code class="font-mono text-xs">{overlayBeforeId()}</code>), so place names stay legible on top
	of the network. Within a component, the declaration order is the drawing order.
</p>
<ol class="overflow-hidden rounded border border-border-weaker bg-paper-white text-sm">
	{@render band(bands[2])}
	<li class="border-t border-border-weakest bg-paper-brand px-4 py-2">
		{@render overlayRow(ABOVE_LABELS)}
	</li>
	{#each [...OVERLAY_STACK].reverse() as layer (layer.id)}
		<li class="border-t border-border-weakest bg-paper-brand px-4 py-2">
			{@render overlayRow(layer)}
		</li>
	{/each}
	{@render band(bands[1])}
	{@render band(bands[0])}
</ol>

{#snippet band(b)}
	<li class="border-t border-border-weakest px-4 py-2 first:border-t-0">
		<details>
			<summary class="cursor-pointer">
				<span class="font-semibold text-ink">Basemap · {b.name}</span>
				<span class="text-ink-weaker">— {b.ids.length} layers</span>
			</summary>
			<p class="mt-2 font-mono text-2xs leading-relaxed text-ink-weaker">{b.ids.join(' · ')}</p>
		</details>
	</li>
{/snippet}

{#snippet overlayRow(layer)}
	<div class="grid gap-x-4 sm:grid-cols-3">
		<span class="font-mono text-xs text-ink">{layer.id}</span>
		<span class="text-xs text-ink-weaker">{layer.tools} · {layer.source}</span>
		<span class="text-xs text-ink-weaker">{layer.paint}</span>
	</div>
{/snippet}

{@render subheading('Basemap · Protomaps')}
<p class="mb-4 text-sm text-ink-weaker">
	One self-hosted PMTiles archive (<code class="font-mono text-xs">PUBLIC_BASEMAP_URL</code>), read
	with range requests. The layers are a fork of Protomaps’ WHITE flavor in
	<code class="font-mono text-xs">map-style/layers.js</code>, recolored by
	<code class="font-mono text-xs">map-style/theme.js</code>. Glyphs are served from
	<code class="font-mono text-xs">/fonts/maplibre/</code> in {fonts.regular}, {fonts.bold} and
	{fonts.italic}. There is no sprite: the few icons are rasterized at runtime. Labels inside the
	city are clipped to its boundary, and its own name is set in bold black.
</p>
<BasemapSpecimen {city} />

<h4 class="mt-8 mb-3 font-display text-xs font-bold tracking-wide text-ink-weaker uppercase">
	Label tiers
</h4>
<div class="overflow-x-auto rounded border border-border-weaker bg-paper-white">
	<table class="w-full text-left text-xs">
		<thead class="text-ink-alt-weaker">
			<tr>
				<th scope="col" class="px-4 py-2 font-semibold">Layer</th>
				<th scope="col" class="px-4 py-2 font-semibold">Matches</th>
				<th scope="col" class="px-4 py-2 font-semibold">Constant</th>
				<th scope="col" class="px-4 py-2 text-right font-semibold">From zoom</th>
			</tr>
		</thead>
		<tbody>
			{#each labelTiers as [layer, matches, constant, zoom] (layer)}
				<tr class="border-t border-border-weakest">
					<th scope="row" class="px-4 py-2 font-mono font-normal text-ink">{layer}</th>
					<td class="px-4 py-2 text-ink-weaker">{matches}</td>
					<td class="px-4 py-2 font-mono text-ink-weaker">{constant}</td>
					<td class="px-4 py-2 text-right text-ink tabular-nums">{zoom}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<h4 class="mt-8 mb-3 font-display text-xs font-bold tracking-wide text-ink-weaker uppercase">
	Palette
</h4>
<p class="mb-3 text-sm text-ink-weaker">
	Greys throughout, so no basemap color can be read as data. {overrideCount} keys depart from the Protomaps
	base and are marked; never bring brand green or the ramp into the basemap.
</p>
<div class="space-y-4">
	{#each paletteGroups as group (group.name)}
		<div>
			<div class="mb-2 text-2xs font-semibold tracking-wider text-ink-alt-weaker uppercase">
				{group.name}
			</div>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				{#each group.entries as entry (entry.key)}
					<div class="flex items-center gap-2">
						<div
							class="h-6 w-6 shrink-0 rounded-sm border border-border-weaker"
							style="background-color: {entry.value};"
						></div>
						<div class="min-w-0 font-mono text-2xs">
							<div class="truncate text-ink">{entry.key}</div>
							<div class="text-ink-weaker">
								{entry.value}
								{#if entry.overridden}<span class="font-sans font-semibold text-brand"
										>· override</span
									>{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
{@render source('map-style/theme.js · theme = { ...BASE_PALETTE, overrides }')}

{@render subheading('GeoJSON overlays')}
<p class="mb-4 text-sm text-ink-weaker">
	Drawn at true pixel width for zoom 12 on the basemap’s white ground. Lines have round caps and
	joins (<code class="font-mono text-xs">ROUND_LINE_LAYOUT</code>), and every width passes through
	<code class="font-mono text-xs">withZoomScale()</code>.
</p>

<div class="space-y-6">
	<div class="rounded border border-brand-subtle bg-paper-white p-6">
		<h4 class="mb-3 font-display text-lg font-bold text-ink">Zoom scale</h4>
		<p class="mb-4 text-sm text-ink-weaker">
			A {topWidth}px line, the default ramp’s widest, at four zooms. Thinner at the overview, much
			heavier at street level.
		</p>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each ZOOM_SAMPLES as { zoom, scale } (zoom)}
				<div>
					<LineSpecimen color={coreColors.ramp3} width={topWidth * scale} />
					<div class="mt-1 font-mono text-2xs text-ink-weaker tabular-nums">
						z{zoom} · ×{scale.toFixed(2)} · {(topWidth * scale).toFixed(1)}px
					</div>
				</div>
			{/each}
		</div>
		{@render source('render-config.js · ZOOM_SCALE_STOPS')}
	</div>

	<div class="rounded border border-brand-subtle bg-paper-white p-6">
		<h4 class="mb-3 font-display text-lg font-bold text-ink">Metric line, per tool</h4>
		<p class="mb-4 text-sm text-ink-weaker">
			Color and width both run up the ramp, placed at evenly spaced quantiles of the dataset’s
			metric, so the segment that matters most is the darkest and the widest.
		</p>
		<div class="space-y-4">
			{#each rampRows as row (row.name)}
				<div class="grid items-center gap-2 sm:grid-cols-4">
					<div class="text-sm">
						<div class="font-semibold text-ink">{row.name}</div>
						<div class="font-mono text-2xs text-ink-weaker">
							{row.ramp} · {row.widthRange[0]}–{row.widthRange[1]}px
						</div>
					</div>
					<div class="flex flex-wrap gap-x-2 gap-y-1 sm:col-span-3">
						{#each row.stops as stop, i (i)}
							<div>
								<LineSpecimen color={stop.color} width={stop.width} length={72} />
								<div class="font-mono text-2xs text-ink-weaker tabular-nums">
									{stop.color} · {stop.width.toFixed(2)}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		{@render source(
			'line-paint.js · computeRampStops(), makeLinePaint() · tools.json renderConfig'
		)}
	</div>

	<div class="rounded border border-brand-subtle bg-paper-white p-6">
		<h4 class="mb-3 font-display text-lg font-bold text-ink">Existing network</h4>
		<p class="mb-4 text-sm text-ink-weaker">
			Periwinkle, deliberately off the green ramp, and thinner than any proposed link, so it reads
			as context beneath the result.
		</p>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{#each existingSamples as s (s.label)}
				<div>
					<LineSpecimen color={s.color} width={s.width} opacity={s.opacity} />
					<div class="mt-1 text-xs text-ink">{s.label}</div>
					<div class="font-mono text-2xs text-ink-weaker">{s.spec}</div>
				</div>
			{/each}
		</div>
		{@render source(
			'render-config.js · EXISTING_NETWORK_LINE_WIDTH, EXISTING_NETWORK_*OPACITY, PLAN_UNDERLAY_*'
		)}
	</div>

	<div class="rounded border border-brand-subtle bg-paper-white p-6">
		<h4 class="mb-3 font-display text-lg font-bold text-ink">Hover &amp; selection</h4>
		<p class="mb-4 text-sm text-ink-weaker">
			A highlighted segment keeps its own ramp color, so pointing at it never costs the value. It is
			redrawn thicker over an ink casing, which separates even the palest stop from the basemap. A
			selection is the same treatment, a step wider. Shown at FixBikeNet’s widths.
		</p>
		<div class="grid grid-cols-3 gap-4">
			{#each ['Plain', 'Hovered', 'Selected'] as state (state)}
				<div class="text-xs text-ink-alt-weaker">{state}</div>
			{/each}
			{#each highlightSamples as sample (sample.color)}
				<LineSpecimen color={sample.color} width={sample.width} />
				<LineSpecimen color={sample.color} width={highlightWidth} {casing} />
				<LineSpecimen color={sample.color} width={selectionWidth} {casing} />
			{/each}
		</div>
		{@render source(
			`render-config.js · max(HIGHLIGHT_LINE_WIDTH, top × HIGHLIGHT_WIDTH_FACTOR) = ${highlightWidth.toFixed(1)}px, + SELECTION_WIDTH_STEP, casing ± HIGHLIGHT_OUTLINE_INSET`
		)}
	</div>

	<div class="rounded border border-brand-subtle bg-paper-white p-6">
		<h4 class="mb-3 font-display text-lg font-bold text-ink">Points</h4>
		<p class="mb-4 text-sm text-ink-weaker">
			Seeds are ink with a white ring, so they read over any line. Rail stations and schools are
			basemap-grey places, dots at the overview and icons from z{CONTEXT_ICON_MIN_ZOOM.rail} (rail) and
			z{CONTEXT_ICON_MIN_ZOOM.school} (schools). FixBikeNet draws each gap as a dot below z{DOT_LINE_CROSSFADE[0]}
			and crossfades to lines by z{DOT_LINE_CROSSFADE[1]}, numbering the top-ranked gaps.
		</p>
		<div class="flex flex-wrap items-end gap-8">
			<div>
				<svg width="72" height="24" aria-hidden="true" class="block">
					<line
						x1="6"
						x2="66"
						y1="12"
						y2="12"
						stroke={coreColors.ramp2}
						stroke-width={topWidth}
						stroke-linecap="round"
					/>
					<circle
						cx="36"
						cy="12"
						r={SEED_CIRCLE_RADIUS}
						fill={coreColors.ink}
						stroke={coreColors.paperWhite}
						stroke-width={SEED_CIRCLE_RADIUS / 3}
					/>
				</svg>
				<div class="mt-1 text-xs text-ink">Seed</div>
				<div class="font-mono text-2xs text-ink-weaker">r {SEED_CIRCLE_RADIUS}</div>
			</div>
			<div>
				<svg width="24" height="24" aria-hidden="true" class="block">
					<circle cx="12" cy="12" r={CONTEXT_DOT_RADIUS} fill={theme.address_label} />
				</svg>
				<div class="mt-1 text-xs text-ink">Place, overview</div>
				<div class="font-mono text-2xs text-ink-weaker">r {CONTEXT_DOT_RADIUS}</div>
			</div>
			{#each ['rail', 'school'] as kind (kind)}
				<div>
					<div class="flex h-6 items-center">
						<canvas {@attach drawIcon(kind)} aria-hidden="true"></canvas>
					</div>
					<div class="mt-1 text-xs text-ink">{kind === 'rail' ? 'Station' : 'School'}</div>
					<div class="font-mono text-2xs text-ink-weaker">from z{CONTEXT_ICON_MIN_ZOOM[kind]}</div>
				</div>
			{/each}
			{#each overviewDots as dot (dot.label)}
				<div>
					<svg width="24" height="24" aria-hidden="true" class="block">
						<circle
							cx="12"
							cy="12"
							r={dot.r}
							fill={dot.color}
							stroke={coreColors.paperWhite}
							stroke-width="1"
						/>
						{#if dot.rank}
							<text
								x="12"
								y="12"
								text-anchor="middle"
								dominant-baseline="central"
								font-size={DOT_RANK_TEXT_SIZE}
								font-weight="700"
								fill={coreColors.paperWhite}
								stroke={coreColors.ink}
								stroke-width="0.5"
								paint-order="stroke">{dot.rank}</text
							>
						{/if}
					</svg>
					<div class="mt-1 text-xs text-ink">FixBikeNet, {dot.label.toLowerCase()}</div>
					<div class="font-mono text-2xs text-ink-weaker">r {dot.r}</div>
				</div>
			{/each}
		</div>
		{@render source(
			'render-config.js · SEED_CIRCLE_RADIUS, CONTEXT_*, DOT_MARKER_RADIUS*, DOT_RANK_TEXT_SIZE · context-icons.js'
		)}
	</div>

	<div class="grid gap-6 sm:grid-cols-2">
		<div class="rounded border border-brand-subtle bg-paper-white p-6">
			<h4 class="mb-3 font-display text-lg font-bold text-ink">Superblocks</h4>
			<p class="mb-4 text-sm text-ink-weaker">
				Each block a translucent hashed category fill, its streets in the same color. Filtered-out
				blocks fall back to category-other. Hover outlines a block in ink, above the labels.
			</p>
			<svg viewBox="0 0 240 64" class="block w-full" aria-hidden="true">
				{#each categories as color, i (i)}
					<g transform="translate({i * 48 + 2} 2)">
						<rect
							width="44"
							height="44"
							rx="4"
							fill={color}
							fill-opacity={SUPERBLOCK_HULL_OPACITY}
							stroke={i === 0 ? coreColors.ink : 'none'}
							stroke-width={SUPERBLOCK_HOVER_WIDTH}
						/>
						<path
							d="M4 22 H40 M22 4 V40"
							stroke={color}
							stroke-opacity={SUPERBLOCK_EDGE_OPACITY}
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</g>
				{/each}
				<text x="2" y="60" font-size="8" fill={coreColors.inkWeaker}>hovered</text>
			</svg>
			{@render source(
				`SUPERBLOCK_HULL_OPACITY ${SUPERBLOCK_HULL_OPACITY} · _EDGE_OPACITY ${SUPERBLOCK_EDGE_OPACITY} · _BOUNDARY_WIDTH ${SUPERBLOCK_BOUNDARY_WIDTH} (density mode)`
			)}
		</div>

		<div class="rounded border border-brand-subtle bg-paper-white p-6">
			<h4 class="mb-3 font-display text-lg font-bold text-ink">City boundary</h4>
			<p class="mb-4 text-sm text-ink-weaker">
				A faint brand wash over everything outside the city, and a thin brand outline, both under
				every other overlay.
			</p>
			<svg viewBox="0 0 240 64" class="block w-full" aria-hidden="true">
				<path
					d="M0 0 H240 V64 H0 Z M70 10 L150 6 L182 30 L160 56 L84 58 L58 34 Z"
					fill={coreColors.brand}
					fill-opacity={BOUNDARY_MASK_OPACITY}
					fill-rule="evenodd"
				/>
				<path
					d="M70 10 L150 6 L182 30 L160 56 L84 58 L58 34 Z"
					fill="none"
					stroke={coreColors.brand}
					stroke-opacity={BOUNDARY_LINE_OPACITY}
					stroke-width={BOUNDARY_LINE_WIDTH}
					stroke-linejoin="round"
				/>
			</svg>
			{@render source(
				`MapHost · BOUNDARY_MASK_OPACITY ${BOUNDARY_MASK_OPACITY} · BOUNDARY_LINE ${BOUNDARY_LINE_WIDTH}px at ${BOUNDARY_LINE_OPACITY}`
			)}
		</div>
	</div>
</div>

{@render subheading('Live, per tool')}
<p class="mb-4 text-sm text-ink-weaker">
	The real <code class="font-mono text-xs">/embed</code> route for each tool, loaded as it scrolls into
	view. These need the basemap and the data host.
</p>
<div class="space-y-10">
	{#each embeds as embed (embed.path)}
		<EmbedSpecimen {...embed} />
	{/each}
</div>
