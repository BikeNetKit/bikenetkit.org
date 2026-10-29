import type { Dataset } from '$lib/data/datasets';

type Prefer = Partial<Pick<Dataset, 'metric' | 'type' | 'variant'>>;

export function bestMatchForCity(
	datasets: readonly Dataset[],
	city: string,
	prefer: Prefer
): Dataset | undefined {
	const inCity = datasets.filter((d) => d.city === city);
	if (inCity.length === 0) return undefined;

	const tryMatch = (k: Prefer) =>
		inCity.find(
			(d) =>
				(k.metric === undefined || d.metric === k.metric) &&
				(k.type === undefined || d.type === k.type) &&
				(k.variant === undefined || d.variant === k.variant)
		);

	return (
		tryMatch(prefer) ??
		tryMatch({ metric: prefer.metric, type: prefer.type }) ??
		tryMatch({ metric: prefer.metric }) ??
		inCity[0]
	);
}
