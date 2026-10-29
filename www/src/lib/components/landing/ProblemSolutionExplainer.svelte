<script>
	import videoPoster from '$lib/assets/media/intro-video-poster.webp?url';
	import { FAQ_URL } from '$lib/site.js';
	import { env } from '$env/dynamic/public';
	import { Dialog } from 'bits-ui';
	import ToolName from '$lib/components/ui/ToolName.svelte';

	const videoUrl = env.PUBLIC_VIDEO_URL;
	// The 720p rendition sits beside the 1080p file (…/bikenetkit-intro-720p.mp4).
	const videoUrl720 = videoUrl?.replace(/\.mp4$/, '-720p.mp4');
	const captionSrc = '/media/bikenetkit-intro.en.vtt';

	let open = $state(false);
	/** @type {HTMLVideoElement | null} */
	let videoEl = $state(null);
	let captionsOn = $state(true);

	// Pick the rendition by viewport, resolved once on mount (before the video ever renders,
	// since the lightbox opens later) so no mid-playback reload happens.
	let isMobile = $state(false);
	const activeVideoUrl = $derived(isMobile && videoUrl720 ? videoUrl720 : videoUrl);

	$effect(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		isMobile = mq.matches;
		const onChange = () => (isMobile = mq.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	$effect(() => {
		const track = videoEl?.textTracks?.[0];
		if (track) track.mode = captionsOn ? 'showing' : 'hidden';
	});

	// The dialog opens on a user click, so autoplaying with sound is allowed.
	$effect(() => {
		if (open && videoEl) videoEl.play?.().catch(() => {});
	});
</script>

<section class="mx-2 rounded-sm bg-paper-brand px-4 py-4 md:py-16 2xl:px-12">
	<div
		class="mx-auto grid max-w-7xl gap-16 lg:grid-cols-5 lg:items-center 2xl:max-w-none 2xl:grid-cols-3 2xl:grid-rows-[1fr_auto_1fr] 2xl:items-start 2xl:gap-x-12 2xl:gap-y-0"
	>
		<!-- From `2xl` the text flanks the video: problem + research left, the BikeNetKit answer
		     right. Both sit in the `auto` middle row so their tops stay level, while the video
		     spans all three rows and the `1fr` rows center the text pair against it. Each half is
		     capped at a readable measure and hugs the video, so spare width goes to the outer
		     edges. Below `2xl` the wrapper is a plain block and the two text halves simply stack. -->
		<div class="lg:col-span-2 2xl:contents">
			<div class="2xl:col-start-1 2xl:row-start-2 2xl:max-w-md 2xl:justify-self-end">
				<!-- First paragraph: no top margin on compact, where the section's own padding is all the
				     breathing room there is room for. Desktop keeps the `mt-4` it has always had. -->
				<p class="mt-0 text-ink md:mt-4 md:text-lg 2xl:text-xl 2xl:leading-relaxed">
					Most cities <strong>don't provide enough space to bike safely</strong>, despite the
					massive demand for cycling and benefits for climate, public health, and city life.
				</p>
				<p class="mt-4 text-ink md:text-lg 2xl:text-xl 2xl:leading-relaxed">
					Since 2019, we have been researching <strong>new computational methods</strong> for
					<strong>growing and fixing bicycle networks</strong>. But these were prototypes, too rough
					for practical use.
				</p>
			</div>
			<div class="2xl:col-start-3 2xl:row-start-2 2xl:max-w-md">
				<p class="mt-4 text-ink md:text-lg 2xl:text-xl 2xl:leading-relaxed">
					<span class=" font-display font-semibold text-balance italic"
						><ToolName name="BikeNetKit" /></span
					>
					turns them into polished, <strong>free &amp; open-source</strong> software tools. Urban
					planners and citizens can run them on their own city with their own data, exploring many
					scenarios to make safe cycling happen. <br /><br />Read more in our
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL -->
					<a href={FAQ_URL} target="_blank" rel="noopener noreferrer" class="link relative"
						>FAQ<span class="sr-only"> (opens in new tab)</span></a
					>.
				</p>
			</div>
		</div>

		<figure
			class="m-0 lg:col-span-3 2xl:col-span-1 2xl:col-start-2 2xl:row-span-3 2xl:row-start-1 2xl:self-center"
		>
			{#if videoUrl}
				<Dialog.Root bind:open>
					<Dialog.Trigger
						class="group relative block aspect-video w-full cursor-pointer overflow-hidden rounded-2xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<img
							src={videoPoster}
							alt="Still from the BikeNetKit intro video: a presenter next to the BikeNetKit logo."
							aria-hidden="true"
							class="h-full w-full rounded-2xl object-cover transition-transform duration-300 group-hover:scale-[1.02]"
						/>
						<span class="absolute inset-0 flex items-center justify-center">
							<span
								class="flex h-16 w-16 items-center justify-center rounded-full bg-brand/80 text-2xl text-white shadow-lg transition-colors group-hover:bg-brand"
								aria-hidden="true">&#9654;</span
							>
						</span>
						<span class="sr-only">Play the BikeNetKit intro video</span>
					</Dialog.Trigger>

					<Dialog.Portal>
						<Dialog.Overlay class="fixed inset-0 z-50 bg-brand-darkest/85 backdrop-blur-sm" />
						<Dialog.Content
							class="fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-lg border focus:outline-none"
						>
							<Dialog.Title class="sr-only">BikeNetKit intro video</Dialog.Title>

							<div class="relative">
								<video
									bind:this={videoEl}
									class="aspect-video w-full rounded-lg bg-black shadow-2xl"
									controls
									playsinline
									preload="metadata"
									poster={videoPoster}
								>
									<source src={activeVideoUrl} type="video/mp4" />
									<track kind="subtitles" src={captionSrc} srclang="en" label="English" default />
								</video>

								<button
									type="button"
									onclick={() => (captionsOn = !captionsOn)}
									aria-pressed={captionsOn}
									class="absolute top-2 left-2 inline-flex h-8 items-center rounded-sm px-2 text-xs font-semibold shadow-md transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none {captionsOn
										? 'bg-brand text-white'
										: 'bg-white/90 text-ink'}"
								>
									CC<span class="sr-only"> subtitles</span>
								</button>

								<Dialog.Close
									class="absolute -top-3 -right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-lg transition-colors hover:bg-brand hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
									aria-label="Close video"
								>
									<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
										<path
											d="M1 1l12 12M13 1L1 13"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
										/>
									</svg>
								</Dialog.Close>
							</div>
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog.Root>
			{:else}
				<div class="relative aspect-video overflow-hidden rounded-2xl bg-brand-subtle">
					<img
						src={videoPoster}
						alt="Still from the BikeNetKit intro video: a presenter next to the BikeNetKit logo."
						class="h-full w-full object-cover"
					/>
					<div class="absolute inset-0 flex items-center justify-center">
						<span
							class="flex h-16 w-16 items-center justify-center rounded-full bg-brand/80 text-2xl text-white"
							aria-hidden="true">&#9654;</span
						>
					</div>
				</div>
			{/if}
		</figure>
	</div>
</section>
