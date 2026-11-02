<script>
	import { designCredit, hostGroup, logoBox, teamRole } from '$lib/data/landing';
	import {
		AGPL_SUMMARY_URL,
		EXPLAINER_VIDEO_URL,
		FAQ_URL,
		GITHUB_ORG_URL,
		PROMO_VIDEO_URL,
		YOUTUBE_CHANNEL_URL
	} from '$lib/site.js';
	import { BookOpen, CirclePlay } from '@lucide/svelte';
	import { formatIsoDate } from '$lib/utils/formatters';

	let { stats, news, team, sponsors } = $props();

	const logoSponsors = $derived(sponsors.filter((s) => s.logo));
	const textSponsors = $derived(sponsors.filter((s) => !s.logo));
	const logoRowWidth = $derived(logoSponsors.reduce((sum, s) => sum + logoBox(s).width, 0));

	// The team grid needs no filler cells: its hairlines are borders on the cells themselves, so a
	// track the team doesn't fill is simply empty rather than a block of the backing color.

	// Each cell sets its own line breaks — given name, then everything else — rather than letting
	// the name wrap wherever the cell happens to end, which put the break in a different place in
	// every cell. Splitting at the first space keeps middle initials and name particles with the
	// family name ("Carlson" / "M. Büth"), which is where they belong on the second line.
	/** @param {string} name */
	function splitName(name) {
		const i = name.indexOf(' ');
		return i === -1 ? [name, ''] : [name.slice(0, i), name.slice(i + 1)];
	}
</script>

