<script>
	import { tick } from 'svelte';
	import { CustomControl, getMapContext } from 'svelte-maplibre-gl';
	import { Popover } from 'bits-ui';
	import Download from '@lucide/svelte/icons/download';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { compact } from '$lib/state/viewport.svelte.js';
	import { formatBbox } from '$lib/utils/bbox-param.js';
	import { activeDataset } from '$lib/data/active-dataset.svelte.js';
	import { downloadBlob } from '$lib/design/download.js';
	import { exportFilename, networkSvgPropsFromData } from '$lib/export/network-svg-props.js';
	import {
		COMPACT_FIT_PADDING,
		EXPORT_NETWORK_MARGIN,
		EXPORT_PIXEL_RATIO,
		FIT_BOUNDS_OPTIONS,
		PANEL_FIT_PADDING
	} from '$lib/map-style/render-config.js';
	import NetworkSvg from '$lib/components/NetworkSvg.svelte';
	import { announce } from '$lib/state/announce.svelte.js';

	const mapCtx = getMapContext();
	const map = $derived(mapCtx.map);
	const ds = activeDataset();
	// The route-level values (bounds, toolSlug) still come from `page.data`.
	const data = $derived(page.data);
	// What the exports serialise. The network no longer travels in `page.data` — it is fetched in
	// the browser and held by the `(map)` layout (see $lib/data/active-dataset.svelte.js) — and the
	// parameters come from `ds.key`, the ones the painted layers actually belong to, so a metric
	// switch in flight can never write one metric's network out under another's filename.
	// `ds.key.variant` is always a string — `'default'` for the three tools with no variant axis —
	// whereas `page.data.variant` is undefined for them, and `exportFilename` drops undefined
	// segments. Spreading the key wholesale would therefore suffix their downloads `-default`.
	// Take the axes from the key, but let growbikenet alone contribute a variant.
	const exportData = $derived({
		...page.data,
		...ds,
		...(ds.key
			? {
					city: ds.key.city,
					metric: ds.key.metric,
					type: ds.key.type,
					variant: ds.key.tool === 'growbikenet' ? ds.key.variant : undefined
				}
			: {})
	});
	// Only the vector/data exports need the loaded network; the raster export is just the basemap.
	const hasData = $derived(!!ds.geojson);

	let open = $state(false);
	// Non-null only while an SVG is being serialised: mounts a hidden NetworkSvg long enough to read
	// its markup, then tears it back down so the projection work isn't redone on every view change.
	/** @type {ReturnType<typeof networkSvgPropsFromData> | null} */
	let svgProps = $state(null);
	/** @type {HTMLDivElement | undefined} */
	let svgHost = $state();
	// True while the PNG is being rendered: drives the masking overlay that hides the reframe/re-render.
	let exporting = $state(false);

	// The panel column covers the map's left edge on the tool pages. Capped at 90% of the width so a
	// fixed 320px gutter can't wipe out a narrow map.
	const panelGutter = (width) => Math.min(PANEL_FIT_PADDING.left, width * 0.9);

	// The part of the map the reader can actually see — minus the panel column, or on compact the
	// bottom sheet. The embed has neither, so this is the box it should open on.
	function visibleBounds(m) {
		const { clientWidth: w, clientHeight: h } = m.getContainer();
		const left = compact.current ? 0 : panelGutter(w);
		const bottom = compact.current ? Math.min(COMPACT_FIT_PADDING.bottom, h * 0.9) : 0;
		const sw = m.unproject([left, h - bottom]);
		const ne = m.unproject([w, 0]);
		return /** @type {import('$lib/utils/bbox-param.js').Bbox} */ ([
			[sw.lng, sw.lat],
			[ne.lng, ne.lat]
		]);
	}

	// Read from `ds.key`, like `exportData`, so the link names the layers actually painted.
	const embedRoute = $derived(
		ds.key
			? resolve('/embed/[tool]/[city]/[[metric]]/[[type]]/[[variant]]', {
					tool: ds.key.tool,
					city: ds.key.city,
					metric: ds.key.metric,
					type: ds.key.type,
					variant: ds.key.tool === 'growbikenet' ? ds.key.variant : undefined
				})
			: undefined
	);
	// The camera isn't reactive state, so the box is read on render and again on click: the
	// popover can stay open while the map moves.
	const embedHref = () =>
		embedRoute && map && `${embedRoute}?bbox=${formatBbox(visibleBounds(map))}`;

	// Copy a sub-rectangle (in buffer pixels) of the fully-rendered WebGL canvas onto a 2D canvas and
	// return it as a PNG blob. Used to trim the panel gutter / letterbox out of the raw capture.
	function cropToBlob(canvas, sx, sy, sw, sh) {
		const out = document.createElement('canvas');
		out.width = Math.max(1, Math.round(sw));
		out.height = Math.max(1, Math.round(sh));
		out.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
		return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
	}

	// Two PNG variants, both rendered at a fixed high pixel ratio (screen-independent) then cropped:
	//   'view'    — the user's current camera, minus the left panel-column gutter.
	//   'network' — the whole city re-fitted, cropped tight to the city bounding box so the image
	//               aspect matches the city rather than the viewport (no letterboxing).
	// The live view + pixel ratio are restored afterwards, masked by an overlay so the jump isn't seen.
	async function exportPng(mode) {
		open = false;
		const m = map;
		if (!m || exporting) return;

		// `getPixelRatio()` resolves to `devicePixelRatio` when no override is set, so restoring that
		// resolved number would pin a permanent override that stops the map following the display.
		// Track whether a real override existed and otherwise clear it back to auto-follow.
		const prevRatio = m.getPixelRatio();
		const hadRatioOverride = prevRatio !== window.devicePixelRatio;
		const prevCenter = m.getCenter();
		const prevZoom = m.getZoom();
		const prevBearing = m.getBearing();
		const prevPitch = m.getPitch();
		const bounds = data.bounds;
		const framing = mode === 'network' ? bounds : null;

		exporting = true;
		announce('Preparing image…');
		try {
			m.setPixelRatio(EXPORT_PIXEL_RATIO);
			if (framing) m.fitBounds(framing, { padding: FIT_BOUNDS_OPTIONS.padding, animate: false });
			// Wait for the camera and tiles to settle at the new ratio/framing before reading pixels.
			await m.once('idle');

			const canvas = m.getCanvas();
			const ratio = canvas.width / canvas.clientWidth; // buffer px per CSS px

			let sx, sy, sw, sh;
			if (framing) {
				// Project the bbox corners (CSS px) and crop to them, plus a small uniform margin.
				const a = m.project(bounds[0]);
				const b = m.project(bounds[1]);
				const margin = Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * EXPORT_NETWORK_MARGIN;
				const x0 = Math.max(0, Math.min(a.x, b.x) - margin);
				const y0 = Math.max(0, Math.min(a.y, b.y) - margin);
				const x1 = Math.min(canvas.clientWidth, Math.max(a.x, b.x) + margin);
				const y1 = Math.min(canvas.clientHeight, Math.max(a.y, b.y) + margin);
				sx = x0 * ratio;
				sy = y0 * ratio;
				sw = (x1 - x0) * ratio;
				sh = (y1 - y0) * ratio;
			} else {
				const gutter = panelGutter(canvas.clientWidth);
				sx = gutter * ratio;
				sy = 0;
				sw = canvas.width - sx;
				sh = canvas.height;
			}

			const blob = await cropToBlob(canvas, sx, sy, sw, sh);
			if (blob) {
				downloadBlob(blob, exportFilename(exportData, 'png', mode));
				announce('Image downloaded.');
			}
		} finally {
			// Passing `undefined` clears the override so the map follows the display again; restoring a
			// number (even the current dpr) would pin it permanently.
			// Passing `undefined` clears the override at runtime, but the typings require a number.
			m.setPixelRatio(/** @type {number} */ (hadRatioOverride ? prevRatio : undefined));
			m.jumpTo({ center: prevCenter, zoom: prevZoom, bearing: prevBearing, pitch: prevPitch });
			exporting = false;
		}
	}

	async function downloadSvg() {
		open = false;
		svgProps = networkSvgPropsFromData(exportData);
		// Let the hidden NetworkSvg render before reading its serialised markup.
		await tick();
		const svg = svgHost?.querySelector('#network-export');
		if (svg) {
			downloadBlob(
				new Blob([svg.outerHTML], { type: 'image/svg+xml' }),
				exportFilename(exportData, 'svg')
			);
		}
		svgProps = null;
	}

	function downloadGeojson() {
		open = false;
		downloadBlob(
			new Blob([JSON.stringify(ds.geojson)], { type: 'application/geo+json' }),
			exportFilename(exportData, 'geojson')
		);
	}
