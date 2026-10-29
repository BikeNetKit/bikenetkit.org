<script>
	import { onMount } from 'svelte';
	import { cityBySlug } from '$lib/data/cities';
	import { animateValue } from '$lib/utils/animation';
	import { heroAdapterFor, heroToolSlugs } from './hero-tools.js';
	import AmbientHud from './AmbientHud.svelte';
	import AmbientMapPane from './AmbientMapPane.svelte';
	import { ZOOM_PULL_AMT, easeInCubic, easeOutCubic } from './hero-motion.js';
	import { makePaneState } from './pane-state.js';
	import { reducedMotion } from '$lib/state/motion.svelte.js';

	// `paused` is the hero's own pause control (WCAG 2.2.2: anything that moves for more than five
	// seconds needs one). Reduced motion halts the rotation the same way, after one static city.
	let { datasets = [], paused = false } = $props();

	const validCombos = $derived(datasets.filter((d) => cityBySlug[d.city]));

	// Tools that actually have loadable combos, in config order — the round-robin cursor walks the
	// rotation built from it, so a tool's air time does not depend on how many combos it ships.
	const toolsInData = $derived(heroToolSlugs.filter((t) => validCombos.some((c) => c.tool === t)));
	// Two passes per round: every tool, then every tool but the `airTime: 'half'` ones.
	const rotation = $derived([
		...toolsInData,
		...toolsInData.filter((t) => heroAdapterFor(t)?.airTime !== 'half')
	]);
	let toolCursor = 0;

	const CROSSFADE_MS = 1200;
	const ORBIT_DWELL_MS = 4000;
	const PUSH_MS = CROSSFADE_MS;
	const PULL_MS = CROSSFADE_MS;
	const FIRST_PAINT_BUDGET_MS = 6000;
	const SWAP_PAINT_BUDGET_MS = 2500;
	const REVEAL_HOLD_MS = CROSSFADE_MS;

	let paneAState = $state(makePaneState());
	let paneBState = $state(makePaneState());

	let paneA;
	let paneB;
	let paneAMapReady = $state(false);
	let paneBMapReady = $state(false);

	let frontPaneId = $state('A');
	let revealed = $state(false);
	let inView = $state(false);
	let pageVisible = $state(true);
	let recentKeys = [];

	const halted = $derived(paused || reducedMotion.current);
	/** @type {(() => void) | null} */
	let resume = null;
	$effect(() => {
		if (!halted) {
			resume?.();
			resume = null;
		}
	});
	// Resolves at once while the hero may move; otherwise parks the rotation until it may again.
	function untilRunning() {
		return halted ? new Promise((r) => (resume = () => r(undefined))) : Promise.resolve();
	}

	let cancelled = false;
	let started = false;
	let containerEl;

	const frontState = $derived(
		revealed ? (frontPaneId === 'A' ? paneAState : paneBState) : makePaneState()
	);

	// The pane's playhead is already the index `cumulativeLengths` is built at, so the HUD gets it
	// as-is — only clamped, since a dataset swap can briefly leave it past the new last step.
	const hudFrame = $derived.by(() => {
		const c = frontState.current;
		if (!c) return -1;
		return Math.min(frontState.frame, c.total - 1);
	});

	function comboKey(c) {
		return `${c.tool}-${c.city}-${c.metric}-${c.type}-${c.variant}`;
	}

	// Round-robin the tool first, then pick a random combo within it (avoiding the recent ones).
	// A tool with a transiently unloadable combo still advances the cursor via `tryPrepare`'s retry,
	// so the next tool fills in rather than the rotation stalling.
	function pickNextCombo() {
		if (rotation.length === 0) return null;
		const tool = rotation[toolCursor % rotation.length];
		toolCursor++;
		const inTool = validCombos.filter((c) => c.tool === tool);
		if (inTool.length === 0) return null;
		const pool = inTool.filter((c) => !recentKeys.includes(comboKey(c)));
		const source = pool.length > 0 ? pool : inTool;
		const pick = source[Math.floor(Math.random() * source.length)];
		recentKeys = [comboKey(pick), ...recentKeys].slice(0, 8);
		return pick;
	}

	function wait(ms) {
		return new Promise((r) => setTimeout(r, ms));
	}

	function animateZoomIn(state, fromOffset, toOffset, easing, duration) {
		return animateValue({
			from: 0,
			to: 1,
			duration,
			isCancelled: () => cancelled,
			onUpdate: (t) => {
				state.zoomPullOffset = fromOffset + (toOffset - fromOffset) * easing(t);
			}
		}).then(() => {
			state.zoomPullOffset = toOffset;
		});
	}

	async function tryPrepare(pane, { paintTimeoutMs, holdCameraDuringEntry }, attempts = 5) {
		for (let i = 0; i < attempts; i++) {
			if (cancelled) return null;
			const combo = pickNextCombo();
			if (!combo) return null;
			const prepared = await pane.prepareCombo(combo, { paintTimeoutMs, holdCameraDuringEntry });
			if (cancelled) return null;
			if (prepared) return prepared;
		}
		return null;
	}

	async function cycle() {
		let front = 'A';
		let back = 'B';

		const firstPrepared = await tryPrepare(paneA, {
			paintTimeoutMs: FIRST_PAINT_BUDGET_MS,
			holdCameraDuringEntry: true
		});
		if (!firstPrepared || cancelled) return;

		// Stage 1: fade the painted city in (basemap + existing network, nothing grown yet). The
		// camera starts orbiting right away — same as a swap's incoming pane — so it's already moving
		// by the time the build-up clock (stage 2) kicks in, rather than starting both at once.
		frontPaneId = 'A';
		revealed = true;
		paneAState.phase = 'build';
		await wait(REVEAL_HOLD_MS);
		if (cancelled) return;
		// Stage 2: only now do the strict clocks start — build-up, then orbit.
		await paneA.runBuild(firstPrepared);
		if (cancelled) return;

		while (!cancelled) {
			await untilRunning();
			await wait(ORBIT_DWELL_MS);
			if (cancelled) return;
			await untilRunning();
			if (cancelled) return;

			const backPane = back === 'A' ? paneA : paneB;
			const backStateRef = back === 'A' ? paneAState : paneBState;
			const frontStateRef = front === 'A' ? paneAState : paneBState;

			if (!reducedMotion.current) {
				backStateRef.zoomPullOffset = -ZOOM_PULL_AMT;
			}

			const prepared = await tryPrepare(backPane, {
				paintTimeoutMs: SWAP_PAINT_BUDGET_MS,
				holdCameraDuringEntry: false
			});
			if (cancelled) return;
			if (!prepared) continue;

			const oldFrontStateRef = frontStateRef;
			const fadeStart = performance.now();
			frontPaneId = back;

			if (!reducedMotion.current) {
				animateZoomIn(frontStateRef, 0, ZOOM_PULL_AMT, easeInCubic, PUSH_MS);
				animateZoomIn(backStateRef, -ZOOM_PULL_AMT, 0, easeOutCubic, PULL_MS);
			}

			wait(CROSSFADE_MS).then(() => {
				if (cancelled) return;
				oldFrontStateRef.phase = 'idle';
			});

			[front, back] = [back, front];

			const fadeRemaining = CROSSFADE_MS - (performance.now() - fadeStart);
			if (fadeRemaining > 0) {
				await wait(fadeRemaining);
				if (cancelled) return;
			}
			await backPane.runBuild(prepared);
			if (cancelled) return;
		}
	}

	$effect(() => {
		if (
			paneAMapReady &&
			paneBMapReady &&
			inView &&
			!started &&
			!cancelled &&
			validCombos.length > 0
		) {
			started = true;
			cycle();
		}
	});

	onMount(() => {
		const io = new IntersectionObserver(
			(entries) => {
				inView = entries[0]?.isIntersecting ?? false;
			},
			{ threshold: 0.05 }
		);
		if (containerEl) io.observe(containerEl);

		function onVis() {
			pageVisible = document.visibilityState === 'visible';
		}
		document.addEventListener('visibilitychange', onVis);

		return () => {
			cancelled = true;
			io.disconnect();
			document.removeEventListener('visibilitychange', onVis);
		};
	});
