<script>
	import { CustomControl } from 'svelte-maplibre-gl';
	import Bug from '@lucide/svelte/icons/bug';
	import { page } from '$app/state';
	import { REPORT_EMAIL } from '$lib/site.js';
	import { toolBySlug } from '$lib/data/tools';
	import { cityBySlug } from '$lib/data/cities';

	const mailHref = $derived.by(() => {
		const d = page.data;
		const tool = toolBySlug[d.toolSlug]?.name ?? d.toolSlug;
		const city = cityBySlug[d.city]?.name ?? d.city;
		const subject = `Issue report — ${tool}, ${city}`;
		const body = [
			`Tool: ${tool}`,
			`City: ${city}`,
			d.metric ? `Metric: ${d.metric}` : null,
			d.type ? `Type: ${d.type}` : null,
			d.variant ? `Variant: ${d.variant}` : null,
			'',
			`Page: ${page.url.href}`,
			'',
			'What happened:'
		]
			.filter((line) => line !== null)
			.join('\n');
		return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	});
</script>

<CustomControl position="bottom-right">
	<a
		href={mailHref}
		class="map-ctrl-toggle map-ctrl-expand group/report"
		aria-label="Report an issue with this page"
		title="Report an issue"
	>
		<Bug
			class="h-4 w-4 shrink-0 transition-[margin-left] duration-200 group-hover/report:ml-2 group-focus-visible/report:ml-2"
			aria-hidden="true"
		/>
		<span
			class="max-w-0 overflow-hidden pr-0 pl-0 whitespace-nowrap transition-[max-width,padding] duration-200 group-hover/report:max-w-40 group-hover/report:pr-2 group-hover/report:pl-1.5 group-focus-visible/report:max-w-40 group-focus-visible/report:pr-2 group-focus-visible/report:pl-1.5"
		>
			Report an issue
		</span>
	</a>
</CustomControl>
