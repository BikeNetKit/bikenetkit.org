# BikeNetKit

The website behind **[bikenetkit.org](https://bikenetkit.org)**, a showroom for the BikeNetKit
family of open source planning tools for bicycle networks with interactive maps and background information.

It is aimed at policy makers, sustainable-mobility advocates, and city and transport planners. The underlying algorithms are research software, developed separately and
published under the [BikeNetKit organisation](https://github.com/BikeNetKit). This repository is
only the website that presents them.

In total, this site currently showcases **412 European cities**, five tools, and roughly 1.8 million kilometres of
modelled bicycle network.

## Quick start

**1. Install Node.js (20.12+) and pnpm.** Skip this if `node -v` and `pnpm -v` already work.

macOS:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"  # Homebrew, if missing
brew install node   # Node.js
brew install pnpm   # pnpm
```

Linux:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash  # nvm, the Node version manager
source ~/.nvm/nvm.sh   # load nvm into this shell
nvm install --lts      # Node.js (LTS)
npm install -g pnpm    # pnpm
```

Windows (PowerShell):

```powershell
winget install Git.Git             # Git, if missing
winget install OpenJS.NodeJS.LTS   # Node.js (LTS)
winget install pnpm.pnpm           # pnpm; open a new terminal afterwards so PATH updates
```

**2. Get the code and start it** (the same on every OS):

```sh
git clone https://github.com/BikeNetKit/bikenetkit.org.git  # fetch the repository
cd bikenetkit.org/www   # the app lives in www/
cp .env.example .env    # required config; the defaults work
pnpm install            # install dependencies
pnpm dev                # dev server at http://localhost:5173
```

The clone does not include the display font. Before running `pnpm dev`, download
`BespokeSans_Complete.zip` from [Fontshare](https://www.fontshare.com/fonts/bespoke-sans) and unzip
it into `www/static/fonts/`. `pnpm fonts:check` tells you whether the font is in place.

## The tools

Five of them ship an interactive map on the site, each fed by results computed in advance. No
algorithm runs in the browser.

| Tool | What it shows |
| --- | --- |
| **GrowBikeNet** | Grows a network one street at a time, always adding the street that helps most next |
| **LinkBikeNet** | Connects fragmented networks into one, under three different strategies |
| **FixBikeNet** | Finds the gaps in an existing bicycle network, ranked by how much closing each would help |
| **superblockify** | Partitions a city into low-traffic neighbourhoods and the streets between them |
| **SortBikeNet** | Plans the order in which a network gets built |

Seven further research tools have static sections under `/more-tools`.

## Running it

The [quick start](#quick-start) above is all it takes.

**The `.env` copy is not optional.** SvelteKit imports `PUBLIC_*` variables statically, so an
undefined one is a build error rather than an empty value: without the file, `pnpm build` fails with
`"PUBLIC_BASEMAP_URL" is not exported`. The example file's defaults are all you need, and nothing in
it is secret.

That is enough to browse the site, with one gap you should expect and one caveat about the type.

- The map has no network on it. The per-city GeoJSON (~4.3 GB) is deliberately not in this
  repository; it is served from `data.bikenetkit.org` and fetched in the browser. Set
  `PUBLIC_DATA_URL` in `www/.env` to load it, or leave it empty and the map renders the basemap
  alone. Nothing errors when it is missing, and nothing needs to: the build never reads this data,
  because the page set comes from a committed manifest, so a clean clone builds the complete site
  either way.
- The display face is not in the repo. Bespoke Sans is licensed for this site's use but may not be
  redistributed, so you need your own copy from Fontshare. `pnpm fonts:check` says so and points at
  the download, and everything but the headings works without it.

[www/README.md](www/README.md) covers the stack, the scripts, and the no-external-dependencies
invariant the project is built around. [AGENTS.md](AGENTS.md) is the orientation guide, written for
coding agents and also the fastest way in for a person.

## Updating the data

This needs SSH access to the server, so it is for maintainers. Everything runs from `www/` on the
`dev` branch.

**Once per machine.** Add an SSH alias `bikenetkit` for the server to `~/.ssh/config` (`DEPLOY_HOST`
in `.env` expects it) and log in with a key, not a password. On macOS, install GNU rsync with
`brew install rsync`, because the system rsync stalls on large transfers. Then fetch the existing
screenshots (~610 MB), so the steps below add to them instead of starting from nothing:

```sh
pnpm pull-screenshots
```

**Every update** follows the same six steps:

```sh
pnpm pull-data -- --dry-run    # A. what changed in the export (the filenames name the cities)
pnpm pull-data                 #    fetch and transform; brings the rail stations, schools and
                               #    contact links along
pnpm check:coverage            # B. if either check fails, stop and check with the maintainers
pnpm check:datasets
pnpm dev                       # check if data looks right on local version of the website
                               # C. screenshots, scoped to what changed (see below)
pnpm deploy:data -- --dry-run  # D. upload: look over any "deleting" lines first
pnpm deploy:data
pnpm compress:data
git add src/lib/data && git commit -m "chore: update data from <date> export"   # E.
git push origin dev
pnpm deploy:preview            # F. stage the full site on the preview host (see OPERATIONS.md)

pnpm deploy:site               # if all looks good — deploy live    
```

Keep D before F, or the site lists files the data host does not have yet. If `pull-data` refuses
because the export is much smaller than what is on disk, do not reach for `--force` without
checking with the maintainers.

**Step C depends on what changed.** The screenshot test names follow the pattern
`screenshot <tool>/<city> <variant>`, so `-g` can select cities, a tool, or both. Start `pnpm dev`
in a second terminal for the OG cards.

| What changed                          | Screenshots                                              | OG cards                                                          |
| ------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Some cities                           | `pnpm generate:screenshots -g "(braga_pt\|kerch_ua)"`    | `pnpm generate:og-cards -- --only "(braga_pt\|kerch_ua)" --force` |
| One tool                              | `pnpm generate:screenshots -g "screenshot linkbikenet/"` | `pnpm generate:og-cards -- --only "linkbikenet/" --force`         |
| Everything                            | `pnpm generate:screenshots` (several hours)              | `pnpm generate:og-cards -- --force`                               |
| Rail stations, schools, contact links | none                                                     | none                                                              |

`--force` recaptures cards that already exist, which refreshed data needs; brand-new cities have
none yet, so it does no harm there either. Run `pnpm check:og-cards` afterwards. For a
SuperBlockify update, also run `pnpm check:hulls`.

**Holding a tool back.** If the export carries a new version of a tool you do not want yet, name
the tools you do want, one flag each: `pnpm pull-data -- --tool fixbikenet --tool growbikenet`.
Then reset the held-back tool's entry in `src/lib/data/tool-versions.json` by hand, because every
run rewrites it from the export.

**Correcting rail stations, schools or contact links.** These are not part of any tool export. They
live on the server in `dataexports/context/` (`rail_stations_geojson/`, `schools_geojson/`,
`contact_links/`). Upload the corrected file there, then run the steps above:

```sh
rsync -a bnk_contact_links.csv bikenetkit:~/bikenetkit/dataexports/context/contact_links/
```

[ADD_A_CITY.md](ADD_A_CITY.md) walks the same path for a single city, including what each check
catches. [www/DEPLOY_DATA.md](www/DEPLOY_DATA.md) explains how the data host is laid out.

## Dependencies

This site is designed to work for years without maintenance. That shapes most of the architecture,
and it is the constraint to check any change against: **nothing loads from a third-party origin at
runtime.** No CDN scripts, hosted fonts, tile services or embeds. The basemap is a self-hosted
PMTiles archive, the fonts are served from the site's own origin, and the build is fully static with
no Node runtime in production.

## Documentation

| Document | Covers |
| --- | --- |
| [www/README.md](www/README.md) | Stack, scripts, project structure |
| [www/DESIGN.md](www/DESIGN.md) | Visual system and design tokens |
| [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md) | What the importer expects from a tool export |
| [EDIT_CONTENT.md](EDIT_CONTENT.md) | Changing the text, without touching the data |
| [ADD_A_CITY.md](ADD_A_CITY.md) | Adding a city to the catalogue |
| [ADD_A_TOOL.md](ADD_A_TOOL.md) | Adding a tool |
| [OPERATIONS.md](OPERATIONS.md) | Server layout, deploys, TLS, triage |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Credits

Built by [Moritz Stefaner](https://truth-and-beauty.net) for the BikeNetKit project, led by
Michael Szell. The algorithms are the work of the individual tool authors, credited on each tool's
page and in its own repository.

## Supported by
Development of BikeNetKit is supported by the [Innovation Fund Denmark](https://innovationsfonden.dk/en) and the EU HORIZON project [JUST STREETS](https://www.just-streets.eu).

[![Innovation Fund Denmark](https://raw.githubusercontent.com/BikeNetKit/.github/refs/heads/main/profile/_static/logo_innovationfund.png)](https://innovationsfonden.dk/en) &emsp;&emsp; [![European Union](https://raw.githubusercontent.com/BikeNetKit/.github/refs/heads/main/profile/_static/logo_eu.png)](https://commission.europa.eu/index_en) &ensp; [![JUST STREETS](https://raw.githubusercontent.com/BikeNetKit/.github/refs/heads/main/profile/_static/logo_juststreets.png)](https://www.just-streets.eu/) 

## Licence

Code is **[AGPL-3.0-or-later](LICENSE)**, © 2026 Moritz Stefaner. Note the AGPL's § 13: running a
modified version of this site publicly obliges you to offer its source.

Other components carry their own terms:

| Component | Terms |
| --- | --- |
| Public Sans, IBM Plex Mono, Noto Sans | SIL OFL 1.1, bundled with their licences |
| Bespoke Sans | ITF FFL, not redistributable; not in this repo, download it from Fontshare |
| Basemap | © OpenStreetMap contributors (ODbL), via Protomaps |
| Tool results | Per upstream tool; served separately, not in this repo |
