<script>
	let { paper, titleClass = '', class: className = '' } = $props();
</script>

<div class="text-ink-alt {className}">
	<span class="block text-ink-alt-weaker">{paper.venue} ({paper.year})</span>
	<strong class="block {titleClass}">{paper.title}</strong>
	<span class="block">{paper.authors}</span>
</div>
