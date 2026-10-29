# Contributing to the BikeNetKit website

Thanks for looking. This repository is the **website** at
[bikenetkit.org](https://bikenetkit.org) — a SvelteKit app. It is not one of the Python tools, so
the org-wide [CONTRIBUTING guide](https://github.com/BikeNetKit/.github/blob/main/CONTRIBUTING.md)
(pixi, pytest, ruff, sphinx) does not apply here; this file replaces it. The
[Code of Conduct](https://github.com/BikeNetKit/.github/blob/main/CODE_OF_CONDUCT.md) does apply,
and everyone participating is expected to uphold it.

## What kind of contribution fits

The site is built to run for years without maintenance, which makes it an unusual codebase to
contribute to. Changes that fit that goal are very welcome:

- **Bug reports** — especially anything that renders wrongly in a browser we have not tested.
- **Accessibility and mobile fixes.** The accessibility (a11y) pass is best-effort, not certified, and reports of
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

You need Node ≥ 20.12 and pnpm; `engine-strict` is on, so a wrong Node version fails immediately
rather than mysteriously. [README.md § Quick start](README.md#quick-start) shows how to install
both.

```sh
git clone https://github.com/BikeNetKit/bikenetkit.org.git
cd bikenetkit.org/www
cp .env.example .env   # required: PUBLIC_* variables are imported statically
pnpm install           # also installs the Chromium that the tests use
# add the display font (see § Fonts below), then:
pnpm dev
```

Nothing in the example file is secret. To see the bicycle networks on the maps, set
`PUBLIC_DATA_URL=https://data.bikenetkit.org` in `www/.env`. Without it the maps show the basemap
and a "Could not load" notice, which is expected and not a bug you need to fix.

## Before you open a pull request

```sh
pnpm lint     # prettier + eslint
pnpm check    # svelte-check, and it does type-check .svelte files
```

Both must be clean. CI ([.github/workflows/lint.yml](.github/workflows/lint.yml)) runs both on
every pull request and every push to `dev`, and `pnpm lint` fails it on any unformatted file, so
run `pnpm format` first if Prettier complains. If you open the repository root in VS Code and
install the recommended Prettier extension, files under `www/` are formatted on save with the
project's config. The repo-root docs are left alone on purpose, because Prettier's markdown parser
corrupts them.

**Verify in the browser** too, and say in the PR what you checked. Neither `pnpm check` nor
`pnpm test` catches a visual or CSS regression. `pnpm build` is slow, so use the dev server unless
a change genuinely cannot be verified there.

## Testing

`pnpm test` runs a Playwright smoke suite (`www/tests/*.e2e.ts`). It covers every top-level route,
each tool's default map, the degraded states and navigation, in under half a minute. It checks app
state and the DOM, never pixels.

The suite runs against whatever answers at `PW_BASE_URL`, which defaults to
`http://localhost:4173`, the port `pnpm preview` uses. When nothing answers there, it builds the
site and starts a preview first, which is slow. While you work, point it at the dev server instead:

```sh
pnpm dev                                      # in one terminal
PW_BASE_URL=http://localhost:5173 pnpm test   # in another
```

The map checks need the data, so set `PUBLIC_DATA_URL` as above. `pnpm check:a11y` runs the
accessibility suite (axe, aria snapshots, keyboard paths) against the same server. CI runs neither
suite, so run them yourself before a PR that touches routes or the map. Before adding cases, read
the two traps listed under `pnpm test` in [AGENTS.md](AGENTS.md#common-commands-run-from-www).

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `feat(map): …`,
  `fix(cities): …`, `chore(data): …`. This differs from the org's capitalised-imperative
  convention; the scopes carry useful signal in a repo with this many documentation commits.
- **Branches** use the org form: `feature/short-description`, lowercase, hyphenated. **Open pull
  requests against `dev`**, not `main`; GitHub then requests a review from the maintainers
  ([.github/CODEOWNERS](.github/CODEOWNERS)). `dev` is the integration branch. `main` records what
  is live on `bikenetkit.org`, and only the maintainers move it, when the site is published
  ([OPERATIONS.md § Deploying](OPERATIONS.md#deploying)).
- **Semantic colour tokens only** in templates: `bg-brand`, `text-ink`, `border-brand-subtle`.
  Raw hex belongs in `src/lib/colors.js`, plus the basemap palette in
  `src/lib/map-style/theme.js`, and nowhere else. [www/DESIGN.md](www/DESIGN.md) is the spec, and
  `/design` in the dev server renders it live.
- **Global styles live only in `src/routes/layout.css`.** There is no `app.css`.

## The constraint to check every change against

**Nothing may load from a third-party origin at runtime.** No CDN scripts, no hosted fonts, no tile
services, no embeds, no analytics. The site must keep working when every external service it might
have used has changed its terms, its URLs, or disappeared. It is easy to break by accident: a
component library that injects a stylesheet link, a map control that links out to an API.
[www/README.md § No external runtime dependencies](www/README.md#no-external-runtime-dependencies)
explains how to check what the browser actually requests, which is the only reliable test.

## Fonts

Bespoke Sans, the display face, may not be redistributed, so it is not in this repository and you
need your own copy; [www/README.md § Fonts](www/README.md#fonts) says where to get it and what not
to do with it. `.gitignore` keeps it out of commits, and so does the optional pre-commit hook
(`pre-commit install`, configured in [.pre-commit-config.yaml](.pre-commit-config.yaml)).
Everything else builds and runs without it.

## Licence

Contributions are accepted under the [AGPL-3.0-or-later](LICENSE), the licence this project ships
under.
