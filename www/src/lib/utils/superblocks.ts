import { featureCollection } from '@turf/helpers';
import Delaunator from 'delaunator';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

export type BlockProps = {
	classification: string;
	lengthM: number;
	population: number;
	edgeCount: number;
	areaKm2: number;
	density: number;
	/** Written by the ambient hero's reveal-rank synthesis (`AmbientMapPane`), not by `buildSuperblocks` itself. */
	__revealRank?: number;
};

/**
 * People per km². 0 when the area is unknown, so such a block sorts last in the reveal.
 *
 * Only for the edge-aggregation fallback: the `ltns` layer carries the export's own
 * `population_density` (converted to km² on import), and that is used verbatim rather than
 * re-derived. The edge layer ships no density, so blocks assembled from edges still need this.
 */
const densityOf = (population: number, areaKm2: number): number =>
	areaKm2 > 0 ? population / areaKm2 : 0;

/** One row of superblockify's own `ltns` layer — one feature per block. */
type LtnsProps = {
	classification?: string;
	length_total?: number;
	population?: number;
	area?: number;
	m?: number;
	/** People per km², converted from the export's per-m² figure by `update-data`. */
	population_density?: number;
};

export type Blocks = {
	hulls: FeatureCollection<Polygon, BlockProps>;
	byClassification: Map<string, Feature[]>;
};

/** Classification id used by superblockify for edges that aren't part of a block. */
export const SPARSE_CLASSIFICATION = 'SPARSE';

export function isSparseClassification(id: string | null | undefined): boolean {
	return id === SPARSE_CLASSIFICATION;
}

/** Floor applied before log-scaling a block area, in km² (1 m²). Keeps a degenerate block off -∞. */
export const MIN_AREA_KM2 = 1e-6;

/** Block areas span three orders of magnitude, so slider and histogram positions live in log10. */
export const toLog = (km2: number): number => Math.log10(Math.max(km2, MIN_AREA_KM2));
export const fromLog = (l: number): number => 10 ** l;

export type SizeExtent = { min: number; max: number };

export type BlockSizeIndex = {
	sizeByClassification: Map<string, number>;
	sizes: number[];
	extent: SizeExtent | null;
};

/**
 * Every block's area keyed by classification, plus the sorted values and their extent.
 *
 * Sourced from the `ltns` layer rather than the hulls, because a block whose alpha shape does not
 * close has no hull but still has edges on the map (amsterdam: 680 blocks, 613 hulls). Sizing off
 * the hulls would leave those blocks' streets unfilterable and make the count read "613 of 680"
 * the moment a handle moves. Falls back to the hulls when `ltns` is unavailable.
 */
export function blockSizeIndex(
	hulls: FeatureCollection<Polygon, BlockProps>,
	blockAttributes?: FeatureCollection | null
): BlockSizeIndex {
	const sizeByClassification = new Map<string, number>();
	for (const f of blockAttributes?.features ?? []) {
		const props = f.properties as LtnsProps | null;
		if (!props?.classification || typeof props.area !== 'number') continue;
		sizeByClassification.set(props.classification, Math.max(props.area / 1e6, MIN_AREA_KM2));
	}
	if (sizeByClassification.size === 0) {
		for (const f of hulls.features) {
			sizeByClassification.set(
				f.properties.classification,
				Math.max(f.properties.areaKm2, MIN_AREA_KM2)
			);
		}
	}
	const sizes = [...sizeByClassification.values()].sort((a, b) => a - b);
	return {
		sizeByClassification,
		sizes,
		extent: sizes.length ? { min: sizes[0], max: sizes[sizes.length - 1] } : null
	};
}

/** Default size-filter window, in km²: 40 000 m² – 4 km², clamped to the extent per city. */
export const DEFAULT_MIN_AREA_KM2 = 0.04;
export const DEFAULT_MAX_AREA_KM2 = 4;

/**
 * The default `[loLog, hiLog]` selection — 40 000 m² – 4 km² clamped into the extent. Falls back to
 * the full extent when the extent lies entirely above or below the window, so the filter never opens
 * inverted or empty.
 */
