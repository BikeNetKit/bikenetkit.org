<script>
	import { resolve } from '$app/paths';
	import wordmarkHorizontal from '$lib/assets/brand/logo-word-mark-horizontal.svg?url';
	import {
		CONTACT_EMAIL,
		DESIGN_CREDIT_NAME,
		DESIGN_CREDIT_URL,
		GITHUB_ORG_URL,
		LEGAL_LAST_UPDATED,
		LOGO_DESIGN_CREDIT_NAME,
		LOGO_DESIGN_CREDIT_URL,
		PARIS_EN_SELLE_URL,
		ECF_URL,
		PUBLISHER_NAME,
		REPORT_EMAIL
	} from '$lib/site.js';

	// A document page, outside the (app) sidebar shell — the same standalone frame as +error.svelte.
	// The prose here is mirrored in docs/legal/legal-review-draft.md for review by mail; this page
	// is the canonical version, so edits start here and the markdown is re-exported afterwards.

	const sections = [
		{ id: 'publisher', title: 'Publisher and contact' },
		{ id: 'privacy', title: 'Privacy notice' },
		{ id: 'storage', title: 'Cookies and local storage' },
		{ id: 'terms', title: 'Use and disclaimer' },
		{ id: 'accessibility', title: 'Accessibility' },
		{ id: 'credits', title: 'Data sources, licenses and funding' }
	];

	// UTC: the ISO date parses as UTC midnight, which is the previous day west of Greenwich.
	const updated = new Date(LEGAL_LAST_UPDATED).toLocaleDateString('en-US', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
</script>

{#snippet h3(text)}<h3 class="mt-6 mb-1 font-display font-bold text-ink-alt">{text}</h3>{/snippet}

<!-- eslint-disable svelte/no-navigation-without-resolve -- a legal page is mostly outbound links:
     licences, the supervisory authority, funders, upstream data sources. -->
<div class="min-h-screen bg-paper">
	<!-- One measure for the whole document: the column width, released from the global 30em <p> cap
	     in the style block below. Without that release, paragraphs would stop at 30em while the
	     lists ran on to the container edge — the two measures visibly disagree in running text. -->
	<main
		id="main"
		tabindex="-1"
		class="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12 focus:outline-none"
	>
		<header class="flex flex-col gap-6">
			<a href={resolve('/')} aria-label="BikeNetKit home">
				<img src={wordmarkHorizontal} alt="BikeNetKit" class="h-12 w-auto md:h-8" />
			</a>
			<div>
				<h1 class="font-display text-2xl font-semibold text-brand">Legal, privacy & credits</h1>
				<p class="mt-1 text-sm text-ink-weaker">Last updated {updated}</p>
			</div>
		</header>

		<nav aria-label="On this page" class="border-y border-brand-subtle py-4">
			<ul class="flex flex-col gap-1 text-sm">
				{#each sections as section (section.id)}
					<li><a href="#{section.id}" class="link">{section.title}</a></li>
				{/each}
			</ul>
		</nav>

		<!-- ── Publisher ────────────────────────────────────────────────────────── -->
		<section id="publisher" class="scroll-mt-8">
			<h2 class="mb-3 font-display text-lg font-bold text-brand">1. Publisher and contact</h2>

			<!-- The publisher asked on 2026-10-07 for "privately" to come out of this sentence. The basis
			     it stated is unchanged: the site is a private, non-commercial publication (confirmed
			     2026-09-28), which is what keeps §5's accessibility statement voluntary and the absence
			     of a CVR number correct. Do not put the word back as a fix. -->
			<p>This site is published by {PUBLISHER_NAME}.</p>

			<dl class="mt-4 flex flex-col gap-2 text-sm">
				<div class="flex gap-2">
					<dt class="w-24 shrink-0 text-ink-weaker">Responsible</dt>
					<dd>{PUBLISHER_NAME}</dd>
				</div>
				<div class="flex gap-2">
					<dt class="w-24 shrink-0 text-ink-weaker">Email</dt>
					<dd><a href="mailto:{CONTACT_EMAIL}" class="link">{CONTACT_EMAIL}</a></dd>
				</div>
			</dl>
		</section>

		<!-- ── Privacy ──────────────────────────────────────────────────────────── -->
		<section id="privacy" class="scroll-mt-8">
			<h2 class="mb-3 font-display text-lg font-bold text-brand">2. Privacy notice</h2>

			<p>
				This site sets no cookies, loads nothing from third parties, and stores no full IP
				addresses.
			</p>

			{@render h3('Controller')}
			<p>
				{PUBLISHER_NAME} is the controller, reachable at
				<a href="mailto:{CONTACT_EMAIL}" class="link">{CONTACT_EMAIL}</a>. This notice covers
				bikenetkit.org, tiles.bikenetkit.org and data.bikenetkit.org. The FAQ at faq.bikenetkit.org
				is hosted by GitHub Pages (GitHub, Inc., USA) and is covered by GitHub's privacy statement,
				not by this notice.
			</p>

			{@render h3('What is processed')}
			<p>
				Each request is logged with your IP address (last block zeroed, e.g.
				<code class="font-mono text-sm">203.0.113.0</code>), date and time, the page requested,
				response status and size, the referrer if sent, and browser/OS. Error logs may briefly hold
				a full IP address, used only to fix faults, and deleted on the same schedule. Messages you
				send us are processed to reply.
			</p>

			{@render h3('Purposes and legal basis')}
			<p>
				We process data to run and secure the site, to compute aggregate usage statistics (from the
				truncated log, with GoAccess, on our own server, never shared or published), and to reply to
				messages. All of this rests on Art. 6(1)(f) GDPR, our legitimate interest.
			</p>

			{@render h3('Recipients and retention')}
			<p>
				The site is hosted at OVH SAS (France, EU), a processor under Art. 28 GDPR, and its domain
				and DNS are handled by Ledl.net GmbH &amp; Co. KG. There are no other recipients and no
				transfers outside the EU/EEA. Logs are kept for 14 days, statistics are kept indefinitely in
				anonymous form, and emails are kept as long as the matter requires.
			</p>

			{@render h3('Your rights')}
			<p>
				You can request access, correction, erasure, restriction or portability of your data, and
				you can object to processing (Art. 21 GDPR) — write to
				<a href="mailto:{CONTACT_EMAIL}" class="link">{CONTACT_EMAIL}</a>. You can also complain to
				Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby, Denmark,
				<a href="https://www.datatilsynet.dk" class="link">www.datatilsynet.dk</a>. There is no
				profiling and no automated decision-making.
			</p>
		</section>

		<!-- ── Storage ──────────────────────────────────────────────────────────── -->
		<section id="storage" class="scroll-mt-8">
			<h2 class="mb-3 font-display text-lg font-bold text-brand">3. Cookies and local storage</h2>

			<p>
				This site sets no cookies, tracking pixels or third-party scripts. Usage statistics come
				from server logs, not from your device. These things live only in your browser:
			</p>
			<ul class="mt-2 flex list-disc flex-col gap-1 pl-5">
				<li>
					<strong>Home city</strong> — this is stored locally as
					<code class="font-mono text-sm">bnk:home-city</code>. It is never sent to the server, and
					clearing site data removes it.
				</li>
				<li>
					<strong>Location</strong> — this is used in-browser to find nearby cities, only if you allow
					it. It is never stored or sent.
				</li>
				<li>
					<strong>Your place on the page</strong> — when you move between pages, the site remembers
					your scroll position and the state of the controls you were using, as
					<code class="font-mono text-sm">sveltekit:scroll</code> and
					<code class="font-mono text-sm">sveltekit:snapshot</code>. They hold no information about
					you, are never sent to the server, and are discarded when you close the tab.
				</li>
			</ul>
		</section>

		<!-- ── Terms ────────────────────────────────────────────────────────────── -->
		<section id="terms" class="scroll-mt-8">
			<h2 class="mb-3 font-display text-lg font-bold text-brand">4. Use and disclaimer</h2>

			<p>
				BikeNetKit's tools compute suggestions from OpenStreetMap data using published algorithms.
				The maps and figures are algorithmic outputs, not professional planning, engineering or
				road-safety advice, and inherit any gaps or errors in the underlying OpenStreetMap data.
			</p>
		</section>

		<!-- ── Accessibility ────────────────────────────────────────────────────── -->
		<section id="accessibility" class="scroll-mt-8">
			<h2 class="mb-3 font-display text-lg font-bold text-brand">5. Accessibility</h2>

			<p>
				We aim for WCAG 2.1 level AA. Semantic markup, keyboard-operable controls and visible focus
				indicators are part of the design system the site is built on. The animation at the top of
				the home page can be paused, and it holds still when your system asks for reduced motion.
				This is a best-effort statement, not a formal compliance filing.
			</p>

			{@render h3('Known limitations')}
			<ul class="flex list-disc flex-col gap-2 pl-5">
				<li>
					The interactive maps are drawn on a WebGL canvas, which screen readers cannot read. Each
					map has a “View as table” button that gives a written summary and its key results as
					tables: how the network builds up, and its most important parts. The tables summarize
					rather than list every segment; the full data is in the GeoJSON download.
				</li>
				<li>
					Panning and zooming a map is designed for pointer input. Keyboard controls exist but are
					slower and less precise.
				</li>
				<li>
					The cities map on the home page is a pointer shortcut. The search field beside it is the
					keyboard route to every city.
				</li>
				<li>
					Some map information is carried by color and line width. Legends spell out the mapping,
					but not every layer has a color-blind-safe alternative.
				</li>
				<li>
					Some secondary text, such as panel labels and captions, does not yet meet the AA contrast
					ratio.
				</li>
			</ul>

			{@render h3('Feedback')}
			<p>
				If something on this site is not usable for you, write to
				<a href="mailto:{REPORT_EMAIL}" class="link">{REPORT_EMAIL}</a> and say which page and what failed.
			</p>
		</section>

		<!-- ── Credits ──────────────────────────────────────────────────────────── -->
		<section id="credits" class="scroll-mt-8">
			<h2 class="mb-3 font-display text-lg font-bold text-brand">
				6. Data sources, licenses and funding
			</h2>

			{@render h3('Map data')}
			<p>
				Map data © <a href="https://www.openstreetmap.org/copyright" class="link"
					>OpenStreetMap contributors</a
				>, available under the
				<a href="https://opendatacommons.org/licenses/odbl/" class="link"
					>Open Database License (ODbL)</a
				>. The map background is built from OpenStreetMap data with
				<a href="https://protomaps.com" class="link">Protomaps</a> and served from our own server.
			</p>

			{@render h3('Tools and research')}
			<p>
				Each tool has its own code repository and publication, linked from its page on this site.
				Licenses, citation details and authorship live in those repositories, collected under
				<a href={GITHUB_ORG_URL} class="link">github.com/BikeNetKit</a>.
			</p>

			{@render h3('City data')}
			<p>
				City names, boundaries and network figures are derived from OpenStreetMap. Population
				figures and the country assignment come from the United Nations Statistics Division's
				<a href="https://unstats.un.org/unsd/demographic-social/products/dyb/dyb_2022/" class="link"
					>Demographic Yearbook 2022</a
				>, which the Division publishes without stating a license.
			</p>

			{@render h3('SortBikeNet data')}
			<p>
				SortBikeNet's as-built order, the sequence in which Paris actually built its bike network,
				is based on data from the cycling advocacy group
				<a href={PARIS_EN_SELLE_URL} class="link">Paris en Selle</a>.
			</p>

			{@render h3('Cycling organizations')}
			<p>
				Links and names of local cycling organizations were collected from the members page of the <a
					href={ECF_URL}
					class="link">European Cyclists Federation</a
				>.
			</p>

			{@render h3('This website')}
			<p>
				The site's source code is published under the
				<a href="https://www.gnu.org/licenses/agpl-3.0.html" class="link">GNU AGPL-3.0</a>. It is
				built with <a href="https://svelte.dev" class="link">Svelte</a> and
				<a href="https://svelte.dev/docs/kit" class="link">SvelteKit</a>, styled with
				<a href="https://tailwindcss.com" class="link">Tailwind CSS</a>, and uses
				<a href="https://maplibre.org" class="link">MapLibre GL</a> and
				<a href="https://docs.protomaps.com/pmtiles/" class="link">PMTiles</a> for the maps,
				<a href="https://lucide.dev" class="link">Lucide</a> for icons, and
				<a href="https://bits-ui.com" class="link">Bits UI</a> for interface components.
			</p>
			<p class="mt-3">
				Type is set in
				<a href="https://public-sans.digital.gov/" class="link">Public Sans</a>
				and
				<a href="https://github.com/IBM/plex" class="link">IBM Plex Mono</a>
				(SIL Open Font License 1.1); the display face is
				<a href="https://www.fontshare.com/fonts/bespoke-sans" class="link">Bespoke Sans</a>, under
				the Indian Type Foundry's free font license. The license texts are served alongside the font
				files, and all fonts are self-hosted.
			</p>
			<p class="mt-3">
				Visualization and site design by
				<a href={DESIGN_CREDIT_URL} class="link">{DESIGN_CREDIT_NAME}</a>. Logo design by
				<a href={LOGO_DESIGN_CREDIT_URL} class="link">{LOGO_DESIGN_CREDIT_NAME}</a>.
			</p>

			{@render h3('Funding')}
			<p>
				We acknowledge funding from the Innovation Fund Denmark, the EU Horizon Project JUST STREETS
				(Grant agreement ID: 101104240), and from the Data Science section of IT University of
				Copenhagen. The funders and the hosting research group are shown on the
				<a href={resolve('/')} class="link">home page</a>.
			</p>
		</section>

		<footer class="border-t border-brand-subtle pt-6 text-sm">
			<a href={resolve('/')} class="link">Back to home</a>
		</footer>
	</main>
</div>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	/* layout.css caps every <p> at 30em, which is right for short marketing copy but wrong for a
	   document: it leaves paragraphs narrower than the lists beside them. Here the column width is
	   the measure. It also balances a paragraph standing on its own, which in a document gives that
	   one section a visibly different measure from its neighbours — so paragraphs wrap normally
	   throughout, `pretty` only to keep last lines from running short. */
	p {
		max-width: none;
		text-wrap: pretty;
	}
</style>
