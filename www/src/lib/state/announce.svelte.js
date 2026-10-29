// One polite live region for the whole site (`Announcer.svelte`, mounted in the root layout). A
// live region only speaks *changes* to content already in the page, so one that mounts together
// with its text is often silent; this one is always there, and components hand it the sentence.
// Use it for state changes the reader caused or is waiting on, not for every value on screen.

let message = $state('');
/** @type {ReturnType<typeof setTimeout> | undefined} */
let pending;

export const announcer = {
	get message() {
		return message;
	}
};

/** @param {string} text */
export function announce(text) {
	// Cleared first and set a beat later, so the same sentence twice in a row is still spoken.
	message = '';
	clearTimeout(pending);
	pending = setTimeout(() => (message = text), 50);
}
