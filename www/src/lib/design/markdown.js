import { Marked } from 'marked';

// DESIGN.md opens with a YAML block. Left in, `marked` renders the leading `---` as an <hr> and
// the keys as a stray paragraph, so the preview would start with a rule and a run-on line.
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

// Heading ids are prefixed so a heading in the previewed document can never collide with the
// /design page's own section anchors (#colors, #conventions, …) that the header nav links to.
const ID_PREFIX = 'spec-';

/** @param {string} text */
function slugify(text) {
	return (
		ID_PREFIX +
		text
			.toLowerCase()
			.replace(/`/g, '')
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-')
	);
}

/**
 * @typedef {object} TocEntry
 * @property {string} id
 * @property {string} text
 */

/**
 * Render trusted repo markdown to HTML. There is no sanitizer: the only input is a file that
 * ships in this repo, and any raw HTML in it is intentional.
 *
 * @param {string} md
 * @returns {{ html: string, toc: TocEntry[] }}
 */
export function renderMarkdown(md) {
	/** @type {TocEntry[]} */
	const toc = [];
	/** @type {Set<string>} */
	const seen = new Set();

	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth, text }) {
				// Two headings with the same words would otherwise share an id and the second
				// anchor would jump to the first.
				let id = slugify(text);
				for (let n = 2; seen.has(id); n++) id = `${slugify(text)}-${n}`;
				seen.add(id);
				// Backticks are markup, not label: a jump list is plain text. Keyed on the *source*
				// depth, so it still tracks DESIGN.md's `##` headings after the demotion below.
				if (depth === 2) toc.push({ id, text: text.replace(/`/g, '') });
				// Demoted one level: this renders as a section of /design, which has its own `h1`,
				// and DESIGN.md's `#` title would otherwise give the page a second one.
				const level = Math.min(depth + 1, 6);
				return `<h${level} id="${id}">${this.parser.parseInline(tokens)}</h${level}>\n`;
			},
			link({ href, tokens }) {
				const text = this.parser.parseInline(tokens);
				// DESIGN.md is written for someone reading the repo, so it links to source files
				// by repo-relative path (`src/lib/colors.js`). Rendered into /design those resolve
				// against the site root, where nothing is served: the prerender crawler fails the
				// build on them, and a visitor would get the same dead link. Every one of them is
				// already labelled with the path itself, so dropping the anchor and keeping the
				// text loses nothing. Real URLs and in-document anchors still render as links.
				if (href.startsWith('#')) return `<a href="#${ID_PREFIX}${href.slice(1)}">${text}</a>`;
				if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return text;
				return `<a href="${href}">${text}</a>`;
			}
		}
	});

	return { html: marked.parse(md.replace(FRONTMATTER_RE, ''), { async: false }), toc };
}
