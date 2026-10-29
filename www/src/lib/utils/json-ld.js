// Render a JSON-LD block as a full <script type="application/ld+json"> tag string, for {@html} in
// <svelte:head>. Kept in a plain .js module (not a .svelte file) so the literal script tags don't
// get extracted as a component script by the Svelte compiler. `<` is escaped in the payload so a
// stray `</script>` inside any string value can't break out of the tag.
export function jsonLdTag(block) {
	const json = JSON.stringify(block).replace(/</g, '\\u003c');
	return `<script type="application/ld+json">${json}</script>`;
}
