import type { City, LngLatBounds } from '$lib/data/types';
import { cityCenter } from '$lib/data/city-tools';

export type Point = [number, number]; // [lng, lat]

export function isInsideBounds([lng, lat]: Point, bounds: LngLatBounds): boolean {
	const [[minLng, minLat], [maxLng, maxLat]] = bounds;
	return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: Point, b: Point): number {
	const R = 6371;
	const dLat = toRad(b[1] - a[1]);
	const dLng = toRad(b[0] - a[0]);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

export function cityAtLocation(point: Point, cities: City[]): City | null {
	const inside = cities.filter((c) => isInsideBounds(point, c.bounds));
	if (!inside.length) return null;
	return inside.sort(
		(a, b) => distanceKm(point, cityCenter(a)) - distanceKm(point, cityCenter(b))
	)[0];
}

export function nearestCities(point: Point, cities: City[], n = 3) {
	return cities
		.map((city) => ({ city, km: distanceKm(point, cityCenter(city)) }))
		.sort((a, b) => a.km - b.km)
		.slice(0, n);
}