</script>

<CustomControl position="bottom-right">
	<Popover.Root bind:open>
		<Popover.Trigger class="map-ctrl-toggle" aria-label="Export this map" title="Export this map">
			<Download class="h-4 w-4" aria-hidden="true" />
		</Popover.Trigger>
		<!-- Portalled to `body` so it escapes `.maplibregl-ctrl-group`, whose unlayered vendor rule
		     (`button { padding:0; width:29px }`) would otherwise clobber the menu items. -->
		<Popover.Portal>
			<Popover.Content
				side="top"
				align="end"
				sideOffset={6}
				class="z-50 min-w-44 rounded-md border border-border-weaker bg-white p-1 text-left shadow-md"
			>
				<button
					type="button"
					onclick={() => exportPng('view')}
					class="flex w-full items-center gap-3 rounded px-3 py-1.5 text-sm whitespace-nowrap text-ink transition-colors hover:bg-brand-subtle hover:text-brand"
				>
					Current view (PNG)
				</button>
				<button
					type="button"
					onclick={() => exportPng('network')}
					class="flex w-full items-center gap-3 rounded px-3 py-1.5 text-sm whitespace-nowrap text-ink transition-colors hover:bg-brand-subtle hover:text-brand"
				>
					Full network (PNG)
				</button>
				<button
					type="button"
					onclick={downloadSvg}
					disabled={!hasData}
					class="flex w-full items-center gap-3 rounded px-3 py-1.5 text-sm whitespace-nowrap text-ink transition-colors hover:bg-brand-subtle hover:text-brand disabled:pointer-events-none disabled:opacity-40"
				>
					Network (SVG)
				</button>
				<button
					type="button"
					onclick={downloadGeojson}
					disabled={!hasData}
					class="flex w-full items-center gap-3 rounded px-3 py-1.5 text-sm whitespace-nowrap text-ink transition-colors hover:bg-brand-subtle hover:text-brand disabled:pointer-events-none disabled:opacity-40"
				>
					Data (GeoJSON)
				</button>
				<div class="my-1 border-t border-border-weaker" role="separator"></div>
				<a
					href={embedHref() || undefined}
					target="_blank"
					rel="noopener"
					onclick={(e) => {
						e.currentTarget.href = embedHref() || e.currentTarget.href;
						open = false;
					}}
					aria-disabled={!embedRoute}
					class="relative flex w-full items-center gap-3 rounded px-3 py-1.5 text-sm whitespace-nowrap text-ink no-underline transition-colors hover:bg-brand-subtle hover:text-brand aria-disabled:pointer-events-none aria-disabled:opacity-40"
				>
					Embed this view
					<ExternalLink class="ml-auto h-4 w-4" aria-hidden="true" />
					<span class="sr-only"> (opens in new tab)</span></a
				>
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
</CustomControl>

{#if exporting}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-paper/70 backdrop-blur-sm"
		aria-hidden="true"
	>
		<span class="rounded-md bg-paper-white px-4 py-2 text-sm text-ink shadow-md">
			Preparing image…
		</span>
	</div>
{/if}

<!-- display:none (not sr-only): NetworkSvg builds its path coordinates in JS, so it serialises
     without layout, and an absolute sr-only element without a relative ancestor would escape the
     app shell's overflow and scroll the page. -->
{#if svgProps}
	<div bind:this={svgHost} style="display:none" aria-hidden="true">
		<NetworkSvg {...svgProps} />
	</div>
{/if}
