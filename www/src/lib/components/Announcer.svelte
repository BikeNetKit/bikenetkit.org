<script>
	import { announcer } from '$lib/state/announce.svelte.js';
</script>

<!-- `fixed` wrapper: the sr-only region is absolutely positioned, and at the end of a full-height
     page its static position would sit just below the viewport and add a scrollbar. -->
<div class="fixed top-0 left-0">
	<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcer.message}</p>
</div>
