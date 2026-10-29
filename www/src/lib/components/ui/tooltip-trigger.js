// A tooltip trigger's props assume a <button>, so `type` and `tabindex` go. So does
// `aria-describedby`: bits-ui points it at an element that does not carry the id. Callers put the
// tooltip's sentence in sr-only text instead, read on focus rather than only once the tooltip opens.
const NOT_FOR_NON_BUTTONS = new Set(['type', 'tabindex', 'aria-describedby']);

/** @param {object} props */
export function asNonButtonProps(props) {
	// A spread, not `Object.entries`: bits-ui attaches the trigger ref under a Symbol key.
	const rest = { ...props };
	for (const key of NOT_FOR_NON_BUTTONS) delete rest[key];
	return rest;
}
