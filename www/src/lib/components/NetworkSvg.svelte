<script>
	import { coreColors } from '$lib/colors.js';
	import {
		RAMP_COLORS,
		rampColorsFor,
		computeRampStops,
		colorForValue,
		widthForValue,
		zoomScale
	} from '$lib/map-style/line-paint.js';
	import {
		DEFAULT_CIRCLE_RADIUS_RANGE,
		DEFAULT_LINE_WIDTH_RANGE,
		EXISTING_NETWORK_LINE_WIDTH
	} from '$lib/map-style/render-config.js';
	import { metricScale } from '$lib/map-style/metric-scale.js';
	import { makeProjection } from '$lib/utils/mercator';
	import { buildSuperblocks, classificationColorMap } from '$lib/utils/superblocks';

	let {
		geojson,
		bounds = undefined,
		metricProperty,
		lineWidthRange = DEFAULT_LINE_WIDTH_RANGE,
		fitToData = false,
		size = 1080,
		mode = 'default',
		// Separately-sourced baseline (linkbikenet). When absent, `ordered` mode falls back
		// to growbikenet's convention of features without `ordering` in the main collection.
		existingNetwork = null,
		lccStepProperty = null
	} = $props();

	const PAPER = coreColors.paperBase;

	const r2 = (n) => Math.round(n * 100) / 100;

	function lineD(geom, project) {
		const seg = (coords) => {
			let d = '';
			for (let i = 0; i < coords.length; i++) {
				const [x, y] = project(coords[i]);
				d += (i === 0 ? 'M' : 'L') + r2(x) + ',' + r2(y);
				if (i < coords.length - 1) d += ' ';
			}
			return d;
		};
		if (geom?.type === 'LineString') return seg(geom.coordinates);
		if (geom?.type === 'MultiLineString') return geom.coordinates.map(seg).join(' ');
		return '';
	}

	function polyD(geom, project) {
		const ring = (coords) => {
			let d = '';
			for (let i = 0; i < coords.length; i++) {
				const [x, y] = project(coords[i]);
				d += (i === 0 ? 'M' : 'L') + r2(x) + ',' + r2(y) + ' ';
			}
			return d + 'Z';
		};
		if (geom?.type === 'Polygon') return geom.coordinates.map(ring).join(' ');
		if (geom?.type === 'MultiPolygon')
			return geom.coordinates.flatMap((p) => p.map(ring)).join(' ');
		return '';
	}

	function pointsXY(geom, project) {
		if (geom?.type === 'Point') return [project(geom.coordinates)];
		if (geom?.type === 'MultiPoint') return geom.coordinates.map(project);
		return [];
	}

	const geometryKind = $derived.by(() => {
		const t = geojson?.features?.[0]?.geometry?.type;
		if (t === 'Point' || t === 'MultiPoint') return 'point';
		return 'line';
	});

	const dataBounds = $derived.by(() => {
		if (!geojson?.features?.length) return null;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		const walk = (c) => {
			if (c[0] < minX) minX = c[0];
			if (c[1] < minY) minY = c[1];
			if (c[0] > maxX) maxX = c[0];
			if (c[1] > maxY) maxY = c[1];
		};
		const visit = (geom) => {
			if (!geom) return;
			const t = geom.type;
			if (t === 'Point') walk(geom.coordinates);
			else if (t === 'MultiPoint' || t === 'LineString') geom.coordinates.forEach(walk);
			else if (t === 'MultiLineString' || t === 'Polygon')
				geom.coordinates.forEach((r) => r.forEach(walk));
			else if (t === 'MultiPolygon')
				geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(walk)));
		};
		for (const f of geojson.features) visit(f.geometry);
		if (!Number.isFinite(minX)) return null;
		return [
			[minX, minY],
			[maxX, maxY]
		];
	});

	const effectiveBounds = $derived(fitToData && dataBounds ? dataBounds : bounds);
	const projection = $derived(effectiveBounds ? makeProjection(effectiveBounds, size) : null);
	const zs = $derived(projection ? zoomScale(projection.zoom) : 1);

	const sortedValues = $derived.by(() =>
		geojson
			? geojson.features
					.map((f) => f.properties?.[metricProperty])
					.filter((v) => typeof v === 'number' && Number.isFinite(v))
					.sort((a, b) => a - b)
			: []
	);

	// --- default: line ---
	const lineStops = $derived(computeRampStops(sortedValues, RAMP_COLORS, lineWidthRange));
	const defaultLineEls = $derived.by(() => {
		if (mode !== 'default' || geometryKind !== 'line' || !projection) return [];
		return geojson.features
			.map((f) => ({
				value: f.properties?.[metricProperty],
				d: lineD(f.geometry, projection.project)
			}))
			.filter((e) => e.d)
			.sort((a, b) => (a.value ?? -Infinity) - (b.value ?? -Infinity))
			.map((e) => ({
				d: e.d,
				stroke: colorForValue(e.value, lineStops),
				width: r2(widthForValue(e.value, lineStops) * zs)
			}));
	});

	// --- default: point ---
	const circleStops = $derived(
		computeRampStops(sortedValues, RAMP_COLORS, DEFAULT_CIRCLE_RADIUS_RANGE)
	);
	const defaultPointEls = $derived.by(() => {
		if (mode !== 'default' || geometryKind !== 'point' || !projection) return [];
		const out = [];
		for (const f of geojson.features) {
			const value = f.properties?.[metricProperty];
			const radius = r2(widthForValue(value, circleStops) * zs);
			const fill = colorForValue(value, circleStops);
			for (const [x, y] of pointsXY(f.geometry, projection.project))
				out.push({ cx: r2(x), cy: r2(y), r: radius, value, fill });
		}
		return out.sort((a, b) => (a.value ?? -Infinity) - (b.value ?? -Infinity));
	});

	// --- ordered (growbikenet) ---
	const proposedSorted = $derived(
		metricScale(geojson, metricProperty, (f) => typeof f.properties?.ordering === 'number')
			.sortedValues
	);
	const orderedStops = $derived(
		computeRampStops(proposedSorted, rampColorsFor(metricProperty), DEFAULT_LINE_WIDTH_RANGE)
	);
	const existingWidth = $derived(r2(EXISTING_NETWORK_LINE_WIDTH * zs));
	// Rendered at the fully-built state, so a segment counts as connected if it ever joins
	// the largest component. Segments that never join stay pale, matching the live map.
	const existingEls = $derived.by(() => {
		if (mode !== 'ordered' || !projection) return [];
		if (existingNetwork) {
			return (existingNetwork.features ?? [])
				.map((f) => ({
					d: lineD(f.geometry, projection.project),
					connected: !lccStepProperty || typeof f.properties?.[lccStepProperty] === 'number'
				}))
				.filter((e) => e.d);
		}
		return geojson.features
			.filter((f) => typeof f.properties?.ordering !== 'number')
			.map((f) => ({ d: lineD(f.geometry, projection.project), connected: false }))
			.filter((e) => e.d);
	});
	const proposedEls = $derived.by(() => {
		if (mode !== 'ordered' || !projection) return [];
		return (
			geojson.features
				.filter((f) => typeof f.properties?.ordering === 'number')
				.map((f) => ({
					value: f.properties?.[metricProperty],
					d: lineD(f.geometry, projection.project)
				}))
				.filter((e) => e.d)
				// Painter's order: the emphasised end of the ramp — the highest metric value — goes
				// last so it stays on top.
				.sort((a, b) => (a.value ?? -Infinity) - (b.value ?? -Infinity))
				.map((e) => ({
					d: e.d,
					stroke: colorForValue(e.value, orderedStops),
					width: r2(widthForValue(e.value, orderedStops) * zs)
				}))
		);
	});

	// --- superblock-edges ---
	// Only the hull geometry and `classification` are drawn here, so the block attribute layer is
	// not fetched for the static export.
	const blocks = $derived(mode === 'superblock-edges' ? buildSuperblocks(geojson) : null);
	const sbColor = $derived(
		blocks ? classificationColorMap([...blocks.byClassification.keys()]) : null
	);
	const sbMetricSorted = $derived.by(() =>
		mode === 'superblock-edges' && geojson
			? geojson.features
					.map((f) => f.properties?.[metricProperty])
					.filter((v) => typeof v === 'number' && Number.isFinite(v))
					.sort((a, b) => a - b)
			: []
	);
	const sbEdgeStops = $derived(computeRampStops(sbMetricSorted, RAMP_COLORS, lineWidthRange));
	const sbConstWidth = $derived((lineWidthRange[0] + lineWidthRange[1]) / 2);
	const hullEls = $derived.by(() => {
		if (mode !== 'superblock-edges' || !projection || !blocks || !sbColor) return [];
		return blocks.hulls.features
			.map((f) => ({
				d: polyD(f.geometry, projection.project),
				fill: sbColor.colorFor(f.properties.classification)
			}))
			.filter((e) => e.d);
	});
	const edgeEls = $derived.by(() => {
		if (mode !== 'superblock-edges' || !projection || !blocks || !sbColor) return [];
		return geojson.features
			.map((f) => {
				const value = f.properties?.[metricProperty];
				const w = sbEdgeStops.length < 2 ? sbConstWidth : widthForValue(value, sbEdgeStops);
				return {
					d: lineD(f.geometry, projection.project),
					stroke: sbColor.colorFor(f.properties?.classification),
					width: r2(w * zs)
				};
			})
			.filter((e) => e.d);
	});
