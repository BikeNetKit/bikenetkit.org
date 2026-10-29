<script>
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import wordmarkSquare from '$lib/assets/brand/logo-word-mark-square.svg?url';

	const status = $derived(page.status);
	const isNotFound = $derived(status === 404);
	const heading = $derived(isNotFound ? 'Page not found' : 'Something went wrong');
	const message = $derived(
		isNotFound
			? 'The page you are looking for does not exist. It may have moved, or the link may be wrong.'
			: (page.error?.message ?? 'An unexpected error occurred.')
	);
</script>

<main
	id="main"
	tabindex="-1"
	class="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 text-center focus:outline-none"
>
	<a href={resolve('/')} aria-label="BikeNetKit home">
		<img src={wordmarkSquare} alt="BikeNetKit" class="h-20 w-auto" />
	</a>

	<p class="display-name text-9xl text-brand-vivid-dark">{status}</p>

	<div class="max-w-md space-y-2">
		<h1 class="text-xl font-semibold text-ink">{heading}</h1>
		<p class="text-ink-weaker">{message}</p>
	</div>

	<div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
		<a href={resolve('/')} class="link">Back to home</a>
		<a href={resolve('/cities')} class="link">Browse cities</a>
	</div>
</main>