export function defaultSizeRange(extent: SizeExtent): [number, number] {
	const lo = Math.max(DEFAULT_MIN_AREA_KM2, extent.min);
	const hi = Math.min(DEFAULT_MAX_AREA_KM2, extent.max);
	if (!(hi > lo)) return [toLog(extent.min), toLog(extent.max)];
	return [toLog(lo), toLog(hi)];
}

/**
 * Population density (people/km²) keyed by classification, sourced from the `ltns` layer and falling
 * back to the hulls — the same sourcing as {@link blockSizeIndex}, so a block without a closing hull
 * is still counted.
 */
export function densityByClassification(
	hulls: FeatureCollection<Polygon, BlockProps>,
	blockAttributes?: FeatureCollection | null
): Map<string, number> {
	const byClass = new Map<string, number>();
	for (const f of blockAttributes?.features ?? []) {
		const props = f.properties as LtnsProps | null;
		if (!props?.classification || typeof props.area !== 'number') continue;
		byClass.set(
			props.classification,
			props.population_density ?? densityOf(props.population ?? 0, props.area / 1e6)
		);
	}
	if (byClass.size === 0) {
		for (const f of hulls.features) byClass.set(f.properties.classification, f.properties.density);
	}
	return byClass;
}

/**
 * A slider handle parked at its bound can land a float hair inside it, because bits-ui snaps values
 * to whole steps. Anything within this fraction of the log span counts as "at the bound", so an
 * untouched slider reads as unfiltered and the block defining the extent is never dropped.
 */
const BOUND_TOLERANCE = 1e-6;

export type SizeSelection = {
	/** `[minKm2, maxKm2]`, or null while the whole extent is selected. */
	filter: [number, number] | null;
	isFiltered: boolean;
};

/** Resolve a `[loLog, hiLog]` slider range against the extent it was drawn from. */
export function sizeSelection(
	range: number[] | null | undefined,
	extent: SizeExtent | null
): SizeSelection {
	if (!extent || !range) return { filter: null, isFiltered: false };
	const [lo, hi] = [toLog(extent.min), toLog(extent.max)];
	const tolerance = Math.max(hi - lo, 1) * BOUND_TOLERANCE;
	const atMin = range[0] <= lo + tolerance;
	const atMax = range[1] >= hi - tolerance;
	if (atMin && atMax) return { filter: null, isFiltered: false };
	return {
		// Open endpoints at the bounds: `fromLog(toLog(x))` would round the extreme block out.
		filter: [atMin ? 0 : fromLog(range[0]), atMax ? Number.MAX_SAFE_INTEGER : fromLog(range[1])],
		isFiltered: true
	};
}

/** The size-hidden blocks plus those the reveal playhead has not reached yet. */
export function hiddenWithReveal(
	hiddenBySize: Set<string>,
	revealOrder: string[],
	revealCount: number
): Set<string> {
	const hidden = new Set(hiddenBySize);
	for (let i = revealCount; i < revealOrder.length; i++) hidden.add(revealOrder[i]);
	return hidden;
}

/** The blocks falling outside `filter`, i.e. the ones the map has to hide. */
export function hiddenBlockSet(
	sizeByClassification: Map<string, number>,
	filter: [number, number] | null
): Set<string> {
	const hidden = new Set<string>();
	if (!filter) return hidden;
	for (const [classification, km2] of sizeByClassification) {
		if (km2 < filter[0] || km2 > filter[1]) hidden.add(classification);
	}
	return hidden;
}

/**
 * Each block's edge features, as MapLibre feature ids, so the map can hide a block by writing
 * feature state instead of changing a layer filter. A filter change makes MapLibre re-parse every
 * tile of the source on the worker, which lands tile by tile — measured on london-residential, one
 * filter change repainted at 20 ms, 241 ms and 354 ms, so blocks visibly vanished in batches.
 * Feature state updates paint arrays on the main thread: 5 746 features in 2 ms, one repaint.
 *
 * The ids are array indices, which is exactly what the source's `generateId` assigns.
 */