</script>

<svg
	id="network-export"
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<rect x="0" y="0" width={size} height={size} fill={PAPER} />

	{#if mode === 'superblock-edges'}
		{#each hullEls as hull (hull.d)}
			<path d={hull.d} fill={hull.fill} fill-opacity="0.15" stroke="none" />
		{/each}
		{#each edgeEls as edge, i (i)}
			<path
				d={edge.d}
				fill="none"
				stroke={edge.stroke}
				stroke-width={edge.width}
				stroke-opacity="0.85"
			/>
		{/each}
	{:else if mode === 'ordered'}
		{#each existingEls as el, i (i)}
			<path
				d={el.d}
				fill="none"
				stroke={lccStepProperty && el.connected
					? coreColors.existingNetworkConnected
					: coreColors.existingNetwork}
				stroke-width={existingWidth}
				stroke-opacity={lccStepProperty && !el.connected ? 0.55 : 0.9}
			/>
		{/each}
		{#each proposedEls as el, i (i)}
			<path d={el.d} fill="none" stroke={el.stroke} stroke-width={el.width} stroke-opacity="1" />
		{/each}
	{:else if geometryKind === 'point'}
		{#each defaultPointEls as c, i (i)}
			<circle cx={c.cx} cy={c.cy} r={c.r} fill={c.fill} fill-opacity="0.9" />
		{/each}
	{:else}
		{#each defaultLineEls as el, i (i)}
			<path d={el.d} fill="none" stroke={el.stroke} stroke-width={el.width} stroke-opacity="1" />
		{/each}
	{/if}
</svg>
