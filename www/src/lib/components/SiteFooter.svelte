<script>
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import SocialIcon from '$lib/components/SocialIcon.svelte';
	import { socialLinks } from '$lib/data/landing';
	import { FAQ_URL, GITHUB_ORG_URL, PRESS_KIT_URL, REPORT_EMAIL } from '$lib/site.js';
	import { BUILD_TIME, SITE_VERSION } from '$lib/build-info';
	import { formatIsoDateTime } from '$lib/utils/formatters';

	let deployedLabel = $state(formatIsoDateTime(BUILD_TIME));
	onMount(() => {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (zone) deployedLabel = formatIsoDateTime(BUILD_TIME, zone);
	});
</script>

<footer
	class="mt-8 flex flex-col gap-6 px-4 py-6 text-ink-alt-weaker sm:flex-row sm:items-end sm:justify-between"
>
	<div class="flex w-full flex-col gap-3">
		<p class="text-xl">BikeNetKit — the digital toolkit for bicycle networks.</p>
		<div class="flex w-full flex-col items-baseline gap-3 lg:flex-row">
			<nav class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" aria-label="Footer">
				<!-- <a href={resolve('/cities')} class="transition-colors hover:text-brand">Cities</a> -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
				<a
					href={GITHUB_ORG_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="relative transition-colors hover:text-brand"
					>Source on GitHub<span class="sr-only"> (opens in new tab)</span></a
				>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
				<a
					href={FAQ_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="relative transition-colors hover:text-brand"
					>FAQ<span class="sr-only"> (opens in new tab)</span></a
				>
				<a href={PRESS_KIT_URL} download class="transition-colors hover:text-brand"
					>Press kit <span class="text-xs">(ZIP)</span></a
				>
				<a href={resolve('/legal')} class="transition-colors hover:text-brand"
					>Legal, privacy & credits</a
				>
				<a href="mailto:{REPORT_EMAIL}" class="transition-colors hover:text-brand"
					>Report a problem</a
				>
			</nav>
			<!-- Beside the link row but outside the <nav>: a note, not a destination. Baked in at build
			     time by the `define` in vite.config.js. The prerendered markup is UTC, since it is served
			     to every timezone; once hydrated it switches to the reader's own zone, with UTC kept in
			     the title. Colour is inherited from <footer>; a step weaker would
			     push already-marginal contrast against `bg-brand-subtle` further down. -->
			<div class="grow text-center text-xs">
				Version {SITE_VERSION}, last deployed on
				<time datetime={BUILD_TIME} title={formatIsoDateTime(BUILD_TIME)} class="tabular-nums"
					>{deployedLabel}</time
				>.
			</div>
		</div>
	</div>

	<nav class="flex items-center gap-4" aria-label="BikeNetKit social links">
		{#each socialLinks as link (link.label)}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="{link.label} (opens in new tab)"
				title={link.label}
				class="text-ink-alt-weaker transition-colors hover:text-brand"
			>
				<SocialIcon icon={link.icon} class="h-6 w-6" />
			</a>
		{/each}
	</nav>
</footer>
