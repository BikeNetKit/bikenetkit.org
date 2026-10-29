/** `Jul 23, 2026` in `timeZone` (UTC unless given). Shared by both date formatters below. */
function formatShortDate(d: Date, timeZone = 'UTC'): string {
	return new Intl.DateTimeFormat('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone
	}).format(d);
}

/**
 * `2026-07-23` -> `Jul 23, 2026`. Parsed as UTC so the rendered day never shifts with the
 * viewer's timezone. Returns the input unchanged if it is not an ISO date.
 */
export function formatIsoDate(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!m) return iso;
	return formatShortDate(new Date(`${iso}T00:00:00Z`));
}

/**
 * `2026-09-16T14:32:07.123Z` -> `Sep 16, 2026 at 2:32 PM UTC`, or with `timeZone` given,
 * `Sep 16, 2026 at 4:32 PM GMT+2` (en-US names only US zones; elsewhere it gives the offset).
 * Sibling of `formatIsoDate`, which drops the time. The UTC default is for prerendered markup,
 * which has no viewer to localize for; pass the viewer's zone only client-side. The date follows
 * the same zone, so a late-evening UTC instant reads as the next day east of Greenwich. Returns
 * the input unchanged if it is not a parseable instant.
 */
export function formatIsoDateTime(iso: string, timeZone = 'UTC'): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const time = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZone,
		timeZoneName: 'short'
	}).format(d);
	return `${formatShortDate(d, timeZone)} at ${time}`;
}

export function humanizeLabel(s: string): string {
	return s.replace(/_/g, ' ');
}

export function padFrame(n: number, width: number): string {
	return String(n).padStart(width, '0');
}

/**
 * A superblock's area. They run from ~100 m² to ~1.4 km², and a median block is 0.013 km² — three
 * leading zeros — so anything below 0.1 km² reads in square metres instead. Only m² and km², never
 * hectares.
 */
export function formatBlockArea(km2: number): string {
	if (!Number.isFinite(km2)) return '–';
	if (km2 >= 0.1) return `${Number(km2.toPrecision(2))} km²`;
	const m2 = Number((km2 * 1e6).toPrecision(2));
	return `${m2.toLocaleString('en-US')} m²`;
}

/** Compact counts in the site's style: `254k`, `1.9m`. */
export function formatCompact(n: number): string {
	if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
	return String(n);
}

/** "A, B and C" — the site's copy leaves out the serial comma. */
export function joinList(items: readonly string[]): string {
	return items.length < 2
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
