<script>
	import { Bike } from '@lucide/svelte';
	import SocialIcon from '$lib/components/SocialIcon.svelte';
	import { socialLinks } from '$lib/data/landing';

	// Fanned-out card look: each card is tilted a little more than the one before it and
	// varies in height, so the row reads as a hand-dealt stack.
	const style = {
		bluesky: { rotate: -2, height: 'h-50' },
		github: { rotate: 0, height: 'h-48' },
		mastodon: { rotate: 2, height: 'h-50' },
		linkedin: { rotate: 4, height: 'h-44' }
	};

	/**
	 * @typedef {{ type: 'badge'; label: string; rotate: number }} BadgeCard
	 * @typedef {import('$lib/data/landing').SocialLink & { type: 'link'; rotate: number; height: string }} LinkCard
	 */

	/** @type {(BadgeCard | LinkCard)[]} */
	const cards = [
		{ type: 'badge', label: 'Coming soon! Meanwhile, follow us on → ', rotate: -4 },
		...socialLinks.map(
			(link) => /** @type {LinkCard} */ ({ type: 'link', ...link, ...style[link.icon] })
		)
	];
</script>

<nav
	class=" pointer-events-none absolute inset-x-0 -bottom-20 z-30 flex items-end justify-center"
	aria-label="Social links"
>
	{#each cards as c (c.label)}
		{#if c.type === 'badge'}
			<div
				class="flex h-56 w-44 flex-col items-center justify-start rounded-2xl border border-brand-light bg-brand-vivid px-3 pt-6 text-center font-display text-base leading-tight font-bold text-white italic shadow-lg"
				style="rotate: {c.rotate}deg "
			>
				<Bike class="mb-2 h-6 w-6" aria-hidden="true" />
				{c.label}
			</div>
		{:else}
			<a
				href={c.href}
				target="_blank"
				rel="noopener noreferrer"
				class="group pointer-events-auto relative -mx-3 flex {c.height} w-28 flex-col items-center justify-start gap-2 rounded-2xl border border-brand-light bg-white px-3 pt-6 font-display text-sm font-semibold text-brand shadow-md transition duration-200 ease-out hover:-translate-y-2 hover:scale-102 hover:text-brand-vivid-dark"
				style="rotate: {c.rotate}deg; "
			>
				<SocialIcon icon={c.icon} />
				<span class="font-sans">{c.label}</span>
				<span class="sr-only"> (opens in new tab)</span></a
			>
		{/if}
	{/each}
</nav>