export function edgeIdsByBlock(edges: FeatureCollection | null | undefined): Map<string, number[]> {
	const byBlock = new Map<string, number[]>();
	const features = edges?.features ?? [];
	for (let i = 0; i < features.length; i++) {
		const classification = features[i].properties?.classification;
		if (typeof classification !== 'string' || isSparseClassification(classification)) continue;
		const ids = byBlock.get(classification);
		if (ids) ids.push(i);
		else byBlock.set(classification, [i]);
	}
	return byBlock;
}

export type Histogram = {
	bins: { start: number; end: number; count: number }[];
	min: number;
	max: number;
	maxCount: number;
};

/**
 * Bin sizes on the log axis, in the shape `MapHistogram` expects. `bounds` are already log values,
 * so bins and the range slider share one coordinate space and line up pixel for pixel.
 */
export function logHistogram(
	sizes: number[],
	[lo, hi]: [number, number],
	binCount: number
): Histogram | null {
	if (sizes.length === 0 || !(hi > lo)) return null;
	const binWidth = (hi - lo) / binCount;
	const bins = Array.from({ length: binCount }, (_, i) => ({
		start: lo + i * binWidth,
		end: lo + (i + 1) * binWidth,
		count: 0
	}));
	for (const size of sizes) {
		const idx = Math.min(Math.max(Math.floor((toLog(size) - lo) / binWidth), 0), binCount - 1);
		bins[idx].count++;
	}
	return { bins, min: lo, max: hi, maxCount: Math.max(...bins.map((b) => b.count)) };
}

const CATEGORY_VARS = [
	'--color-category-0',
	'--color-category-1',
	'--color-category-2',
	'--color-category-3',
	'--color-category-4'
];
const CATEGORY_OTHER_VAR = '--color-category-other';

let cachedPalette: string[] | null = null;
let cachedOther: string | null = null;

function readPalette(): { palette: string[]; other: string } {
	if (cachedPalette && cachedOther) return { palette: cachedPalette, other: cachedOther };
	if (typeof document === 'undefined') {
		return { palette: CATEGORY_VARS.map(() => '#777'), other: '#c2c2b3' };
	}
	const styles = getComputedStyle(document.documentElement);
	cachedPalette = CATEGORY_VARS.map((v) => styles.getPropertyValue(v).trim() || '#777');
	cachedOther = styles.getPropertyValue(CATEGORY_OTHER_VAR).trim() || '#c2c2b3';
	return { palette: cachedPalette, other: cachedOther };
}

function hashString(s: string): number {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
	return h >>> 0;
}

export type ClassificationColorExpression = string | (string | string[])[];

export function classificationColorMatchExpression(
	classifications: string[]
): ClassificationColorExpression {
	const { palette, other } = readPalette();
	const stops: (string | string[])[] = [];
	for (const id of classifications) {
		if (isSparseClassification(id)) continue;
		stops.push(id, palette[hashString(id) % palette.length]);
	}
	if (stops.length === 0) return other;
	return ['match', ['get', 'classification'], ...stops, other];
}

/**
 * The neutral tone streets get when they belong to no superblock — and, when the size filter is
 * narrowed, to no *shown* one. Same value the `match` above falls through to.
 */
export function categoryOtherColor(): string {
	return readPalette().other;
}

/** Concrete classification→color lookup mirroring {@link classificationColorMatchExpression}. */
export function classificationColorMap(classifications: string[]): {
	colorFor: (classification: string | null | undefined) => string;
	other: string;
} {
	const { palette, other } = readPalette();
	const map = new Map<string, string>();
	for (const id of classifications) {
		if (isSparseClassification(id)) continue;
		map.set(id, palette[hashString(id) % palette.length]);
	}
	return {
		colorFor: (classification) => (classification ? (map.get(classification) ?? other) : other),
		other
	};
}

type XY = [number, number];

