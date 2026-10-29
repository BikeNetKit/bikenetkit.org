<script>
	// Terminal-styled, read-only code block for "how to run this tool" samples.
	// Brand-tinted: paper-brand chrome over a paper-white body, ink text. Only the three window
	// dots sit outside the palette (see --color-terminal-dot-* in layout.css) — they are, with the
	// prompt, the cue that the block is a shell/REPL session. No copy button by design: static,
	// selectable text.
	// Each line is its own <span>, and the prompt is drawn as a ::before pseudo-element rather than
	// as text, so selecting the sample copies the bare commands without the prompts. That is also
	// why `white-space: pre` lives on the line spans, in the scoped style below, and not on the
	// <pre>, which is `whitespace-normal`: with
	// `white-space: pre` on the container, any newline Prettier put between the spans would render
	// as a blank line. Long lines scroll horizontally rather than wrap; a wrapped shell command is
	// a misleading one.
	//
	// The prompt is per-line rather than fixed: a sample is a shell session until a line invokes
	// the Python REPL, from which point statements carry `>>>` and bracket continuations carry
	// `...`, the way a real session looks. Bracket depth is counted outside string literals, so a
	// bracket inside a quoted city name opens nothing. Leaving the REPL again (`exit()`) is
	// deliberately not modelled: no sample does it, and guessing wrong would mislabel every line
	// after it. Prompts render via `attr(data-prompt)`, so they stay pseudo-elements and out of the
	// clipboard exactly like the old fixed `>`.
	/**
	 * @typedef {object} Props
	 * @property {string} code Sample text. Newlines are preserved verbatim — do not indent it to
	 *   match the call site's indentation, that whitespace renders. An empty string renders an
	 *   empty terminal: chrome only, no lines, and the body hidden from assistive tech.
	 * @property {string} [label] Accessible name for the scrollable region.
	 * @property {string} [maxHeight] Tailwind `max-h-*` class for long samples. Omitted = grows to
	 *   content.
	 * @property {string} [minHeight] Tailwind `min-h-*` class. An empty sample needs one: it would
	 *   otherwise collapse to the padding and read as clipped rather than as a placeholder.
	 * @property {boolean} [prompt] Draw a shell/REPL prompt before each line. Pass false for samples
	 *   that are not a sequence of commands.
	 * @property {string} [requirements] Interpreter/version spec shown right-aligned in the title
	 *   bar, e.g. `Python>=3.12`. Absent = no text in the bar.
	 * @property {string} [class]
	 */
	/** @type {Props} */
	let {
		code,
		label = 'Code sample',
		maxHeight = '',
		minHeight = '',
		prompt = true,
		requirements = '',
		class: className = ''
	} = $props();

	// A trailing newline would otherwise render one extra, prompted, blank line. An empty sample has
	// no lines at all rather than one blank prompted one (see `.code-line:empty` below).
	const isEmpty = $derived(code.trim() === '');
	const lines = $derived(isEmpty ? [] : code.replace(/\n$/, '').split('\n'));

	const REPL_ENTRY = /^(python3?|ipython)$/;

	/** Net bracket depth of `line`, ignoring quoted strings and trailing comments. */
	function depthDelta(line) {
		let delta = 0;
		let quote = null;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (quote) {
				if (ch === '\\') i++;
				else if (ch === quote) quote = null;
			} else if (ch === "'" || ch === '"') quote = ch;
			else if (ch === '#') break;
			else if (ch === '(' || ch === '[' || ch === '{') delta++;
			else if (ch === ')' || ch === ']' || ch === '}') delta--;
		}
		return delta;
	}

	/** `[{ text, prompt }]`. Prompts are padded to one width so the commands stay left-aligned; a
	 *  pure-shell sample keeps the bare `> ` it has always had. */
	function withPrompts(sampleLines) {
		let repl = false;
		let depth = 0;
		const marked = sampleLines.map((text) => {
			const mark = !repl ? '>' : depth > 0 ? '...' : '>>>';
			if (repl) depth = Math.max(0, depth + depthDelta(text));
			else if (REPL_ENTRY.test(text.trim())) repl = true;
			return { text, mark };
		});
		const width = Math.max(1, ...marked.map((l) => l.mark.length));
		return marked.map(({ text, mark }) => ({ text, prompt: `${mark.padEnd(width)} ` }));
	}

	const promptedLines = $derived(
		prompt ? withPrompts(lines) : lines.map((text) => ({ text, prompt: undefined }))
	);
</script>

<div
	class="w-full overflow-hidden rounded-sm border border-border-weaker bg-paper-white {className}"
>
	<div
		class="flex items-center justify-between gap-2 border-b border-border-weaker bg-paper-brand px-4 py-3"
	>
		<span class="flex items-center gap-2" aria-hidden="true">
			<span class="h-3 w-3 rounded-full bg-terminal-dot-red"></span>
			<span class="h-3 w-3 rounded-full bg-terminal-dot-amber"></span>
			<span class="h-3 w-3 rounded-full bg-terminal-dot-green"></span>
		</span>
		{#if requirements}
			<p class="text-xs text-ink-alt-weaker">
				Requires <span class="font-mono">{requirements}</span>
			</p>
		{/if}
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- Deliberate: a scrollable region has to be reachable by keyboard so it can be scrolled
	     (WCAG 2.1.1), which is exactly what `role="region"` + `tabindex="0"` + an accessible name
	     is for. Long lines always overflow at narrow widths, so this is unconditional rather than
	     measured. The lint rule does not model the scrollable-region exception. An empty sample is
	     the exception to the exception: nothing to scroll and nothing to announce, so it drops the
	     region entirely and goes `aria-hidden`, like the window dots above. -->
	<pre
		tabindex={isEmpty ? undefined : 0}
		role={isEmpty ? undefined : 'region'}
		aria-label={isEmpty ? undefined : label}
		aria-hidden={isEmpty ? 'true' : undefined}
		class="overflow-auto px-6 py-5 font-mono text-sm leading-relaxed whitespace-normal text-ink {minHeight} {maxHeight}"><code
			class="code-lines"
			class:prompted={prompt}>
			{#each promptedLines as line, i (i)}
				<span class="code-line" data-prompt={line.prompt}>{line.text}</span>
			{/each}
		</code></pre>
</div>

<style>
	/* Block so the line spans are its only children and no anonymous inline box wraps them. */
	.code-lines {
		display: block;
	}

	.code-line {
		display: block;
		white-space: pre;
	}

	/* A pseudo-element, not text: the prompt must not land in the clipboard when the sample is
	   selected and copied. Weakest ink so it reads as chrome, not as part of the command. */
	.prompted .code-line::before {
		content: attr(data-prompt);
		color: var(--color-ink-weakest);
	}

	/* A blank line in a sample is a separator, not a prompt. The no-break space gives the otherwise
	   empty span its line height; like the prompt, it stays out of the clipboard. Must follow the
	   rule above — same specificity, so source order decides. */
	.code-line:empty::before {
		content: '\00a0';
	}
</style>
