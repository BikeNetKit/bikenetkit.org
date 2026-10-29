/**
 * Turns the camera into a reactive dependency, so a tooltip's pixel anchor is *derived* from the
 * map rather than written into tooltip state at pointer time. A pin captured as `e.point` is a
 * snapshot of where the cursor was, and goes stale the moment the reader pans — anchoring on the
 * ground and reprojecting keeps the box on the feature it describes.
 *
 * Call during component init. Returns a projector: hand it a function that resolves the anchor
 * against the live map, get back container pixels — or `null` once the anchor has left the map,
 * which callers render as no tooltip at all rather than let the shell clamp the box to an edge it
 * no longer points at.
 *
 * @param {() => import('maplibre-gl').Map | null | undefined} getMap
 */
export function cameraAnchor(getMap) {
	// One counter, bumped once per camera frame; the projector reads it, and that is the whole
	// subscription. Deriving rather than writing means nothing has to remember to keep x/y in step
	// with a pan, and a tooltip that isn't rendered costs nothing.
	let tick = $state(0);

	$effect(() => {
		const m = getMap();
		if (!m) return;
		const bump = () => tick++;
		// `move` covers pan, zoom, rotate, pitch and every animated flight. `resize` covers the
		// container changing under a still camera — the bottom sheet opening, the rail splitting.
		m.on('move', bump);
		m.on('resize', bump);
		return () => {
			m.off('move', bump);
			m.off('resize', bump);
		};
	});

	/**
	 * @param {((map: import('maplibre-gl').Map) => { x: number, y: number } | null) | null} project
	 * @returns {{ x: number, y: number } | null}
	 */
	return (project) => {
		void tick;
		const m = getMap();
		if (!m || !project) return null;
		const p = project(m);
		// A pitched camera projects a point past the horizon to a non-finite or wildly out-of-range
		// value; both fall out here as "nowhere on the map".
		if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
		const { clientWidth: w, clientHeight: h } = m.getContainer();
		if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return null;
		return p;
	};
}