/**
 * Max circumradius (meters) for a Delaunay triangle to be kept in the alpha shape. Larger
 * values fill more (closer to a convex hull); smaller values hug the streets more tightly
 * but can fragment a block into several pieces. Tuned for typical city-block extents.
 */
const ALPHA_RADIUS_M = 400;

/**
 * Street segments meet at shared endpoints, so ~55% of a block's vertices are exact duplicates.
 * They are snapped to this grid (in meters) and dropped before triangulating — a centimeter, two
 * orders of magnitude below the ~1 m precision the export ships, so no distinct vertex is merged.
 */
const DEDUPE_GRID_M = 0.01;

/** Flatten all vertices of a block's (Multi)LineString edges into `[lng, lat]` points. */
function pointsFromFeatures(fs: Feature[]): XY[] {
	const points: XY[] = [];
	for (const f of fs) {
		const g = f.geometry;
		if (g?.type === 'LineString') {
			for (const c of g.coordinates) points.push([c[0], c[1]]);
		} else if (g?.type === 'MultiLineString') {
			for (const line of g.coordinates) for (const c of line) points.push([c[0], c[1]]);
		}
	}
	return points;
}

/** Ensure a GeoJSON-valid closed linear ring (first === last, ≥ 4 positions). */
function closeRing(ring: XY[]): XY[] | null {
	if (ring.length < 3) return null;
	const first = ring[0];
	const last = ring[ring.length - 1];
	if (first[0] !== last[0] || first[1] !== last[1]) ring = [...ring, [first[0], first[1]]];
	return ring.length >= 4 ? ring : null;
}

/**
 * The alpha shape works in a planar metric, so project lng/lat to local meters about the
 * point cloud's centroid (equirectangular, x scaled by cos(lat)). Returns the projection
 * and its inverse so the resulting ring can be mapped back to lng/lat.
 */
function localMetricProjection(points: XY[]) {
	let sumLng = 0;
	let sumLat = 0;
	for (const [lng, lat] of points) {
		sumLng += lng;
		sumLat += lat;
	}
	const lng0 = sumLng / points.length;
	const lat0 = sumLat / points.length;
	const mPerDegLat = 110540;
	const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
	return {
		project: ([lng, lat]: XY): XY => [(lng - lng0) * mPerDegLng, (lat - lat0) * mPerDegLat],
		unproject: ([x, y]: XY): XY => [lng0 + x / mPerDegLng, lat0 + y / mPerDegLat]
	};
}

/**
 * Squared circumradius of a triangle, `Infinity` when it is degenerate (collinear) so such a
 * triangle never survives the alpha filter.
 */
function circumradius2(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	cx: number,
	cy: number
): number {
	const adx = bx - ax;
	const ady = by - ay;
	const bdx = cx - ax;
	const bdy = cy - ay;
	const d = 2 * (adx * bdy - ady * bdx);
	if (Math.abs(d) < 1e-12) return Infinity;
	const al = adx * adx + ady * ady;
	const bl = bdx * bdx + bdy * bdy;
	const ux = (bdy * al - ady * bl) / d;
	const uy = (adx * bl - bdx * al) / d;
	return ux * ux + uy * uy;
}

/**
 * Boundary of the alpha complex of a projected point cloud, as oriented `[i, j]` index pairs.
 *
 * Triangulate, keep the triangles whose circumradius is within `radiusM`, and take the half-edges
 * whose twin is missing or dropped — those are exactly the boundary of the kept region.
 *
 * This replaces the `alpha-shape` package, which is an *n*-dimensional implementation: it lifts to
 * ℝ³ and runs exact arithmetic through robust predicates, costing ~2 ms for a 200-point block.
 * Berlin has 1 307 blocks, so hull construction froze the main thread for 2.6 s. A 2D
 * triangulation plus one linear half-edge pass is ~37× faster and, measured across berlin_de,
 * london_gb and warsaw_pl, yields the same polygons — median and p95 relative area delta 0.
 */
