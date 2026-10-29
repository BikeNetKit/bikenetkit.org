<script>
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import Menu from '@lucide/svelte/icons/menu';
	import SidebarNav from '$lib/components/app-shell/SidebarNav.svelte';
	import wordmarkHorizontal from '$lib/assets/brand/logo-word-mark-horizontal.svg?url';

	let { children } = $props();

	let navOpen = $state(false);

	// Belt-and-braces backstop for `onNavigate`: any pathname change closes the drawer, even if a
	// future nav path forgets to wire the callback.
	$effect(() => {
		page.url.pathname;
		navOpen = false;
	});
</script>

<div class="flex h-dvh flex-col md:flex-row">
	<!-- Compact: a top bar with the hamburger. `md:hidden`, so a desktop reader never sees it,
	     hydrated or not. -->
	<header
		class="flex h-14 shrink-0 items-center gap-3 border-b border-brand bg-paper px-3 md:hidden"
	>
		<Dialog.Root bind:open={navOpen}>
			<Dialog.Trigger
				aria-label="Open navigation"
				class="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-brand hover:bg-brand-subtle"
			>
				<Menu class="size-5" aria-hidden="true" />
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-40 bg-brand-darkest/60" />
				<!-- w-72 (288px) fits every phone from 320px up without an arbitrary value. -->
				<Dialog.Content
					class="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-brand bg-paper focus:outline-none"
				>
					<Dialog.Title class="sr-only">Navigation</Dialog.Title>
					<nav aria-label="Site" class="flex min-h-0 flex-1 flex-col">
						<SidebarNav onNavigate={() => (navOpen = false)} />
					</nav>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
		<a href={resolve('/')} class="shrink-0">
			<img src={wordmarkHorizontal} alt="BikeNetKit" class="h-7 w-auto" />
		</a>
	</header>

	<!-- Desktop: unchanged, just gated. -->
	<nav
		aria-label="Site"
		class="hidden w-64 shrink-0 flex-col border-r border-brand bg-paper md:flex"
	>
		<a href={resolve('/')} class="flex h-18 items-center border-b border-brand px-4 py-4">
			<img src={wordmarkHorizontal} alt="BikeNetKit" class="h-8 w-auto" />
		</a>
		<SidebarNav />
	</nav>

	<!-- `min-h-0` is load-bearing on compact: in a column flex, `flex-1` alone lets the child's
	     intrinsic height win and the inner `h-full overflow-y-auto` panes stop scrolling. -->
	<main id="main" tabindex="-1" class="min-h-0 flex-1 overflow-hidden focus:outline-none">
		{@render children()}
	</main>
</div>
