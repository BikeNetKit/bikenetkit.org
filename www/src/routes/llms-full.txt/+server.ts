import { activeInteractiveTools, staticTools } from '$lib/data/tools';
import { cities } from '$lib/data/cities';
import { datasets } from '$lib/data/datasets';
import { toolApplyWhen, toolIntro, axisTitle, optionCopy } from '$lib/data/control-copy';
import { metricHelp } from '$lib/data/metric-help';
import { growBikeNetVariantLabels, linkBikeNetStrategyLabels } from '$lib/data/tool-paths';
import { AXIS_FALLBACK_TITLES, axisOptionWords, defaultViewFor } from '$lib/data/tool-page-loader';
import {
	EXPLAINER_VIDEO_URL,
	FAQ_URL,
	PROMO_VIDEO_URL,
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_TAGLINE,
	SITE_URL,
	YOUTUBE_CHANNEL_URL
} from '$lib/site.js';
import type { GrowBikeNetConfig, Tool } from '$lib/data/types';

export const prerender = true;

// The long companion to the hand-written static/llms.txt: everything a language model needs to
// explain a tool and read its maps, generated from the same catalog and control copy the pages
// use, so it cannot drift from them. llms.txt links here.

const GIVEN_LABELS: Record<string, Record<string, Record<string, string>>> = {
	linkbikenet: { metric: linkBikeNetStrategyLabels },
	growbikenet: { variant: growBikeNetVariantLabels }
};

function axesSection(tool: Tool): string[] {
	const config = tool.config;
	if (!config) return [];
	const axes: [string, readonly string[]][] = [
		['metric', config.metrics],
		['type', config.types],
		['variant', (config as GrowBikeNetConfig).variants ?? []]
	];
	const out: string[] = [];
	for (const [axis, values] of axes) {
		if (values.length < 2) continue;
		out.push(`### ${axisTitle(tool.slug, axis, AXIS_FALLBACK_TITLES[axis])}`, '');
		for (const value of values) {
			const words = axisOptionWords(
				tool.slug,
				axis,
				value,
				GIVEN_LABELS[tool.slug]?.[axis]?.[value]
			);
			const copy = optionCopy(tool.slug, axis, value);
			out.push(`- ${words}${copy ? `: ${copy}` : ''}`);
		}
		out.push('');
	}
	return out;
}

function toolSection(tool: Tool): string[] {
	const toolDatasets = datasets[tool.slug] ?? [];
	const covered = cities.filter((c) => toolDatasets.some((d) => d.city === c.slug));
	const example = covered.find((c) => c.slug === 'copenhagen_dk') ?? covered[0];
	const help = metricHelp(tool.slug);
	const intro = toolIntro(tool.slug);
	const applyWhen = toolApplyWhen(tool.slug);
	const out = [`## ${tool.name}`, '', `${SITE_URL}/${tool.slug} — ${tool.shortDescription}`, ''];
	if (tool.questionAnswered) out.push(`Question it answers: ${tool.questionAnswered}`, '');
	if (tool.longDescription) out.push(tool.longDescription, '');
	if (intro) out.push(`On the map: ${intro}`, '');
	if (applyWhen) out.push(`Apply when ${applyWhen}`, '');
	out.push(...axesSection(tool));
	if (help) out.push(`### ${help.heading}`, '', ...help.paragraphs.flatMap((p) => [p, '']));
	const coverage =
		covered.length === 1
			? `Results for one city, ${covered[0].name}.`
			: `Results for ${covered.length} cities.`;
	out.push(`Coverage: ${coverage}`);
	if (example) {
		const view = defaultViewFor(tool.slug, example.slug, toolDatasets, tool.slug === 'growbikenet');
		const path = [tool.slug, example.slug, view.metric, view.type, view.variant]
			.filter(Boolean)
			.join('/');
		out.push(
			`Map URLs follow /${tool.slug}/<city>/<metric>/<type>${tool.slug === 'growbikenet' ? '/<variant>' : ''}, e.g. ${SITE_URL}/${path}.`
		);
	}
	if (tool.paper) {
		const p = tool.paper;
		out.push(
			`Paper: ${p.authors}, "${p.title}"${p.venue ? `, ${p.venue}` : ''}${p.year ? ` (${p.year})` : ''}${p.url ? `. ${p.url}` : ''}`
		);
	}
	if (tool.repo) out.push(`Code: ${tool.repo}`);
	if (tool.docs) out.push(`Documentation: ${tool.docs}`);
	if (tool.tutorial) out.push(`Video tutorial: ${tool.tutorial}`);
	out.push('');
	return out;
}

function build(): string {
	const lines = [
		`# ${SITE_NAME} — full reference`,
		'',
		`> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}`,
		'',
		`The short index is ${SITE_URL}/llms.txt. This file describes each interactive tool in full: what it computes, every option on its map, how the headline number is derived, and where the research and code live. Every tool is free, open-source Python under the GNU AGPL-3.0. The tools compute suggestions from OpenStreetMap data using published algorithms; the maps and figures are algorithmic outputs, not professional planning, engineering or road-safety advice (${SITE_URL}/legal#terms).`,
		'',
		...activeInteractiveTools.flatMap(toolSection),
		'## More tools',
		'',
		...staticTools.map(
			(t) =>
				`- ${t.name}${t.external ? ' (related work)' : ''}: ${t.shortDescription} ${SITE_URL}/more-tools#${t.slug}`
		),
		'',
		'## Explore',
		'',
		`- Cities: ${SITE_URL}/cities — ${cities.length} cities, each with a page listing its results.`,
		`- Tool coverage table: ${SITE_URL}/cities/table`,
		`- FAQ, with the formulas: ${FAQ_URL}`,
		`- Film, "The missing bike lanes of Copenhagen! Introducing BikeNetKit": ${PROMO_VIDEO_URL}`,
		`- Explainer video, "What is BikeNetKit?": ${EXPLAINER_VIDEO_URL}`,
		`- YouTube channel, with a tutorial for each tool: ${YOUTUBE_CHANNEL_URL}`,
		`- Sitemap: ${SITE_URL}/sitemap.xml`,
		''
	];
	return lines.join('\n');
}

export function GET() {
	return new Response(build(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