function alphaBoundary(coords: Float64Array, radiusM: number): number[][] {
	const { triangles, halfedges } = new Delaunator(coords);
	const r2 = radiusM * radiusM;
	const keep = new Uint8Array(triangles.length / 3);
	for (let t = 0; t < triangles.length; t += 3) {
		const a = triangles[t] * 2;
		const b = triangles[t + 1] * 2;
		const c = triangles[t + 2] * 2;
		const r = circumradius2(
			coords[a],
			coords[a + 1],
			coords[b],
			coords[b + 1],
			coords[c],
			coords[c + 1]
		);
		if (r <= r2) keep[t / 3] = 1;
	}
	const boundary: number[][] = [];
	for (let e = 0; e < triangles.length; e++) {
		if (!keep[(e / 3) | 0]) continue;
		const twin = halfedges[e];
		if (twin !== -1 && keep[(twin / 3) | 0]) continue;
		// Delaunator's triangles are counterclockwise, so `e → next(e)` orients every boundary
		// edge consistently — which is what the loop stitching below walks.
		boundary.push([triangles[e], triangles[e % 3 === 2 ? e - 2 : e + 1]]);
	}
	return boundary;
}

/** Stitch the oriented boundary edges (`[i, j]` index pairs) into closed index loops. */
function loopsFromBoundary(edges: number[][]): number[][] {
	const adj = new Map<number, number[]>();
	for (const [a, b] of edges) {
		let arr = adj.get(a);
		if (!arr) adj.set(a, (arr = []));
		arr.push(b);
	}
	const loops: number[][] = [];
	for (const start of adj.keys()) {
		let arr = adj.get(start);
		while (arr && arr.length) {
			const loop = [start];
			let cur = arr.pop() as number;
			while (cur !== start) {
				loop.push(cur);
				const next = adj.get(cur);
				if (!next || !next.length) break; // open chain — discard
				cur = next.pop() as number;
			}
			if (cur === start && loop.length >= 3) loops.push(loop);
			arr = adj.get(start);
		}
	}
	return loops;
}

function signedArea(ring: XY[]): number {
	let area = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
	}
	return area / 2;
}

/**
 * Concave hull of a block's edge vertices. Projects to local meters, dedupes, takes the boundary
 * of the alpha complex, stitches it into loops, and returns the largest loop as a closed lng/lat
 * ring (or null if no loop forms — e.g. too few or collinear points).
 *
 * A block whose alpha complex falls apart into several loops keeps only the biggest one, so ~2% of
 * blocks have two candidates of comparable size. The tie-break is by area and then by lowest vertex
 * index, so the winner is the same on every run rather than whatever `loopsFromBoundary` happened
 * to emit first.
 */
