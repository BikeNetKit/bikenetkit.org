# BikeNetKit

The website behind **[bikenetkit.org](https://bikenetkit.org)**, a showroom for the BikeNetKit
family of open-source planning tools for bicycle networks. It presents the tools with interactive
maps and background information for policy makers, sustainable-mobility advocates, and city and
transport planners.

The algorithms themselves are research software, developed separately and published under the
[BikeNetKit organisation](https://github.com/BikeNetKit). This repository is only the website that
presents them: 400+ European cities and five interactive tools.

## Quick start

**1. Install Node.js (20.12+) and pnpm.** Skip this if `node -v` and `pnpm -v` already work.

- macOS, with [Homebrew](https://brew.sh): `brew install node pnpm`
- Linux, with [nvm](https://github.com/nvm-sh/nvm): `nvm install --lts && npm install -g pnpm`
- Windows, in PowerShell: `winget install OpenJS.NodeJS.LTS`, then `winget install pnpm.pnpm`
  (and `winget install Git.Git` if Git is missing). Open a new terminal afterwards so `PATH`
  updates.

**2. Get the code, add the font, and start it** (the same on every OS):

```sh
git clone https://github.com/BikeNetKit/bikenetkit.org.git  # fetch the repository
cd bikenetkit.org/www   # the app lives in www/
cp .env.example .env    # required, or the build fails; the defaults work, nothing is secret
pnpm install            # install dependencies (and the Chromium that the tests use)
```

> [!WARNING]
> The clone does not include the display font. Bespoke Sans is licensed for this site's use but may
> not be redistributed. Download `BespokeSans_Complete.zip` from
> [Fontshare](https://www.fontshare.com/fonts/bespoke-sans) and unzip it into `www/static/fonts/`.
> `pnpm fonts:check` tells you whether it is in place; [www/README.md § Fonts](www/README.md#fonts)
> has the details. Without it, everything but the headings still works.

```sh
pnpm dev                # dev server at http://localhost:5173
```

**The map shows no bicycle network until you point it at the data.** The per-city GeoJSON (several
GB) is not in this repository. It is served from `data.bikenetkit.org` and fetched in the browser,
which allows requests from any origin, localhost included. To load it, set
`PUBLIC_DATA_URL=https://data.bikenetkit.org` in `www/.env`. Left empty, the map pages show the
basemap with a "Could not load" notice. The build never reads the data, so a clean clone builds
the complete site either way
([www/DEPLOY_DATA.md § The build is independent of the data](www/DEPLOY_DATA.md#the-build-is-independent-of-the-data)).

## The tools

Five of them ship an interactive map on the site, each fed by results computed in advance. No
algorithm runs in the browser.

| Tool | What it shows |
| --- | --- |
| **GrowBikeNet** | Grows a network one street at a time, always adding the street that helps most next |
| **LinkBikeNet** | Connects fragmented networks into one, under three different strategies |
| **FixBikeNet** | Finds the gaps in an existing bicycle network, ranked by how much closing each would help |
| **superblockify** | Partitions a city into low-traffic neighbourhoods and the streets between them |
| **SortBikeNet** | Plans the order in which a network gets built (Paris only) |

Further research tools have static sections under `/more-tools`.

## Design constraint

The site is built to keep working for years without maintenance, so **nothing loads from a
third-party origin at runtime**. [www/README.md § No external runtime dependencies](www/README.md#no-external-runtime-dependencies)
explains what that rules out and how it is checked.

## For maintainers: updating the data

This needs SSH access to the server. Everything runs from `www/` on the `dev` branch.

**Once per machine.** Add an SSH alias `bikenetkit` for the server to `~/.ssh/config` (`DEPLOY_HOST`
in `.env` expects it) and log in with a key, not a password. On macOS, install GNU rsync with
`brew install rsync`, because the system rsync stalls on large transfers. Then fetch the existing
screenshots (several hundred MB), so the steps below add to them instead of starting from nothing:

```sh
pnpm pull-screenshots
```

**Every update** follows the same steps:

```sh
pnpm pull-data -- --dry-run    # A. what changed in the export (the filenames name the cities)
pnpm pull-data                 #    fetch and transform; brings the rail stations, schools and
                               #    contact links along
pnpm check:coverage            # B. if either check fails, stop and check with the maintainers
pnpm check:datasets
pnpm dev                       #    look over the new data in the local site
                               # C. screenshots, scoped to what changed (see below)
pnpm deploy:data -- --dry-run  # D. upload: look over any "deleting" lines first
pnpm deploy:data
pnpm compress:data
git add src/lib/data && git commit -m "chore: update data from <date> export"   # E.
git push origin dev
pnpm deploy:preview            # F. stage the full site on the preview host and check it there
git checkout main && git merge --ff-only dev   # then publish: main records what is live
pnpm deploy:site -- --skip-build               # ships the build you just checked
git push origin main dev
```

Keep D before F, or the site lists files the data host does not have yet. If `pull-data` refuses
because the export is much smaller than what is on disk, do not reach for `--force` without
checking with the maintainers. [OPERATIONS.md § Deploying](OPERATIONS.md#deploying) explains the
release flow and the preview host.

**Step C depends on what changed.** The screenshot test names follow the pattern
`screenshot <tool>/<city> <variant>`, so `-g` can select cities, a tool, or both. The OG cards
(the per-city Open Graph preview images) are captured from a running `pnpm dev`, so keep it open in
a second terminal.

| What changed | Screenshots | OG cards |
| --- | --- | --- |
| Some cities | `pnpm generate:screenshots -g "(braga_pt\|kerch_ua)"` | `pnpm generate:og-cards -- --only "(braga_pt\|kerch_ua)" --force` |
| One tool | `pnpm generate:screenshots -g "screenshot linkbikenet/"` | `pnpm generate:og-cards -- --only "linkbikenet/" --force` |
| Everything | `pnpm generate:screenshots` (several hours) | `pnpm generate:og-cards -- --force` |
| Rail stations, schools, contact links | none | none |

`--force` recaptures cards that already exist, which refreshed data needs; brand-new cities have
none yet, so it does no harm there either. Run `pnpm check:og-cards` afterwards. For a
superblockify update, also run `pnpm check:hulls`.

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

## Documentation

| Document | Covers |
| --- | --- |
| **Contributing** | |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute: setup, checks, tests, conventions |
| [EDIT_CONTENT.md](EDIT_CONTENT.md) | Changing the text, without touching the data |
| [ADD_A_CITY.md](ADD_A_CITY.md) | Adding a city to the catalogue |
| [ADD_A_TOOL.md](ADD_A_TOOL.md) | Adding a tool |
| [AGENTS.md](AGENTS.md) | Orientation guide, written for coding agents; also the fastest way in for a person |
| **Operating** (maintainers, SSH to the server) | |
| [OPERATIONS.md](OPERATIONS.md) | Server layout, deploys, TLS, triage |
| [www/DEPLOY_NGINX.md](www/DEPLOY_NGINX.md) | Serving the static site with nginx |
| [www/DEPLOY_TILES.md](www/DEPLOY_TILES.md) | Building and serving the self-hosted basemap |
| [www/DEPLOY_DATA.md](www/DEPLOY_DATA.md) | The off-repo GeoJSON host |
| [www/DEPLOY_STATS.md](www/DEPLOY_STATS.md) | Cookieless visitor stats from the server logs |
| **Reference** | |
| [www/README.md](www/README.md) | Stack, everyday scripts, project structure |
| [www/DESIGN.md](www/DESIGN.md) | Visual system and design tokens |
| [www/DATA_CONTRACT.md](www/DATA_CONTRACT.md) | What the importer expects from a tool export |
| [www/DOCS_MAP_INTEGRATION.md](www/DOCS_MAP_INTEGRATION.md) | Using the site's basemap and colours in the docs site |

## Credits

Built by [Moritz Stefaner](https://truth-and-beauty.net) for the BikeNetKit project, led by
Michael Szell. The algorithms are the work of the individual tool authors, credited on each tool's
page and in its own repository.

## Supported by

Development of BikeNetKit is supported by the
[Innovation Fund Denmark](https://innovationsfonden.dk/en) and the EU HORIZON project
[JUST STREETS](https://www.just-streets.eu).

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
