import { MediaQuery } from 'svelte/reactivity';

// One shared listener. `compact` means phone-shaped: the map's floating rail and the app sidebar
// both give way to overlays below this width. Matches Tailwind's `md` floor — keep the number and
// the `max-md:`/`md:` classes in the components in sync.
//
// SSR/prerender resolves to the fallback (false = desktop), so anything that *renders* differently
// on compact must ALSO carry `md:hidden` / `hidden md:…` so the correct chrome is visible before
// hydration. This rune is only for things CSS cannot express — picking a portal target, and the
// `insetLeft` number handed to CitiesMap.
export const compact = new MediaQuery('max-width: 767px', false);