function alphaHullRing(points: XY[]): XY[] | null {
	if (points.length < 3) return null;
	const { project, unproject } = localMetricProjection(points);

	const seen = new Set<string>();
	const projected: XY[] = [];
	for (const p of points) {
		const q = project(p);
		const key = `${Math.round(q[0] / DEDUPE_GRID_M)},${Math.round(q[1] / DEDUPE_GRID_M)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		projected.push(q);
	}
	if (projected.length < 3) return null;

	const coords = new Float64Array(projected.length * 2);
	for (let i = 0; i < projected.length; i++) {
		coords[2 * i] = projected[i][0];
		coords[2 * i + 1] = projected[i][1];
	}

	let boundary: number[][];
	try {
		boundary = alphaBoundary(coords, ALPHA_RADIUS_M);
	} catch {
		return null; // degenerate (e.g. collinear) point set
	}

	let best: number[] | null = null;
	let bestArea = 0;
	let bestFirst = Infinity;
	for (const loop of loopsFromBoundary(boundary)) {
		const area = Math.abs(signedArea(loop.map((i) => projected[i])));
		let first = Infinity;
		for (const i of loop) if (i < first) first = i;
		if (area > bestArea || (area === bestArea && first < bestFirst)) {
			bestArea = area;
			bestFirst = first;
			best = loop;
		}
	}
	return best ? closeRing(best.map((i) => unproject(projected[i]))) : null;
}

/**
 * Aggregate a block's attributes from its edges. Only used when the `ltns` layer is unavailable:
 * `population` and `area` are per-edge *cell* values, so a cell shared between two edges is
 * counted twice (brussels `residential_1`: 116 against the exported 58).
 */
function aggregateFromEdges(fs: Feature[]): Omit<BlockProps, 'classification'> {
	let lengthM = 0;
	let population = 0;
	let areaSum = 0;
	for (const f of fs) {
		const len = f.properties?.length;
		if (typeof len === 'number') lengthM += len;
		const pop = f.properties?.population;
		if (typeof pop === 'number') population += pop;
		const a = f.properties?.area;
		if (typeof a === 'number') areaSum += a;
	}
	const areaKm2 = areaSum / 1e6;
	return {
		lengthM,
		population,
		edgeCount: fs.length,
		areaKm2,
		density: densityOf(population, areaKm2)
	};
}

function blockPropsFromLtns(
	classification: string,
	ltns: LtnsProps,
	edgeCountFallback: number
): BlockProps {
	const areaKm2 = (ltns.area ?? 0) / 1e6;
	return {
		classification,
		lengthM: ltns.length_total ?? 0,
		population: ltns.population ?? 0,
		edgeCount: ltns.m ?? edgeCountFallback,
		areaKm2,
		density: ltns.population_density ?? densityOf(ltns.population ?? 0, areaKm2)
	};
}

export type BlockRow = { props: BlockProps; feature: Feature };

/**
 * Every block superblockify found, read from its own `ltns` layer: the same count as the map's
 * `blockCount`, including blocks whose hull does not close. No hull work, so it is cheap enough for
 * a table.
 */
export function blockRows(blockAttributes: FeatureCollection | null | undefined): BlockRow[] {
	const rows: BlockRow[] = [];
	for (const feature of blockAttributes?.features ?? []) {
		const ltns = feature.properties as LtnsProps | null;
		const classification = ltns?.classification;
		if (!ltns || !classification || isSparseClassification(classification)) continue;
		rows.push({ props: blockPropsFromLtns(classification, ltns, 0), feature });
	}
	return rows;
}

/** A block's name as the tooltip prints it, e.g. "Block RESIDENTIAL_12". */
export function blockLabel(metric: string, classification: string): string {
	return `Block ${metric.toUpperCase()}_${classification.split('_').pop()}`;
}

export function buildSuperblocks(
	edges: FeatureCollection | null | undefined,
	blockAttributes?: FeatureCollection | null
): Blocks {
	const byClassification = new Map<string, Feature[]>();
	if (!edges?.features?.length) {
		return {
			hulls: featureCollection<Polygon, BlockProps>([]),
			byClassification
		};
	}

	for (const f of edges.features) {
		const id = f.properties?.classification;
		if (typeof id !== 'string') continue;
		const list = byClassification.get(id);
		if (list) list.push(f);
		else byClassification.set(id, [f]);
	}

	// Superblockify's own per-block row, keyed by classification. Preferred over aggregating the
	// edges, which double-counts population and area.
	const ltnsByClassification = new Map<string, LtnsProps>();
	for (const f of blockAttributes?.features ?? []) {
		const props = f.properties as LtnsProps | null;
		if (props?.classification) ltnsByClassification.set(props.classification, props);
	}

	const hulls: Feature<Polygon, BlockProps>[] = [];
	for (const [classification, fs] of byClassification) {
		if (isSparseClassification(classification)) continue;
		const ring = alphaHullRing(pointsFromFeatures(fs));
		if (!ring) continue;
		const ltns = ltnsByClassification.get(classification);
		const properties: BlockProps = ltns
			? blockPropsFromLtns(classification, ltns, fs.length)
			: { classification, ...aggregateFromEdges(fs) };
		hulls.push({
			type: 'Feature',
			// Explicit, stable ids: the map hides a block by writing feature state against them.
			id: hulls.length,
			geometry: { type: 'Polygon', coordinates: [ring] },
			properties
		});
	}

	return {
		hulls: featureCollection<Polygon, BlockProps>(hulls),
		byClassification
	};
}
