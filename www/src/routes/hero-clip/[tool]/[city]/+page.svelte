<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import AmbientMapPane from '$lib/components/landing/AmbientMapPane.svelte';
	import AmbientHud from '$lib/components/landing/AmbientHud.svelte';
	import { makePaneState } from '$lib/components/landing/pane-state.js';
	import { BASEMAP_SOURCE_ID } from '$lib/map-style/style.js';
	import { heroAdapterFor } from '$lib/components/landing/hero-tools.js';
	import { cityBySlug } from '$lib/data/cities';
	import { DEFAULT_PHASES, frameAt, frameCount, phaseBounds } from '$lib/hero-clip/timeline.js';
	import { dataFocus } from '$lib/hero-clip/framing.js';

	// Capture page for scripts/generate-hero-clips.mjs: the landing hero's map pane on its own —
	// no logo, headline, overlay, HUD or credit — stepped frame by frame on the clip timeline.
	// The page↔script contract (`window.__clip`, the ready/error flags) is $lib/hero-clip/bridge.js.
	// The basemap's OSM credit is not in the frame, so it is owed in the edit or the caption.

	const params = page.url.searchParams;
	const num = (key, fallback) => {
		const v = Number(params.get(key));
		return params.has(key) && Number.isFinite(v) ? v : fallback;
	};

	const combo = {
		tool: page.params.tool ?? '',
		city: page.params.city ?? '',
		metric: params.get('metric') ?? '',
		type: params.get('type') ?? '',
		variant: params.get('variant') ?? 'default'
	};
	const width = num('width', 1920);
	const height = num('height', 1080);
	const fps = num('fps', 60);
	const startBearing = num('bearing', 0);
	const padding = num('padding', 40);
	const orbitSpeed = num('orbit', undefined);
	const transparent = params.get('transparent') === '1';
	const weight = num('weight', 1);
	// A tighter frame for social video: `zoom` stops past the fit, centered on `focus` — `data`
	// (the revealed layer's median vertex) or `lon,lat`. Anything outside the frame is let go.
	const zoomOffset = num('zoom', 0);
	const focusParam = params.get('focus');
	// The landing hero's telemetry HUD, for stills. Its line reveals run on CSS animations, which
	// `seek` settles into their end state so a screenshot never catches one halfway.
	const hud = params.get('hud') === '1';
	const phases = {
		fadeIn: num('fadeIn', DEFAULT_PHASES.fadeIn),
		build: num('build', DEFAULT_PHASES.build),
		hold: num('hold', DEFAULT_PHASES.hold),
		teardown: num('teardown', DEFAULT_PHASES.teardown),
		fadeOut: num('fadeOut', DEFAULT_PHASES.fadeOut)
	};

	let pane = $state();
	let paneState = $state(makePaneState());
	let opacity = $state(0);
	/** @type {{ phase: string, frame: number, bearing: number, zoom: number, center: [number, number] } | null} */
	let hudState = $state(null);

	async function settleAnimations() {
		await document.fonts.ready;
		for (const a of document.getAnimations()) {
			// The cursor blinks forever; hold it on its visible half. Everything else ends.
			if (a.effect?.getComputedTiming().endTime === Infinity) {
				a.pause();
				a.currentTime = 0;
			} else a.finish();
		}
	}

	/** Resolves on the next `idle`, or after `ms` — a frame that changes nothing never fires one. */
	function idleOrTimeout(map, ms) {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				map.off('idle', done);
				resolve(false);
			}, ms);
			function done() {
				clearTimeout(timer);
				resolve(true);
			}
			map.once('idle', done);
		});
	}

	function fail(message) {
		document.body.dataset.clipError = message;
	}

	function init() {
		start().catch((err) => fail(err instanceof Error ? err.message : String(err)));
	}

	async function start() {
		const map = pane?.getMap();
		if (!map) return fail('map did not initialize');
		const prepared = await pane.prepareCombo(combo, {
			paintTimeoutMs: 60_000,
			holdCameraDuringEntry: true,
			startBearing,
			padding
		});
		const current = paneState.current;
		if (!prepared || !current) return fail(`${combo.tool}/${combo.city}: combo did not load`);

		const base = { bearing: paneState.bearing, zoom: paneState.baseZoom + zoomOffset };
		const total = current.total;

		/** @type {[number, number] | null} */
		let focus = null;
		if (focusParam === 'data') focus = dataFocus(current.geojson ?? current.hulls);
		else if (focusParam) {
			const [lon, lat] = focusParam.split(',').map(Number);
			if (Number.isFinite(lon) && Number.isFinite(lat)) focus = [lon, lat];
			else return fail(`focus "${focusParam}" is neither "data" nor "lon,lat"`);
		}
		if (focus) map.jumpTo({ center: focus });

		// Warm the tile cache at the opening camera, so frame 0 does not wait on a cold basemap.
		const first = frameAt(0, { fps, total, phases, orbitSpeed });
		map.jumpTo({ bearing: base.bearing + first.bearing, zoom: base.zoom + first.zoom });
		map.triggerRepaint();
		await idleOrTimeout(map, 60_000);

		const adapter = heroAdapterFor(combo.tool);
		const city = cityBySlug[combo.city];
		/** @type {import('$lib/hero-clip/bridge.js').HeroClipBridge} */
		const bridge = {
			frames: () => frameCount(fps, phases),
			meta: () => ({
				combo,
				cityName: city?.name ?? combo.city,
				country: city?.country ?? '',
				toolLabel: adapter?.label ?? combo.tool,
				metricLabel: adapter ? adapter.metricLabel(combo) : combo.metric,
				mode: current.mode,
				steps: total,
				baselineLength: current.baselineLength,
				totalLength: current.cumulativeLengths?.at(-1) ?? null,
				camera: {
					center: focus ?? paneState.center,
					zoom: base.zoom,
					bearing: base.bearing,
					pitch: map.getPitch()
				},
				phases: phaseBounds(phases),
				basemapLoaded: transparent
					? null
					: Boolean(map.getSource(BASEMAP_SOURCE_ID) && map.isSourceLoaded(BASEMAP_SOURCE_ID)),
				zoomOffset,
				focus
			}),
			seek: async (i) => {
				const f = frameAt(i, { fps, total, phases, orbitSpeed });
				paneState.frame = f.reveal;
				opacity = f.opacity;
				await tick();
				map.jumpTo({ bearing: base.bearing + f.bearing, zoom: base.zoom + f.zoom });
				map.triggerRepaint();
				const idle = await idleOrTimeout(map, 15_000);
				if (hud) {
					const c = map.getCenter();
					hudState = {
						phase: f.reveal === total - 1 ? 'orbit' : f.reveal < 0 ? 'enter' : 'build',
						frame: f.reveal,
						bearing: map.getBearing(),
						zoom: map.getZoom(),
						center: [c.lng, c.lat]
					};
					await tick();
					await settleAnimations();
				}
				return idle;
			}
		};
		/** @type {Window & { __clip?: typeof bridge }} */ (window).__clip = bridge;
		document.body.dataset.clipReady = 'true';
	}

	onMount(() => {
		const bg = transparent ? 'transparent' : '#ffffff';
		document.documentElement.style.background = bg;
		document.body.style.background = bg;
	});
</script>

<svelte:head>
	<style>
		html,
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
	</style>
</svelte:head>

<div style="position: relative; width: {width}px; height: {height}px; opacity: {opacity};">
	<AmbientMapPane
		bind:this={pane}
		bind:paneState
		paused
		externalCamera
		basemap={!transparent}
		antialias
		lineWeight={weight}
		onMapReady={init}
	/>
	{#if hud && hudState && paneState.current}
		<AmbientHud
			combo={paneState.current.combo}
			cityName={cityBySlug[paneState.current.combo.city]?.name ?? paneState.current.combo.city}
			country={cityBySlug[paneState.current.combo.city]?.country ?? ''}
			phase={hudState.phase}
			frame={hudState.frame}
			total={paneState.current.total}
			bearing={hudState.bearing}
			zoom={hudState.zoom}
			center={hudState.center}
			cumulativeLengths={paneState.current.cumulativeLengths}
			baselineLength={paneState.current.baselineLength}
		/>
	{/if}
</div>
