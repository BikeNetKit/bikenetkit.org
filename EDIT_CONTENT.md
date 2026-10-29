# Changing website contents

The website's words live in this repository. The data (the GeoJSON, the city catalogue, the per-tool
metrics) lives outside it and arrives through a data refresh, which needs SSH access to the server.
[ADD_A_CITY.md](ADD_A_CITY.md) and [ADD_A_TOOL.md](ADD_A_TOOL.md) cover that direction; this page
covers the other.

## The loop

Everything runs from `www/`.

```sh
pnpm dev      # edit, save, the page reloads
pnpm lint     # prettier + eslint
pnpm check    # svelte-check
```

Open a pull request against `dev`, as [CONTRIBUTING.md](CONTRIBUTING.md) describes. The
maintainers publish it ([OPERATIONS.md § Deploying](OPERATIONS.md#deploying)); a text edit needs
nothing extra there.

You do not need `www/data/` on disk for any of this. Without it the maps draw the basemap with no
network on it, while every word you are there to change renders exactly as it will on the live
site. Site copy is American English (`color`, `neighborhood`), as
[AGENTS.md § Conventions](AGENTS.md#conventions) sets out.

## Where the words are

| What | File |
| --- | --- |
| Site name, tagline, description, contact addresses, legal "last updated" date | [site.js](www/src/lib/site.js) |
| Tool names, descriptions, the question each tool answers, links to paper/repo/docs/tutorial, the "Run it yourself" commands | [tools.json](www/src/lib/data/tools.json) |
| Hero headline and tagline | [HeroSection.svelte](www/src/lib/components/landing/HeroSection.svelte) |
| The "what the problem is, what the tools do" prose on the landing page | [ProblemSolutionExplainer.svelte](www/src/lib/components/landing/ProblemSolutionExplainer.svelte) |
| Team members, funders, news entries, the labels under the three big numbers | [landing.ts](www/src/lib/data/landing.ts) |
| The rest of the landing grid, and the footer | [InfoGrid.svelte](www/src/lib/components/landing/InfoGrid.svelte), [SiteFooter.svelte](www/src/lib/components/SiteFooter.svelte) |
| A map page's opening line and "apply when" line (`toolIntro()`, `toolApplyWhen()`), panel headings on the map controls, and the sentence explaining each option | [control-copy.ts](www/src/lib/data/control-copy.ts) |
| Legend, tooltip and HUD (the on-map readout) labels, and the units numbers are shown in | [metric-meta.ts](www/src/lib/data/metric-meta.ts) |
| How each map's headline number is derived: the (?) popover on the metric panel | [metric-help.ts](www/src/lib/data/metric-help.ts) |
| Page titles, meta descriptions and JSON-LD | [meta.js](www/src/lib/data/meta.js) |
| Legal, privacy and credits | [legal/+page.svelte](www/src/routes/legal/+page.svelte) |
| The `/more-tools` page | [more-tools/+page.svelte](<www/src/routes/(app)/more-tools/+page.svelte>) |
| The plain-text summary for LLMs | [llms.txt](www/static/llms.txt) |

`tools.json` has more reach than any of the others. A tool's `name` appears everywhere the tool
does. Its `shortDescription` is the meta description of its pages, the line under its heading on
each city page, the text screen readers and crawlers get before a map loads, the caption on its
per-city Open Graph cards (the preview images shown when a page is shared), and the fallback
opening line of the map's info panel. On the landing grid, an active tool's card shows
`questionAnswered` instead. `longDescription` is the paragraph at the top of the tool page, and of
a static tool's section on `/more-tools`. One edit there usually covers every page.

For anything the table doesn't name, the running site can point at the file itself. Press
**Alt+Shift** on a `pnpm dev` page to turn the Svelte inspector on, hover to highlight the component
under the cursor, and click to open its source in VS Code at that line. Alt+Shift again turns it
off. The key combo is set in [svelte.config.js](www/svelte.config.js), and the `dev` script picks
the editor through `LAUNCH_EDITOR=code`.

The inspector finds the component, which is not always where the words are: click a tool card and
you land in `ToolCard.svelte`, whose text comes in as props from `tools.json`. Follow the prop back
to its source, or check the table above.

## What you don't have to run

- `pnpm pull-data`, `pnpm update-data` and `pnpm deploy:data`, since nothing under `www/data/`
  changes.
- `pnpm generate:screenshots`. The screenshots are map renders captured with labels, legend and
  controls switched off, so no text in this repository appears in them.
- `pnpm build`. It is slow, and the dev server shows you the same words.

## The text changes that need a second step

- **Renaming a tool.** Re-run `pnpm generate:og` and commit the changed PNGs under
  `www/static/og/`, because the per-tool social cards render the tool's name as artwork. Changing
  its _slug_ is a route change rather than a text change: open an issue first.
- **A new `name` or `shortDescription`.** The per-city Open Graph cards bake both in, so the
  maintainers regenerate them after the change is merged (`pnpm generate:og-cards -- --only
  "<slug>/" --force` against a running `pnpm dev`, then `pnpm deploy:data`). Mention it in the pull
  request. Until then the old wording keeps showing in shared links.
- **A reworded tool description, or a new paper or repo link**, has to be mirrored into
  [www/static/llms.txt](www/static/llms.txt) in the same pull request. Nothing generates that file,
  and `pnpm check:build-output` catches a tool missing from it but not a stale description. Its
  long companion, `llms-full.txt`, is generated from `tools.json` and `control-copy.ts`, so it
  follows on its own.
- **A new `tutorial` URL** (a `https://www.youtube.com/watch?v=…` link) needs its thumbnail too:
  run `pnpm generate:tutorial-thumbs` and commit the image it writes to
  `www/src/lib/assets/media/tutorials/`, or the tool page shows a plain button instead.
- **Legal text** carries a date. Bump `LEGAL_LAST_UPDATED` in [site.js](www/src/lib/site.js)
  whenever you change the page, since that is how a reader tells versions apart.
- **The contact addresses** in `site.js` gate the deploy, which refuses to run while either still
  holds its `REPLACE-ME` placeholder. Keep them real.

## What looks like text but is data

These files under `www/src/lib/data/` are written by scripts, and a hand edit to any of them
disappears at the next run:

| File | Written by |
| --- | --- |
| `cities.json`, `city-boundaries.json`, `data-files.json`, `site-stats.json`, `tool-versions.json` | `pnpm update-data` |
| `contact-links.json` (the "Take action!" links) | `pnpm import:contacts` |
| `context-points.json` | `pnpm import:context` |
| `og-cards.json` | `pnpm generate:og-cards` |

So a wrong city display name is fixed upstream rather than here: it is the `name_en` column of
`cities.csv`, published in [BikeNetKit/dataexport](https://github.com/BikeNetKit/dataexport) as
`cities/meta/cities.csv`. Open an issue there or here, and the fix reaches the site with the next
data refresh. The numbers on the landing page come from `site-stats.json` and the city count, so
only their labels are copy. The tool version shown on each tool page describes the data behind that
page, not the website's own release.

`tools.json` sits in the same directory and is the exception: `update-data` validates it and never
writes it, so it is yours to edit.

## Before you commit

`pnpm lint` and `pnpm check` both have to be clean. `check` catches a renamed field that a template
still reads, which is the realistic way a copy edit breaks a page.

This repository is public, so also run the public-safety check. It scans **staged** files for
things that must not be published, like server addresses and paths from a maintainer's machine,
which are easy to paste in while editing prose. Run it after `git add`:

```sh
node scripts/check-public-safety.mjs          # staged files
node scripts/check-public-safety.mjs --all    # the whole tracked tree
```

[.pre-commit-config.yaml](.pre-commit-config.yaml) runs it as a git hook, but only once you have
opted in with `pre-commit install` (from the repository root, with
[pre-commit](https://pre-commit.com) installed). CI does not run it: the workflow in
[.github/workflows/lint.yml](.github/workflows/lint.yml) runs `pnpm lint` and `pnpm check` only.
