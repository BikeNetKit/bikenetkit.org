<script>
	import { padFrame } from '$lib/utils/formatters';
	import { heroAdapterFor } from './hero-tools.js';
	import { toolVersionFor } from '$lib/data/tools';

	let {
		combo,
		cityName,
		country,
		phase,
		frame,
		total,
		bearing,
		zoom,
		center,
		cumulativeLengths = null,
		baselineLength = 0
	} = $props();

	const lastFrame = $derived(Math.max(0, total - 1));
	// `frame` is already the index `cumulativeLengths` is built at — no conversion, no rounding.
	const displayFrame = $derived(Math.max(0, Math.min(frame, lastFrame)));
	const buildProgress = $derived(lastFrame > 0 ? displayFrame / lastFrame : 0);

	const totalLengthKm = $derived(
		cumulativeLengths?.length ? (cumulativeLengths[cumulativeLengths.length - 1] ?? 0) / 1000 : 0
	);
	// Before the first step the existing network is already on screen, so the readout starts at
	// its length rather than 0 — `cumulativeLengths` counts from there.
	const currentLengthKm = $derived(
		frame < 0 || !cumulativeLengths?.length
			? baselineLength / 1000
			: (cumulativeLengths[displayFrame] ?? 0) / 1000
	);

	const sessionKey = $derived(`${combo.tool}-${combo.city}-${combo.metric}-${combo.type}`);

	const opacity = $derived(phase === 'idle' ? 0 : 1);

	function fmtCoord(v, suffixes) {
		const abs = Math.abs(v);
		const dir = v >= 0 ? suffixes[0] : suffixes[1];
		return `${abs.toFixed(4)}° ${dir}`;
	}

	const lat = $derived(center?.[1] ?? 0);
	const lon = $derived(center?.[0] ?? 0);

	// The tool's own release, not the website's package version — the HUD reads as a session
	// header for the analysis on screen, so it should name the thing that produced it.
	const toolVersion = $derived(toolVersionFor(combo.tool)?.version);
	const adapter = $derived(heroAdapterFor(combo.tool));
	const mode = $derived(adapter?.mode ?? 'buildup');
	const toolLabel = $derived(adapter?.label ?? combo.tool);
	const metricLabel = $derived(adapter ? adapter.metricLabel(combo) : combo.metric);

	const buildVerb = $derived(
		adapter?.buildVerb ??
			(mode === 'severity'
				? 'prioritizing gaps'
				: mode === 'superblock'
					? 'partitioning into superblocks'
					: 'growing network')
	);
	const readyNoun = $derived(
		mode === 'severity' ? 'gaps' : mode === 'superblock' ? 'superblocks' : 'segments'
	);

	const statusLine = $derived.by(() => {
		if (phase === 'enter') return '> initializing…';
		if (phase === 'build') {
			const t = Math.round(buildProgress * 100);
			return `> ${buildVerb}… ${t}%`;
		}
		if (phase === 'orbit') return `> network ready · ${total} ${readyNoun}`;
		return '> idle';
	});
</script>

<!-- HUD lives in the lower portion of the section, below the floating panels, so it's always visible. -->
<div
	class="pointer-events-none absolute inset-x-0 right-0 bottom-0 left-0 font-mono text-[11px] leading-tight text-ink tabular-nums transition-opacity duration-500"
	style="opacity: {opacity}; top: clamp(280px, 55%, 70%);"
