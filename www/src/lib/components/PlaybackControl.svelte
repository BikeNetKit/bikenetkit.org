<script>
	import IconButton from './ui/IconButton.svelte';

	let {
		frame = $bindable(0),
		total,
		isPlaying = $bindable(false),
		onplay = undefined,
		onpause = undefined,
		onscrub = undefined,
		// How long a full play-through takes. Passed in so a held step button runs at exactly the
		// pace the play button does — the layer sets own the number (`PLAYBACK_MS`), this mirrors it.
		playbackMs = 12_000
	} = $props();

	/**
	 * How long a step button is held before it starts repeating. Long enough that a deliberate single
	 * step never repeats, short enough that a hold reads as "keep going" rather than as a dead button.
	 */
	const HOLD_DELAY_MS = 350;
	/**
	 * Floor and ceiling on the repeat pace. A three-frame city would otherwise sit 6 s between steps
	 * (12 s / 2) and read as frozen; a thousand-frame one would outrun what the map can repaint.
	 */
	const MIN_HOLD_STEP_MS = 30;
	const MAX_HOLD_STEP_MS = 250;

	function toggle() {
		if (isPlaying) onpause?.();
		else onplay?.();
	}

	function step(delta) {
		const next = Math.max(0, Math.min(total - 1, frame + delta));
		if (next === frame) return;
		frame = next;
		onscrub?.();
	}

	/** @type {ReturnType<typeof setTimeout> | null} */
	let holdTimer = null;
	/** @type {number | null} */
	let holdRaf = null;

	function stopHold() {
		if (holdTimer) clearTimeout(holdTimer);
		if (holdRaf) cancelAnimationFrame(holdRaf);
		holdTimer = null;
		holdRaf = null;
	}

	/**
	 * Hold a step button and it keeps stepping, at the pace a play-through runs — so holding Next is
	 * the build-up, and holding Previous is the same run in reverse.
	 *
	 * @param {number} direction
	 */
	function startHold(direction) {
		stopHold();
		holdTimer = setTimeout(() => {
			holdTimer = null;
			// A hold is a playback mode of its own — hand it the playhead rather than let two rAF
			// loops write `frame` against each other.
			if (isPlaying) onpause?.();

			const stepMs = Math.min(
				Math.max(playbackMs / Math.max(total - 1, 1), MIN_HOLD_STEP_MS),
				MAX_HOLD_STEP_MS
			);
			const fromFrame = frame;
			const startedAt = performance.now();

			const advance = () => {
				// Anchored on the press, like the playhead's own tick: a per-frame increment would
				// drift, and a rAF running faster than `stepMs` would round its increment to zero and
				// never move at all.
				const steps = Math.floor((performance.now() - startedAt) / stepMs);
				const next = Math.max(0, Math.min(total - 1, fromFrame + direction * steps));
				if (next !== frame) {
					frame = next;
					onscrub?.();
				}
				// Reached an end — stop rather than spin against the clamp.
				if (next === 0 || next === total - 1) return stopHold();
				holdRaf = requestAnimationFrame(advance);
			};
			holdRaf = requestAnimationFrame(advance);
		}, HOLD_DELAY_MS);
	}

	/**
	 * @param {PointerEvent} event
	 * @param {number} direction
	 */
	function holdStart(event, direction) {
		if (event.button !== 0) return;
		step(direction); // transports step on press, not on release
		startHold(direction);
		// On `window`, not on the button: the pointer may leave the button mid-hold and release
		// anywhere.
		const release = () => {
			stopHold();
			window.removeEventListener('pointerup', release);
			window.removeEventListener('pointercancel', release);
		};
		window.addEventListener('pointerup', release);
		window.addEventListener('pointercancel', release);
	}

	/**
	 * `detail === 0` marks a click synthesised by keyboard activation (Enter/Space). Pointer presses
	 * have already stepped in `holdStart`, and the click trailing them must not step a second time.
	 *
	 * @param {MouseEvent} event
	 * @param {number} direction
	 */
	function keyboardStep(event, direction) {
		if (event.detail === 0) step(direction);
	}

	$effect(() => () => stopHold());

	const SPACE_ROLES = new Set(['button', 'checkbox', 'switch', 'radio', 'tab', 'option', 'slider']);

	// Elements that give Space a meaning of their own: form controls, `<summary>` (the map credits
	// toggle is one), and widgets with an interactive role, like the size filter's slider thumbs.
	// Links and the map canvas don't use Space, so the shortcut still works from them.
	function ownsSpace(el) {
		if (!el) return false;
		const tag = el.tagName;
		return (
			tag === 'INPUT' ||
			tag === 'TEXTAREA' ||
			tag === 'SELECT' ||
			tag === 'BUTTON' ||
			tag === 'SUMMARY' ||
			SPACE_ROLES.has(el.getAttribute('role')) ||
			el.isContentEditable
		);
	}

	/**
	 * Space plays and pauses from anywhere on the page. MapLibre gives Space no meaning, so unlike
	 * the arrows it has no other owner to collide with.
	 *
	 * @param {KeyboardEvent} event
	 */
	function handleWindowKeydown(event) {
		if (total <= 1) return;
		if (event.key !== ' ' && event.key !== 'Spacebar') return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (ownsSpace(event.target)) return;
		event.preventDefault();
		toggle();
	}

	/**
	 * Arrows step the playhead only while focus is inside the bar. The map canvas owns them too, and
	 * a window-wide handler would step the playhead on the same press that pans the map. Bound on the
	 * buttons only: the range input already steps on arrows natively.
	 *
	 * @param {KeyboardEvent} event
	 */
	function handleBarKeydown(event) {
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
		const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!direction) return;
		event.preventDefault();
		step(direction);
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if total > 1}
	<div
		role="group"
		aria-label="Playback"
		class="pointer-events-auto flex w-full items-center gap-2 rounded-sm border border-border-weaker bg-white px-3 py-2.5 shadow-md pointer-coarse:py-3"
	>
		<IconButton
			onclick={toggle}
			onkeydown={handleBarKeydown}
			ariaLabel={isPlaying ? 'Pause' : 'Play'}
		>
			{#if isPlaying}
				<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
					<rect x="2" y="2" width="3" height="8" rx="0.5" />
					<rect x="7" y="2" width="3" height="8" rx="0.5" />
				</svg>
			{:else}
				<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
					<polygon points="3,2 10,6 3,10" />
				</svg>
			{/if}
		</IconButton>

		<input
			type="range"
			min="0"
			max={total - 1}
			step="1"
			bind:value={frame}
			oninput={() => onscrub?.()}
			aria-label="Playback frame"
			aria-valuetext="Step {frame} of {total - 1}"
			class="range-thumb-brand h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-brand-subtle focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none pointer-coarse:h-3"
		/>

		<IconButton
			variant="ghost"
			size="sm"
			disabled={frame <= 0}
			onpointerdown={(e) => holdStart(e, -1)}
			onclick={(e) => keyboardStep(e, -1)}
			onkeydown={handleBarKeydown}
			ariaLabel="Previous step"
		>
			<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
				<polygon points="9,2 3,6 9,10" />
			</svg>
		</IconButton>

		<!-- Counts build steps, not frames: frame 0 is the starting condition (existing network
		     only, or an empty map), so it reads "0" over "/ n". Stacked rather than "n / n" on one
		     line so the reserved width is one number wide, not two — that is what leaves room for
		     the step buttons either side of it in the `w-72` panel. The total is de-emphasized
		     (`ink-alt-weakest`) so the current frame reads as the primary figure. `min-width`
		     reserves the wider of the two lines — the "/ n" reading, once the slash is counted — so
		     neither line reflows the row as digits change. -->
		<div
			class="flex shrink-0 flex-col items-end font-mono text-2xs leading-tight tabular-nums"
			aria-hidden="true"
		>
			<span class="text-right text-ink-alt-weaker" style:min-width="{String(total - 1).length}ch"
				>{frame}</span
			>
			<span
				class="text-right text-ink-alt-weakest"
				style:min-width="{String(total - 1).length + 2}ch">/ {total - 1}</span
			>
		</div>

		<IconButton
			variant="ghost"
			size="sm"
			disabled={frame >= total - 1}
			onpointerdown={(e) => holdStart(e, 1)}
			onclick={(e) => keyboardStep(e, 1)}
			onkeydown={handleBarKeydown}
			ariaLabel="Next step"
		>
			<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
				<polygon points="3,2 9,6 3,10" />
			</svg>
		</IconButton>
	</div>
{/if}
