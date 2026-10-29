<script>
	import Bike from '@lucide/svelte/icons/bike';
	import Building2 from '@lucide/svelte/icons/building-2';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Users from '@lucide/svelte/icons/users';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	/** @type {{ links: import('$lib/data/contact-links').ActionLink[] }} */
	let { links } = $props();

	const ICONS = { mobility: Bike, contact: Building2, ministry: Landmark, org: Users };

	const languageNames = new Intl.DisplayNames(['en-US'], { type: 'language' });
	/** @param {string | undefined} lang */
	const languageNote = (lang) => {
		if (!lang || lang === 'en') return '';
		try {
			return `, in ${languageNames.of(lang)}`;
		} catch {
			return '';
		}
	};
</script>

<div class="flex flex-col gap-2">
	<ul class="grid gap-1">
		{#each links as link (link.url + link.kind)}
			{@const Icon = ICONS[link.kind]}
			<li>
				<a
					href={link.url}
					hreflang={link.lang}
					target="_blank"
					rel="noopener external"
					class="group relative flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-brand-subtle focus-visible:bg-brand-subtle focus-visible:-outline-offset-2"
				>
					<Icon class="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm font-medium text-brand group-hover:text-ink">{link.label}</span>
						{#if link.detail}
							<span class="text-xs text-ink-alt-weaker">{link.detail}</span>
						{/if}
					</span>
					<ExternalLink class="mt-1 h-3.5 w-3.5 shrink-0 text-brand-muted" aria-hidden="true" />
					<span class="sr-only">(opens in a new tab{languageNote(link.lang)})</span>
				</a>
			</li>
		{/each}
	</ul>
</div>
