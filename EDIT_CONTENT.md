# Changing website contents

The website contents live in this repository. The data (the GeoJSON, the city catalogue, the per-tool
metrics) lives outside it and arrives through `pnpm pull-data`, which is slow and has failure modes
of its own. [ADD_A_CITY.md](ADD_A_CITY.md) and [ADD_A_TOOL.md](ADD_A_TOOL.md) cover that direction;
this covers the other.

## The loop

Everything runs from `www/`.

```sh
pnpm dev      # edit, save, the page reloads
pnpm lint     # prettier + eslint
pnpm check    # svelte-check
```

Commit on `dev`. Publishing is [OPERATIONS.md](OPERATIONS.md) § Deploying, and is unchanged for a
text edit.

You do not need `www/data/` on disk for any of this. Without it the maps draw the basemap with no
network on it, while every word you are there to change renders exactly as it will on the live site.

## Where the words are

| What                                                                                              | File                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Site name, tagline, description, contact addresses, legal "last updated" date                     | [site.js](www/src/lib/site.js)                                                                                                   |
| Tool names, short and long descriptions, links to paper/repo/docs, the "Run it yourself" commands | [tools.json](www/src/lib/data/tools.json)                                                                                        |
| Hero headline and tagline                                                                         | [HeroSection.svelte](www/src/lib/components/landing/HeroSection.svelte)                                                          |
| The "what the problem is, what the tools do" prose on the landing page                            | [ProblemSolutionExplainer.svelte](www/src/lib/components/landing/ProblemSolutionExplainer.svelte)                                |
| Team members, funders, news entries, the labels under the three big numbers                       | [landing.ts](www/src/lib/data/landing.ts)                                                                                        |
| The rest of the landing grid, and the footer                                                      | [InfoGrid.svelte](www/src/lib/components/landing/InfoGrid.svelte), [SiteFooter.svelte](www/src/lib/components/SiteFooter.svelte) |
| Panel headings on the map controls, and the sentence explaining each option                       | [control-copy.ts](www/src/lib/data/control-copy.ts)                                                                              |
| Legend, tooltip and HUD labels, and the units numbers are shown in                                | [metric-meta.ts](www/src/lib/data/metric-meta.ts)                                                                                |
| How each map's headline number is derived: the (?) popover on the metric panel                    | [metric-help.ts](www/src/lib/data/metric-help.ts)                                                                                |
| Page titles, meta descriptions and JSON-LD                                                        | [meta.js](www/src/lib/data/meta.js)                                                                                              |
| Legal, privacy and credits                                                                        | [legal/+page.svelte](www/src/routes/legal/+page.svelte)                                                                          |
| The `/more-tools` page                                                                            | [more-tools/+page.svelte](<www/src/routes/(app)/more-tools/+page.svelte>)                                                        |
| The plain-text summary for LLMs                                                                   | [llms.txt](www/static/llms.txt)                                                                                                  |

`tools.json` has more reach than any of the others. A tool's `name` and `shortDescription` appear on
its own page, on the landing showcase card, in the sidebar, on `/more-tools`, and in the page title
and meta description, so one edit there is usually the whole job. Its `longDescription` is the
paragraph at the top of the tool page. Nothing else needs touching to keep those in agreement.

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
- `pnpm build`. It is slow, and the dev server shows you the same words. The deploy builds.

## The text changes that do need a second step

- If you rename a tool, re-run `pnpm generate:og` and commit the changed PNGs under
  `www/static/og/`, because the social cards render the tool's name as artwork. Changing its _slug_
  is a route change rather than a text change, and [ADD_A_TOOL.md](ADD_A_TOOL.md) covers it.
- A reworded tool description, or a new paper or repo link, has to be mirrored into
  [www/static/llms.txt](www/static/llms.txt) in the same commit. Nothing generates that file.
  `pnpm check:build-output` catches a tool missing from it, but not a stale description, so the
  wording still drifts silently.
- Legal text carries a date. Bump `LEGAL_LAST_UPDATED` in [site.js](www/src/lib/site.js) whenever
  you change the page, since that is how a reader tells versions apart.
- The contact addresses gate the deploy, which refuses to run on unset ones. Keep them real.

## What looks like text but is data

These files are written by `pnpm update-data` from the export: `cities.json`,
`city-boundaries.json`, `data-files.json`, `site-stats.json` and `tool-versions.json`. A hand edit
to any of them works, survives review, and then disappears at the next data refresh with nothing to
show it ever existed.

So a wrong city display name is fixed in `meta/cities.csv` in the export rather than here; see
[ADD_A_CITY.md](ADD_A_CITY.md) § 3. The numbers on the landing page come from `site-stats.json` and
the city count and change when the data does, so only their labels are copy. The tool version shown
on each tool page describes the data behind that page, not the website's own release.

`tools.json` sits in the same directory and is the exception: `update-data` validates it and never
writes it, so it is yours to edit. A new `tutorial` URL (a `https://www.youtube.com/watch?v=…` link) needs
its thumbnail too: run `pnpm generate:tutorial-thumbs` and commit the image it writes to
`www/src/lib/assets/media/tutorials/`, or the tool page shows a plain button instead.

## Before you commit

`pnpm lint` and `pnpm check` both have to be clean. `check` catches a renamed field that a template
still reads, which is the realistic way a copy edit breaks a page.

This repository is published, so run

```sh
node scripts/check-public-safety.mjs
```

before committing. It scans staged files for things that must not be public, like server addresses
and paths from a maintainer's machine, which are easy to paste in while editing prose. Nothing wires
it up as a git hook, so you have to run it yourself.
