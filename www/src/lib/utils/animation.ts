export interface AnimateValueOptions {
	from: number;
	to: number;
	duration: number;
	onUpdate: (value: number) => void;
	isCancelled?: () => boolean;
}

export function animateValue(options: AnimateValueOptions): Promise<void> {
	const { from, to, duration, onUpdate, isCancelled } = options;
	return new Promise((resolve) => {
		const start = performance.now();
		function tick() {
			if (isCancelled?.()) return resolve();
			const t = Math.min(1, (performance.now() - start) / duration);
			onUpdate(from + (to - from) * t);
			if (t >= 1) return resolve();
			requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	});
}
