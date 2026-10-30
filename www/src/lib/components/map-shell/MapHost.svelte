<script>
	import { coreColors } from '$lib/colors.js';
	import { ROUND_LINE_LAYOUT } from '$lib/map-style/line-paint.js';
	import MapDebugOverlay from '$lib/components/map/MapDebugOverlay.svelte';
	import MapDownloadControl from '$lib/components/map/MapDownloadControl.svelte';
	import MapReportIssueControl from '$lib/components/map/MapReportIssueControl.svelte';
	import MapTableControl from '$lib/components/map/MapTableControl.svelte';
	import MapZoomControl from '$lib/components/map/MapZoomControl.svelte';
	import MapSettingsMenu from './MapSettingsMenu.svelte';
	import MapBottomSheet from './MapBottomSheet.svelte';
	import { compact } from '$lib/state/viewport.svelte.js';
	import { collapseAttribution } from '$lib/map-style/attribution.js';
	import { invertBoundary } from '$lib/map-style/boundary-mask.js';
	import { applyLabelClip } from '$lib/map-style/label-clip.js';
	import {
		BOUNDARY_LINE_OPACITY,
		BOUNDARY_LINE_WIDTH,
		BOUNDARY_MASK_OPACITY,
		COMPACT_FIT_PADDING,
		FIT_BOUNDS_OPTIONS,
		MAX_BOUNDS_PAD,
		MAX_ZOOM,
		MIN_ZOOM,
		RAIL_SPLIT_MAX_HEIGHT,
		RAIL_SPLIT_MIN_WIDTH
	} from '$lib/map-style/render-config.js';
	import {
		makeMapStyle,
		overlayBeforeId,
		setLabelVisibility,
		withAttributionExtra
	} from '$lib/map-style/style.js';
	import { padBounds } from '$lib/utils/bounds';
	import { untrack } from 'svelte';
	import { FillLayer, GeoJSONSource, LineLayer, MapLibre } from 'svelte-maplibre-gl';
	import { provideMapOverlay } from './mapOverlay.js';
	import { provideCameraFlight } from './cameraFlight.js';

	let {
		bounds = undefined,
		// Replaces `bounds` for the first fit only — the /embed `?bbox=` deeplink. `bounds` still sets
		// the camera envelope and the zoom floor, so the rest of the city stays one zoom-out away.
		/** @type {import('$lib/utils/bbox-param.js').Bbox | null} */
		initialBounds = null,
		// Simplified city polygon. Basemap place labels outside it are dropped — see `label-clip.js`.
		cityBoundary = null,
		// Washes a faint ink tint over everything outside the city to spotlight its shape.
		// On by default everywhere (interactive maps and capture routes); a route can pass false.
		showBoundary = true,
		// false hides every basemap symbol layer. Baked into the initial style; later changes go
		// through `setLabelVisibility`.
		showLabels = true,
		// When set, a basemap-label toggle joins the zoom buttons bottom-right. Gated on the callback
		// rather than a flag, so the export routes — which pass none — can never grow a control.
		onToggleLabels = undefined,
		// When true, a download control joins the bottom-right stack, offering PNG/SVG/GeoJSON exports
		// of the current view. Gated so only the interactive layout — which loads the network data the
		// exports read from `page.data` — grows it; capture routes never do.
		showDownload = false,
		// When true, a "View as table" control joins the stack beside the download, opening the
		// dialog the `(map)` layout mounts (see `mapTable.svelte.js`). Interactive layout only.
		showTable = false,
		showControls = true,
		// The basemap is OSM/ODbL via Protomaps, so attribution is required wherever the map is
		// published. Video exports turn it off; the credit belongs in the edit.
		showAttribution = true,
		// HTML appended to that credit, used by the interactive shell for the `/legal` link: the
		// full-screen map view has no sidebar and no footer, so the attribution control is the only
		// persistent chrome that can keep the privacy notice one click away. Exports pass nothing.
		attributionExtra = '',
		showDebug = true,
		// The pan/zoom envelope is an interaction affordance. A 16:9 export can need a viewport wider
		// than the padded envelope, which clamps the camera and mis-frames the shot; capture routes
		// turn it off.
		constrainCamera = true,
		fitPadding = FIT_BOUNDS_OPTIONS.padding,
		// Collapsed-handle label for the compact bottom sheet — the tool name.
		sheetTitle = '',
		// The canvas's accessible name, e.g. "GrowBikeNet results for Berlin". MapLibre names every
		// map "Map", which says nothing about which one a screen-reader user has landed on.
		mapTitle = 'Map',
		onidle = undefined,
		children
	} = $props();

	let map = $state();
	// The shared overlay layer: a positioned sibling of `<MapLibre>` that every layer set and the
	// control-panel stack portal their DOM into (see mapOverlay.js). Kept out of the map container
	// so our UI inherits the app font from `body`, not the vendor rules on `.maplibregl-map`.
	let overlayEl = $state();
	let overlayW = $state(0);
	let overlayH = $state(0);
	// The rail's three slots — see the markup below for the vertical budget they divide.
	let railControls = $state();
	let railReadouts = $state();
	let railPlayback = $state();
	/** @type {HTMLDivElement | undefined} */
	let railEl = $state();
	// The sheet's own portal targets, bound by MapBottomSheet below.
	let sheetBody = $state();
	let sheetDock = $state();

	// Capture routes (/screenshot, /animation) pass `showControls={false}` and have no sheet, so they
	// never go compact — /screenshot renders at 540 CSS px, inside the media query. /embed in a narrow
	// iframe gets the sheet, which is right.
	const isCompact = $derived(compact.current && showControls);

	const railZones = {
		// Info card, control panels, legend, top-spots — "information and settings". Into the sheet body.
		controls: () => (isCompact ? sheetBody : railControls),
		// The map's own readouts (HUD, legend, existing-network chip, size filter) follow the controls:
		// on a 360px screen a floating `w-72` readout column is the map.
		readouts: () => (isCompact ? sheetBody : railReadouts),
		// The playbar keeps a dock of its own in both layouts — it must stay operable while the sheet
		// is collapsed.
		playback: () => (isCompact ? sheetDock : railPlayback)
	};
	provideMapOverlay(
		() => overlayEl,
		() => ({ width: overlayW, height: overlayH }),
		(zone) => railZones[zone]?.()
	);
	const cameraFlight = provideCameraFlight();

	// The rail's scroll containers are `pointer-events-none` so the gaps between cards stay draggable
	// map — but that also makes the browser skip them when it hit-tests for something to scroll under
	// the wheel, leaving an overflowing column stuck. The event still *bubbles* out of the card the
	// reader is pointing at (bubbling is DOM-based, not hit-tested), so scroll the zone by hand.
	function scrollZone(event) {
		const zone = event.currentTarget;
		if (zone.scrollHeight <= zone.clientHeight) return;
		zone.scrollTop += event.deltaY;
		event.preventDefault();
	}

	// A wide but short map has room to spare beside the city and none above the playbar, so the rail
	// splits: the readouts and the playbar leave the column for the right edge, and the control
	// panels get the full height back. Read off the overlay box, which is sized by the map container
	// alone — the rail's own contents can never change it, so this cannot oscillate.
	const splitRail = $derived(overlayW >= RAIL_SPLIT_MIN_WIDTH && overlayH < RAIL_SPLIT_MAX_HEIGHT);

	const RAIL_BOTTOM_INSET = 24;
	const RAIL_SIDE_INSET = 16;
	const CARD_GAP = 8;
	const CTRL_RING = 1;

	// Where MapLibre's own bottom-right button stack ends, in px above the map's bottom edge. In the
	// split layout the playbar sits beside that stack, so it takes its baseline from it rather than
	// from a number of our own: the result depends on the font and on the credit's state, and lands
	// off our 4px spacing scale anyway. Starts at the rail's own inset, i.e. no offset until measured.
	let ctrlStackGap = $state(RAIL_BOTTOM_INSET);
	// How far the split rail's right column is inset from the rail box's right edge, so its cards end
	// one `CARD_GAP` short of the button stack. Measured for the same reason as the baseline, and
	// because the reserved scrollbar gutter the cards are inset by is 0px with overlay scrollbars and
	// ~15px with classic ones. Starts at the old `right-12`.
	let railRight = $state(48);
	// The readouts column's reserved scrollbar gutter, which the split playbar restates as padding.
	let railGutter = $state(0);
	// The compact counterpart: the playbar dock's bottom padding above the sheet.
	let dockPad = $state(CARD_GAP);
	// Measured, not assumed, so an empty slot contributes nothing — fixbikenet has readouts and no
	// playbar, and its chip should sit on the baseline rather than hover above a reserved gap.
	let playbackH = $state(0);

	// Both are offsets from the rail's own bottom edge, which already sits `RAIL_BOTTOM_INSET` up —
	// so negative when the stack ends lower than that, which is the case on the collapsed credit.
	const playbackBottom = $derived(ctrlStackGap - RAIL_BOTTOM_INSET);
	const readoutsBottom = $derived(playbackBottom + (playbackH ? playbackH + CARD_GAP : 0));

	function measureCtrlStack() {
		const container = map?.getContainer();
		if (!container) return;
		// Direct children only — our own controls (gear, download, labels) nest a
		// `maplibregl-ctrl-group` of their own that a descendant selector would find first. The credit
		// counts while it rests as its ⓘ button, which is then the bottom of the stack. Open, it is a
		// strip wider than the gap beside the rail, so the rail stays above it.
		const ctrls = [
			...container.querySelectorAll('.maplibregl-ctrl-bottom-right > .maplibregl-ctrl')
		]
			.filter(
				(el) =>
					!el.classList.contains('maplibregl-ctrl-attrib') ||
					!el.classList.contains('maplibregl-compact-show')
			)
			.map((el) => el.getBoundingClientRect());
		if (!ctrls.length) return;
		const box = container.getBoundingClientRect();
		const lowest = ctrls.reduce((a, b) => (b.bottom > a.bottom ? b : a));
		// The controls draw their outline as a ring outside their box, the cards as a border inside
		// theirs, so the edges to line up are the ring's: one `CTRL_RING` further out.
		ctrlStackGap = Math.round(box.bottom - lowest.bottom) - CTRL_RING;
		// Off the lowest control's left edge rather than the stack's leftmost: the report-issue pill
		// at the top widens on hover to show its label.
		railGutter = railReadouts ? railReadouts.offsetWidth - railReadouts.clientWidth : 0;
		railRight = Math.max(
			0,
			Math.round(box.right - lowest.left) + CTRL_RING + CARD_GAP - RAIL_SIDE_INSET - railGutter
		);
		// On compact the playbar docks on the sheet, beside the stack the sheet lifts (layout.css). The
		// dock's bottom edge is the sheet's top, open or closed; once the sheet has risen past the
		// stack there is nothing to line up with, and the dock keeps the card gap.
		if (sheetDock) {
			const pad = Math.round(sheetDock.getBoundingClientRect().bottom - lowest.bottom) - CTRL_RING;
			dockPad = Math.max(CARD_GAP, pad);
		}
	}

	// The controls mount with the map and the credit can re-wrap as the map resizes, so measure on
	// both: `idle` covers the mount, the overlay box covers every later resize.
	$effect(() => {
		if (!map) return;
		const m = map;
		measureCtrlStack();
		m.on('idle', measureCtrlStack);
		return () => m.off('idle', measureCtrlStack);
	});

	$effect(() => {
		void overlayW;
		void overlayH;
		measureCtrlStack();
		scheduleRailFit();
	});

	// A rail that would scroll with every panel description shown is "tight", and the panels then
	// tuck their descriptions behind an (i) as they do on compact. Measured with the class off and
	// set again in the same task, so the test never paints, and always against the full content, so
	// hiding the descriptions cannot flip the result back.
	let railFitFrame = 0;
	function scheduleRailFit() {
		cancelAnimationFrame(railFitFrame);
		railFitFrame = requestAnimationFrame(() => {
			if (!railEl) return;
			railEl.classList.remove('rail-tight');
			const overflows = [railControls, railReadouts].some(
				(el) => el && el.scrollHeight > el.clientHeight + 1
			);
			railEl.classList.toggle('rail-tight', overflows);
		});
	}
	$effect(() => {
		const zones = [railControls, railReadouts].filter(Boolean);
		if (!zones.length) return;
		const observer = new MutationObserver(scheduleRailFit);
		for (const zone of zones) {
			observer.observe(zone, { childList: true, subtree: true, characterData: true });
		}
		scheduleRailFit();
		return () => {
			observer.disconnect();
			cancelAnimationFrame(railFitFrame);
		};
	});

	// Gates every source and layer below. svelte-maplibre-gl 1.x queues an add made before the style
	// has loaded and replays the queue on `styledata` — but a queued add can fire `styledata` itself,
	// re-entering the replay from the top, so the first source is added twice ("Source … already
	// exists") and the throw abandons the rest of the queue. Only routes that hand the map its
	// boundary or data at creation reach that window (/embed, /screenshot); mounting nothing until the
	// style is in keeps the queue empty everywhere.
	let styleLoaded = $state(false);
	$effect(() => {
		if (!map) return;
		const m = map;
		if (m.isStyleLoaded()) {
			styleLoaded = true;
			return;
		}
		const onload = () => (styleLoaded = true);
		m.once('load', onload);
		return () => m.off('load', onload);
	});

	// Opening the sheet moves the dock without resizing the map or firing `idle`.
	$effect(() => {
		const sheet = sheetDock?.parentElement;
		if (!sheet) return;
		const observer = new ResizeObserver(() => measureCtrlStack());
		observer.observe(sheet);
		return () => observer.disconnect();
	});

	// The basemap credit rests as its ⓘ button and opens on click — see `collapseAttribution` for why
	// MapLibre needs telling. Gated on `showControls` rather than on a flag of its own, because that
	// prop already means "this map has interactive chrome", and it draws the line in the right place:
	// the tool pages and /embed collapse, while /screenshot and /animation keep the credit spelled
	// out. A button in a PNG or a video frame is a picture of an attribution, not an attribution —
	// and collapsing it there would invalidate every static export.
	//
	// One shot, deliberately: a reader who opens the credit keeps it open. `map` and `showControls`
	// are both stable for the life of an instance, so a city or tool switch never re-closes it.
	$effect(() => {
		if (!map || !showControls) return;
		const m = map;
		// The control is added inside the `Map` constructor and its default `customAttribution` is
		// non-empty, so it is already compact by now. `once` is insurance for the
		// `maplibregl-attrib-empty` path, where the pill appears only with the style.
		if (!collapseAttribution(m)) m.once('styledata', () => collapseAttribution(m));
		// The split rail sits on the ⓘ while the credit is closed and above the strip while it is
		// open, so re-measure on every toggle. `untrack`: the measurement reads the rail's bound
		// elements, and a re-run here would close a credit the reader had opened.
		untrack(measureCtrlStack);
		const credit = m.getContainer().querySelector('.maplibregl-ctrl-attrib');
		if (!credit) return;
		const observer = new MutationObserver(measureCtrlStack);
		observer.observe(credit, { attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	// `undefined` is stripped from the options svelte-maplibre-gl builds, so the credit falls back to
	// MapLibre's own default — which is already `{ compact: true, customAttribution: <MapLibre link> }`.
	// Passing an options object instead would *replace* that default wholesale and silently drop the
	// MapLibre credit, so the default is left alone and only its initial state is corrected, by the
	// effect above.
	const attributionControl = $derived(showAttribution ? undefined : false);

	// "Toggle attribution" names the mechanism, not the contents — and on the full-screen map view
	// that panel also carries the only link to /legal (see `attributionExtra`). Sets `title` and
	// `aria-label`; nothing rendered, so the capture routes look exactly as before.
	const locale = {
		'AttributionControl.ToggleAttribution': 'Map credits, sources and privacy',
		'Map.Title': untrack(() => mapTitle)
	};

	// MapLibre reads `locale` once, at construction, and the map instance outlives a city or tool
	// switch — so the name is kept current on the canvas itself.
	$effect(() => {
		map?.getCanvas().setAttribute('aria-label', mapTitle);
	});

	let isFirstFit = true;
	let prevBoundsKey = null;

	// Baked into the style rather than applied in an effect wherever the boundary is already in hand:
	// `/screenshot` captures on the map's first `idle`, which can fire before an effect has run, and
	// would bake unclipped labels into the static exports. The capture routes await it in `load`, and
	// the interactive ones seed it from the boundary cache, so this covers everything except a
	// cold-cache first load — which catches up through `applyLabelClip` below, as city changes do.
	const initialStyle = /** @type {import('maplibre-gl').StyleSpecification} */ (
		untrack(() =>
			withAttributionExtra(
				/** @type {import('maplibre-gl').StyleSpecification} */ (
					makeMapStyle({ cityBoundary, labels: showLabels })
				),
				attributionExtra
			)
		)
	);
	let clippedTo = untrack(() => cityBoundary);
	// Same reasoning: the first state is already in `initialStyle`, so this only tracks later
	// changes — the reader toggling labels off.
	let labelsShown = untrack(() => showLabels);

	// Keyed on the boundary object itself, and it must stay that way. On the interactive routes the
	// boundary is fetched in the browser, so `null → boundary` on first load is the normal path —
	// keying on anything the caller already knows synchronously (the city slug, say) matches on the
	// first run and swallows that transition, leaving the map unclipped and every city label grey.
	// Identity is precise enough on its own: `loadCityBoundary` caches per slug and `active-dataset`
	// refetches only when the city changes, so a same-city tool switch hands back the very same
	// object and this stays a no-op.
	$effect(() => {
		if (!map || cityBoundary === clippedTo) return;
		clippedTo = cityBoundary;
		applyLabelClip(map, cityBoundary);
	});

	$effect(() => {
		if (!map || showLabels === labelsShown) return;
		labelsShown = showLabels;
		setLabelVisibility(map, showLabels);
	});

	const maxBounds = $derived(
		constrainCamera && bounds ? padBounds(bounds, MAX_BOUNDS_PAD) : undefined
	);

	// The city polygon holds only the inside; invert it so a single fill can tint the outside.
	const boundaryMask = $derived(showBoundary ? invertBoundary(cityBoundary) : null);
	const boundaryMaskData = $derived(
		boundaryMask
			? /** @type {import('geojson').FeatureCollection} */ ({
					type: 'FeatureCollection',
					features: [boundaryMask]
				})
			: null
	);

	// Per-side padding, clamped to the live container. `fitPadding` may be a scalar or a
	// `{ top, right, bottom, left }` object (the interactive view reserves a wide `left` gutter for
	// the panel column). A fixed gutter can exceed a narrow viewport, which mis-frames or throws in
	// MapLibre, so cap each opposing pair at 90% of the container and shrink the larger side first.
	function clampPadding(pad, width, height) {
		const p =
			typeof pad === 'number'
				? { top: pad, right: pad, bottom: pad, left: pad }
				: { top: 0, right: 0, bottom: 0, left: 0, ...pad };
		const fit = (a, b, extent) => {
			const max = extent * 0.9;
			if (a + b <= max) return [a, b];
			// Shrink the larger side first so the smaller (fixed 40px) margin survives.
			const over = a + b - max;
			return a >= b ? [Math.max(0, a - over), b] : [a, Math.max(0, b - over)];
		};
		const [left, right] = fit(p.left, p.right, width);
		const [top, bottom] = fit(p.top, p.bottom, height);
		return { top, right, bottom, left };
	}

	// On compact there is no left gutter — the panels moved into the bottom sheet — but there is a
	// bottom one (playback dock + sheet handle). Known limit: the fit effect below keys off
	// `prevBoundsKey` (the city), so flipping compact does not re-fit; matches today's behaviour on
	// plain resize.
	const effectiveFitPadding = $derived(isCompact ? COMPACT_FIT_PADDING : fitPadding);

	// Fit only when the city (bounds value) actually changes: a same-city tool switch keeps the
	// key, so the shared instance stays put while the data overlay swaps beneath it.
	$effect(() => {
		if (!map || !bounds) return;
		const key = `${bounds[0][0]},${bounds[0][1]},${bounds[1][0]},${bounds[1][1]}`;
		if (key === prevBoundsKey) return;
		prevBoundsKey = key;

		// One framing for both camera calls: `cameraForBounds` derives the min-zoom floor, so it has
		// to see the same padding the map is actually fitted with.
		const container = map.getContainer();
		const padding = clampPadding(
			effectiveFitPadding,
			container.clientWidth,
			container.clientHeight
		);
		const opts = { ...FIT_BOUNDS_OPTIONS, padding };

		const wasFirstFit = isFirstFit;
		// The first fit jumps (no `animate`), so there's nothing to wait for. Every later one is a
		// real city switch — flag it before calling `fitBounds` so layer sets can never observe a
		// flight that has already started but isn't flagged yet.
		if (!wasFirstFit) cameraFlight.start(map);
		const target = wasFirstFit && initialBounds ? initialBounds : bounds;
		map.fitBounds(target, { ...opts, animate: !wasFirstFit });
		isFirstFit = false;

		// Let users zoom out until the whole city fits (e.g. elongated cities like Brussels), but
		// never tighter than the global floor.
		const cam = map.cameraForBounds(bounds, opts);
		if (cam) map.setMinZoom(Math.max(3, Math.min(MIN_ZOOM, cam.zoom - 1)));

		// Capture what the fit actually settles at, for the reset-view button below. Not
		// `cameraForBounds`'s own return value: that calculation doesn't know about `maxBounds`, and
		// `fitBounds`'s internal `constrain()` step can pull the real resting camera away from it —
		// observed with the panel-gutter's asymmetric left padding, whose "ideal" offset can fall
		// outside the padded `maxBounds` envelope. Synchronous for the unanimated first fit; queued
		// for a later city switch, which flies there instead of jumping.
		if (wasFirstFit) captureDefaultCamera();
		else cameraFlight.onSettled(captureDefaultCamera);
	});

	// The actual settled camera after the most recent fit — what the reset-view button flies back
	// to, and what its disabled state compares the live camera against.
	/** @type {{ center: [number, number], zoom: number } | null} */
	let defaultCamera = $state(null);

	function captureDefaultCamera() {
		if (!map) return;
		const c = map.getCenter();
		defaultCamera = { center: [c.lng, c.lat], zoom: map.getZoom() };
	}

	function resetView() {
		if (!map || !defaultCamera) return;
		cameraFlight.start(map);
		// `fitBounds` resets bearing to 0 by construction, but never touches pitch — pass both
		// explicitly so a reader who rotated or tilted the map (ctrl-drag, two-finger touch) gets
		// back to a level view, not just a re-centered one.
		map.flyTo({
			center: defaultCamera.center,
			zoom: defaultCamera.zoom,
			bearing: 0,
			pitch: 0,
			speed: FIT_BOUNDS_OPTIONS.speed
		});
	}

	// Bumped on every camera change so `isAtDefaultView` re-evaluates — mirrors the `move`/`resize`
	// listener pair in `tooltipAnchor.svelte.js`'s `cameraAnchor`.
	let cameraTick = $state(0);
	$effect(() => {
		if (!map) return;
		const m = map;
		const bump = () => cameraTick++;
		m.on('move', bump);
		m.on('resize', bump);
		return () => {
			m.off('move', bump);
			m.off('resize', bump);
		};
	});

	const EPS_LNGLAT = 1e-4;
	const EPS_ZOOM = 0.01;
	const EPS_ANGLE = 0.5;
	const isAtDefaultView = $derived.by(() => {
		void cameraTick;
		if (!map || !defaultCamera) return true;
		const c = map.getCenter();
		return (
			Math.abs(c.lng - defaultCamera.center[0]) < EPS_LNGLAT &&
			Math.abs(c.lat - defaultCamera.center[1]) < EPS_LNGLAT &&
			Math.abs(map.getZoom() - defaultCamera.zoom) < EPS_ZOOM &&
			Math.abs(map.getBearing()) < EPS_ANGLE &&
			Math.abs(map.getPitch()) < EPS_ANGLE
		);
	});
</script>

<div class="@container relative h-full w-full {showControls ? 'map-has-sheet' : ''}">
	<!-- First in the DOM, though it paints on top (`z-10`): tab and reading order follow the DOM,
	     and the panels — the tool heading, its controls, the readouts, the playbar — are what a
	     keyboard or screen-reader user needs before the canvas and its corner controls. -->
	<!-- Every layer set and the control-panel stack portals its DOM in here — a sibling of the map,
	     so it never inherits `.maplibregl-map`'s vendor styles. `pointer-events-none`; each card
	     re-enables its own. -->
	<div
		bind:this={overlayEl}
		bind:clientWidth={overlayW}
		bind:clientHeight={overlayH}
		class="pointer-events-none absolute inset-0 z-10 overflow-clip"
	>
		<!-- The rail. Both left-hand stacks — the page's control panels and the map's own readouts —
		     used to be independently positioned boxes that could only be kept apart by measuring one
		     and offsetting the other; on a short map they met anyway. Here one flex column divides
		     the height between them, and the flex algorithm decides who yields:

		       roomy   → controls take what is left over and scroll; readouts keep their height
		       tight   → controls stop at `min-h-32` and scroll; readouts shrink and scroll
		       always  → the playbar is `shrink-0`, so it is never covered nor scrolled away

		     When the map is wide and short (`splitRail`) the readouts and the playbar go `absolute`
		     instead: they leave the flex flow for the right edge, handing the whole height back to
		     the control panels. The box spans the full width so those two can reach that edge, which
		     costs nothing — the zones carry their own `w-72`, so the single-column layout is
		     unchanged. The right column ends one card gap short of the map's own bottom-right controls
		     and shares their baseline: the collapsed credit's, or the stack's above the open strip.

		     The slots are portal targets, so they must exist even while empty — `empty:` keeps an
		     unused one from reserving space (`/embed` renders readouts with no control panels above
		     them). Only portalled elements ever land inside; `{#if}` anchors stay in the layer set.

		     Hidden wholesale on compact rather than relying on every zone being empty (`empty:hidden`
		     only handles the *unused* slot case) — below `md` the sheet owns these panels instead. -->
		<div
			bind:this={railEl}
			role="region"
			aria-label="Map panels"
			class="pointer-events-none absolute inset-x-4 top-4 bottom-6 hidden flex-col gap-2 md:flex"
		>
			<div
				bind:this={railControls}
				onwheel={scrollZone}
				class="min-h-32 w-72 flex-1 [scrollbar-gutter:stable] overflow-y-auto empty:min-h-0"
			></div>
			<!-- Every slot is one `w-72` column wide in both layouts, and the cards inside size
			     themselves off it (`w-full` wrappers) or shrink-wrap and hug the edge (`items-end`,
			     for the narrower chips). That is what keeps one right edge down the whole rail: a
			     wrapper with a width of its own would ignore the reserved scrollbar gutter and hang
			     a scrollbar's width proud of the cards above it.
			     `justify-end-safe` keeps the readouts sitting just above the playbar, the way they
			     read in the single column — the *safe* variant falls back to top-alignment once they
			     outgrow the space, which a plain `justify-end` would push past the scroll container's
			     top edge and out of reach. -->
			<!-- The numbers the map shows, as text: the closest thing the page has to a non-visual
			     version of the map. A landmark, so a screen-reader user can jump straight to it. -->
			<div
				bind:this={railReadouts}
				role="region"
				aria-label="Current values"
				onwheel={scrollZone}
				style:bottom={splitRail ? `${readoutsBottom}px` : null}
				style:right={splitRail ? `${railRight}px` : null}
				class="flex [scrollbar-gutter:stable] flex-col overflow-y-auto empty:hidden {splitRail
					? 'absolute top-0 w-72 items-end justify-end-safe'
					: 'min-h-0 w-72 shrink'}"
			></div>
			<!-- Reserves the same scrollbar gutter as the two columns above even though it never
			     scrolls: that gutter is what the cards are inset by, so without it the playbar would
			     hang a scrollbar's width further out than every card above it. Sharing the property
			     keeps the edges together whether the platform draws classic scrollbars (a real
			     gutter) or overlay ones (no gutter at all).
			     Except in the split layout, where it reserves the measured gutter as padding instead.
			     A scroll container clips its children's shadows, and there the playbar sits on the
			     same baseline as the map's ⓘ button: with its shadow cut off, the card read as a pixel
			     higher than the button whose shadow was not. -->
			<div
				bind:this={railPlayback}
				bind:clientHeight={playbackH}
				style:bottom={splitRail ? `${playbackBottom}px` : null}
				style:right={splitRail ? `${railRight}px` : null}
				style:padding-right={splitRail ? `${railGutter}px` : null}
				class="flex flex-col empty:hidden {splitRail
					? 'absolute w-72 items-end'
					: 'w-72 shrink-0 [scrollbar-gutter:stable] overflow-y-auto'}"
			></div>
		</div>

		{#if showControls}
			<MapBottomSheet bind:body={sheetBody} bind:dock={sheetDock} {dockPad} title={sheetTitle} />
		{/if}

		<!-- Dev server only. Gated here rather than inside the overlay, whose listeners would otherwise
		     run a feature query and a console.log on every mousemove of a production map. The panel
		     itself starts hidden; `d` toggles it. `window.__map` is set regardless. -->
		{#if showDebug && import.meta.env.DEV}
			<MapDebugOverlay {map} />
		{/if}
	</div>

	<MapLibre
		class="absolute inset-0 h-full w-full"
		autoloadGlobalCss={false}
		style={initialStyle}
		center={[0, 51]}
		zoom={5}
		minZoom={MIN_ZOOM}
		maxZoom={MAX_ZOOM}
		{attributionControl}
		{locale}
		canvasContextAttributes={{ preserveDrawingBuffer: true }}
		{maxBounds}
		bind:map
		{onidle}
	>
		<!-- Bottom-right, above the credits: MapLibre prepends controls in bottom corners, so the zoom
		     group stacks on top of the attribution the map added when it was constructed, and each
		     control added after it stacks on top of the one before. Order is load-bearing.

		     The data sources/layers a layer set declares also render here (they resolve the map through
		     `getMapContext()`); only its visible overlay DOM is portalled out to `overlayEl` below. -->
		<!-- City boundary: a faint ink wash over everything outside it, spotlighting the shape. Sits
		     under labels (`overlayBeforeId`) so place names stay legible; data overlays draw on top. -->
		{#if styleLoaded && showBoundary && boundaryMaskData}
			<GeoJSONSource id="city-boundary-mask" data={boundaryMaskData}>
				<FillLayer
					id="city-boundary-mask-fill"
					beforeId={overlayBeforeId()}
					paint={{ 'fill-color': coreColors.brand, 'fill-opacity': BOUNDARY_MASK_OPACITY }}
				/>
				<LineLayer
					id="city-boundary-line"
					layout={ROUND_LINE_LAYOUT}
					beforeId={overlayBeforeId()}
					paint={{
						'line-color': coreColors.brand,
						'line-opacity': BOUNDARY_LINE_OPACITY,
						'line-width': BOUNDARY_LINE_WIDTH
					}}
				/>
			</GeoJSONSource>
		{/if}

		{#if showControls}
			<!-- Bottom corners prepend, so the stack reads bottom-up from here: zoom, report, table,
			     download, settings. -->
			<MapZoomControl homeDisabled={isAtDefaultView} onhome={resetView} />
			<MapReportIssueControl />
			{#if showTable}
				<MapTableControl />
			{/if}
			{#if showDownload}
				<MapDownloadControl />
			{/if}
			<!-- Map labels, plus whatever expert controls the tool page has registered. -->
			<MapSettingsMenu {showLabels} {onToggleLabels} />
		{/if}

		{#if styleLoaded}
			{@render children?.()}
		{/if}
	</MapLibre>
</div>