</script>

<div bind:this={containerEl} class="ambient-stack absolute inset-0 overflow-hidden">
	<div class="ambient-pane" data-front={revealed && frontPaneId === 'A'}>
		<AmbientMapPane
			bind:this={paneA}
			bind:paneState={paneAState}
			reducedMotion={reducedMotion.current}
			{paused}
			{pageVisible}
			onMapReady={() => (paneAMapReady = true)}
		/>
	</div>
	<div class="ambient-pane" data-front={revealed && frontPaneId === 'B'}>
		<AmbientMapPane
			bind:this={paneB}
			bind:paneState={paneBState}
			reducedMotion={reducedMotion.current}
			{paused}
			{pageVisible}
			onMapReady={() => (paneBMapReady = true)}
		/>
	</div>

	<!-- Same bottom-left spot the HUD's status line lands in once revealed — reads as the same
	     line continuing, not a separate element popping in. -->
	<div
		class="loading-indicator pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-ink-alt-weaker max-lg:hidden"
		class:loading-indicator-hidden={revealed}
		aria-hidden="true"
	>
		&gt; initializing<span class="loading-cursor">▍</span>
	</div>

	{#if frontState.current}
		<AmbientHud
			combo={frontState.current.combo}
			cityName={cityBySlug[frontState.current.combo.city]?.name ?? frontState.current.combo.city}
			country={cityBySlug[frontState.current.combo.city]?.country ?? ''}
			phase={frontState.phase}
			frame={hudFrame}
			total={frontState.current.total}
			cumulativeLengths={frontState.current.cumulativeLengths}
			baselineLength={frontState.current.baselineLength}
			bearing={frontState.bearing}
			zoom={frontState.zoom}
			center={frontState.center}
		/>
	{/if}
</div>

<style>
	.ambient-stack {
		position: absolute;
		inset: 0;
	}
	.ambient-pane {
		position: absolute;
		inset: 0;
		opacity: 0;
		/* The network lines reveal before the basemap's own tiles necessarily have — see
		   waitForSourcesLoaded. White keeps that gap clean instead of showing the page's cream
		   background (or nothing) through the not-yet-painted canvas. */
		background: white;
		transition: opacity 1200ms ease-in-out;
		will-change: opacity;
	}
	.ambient-pane[data-front='true'] {
		opacity: 1;
	}
	.loading-indicator {
		opacity: 1;
		transition: opacity 500ms ease-in-out;
	}
	.loading-indicator-hidden {
		opacity: 0;
	}
	.loading-cursor {
		animation: loading-blink 1s steps(2) infinite;
	}
	@keyframes loading-blink {
		50% {
			opacity: 0;
		}
	}
</style>
