<script>
	import { CustomControl } from 'svelte-maplibre-gl';
	import { Popover } from 'bits-ui';
	import Settings from '@lucide/svelte/icons/settings';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import PanelHeading from './PanelHeading.svelte';
	import { getExpertMenu } from './expertMenu.svelte.js';

	/** @type {{ showLabels: boolean, onToggleLabels?: (show: boolean) => void }} */
	let { showLabels, onToggleLabels = undefined } = $props();

	// The active page's registered expert controls, if any — see `expertMenu.svelte.js`: the layout
	// publishes the holder, each tool page writes into it. The gear itself renders whenever there is
	// something to put in it, so a page with labels but no expert controls still gets one.
	const expert = getExpertMenu();
	const expertContent = $derived(expert?.content ?? null);
	let open = $state(false);

	const LABEL_OPTIONS = [
		{ value: 'show', label: 'Show' },
		{ value: 'hide', label: 'Hide' }
	];
</script>

{#if onToggleLabels || expertContent}
	<CustomControl position="bottom-right">
		<Popover.Root bind:open>
			<Popover.Trigger class="map-ctrl-toggle" aria-label="Map settings" title="Map settings">
				<Settings class="h-4 w-4" aria-hidden="true" />
			</Popover.Trigger>
			<!-- Portalled to `body` so it escapes `.maplibregl-ctrl-group`, whose unlayered vendor rule
			     would otherwise clobber the menu items. Opens upward — the control sits low-right.
			     Each direct child is a section: the column draws the rules between them and pads them,
			     so a page's expert controls need not know whether they come first or alone. -->
			<Popover.Portal>
				<Popover.Content
					side="top"
					align="end"
					sideOffset={6}
					class="z-50 flex w-72 flex-col divide-y divide-border-weakest rounded-md border border-border-weaker bg-white px-3 text-left shadow-md *:px-1 *:py-3"
				>
					{#if onToggleLabels}
						<div class="flex items-center justify-between gap-3">
							<PanelHeading title="Map labels" />
							<SegmentedControl
								ariaLabel="Map labels"
								options={LABEL_OPTIONS}
								active={showLabels ? 'show' : 'hide'}
								onSelect={(v) => onToggleLabels(v === 'show')}
							/>
						</div>
					{/if}
					{@render expertContent?.()}
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	</CustomControl>
{/if}
