# Contributing to the BikeNetKit website

Thanks for looking. This repository is the **website** at
[bikenetkit.org](https://bikenetkit.org) — a SvelteKit app. It is not one of the Python tools, so
the org-wide [CONTRIBUTING guide](https://github.com/BikeNetKit/.github/blob/main/CONTRIBUTING.md)
(pixi, pytest, ruff, sphinx) does not apply here; this file replaces it. The
[Code of Conduct](https://github.com/BikeNetKit/.github/blob/main/CODE_OF_CONDUCT.md) does apply,
and everyone participating is expected to uphold it.

## What kind of contribution fits

The site is built to run for about eight years without maintenance, which makes it an unusual
codebase to contribute to. Changes that fit that goal are very welcome:

- **Bug reports** — especially anything that renders wrongly in a browser we have not tested.
- **Accessibility and mobile fixes.** The a11y pass is best-effort, not certified, and reports of
  real problems are more useful than an audit tool's output.
- **Content and copy corrections**, including in the tool descriptions.
  [EDIT_CONTENT.md](EDIT_CONTENT.md) says where each piece of text lives and what a text-only change
  does and does not need.
- **Small, self-contained fixes** with a clear before and after.

Two things to raise as an issue before writing code, because they are likely to be declined on
longevity grounds rather than on merit: **new runtime dependencies**, and **large refactors**. The
first is a hard constraint (see below); the second trades a maintenance cost we can predict for one
we cannot.

## Getting set up

```sh
git clone https://github.com/BikeNetKit/bikenetkit.org.git
cd bikenetkit.org/www
cp .env.example .env
pnpm install
pnpm dev
```

Copying `.env.example` is required, not a nicety: `PUBLIC_*` variables are imported statically, so
a missing one fails the build outright rather than defaulting to empty. Nothing in the example file
is secret.

Node ≥ 20.12 and pnpm; `engine-strict` is on, so a wrong Node version fails immediately rather than
mysteriously. [README.md](README.md) explains what you will and will not see without the data and
the display font — both absences are quiet, and neither is a bug you need to fix.

## Before you open a pull request

```sh
pnpm lint     # prettier + eslint
pnpm check    # svelte-check, and it does type-check .svelte files
```

Both must be clean. `pnpm test` currently runs nothing — there is no e2e suite yet, so **verify in
the browser** and say in the PR what you checked. A clean `pnpm check` does not catch a visual or
CSS regression.

`pnpm build` is slow. Use the dev server unless a change genuinely cannot be verified there.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org) — `feat(map): …`,
  `fix(cities): …`, `chore(data): …`. This differs from the org's capitalised-imperative convention;
  the whole history here uses this form, and the scopes carry useful signal in a repo with this many
  documentation commits.
- **Branches** use the org form: `feature/short-description`, lowercase, hyphenated. **Open pull
  requests against `dev`**, not `main`. `dev` is the integration branch, built onto the password-gated
  preview host by `pnpm deploy:preview`; `main` records what is live on `bikenetkit.org` and moves only when the site is
  published.
- **Semantic colour tokens only** in templates — `bg-brand`, `text-ink`, `border-brand-subtle`. Raw
  hex belongs in `src/lib/colors.js` and nowhere else. [www/DESIGN.md](www/DESIGN.md) is the spec,
  and `/design` in the dev server renders it live.
- **Global styles live only in `src/routes/layout.css`.** There is no `app.css`.

## The constraint to check every change against

**Nothing may load from a third-party origin at runtime.** No CDN scripts, no hosted fonts, no tile
services, no embeds, no analytics. The site must keep working when every external service it might
have used has changed its terms, its URLs, or disappeared.

This is easy to break by accident — a component library that injects a stylesheet link, a map
control that links out to an API. `www/README.md` § No external runtime dependencies explains how to
check what the browser actually requests, which is the only reliable test.

## Fonts

Bespoke Sans is licensed for this site's own use and **may not be redistributed**, so it is not in
this repository and you need your own copy. `pnpm fonts:check` runs on dev, build and lint and tells
you where to get it if it is missing; `.gitignore` and the public-safety pre-commit hook keep it
from being committed. Do not subset or convert the files — § 02
of its licence forbids both. Everything else builds and runs without it; only the display face and
`/design`'s logo generator are affected.

## Licence

Contributions are accepted under the [AGPL-3.0-or-later](LICENSE), the licence this project ships
under.
