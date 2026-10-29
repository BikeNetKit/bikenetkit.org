import { MediaQuery } from 'svelte/reactivity';

// One shared listener for the reader's reduced-motion setting, live rather than read once at
// mount. SSR resolves to the fallback (motion allowed); the CSS side is the global
// `prefers-reduced-motion` block in layout.css, which needs no hydration.
export const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce', false);