>
	{#key sessionKey}
		<!-- top-left of map area: session header -->
		<div class="hud-stagger absolute top-3 left-4 flex flex-col gap-0.5 max-md:hidden">
			<div class="hud-line hud-line-0 text-ink-alt-weaker uppercase">
				[{combo.tool}{toolVersion ? `_v${toolVersion}` : ''}]
			</div>
			<div class="hud-line hud-line-1">
				&gt; CITY&nbsp;&nbsp;: <span class="font-semibold">{cityName}</span>{country
					? `, ${country}`
					: ''}
			</div>
			<div class="hud-line hud-line-2">&gt; TOOL&nbsp;&nbsp;: {toolLabel}</div>
			<div class="hud-line hud-line-3">&gt; METRIC: {metricLabel}</div>
			<div class="hud-line hud-line-4">&gt; TYPE&nbsp;&nbsp;: {combo.type}</div>
		</div>

		<!-- Compact: city and tool only. The four desktop blocks are corners of telemetry; at 390px
		     that much text is the map. These two are the ones that say what is actually on screen.
		     `bottom-12`, not the `bottom-3` the desktop blocks use — below `md` the OSM credit takes
		     the bottom edge for itself (see HeroSection), and these two need to sit clear of it
		     rather than just above it. -->
		<div class="hud-stagger absolute bottom-12 left-4 flex flex-col gap-0.5 md:hidden">
			<!-- City only, no country — the desktop line appends it, but `Newcastle-Upon-Tyne, United
			     Kingdom` measures 297px against the 313px this block has at 360px, and the name is
			     bold on top of that. The city alone is what the line is for. -->
			<div class="hud-line hud-line-0">
				&gt; CITY&nbsp;&nbsp;: <span class="font-semibold">{cityName}</span>
			</div>
			<div class="hud-line hud-line-1">&gt; TOOL&nbsp;&nbsp;: {toolLabel}</div>
		</div>

		<!-- top-right of map area: camera telemetry -->
		<div class="hud-stagger absolute top-3 right-4 flex w-[15ch] flex-col gap-0.5 max-md:hidden">
			<div class="hud-line hud-line-0 flex justify-between tabular-nums">
				<span>LAT</span><span>{fmtCoord(lat, ['N', 'S'])}</span>
			</div>
			<div class="hud-line hud-line-1 flex justify-between tabular-nums">
				<span>LON</span><span>{fmtCoord(lon, ['E', 'W'])}</span>
			</div>
			<div class="hud-line hud-line-2 flex justify-between tabular-nums">
				<span>BRG</span><span>{padFrame(Math.round(((bearing % 360) + 360) % 360), 3)}°</span>
			</div>
			<div class="hud-line hud-line-3 flex justify-between tabular-nums">
				<span>PIT</span><span>{padFrame(50, 3)}°</span>
			</div>
			<div class="hud-line hud-line-4 flex justify-between tabular-nums">
				<span>ZOOM</span><span>{(zoom ?? 0).toFixed(2)}</span>
			</div>
		</div>

		<!-- bottom-left of section: status log + frame counter -->
		<div class="hud-stagger ma absolute bottom-3 left-4 flex flex-col gap-0.5 max-lg:hidden">
			<div class="hud-line hud-line-0">{statusLine}</div>
			<div class="hud-line hud-line-1 text-ink-alt-weaker tabular-nums">
				FRAME {padFrame(displayFrame, 4)} / {padFrame(lastFrame, 4)}
			</div>
			{#if totalLengthKm > 0}
				<div class="hud-line hud-line-2 text-ink-alt-weaker tabular-nums">
					LENGTH {currentLengthKm.toFixed(1)} / {totalLengthKm.toFixed(1)} km
				</div>
			{/if}
		</div>

		<!-- bottom-right of section: brand mark + blinking cursor -->
		<div class="hud-stagger absolute right-4 bottom-3 flex items-center gap-2 max-md:hidden">
			<div class="hud-line hud-line-0 text-ink-alt-weaker">// bikenetkit</div>
			<span class="hud-cursor text-ink" aria-hidden="true">▍</span>
		</div>
	{/key}
</div>

<style>
	.hud-line {
		opacity: 0;
		clip-path: inset(0 100% 0 0);
		animation: hud-reveal 600ms ease-out forwards;
	}
	.hud-stagger > .hud-line-0 {
		animation-delay: 100ms;
	}
	.hud-stagger > .hud-line-1 {
		animation-delay: 250ms;
	}
	.hud-stagger > .hud-line-2 {
		animation-delay: 400ms;
	}
	.hud-stagger > .hud-line-3 {
		animation-delay: 550ms;
	}
	.hud-stagger > .hud-line-4 {
		animation-delay: 700ms;
	}
	@keyframes hud-reveal {
		from {
			opacity: 0;
			clip-path: inset(0 100% 0 0);
		}
		to {
			opacity: 1;
			clip-path: inset(0 0 0 0);
		}
	}
	.hud-cursor {
		animation: hud-blink 1s steps(2) infinite;
	}
	@keyframes hud-blink {
		50% {
			opacity: 0;
		}
	}
</style>
