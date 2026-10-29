<script>
	import { page } from '$app/state';
	import {
		DEFAULT_OG_IMAGE,
		DEFAULT_OG_IMAGE_ALT,
		OG_IMAGE_SIZE,
		SITE_DESCRIPTION,
		SITE_LOGO,
		SITE_NAME,
		SITE_TAGLINE,
		SITE_URL
	} from '$lib/site.js';

	// Mounted exactly once, in the root +layout.svelte. Svelte concatenates <svelte:head>
	// from every component in the tree, so a second instance would emit a second og:image
	// and leave crawlers to pick one. Pages contribute through `meta` on their load instead.
	import { socialLinks } from '$lib/data/landing';
	import { jsonLdTag } from '$lib/utils/json-ld.js';
	import { coreColors } from '$lib/colors.js';

	const meta = $derived(page.data.meta ?? {});
	// An error page keeps the data of the layouts above the route that failed (a tool layout's
	// title, say), so its title comes from the status, or a 404 would be announced as a tool page.
	const errorTitle = $derived(
		page.status >= 400 ? (page.status === 404 ? 'Page not found' : 'Something went wrong') : null
	);
	const title = $derived(
		(errorTitle ?? meta.title)
			? `${errorTitle ?? meta.title} · ${SITE_NAME}`
			: `${SITE_NAME} — ${SITE_TAGLINE}`
	);
	// An error page is never indexed and has no canonical: the URL it answers is not a page.
	const noindex = $derived(errorTitle !== null || !!meta.noindex);
	const description = $derived(meta.description ?? SITE_DESCRIPTION);
	// `meta.canonical` lets a view name another URL as the one to index — every map view of a
	// tool×city points at its default view (see mapMeta).
	const url = $derived(new URL(meta.canonical ?? page.url.pathname, SITE_URL).href);
	const image = $derived(new URL(meta.image ?? DEFAULT_OG_IMAGE, SITE_URL).href);

	// Site-wide structured data (emitted on every page) plus any per-page blocks the route's
	// `meta.jsonLd` contributes (e.g. SoftwareApplication + ScholarlyArticle from toolMeta()).
	const siteJsonLd = [
		{
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: SITE_NAME,
			url: SITE_URL,
			description: SITE_DESCRIPTION,
			logo: `${SITE_URL}${SITE_LOGO}`,
			sameAs: socialLinks.map((l) => l.href)
		},
		{
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: SITE_NAME,
			url: SITE_URL,
			description: SITE_DESCRIPTION
		}
	];
	const jsonLdBlocks = $derived([...siteJsonLd, ...(meta.jsonLd ?? [])]);

	const ogImageWidth = String(OG_IMAGE_SIZE.width);
	const ogImageHeight = String(OG_IMAGE_SIZE.height);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="theme-color" content={coreColors.brand} />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	{#if errorTitle === null}
		<link rel="canonical" href={url} />
	{/if}

	{#if noindex}
		<meta name="robots" content="noindex" />
	{:else}
		<meta property="og:type" content="website" />
		<meta property="og:site_name" content={SITE_NAME} />
		<meta property="og:locale" content="en_US" />
		<meta property="og:title" content={title} />
		<meta property="og:description" content={description} />
		<meta property="og:url" content={url} />
		<meta property="og:image" content={image} />
		<meta property="og:image:width" content={ogImageWidth} />
		<meta property="og:image:height" content={ogImageHeight} />
		<meta property="og:image:alt" content={meta.imageAlt ?? DEFAULT_OG_IMAGE_ALT} />
		<meta name="twitter:card" content="summary_large_image" />

		{#each jsonLdBlocks as block, i (i)}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- serialized JSON-LD, `<` escaped -->
			{@html jsonLdTag(block)}
		{/each}
	{/if}
</svelte:head>