{#snippet statBody(stat)}
	<span class="text-5xl font-light text-brand-vivid-dark">{stat.value}</span>
	<span class="ml-1 text-sm text-ink-weaker">{stat.label}</span>
{/snippet}

<section class="grid gap-4 px-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
	<!-- At lg (three columns) the stats and News share the first column, News filling it below the
	     square stats block. Elsewhere the wrapper is `contents`, so both stay grid items of their
	     own: side by side at md, and a column each in the four-column grid from xl. -->
	<div class="contents lg:flex lg:flex-col lg:gap-4 xl:contents">
		<div class="grid aspect-square grid-cols-2 gap-4">
			{#each stats as stat (stat.label)}
				{#if stat.href}
					<a
						href={stat.href}
						class="flex flex-col items-center justify-center rounded-md bg-paper text-center transition-colors hover:bg-white"
					>
						{@render statBody(stat)}
					</a>
				{:else}
					<div class="flex flex-col items-center justify-center rounded-md bg-paper text-center">
						{@render statBody(stat)}
					</div>
				{/if}
			{/each}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
			<a
				href={AGPL_SUMMARY_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="relative flex grow flex-col items-center justify-center rounded-full border-2 border-dotted border-brand-muted text-center"
			>
				<span class="text-4xl text-brand">AGPL</span>
				<span class="ml-1 text-sm text-ink">License</span>
				<span class="sr-only"> (opens in new tab)</span>
			</a>
		</div>

		<section class="flex flex-col rounded-sm bg-paper-brand p-6 lg:grow">
			<h3 id="news-heading" class="font-display text-lg font-bold text-brand">News</h3>
			<!-- The list scrolls inside the box rather than growing it. From md the box shares a grid row
			     (or, at lg, a column) with cards of fixed height, so the list is taken out of flow and
			     fills whatever height the row already has: a long list can never stretch the row. In the
			     single column below md there is no row to fill, so it is capped instead. Focusable, so a
			     keyboard user can scroll it too. -->
			<div class="relative mt-3 grow md:min-h-24">
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<ul
					tabindex="0"
					aria-labelledby="news-heading"
					class="max-h-64 space-y-3 overflow-y-auto text-sm text-ink-alt md:absolute md:inset-0 md:max-h-none"
				>
					{#each news as item (item.date)}
						<li>
							<time datetime={item.date} class="text-xs text-ink-alt-weaker tabular-nums"
								>{formatIsoDate(item.date)}</time
							>
							<span class="ml-2"
								>{#each typeof item.text === 'string' ? [item.text] : item.text as part, i (i)}{#if typeof part === 'string'}{part}{:else}<a
											href={part.href}
											class="link relative">{part.text}</a
										>{/if}{/each}</span
							>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	</div>

	<!-- Team -->
	<div class="rounded-sm bg-white p-6">
		<h3 class="font-display text-lg font-bold text-brand">Team</h3>
		<p class="mt-2 text-sm text-ink">
			Built at
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
			<a href={hostGroup.url} target="_blank" rel="noopener noreferrer" class="link relative"
				>NERDS<span class="sr-only"> (opens in new tab)</span></a
			>, part of the
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
			<a
				href="https://en.itu.dk/Research/Sections-and-research-groups/Data-Science"
				target="_blank"
				rel="noopener noreferrer"
				class="link relative"
				>Data Science Section<span class="sr-only"> (opens in new tab)</span></a
			>
			at the IT University of Copenhagen, by researchers and practitioners in urban mobility and network
			science.
		</p>
		<p class="mt-8 text-sm text-ink-alt-weaker">{teamRole}:</p>
		<!-- Two columns until the card is wide enough for three (2xl), which is also where the
		     square cells stop squeezing the names.
		     The hairlines are borders on the cells, not a teal backing showing through a 1px gap.
		     The backing leaked: tracks are fractional (336px / 3), each cell's background snaps to
		     device pixels independently, and on a scaled display (device pixel ratio 1.25, 1.75,
		     2.25) the last cell's painted edge landed short of the container's — drawing a teal
		     line down the outside of the last column. Borders can't leak, because nothing is
		     painted behind the cells to leak through.
		     Each cell draws its own top and left edge, and the first row and first column drop
		     theirs. Leading edges rather than trailing ones on purpose: the first row and column
		     are always complete, while a last row that the team doesn't fill would take the
		     nth-last-child rules off the wrong cells. -->
		<ul class="mt-2 grid auto-rows-fr grid-cols-2 text-sm text-ink 2xl:grid-cols-3">
			{#each team as member (member.name)}
				{@const [given, family] = splitName(member.name)}
				<!-- overflow-hidden lets the square win over the intrinsic content height, so a cell
				     with a third line never pushes its neighbours taller. -->
				<li
					class="flex aspect-square flex-col items-center justify-center overflow-hidden border-t border-l border-brand-light bg-white p-2 text-center leading-tight max-2xl:[&:nth-child(-n+2)]:border-t-0 2xl:[&:nth-child(-n+3)]:border-t-0 max-2xl:[&:nth-child(2n+1)]:border-l-0 2xl:[&:nth-child(3n+1)]:border-l-0"
				>
					<p>
						{#if member.lead}<span class="invisible block" aria-hidden="true">(Lead)</span>{/if}
						{#if member.url}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
							<a
								href={member.url}
								target="_blank"
								rel="noopener noreferrer"
								class="link link-quiet relative font-medium"
								><span class="block">{given}</span><span class="block">{family}</span><span
									class="sr-only"
								>
									(opens in new tab)</span
								></a
							>
						{:else}
							<span class="font-medium"
								><span class="block">{given}</span><span class="block">{family}</span></span
							>
						{/if}
						{#if member.lead}<span class="block text-ink-alt-weaker">(Lead)</span>{/if}
					</p>
				</li>
			{/each}
		</ul>
		<!-- The closing row of the card: the design credit on the left, the NERDS mark bottom-right
		     beside it. `flex-wrap` plus `ml-auto` is what makes "bottom right" hold at both widths —
		     where the two fit on one line the mark sits at the right edge of that line, and where
		     they don't (the card is only ~300px wide at xl) the mark drops to its own line and stays
		     right-aligned, rather than squeezing the credit into four wrapped lines. -->
		<div class="mt-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
			<!-- Label and name each take a whole row, always: letting them share one line meant the name
			     broke mid-way at the widths where the card is narrow (lg–2xl, and half-width at md),
			     and the card read as two lines at most sizes anyway. -->
			<p class="text-sm text-ink">
				<span class="block text-ink-alt-weaker">{designCredit.role}:</span>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
				<a
					href={designCredit.url}
					target="_blank"
					rel="noopener noreferrer"
					class="link link-quiet relative block font-medium"
					>{designCredit.name}<span class="sr-only"> (opens in new tab)</span></a
				>
			</p>

			<!-- The mark, repeating the link the opening sentence already carries. The anchor holds
			     the accessible name and the image is decorative (alt=""), so the destination is
			     announced once rather than twice under two different names.
			     The official SVG, vendored unmodified — the muting is `.logo-tint-soft` at render
			     time, not baked-in fills, so hover/focus reveals NERDS' real black-and-yellow and a
			     change of treatment stays a one-class edit. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
			<a
				href={hostGroup.url}
				target="_blank"
				rel="noopener noreferrer"
				title={hostGroup.name}
				aria-label="{hostGroup.fullName} (opens in new tab)"
				class="ml-auto block w-24 shrink-0"
			>
				<img
					src={hostGroup.logo}
					alt=""
					style="aspect-ratio: {hostGroup.ratio}"
					class="logo-tint-soft w-full object-contain"
				/>
			</a>
		</div>
	</div>

	<!-- Sponsors. Learn more and Sponsors split the column's height equally (flex: 1 1 0) wherever
	     the column is stretched to the row; on mobile both keep their natural heights. -->
	<div class="flex flex-col gap-4">
		<div class="rounded-sm bg-paper-brand p-6 md:flex-1">
			<h3 class="font-display text-lg font-bold text-brand">Learn more</h3>
			<p class="my-4 flex items-center gap-4 text-sm text-ink">
				<BookOpen class="shrink-0 text-brand" size="20" aria-hidden="true" />
				<span>
					Check out the
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a href={FAQ_URL} target="_blank" rel="noopener noreferrer" class="link relative"
						>FAQs<span class="sr-only"> (opens in new tab)</span></a
					>, read the research papers, or explore the source code on
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a href={GITHUB_ORG_URL} target="_blank" rel="noopener noreferrer" class="link relative"
						>GitHub<span class="sr-only"> (opens in new tab)</span></a
					>.
				</span>
			</p>
			<p class="my-4 flex items-center gap-4 text-sm text-ink">
				<CirclePlay class="shrink-0 text-brand" size="20" aria-hidden="true" />
				<span>
					Watch our film
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a href={PROMO_VIDEO_URL} target="_blank" rel="noopener noreferrer" class="link relative"
						>The missing bike lanes of Copenhagen<span class="sr-only"> (opens in new tab)</span></a
					>, the short explainer
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a
						href={EXPLAINER_VIDEO_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="link relative"
						>What is BikeNetKit?<span class="sr-only"> (opens in new tab)</span></a
					>, and a tutorial for each tool on our
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a
						href={YOUTUBE_CHANNEL_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="link relative">YouTube channel<span class="sr-only"> (opens in new tab)</span></a
					>.
				</span>
			</p>
		</div>

		<div class="rounded-sm bg-paper-brand p-6 md:flex-1">
			<h3 class="font-display text-lg font-bold text-brand">Sponsors</h3>
			<p class="mt-2 text-sm text-ink">
				BikeNetKit is supported by public research funding and open-source contributors.
			</p>
			<!-- Every logo shares one band height: IFD's text, the EU flag, and JUST STREETS between
		     its rules (see `logoBox`). The logos take --logo-fill of the row, so they grow with the
		     card, and justify-between spreads the rest. -->
			<ul class="sponsor-logos mt-6 flex w-full items-center justify-between gap-5">
				{#each logoSponsors as sponsor (sponsor.name)}
					{@const box = logoBox(sponsor)}
					<li
						class="min-w-0"
						style="width: calc(var(--logo-fill) * {(box.width / logoRowWidth) * 100}%)"
					>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
						<a
							href={sponsor.url}
							target="_blank"
							rel="noopener noreferrer"
							title={sponsor.name}
							aria-label="{sponsor.name} (opens in new tab)"
							class="block"
						>
							<img
								src={sponsor.logo}
								alt={sponsor.name}
								style="aspect-ratio: {box.ratio}; object-position: {box.position}"
								class="logo-tint w-full object-contain"
							/>
						</a>
					</li>
				{/each}
			</ul>
			<ul class="mt-5 space-y-1 text-sm">
				{#each textSponsors as sponsor (sponsor.name)}
					<li>
						{#if sponsor.url}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
							<a
								href={sponsor.url}
								target="_blank"
								rel="noopener noreferrer"
								class="link relative font-medium"
								>{sponsor.name}<span class="sr-only"> (opens in new tab)</span></a
							>
						{:else}
							<span class="font-medium text-ink">{sponsor.name}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	</div>

	<!-- Duotone ramp behind `.logo-tint`: flatten to Rec.709 luminance, then map the bottom half of
	     the range flat onto --color-ink-alt-weaker (#5b8b75, the resting color of the social icons)
	     and ramp the top half to white. The flat shadow end is what makes near-black logo ink land
	     on exactly the social-icon color instead of a washed-out version of it; the ramped highlight
	     end keeps light detail (the EU stars) readable. Alpha passes through untouched, so
	     transparent logo backgrounds stay transparent. Kept in sRGB because the filter default
	     (linearRGB) lifts the midtones. Values are literals rather than tokens: SVG filter
	     attributes cannot read CSS custom properties. -->
	<svg width="0" height="0" class="absolute" aria-hidden="true" focusable="false">
		<!-- Lightness lift, applied *before* `#logo-duotone` by `.logo-tint-soft` (see layout.css).
		     A linear transfer per channel: out = slope x in + intercept. Because the weights in the
		     duotone's luminance matrix sum to 1, lifting each channel this way lifts luminance by
		     exactly the same linear rule — so the two filters compose predictably.
		     It exists because the duotone alone has a flat shadow half: everything below mid grey
		     lands on one teal, which flattens a mark whose whole structure is black shapes with
		     details knocked out of them. Lifting the blacks above the midpoint first moves them onto
		     the ramp, where the structure survives as two separable values. -->
		<filter id="logo-lighten" color-interpolation-filters="sRGB">
			<feComponentTransfer>
				<feFuncR type="linear" slope="0.4" intercept="0.6" />
				<feFuncG type="linear" slope="0.4" intercept="0.6" />
				<feFuncB type="linear" slope="0.4" intercept="0.6" />
			</feComponentTransfer>
		</filter>

		<filter id="logo-duotone" color-interpolation-filters="sRGB">
			<feColorMatrix
				type="matrix"
				values="0.2126 0.7152 0.0722 0 0
				        0.2126 0.7152 0.0722 0 0
				        0.2126 0.7152 0.0722 0 0
				        0      0      0      1 0"
			/>
			<feComponentTransfer>
				<feFuncR type="table" tableValues="0.357 0.357 1" />
				<feFuncG type="table" tableValues="0.545 0.545 1" />
				<feFuncB type="table" tableValues="0.459 0.459 1" />
			</feComponentTransfer>
		</filter>
	</svg>
</section>

<style>
	/* Share of the row the logos take; at 0.72, IFD keeps the width it had under equal-area
	   sizing, and the EU flag and JUST STREETS shrink to its text height. */
	.sponsor-logos {
		--logo-fill: 0.72;
	}
</style>
