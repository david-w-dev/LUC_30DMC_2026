# LUC Vector Map

A terminal-controlled South Wales map with a vector CRT display, glow and phosphor sustain. This is the working web demo migrated into source modules for GitHub Pages.

## Run locally

Requires Python 3 for the development server; no npm dependencies or frontend build step are required.

```sh
python3 -m http.server 8000 --directory public
```

Open http://localhost:8000. Serve the files over HTTP; ES modules and JSON loading do not work by double-clicking `index.html`.

## Controls

Click the screen, type a command, and press Enter.

| Command                       | Action                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| `move LUC`                    | Centre on Brunel House; its map label remains Brunel House |
| `move Cardiff`                | Centre on a named destination                              |
| `move place Rhoose`           | Search within a category                                   |
| `move street Park Place`      | Search streets                                             |
| `move landmark castle`        | Search landmarks                                           |
| `move address 10 Duke Street` | Search imported addresses                                  |
| `move coords -3.2,51.5`       | Centre on longitude, latitude within the extract           |
| `move id way/26579743`        | Centre on an imported OSM feature                          |
| `zoom 1` to `zoom 10`         | Regional overview through building detail                  |
| `help`                        | Show command help                                          |

When search lists several matches, press the result number to highlight it, then Enter to navigate. Escape clears the entry and results. Failed commands clear the entry. The attribution on the screen links to OpenStreetMap's copyright page.

## Source structure

- `public/index.html`, `styles.css`: the full-window map screen.
- `public/js/app.js`: startup and application state.
- `public/js/map-data.js`: fetch and decode the static datasets.
- `public/js/renderer.js`: geometry, dynamic labels, legend and terminal display.
- `public/js/camera.js`: smooth pan and logarithmic zoom.
- `public/js/search.js`, `terminal.js`: matching and command input.
- `public/js/crt-overlay.js`, `shaders.js`: the adapted RetroZone WebGL effect.
- `public/data/`: compressed datasets split into small static files; these make the deployed app independent of third-party map requests.
- `tools/`: optional Python data preparation.
- `tests/`: command and rendering regression tests using Node's built-in test runner.

## Tests

Requires Node 24 or later.

```sh
npm test
```

## GitHub Pages

In repository **Settings > Pages**, select **GitHub Actions** as the source. The included workflow tests the app and publishes only `public/` whenever `main` changes. Pull requests run tests without deploying.

Expected site address: https://david-w-dev.github.io/LUC_30DMC_2026/

## Map data and limits

The current map covers Rhoose, Pontypridd, Rogerstone and the area between them. Central Cardiff has finer building and street geometry. Regional geometry is simplified, with sampled residential roads and larger green areas; it is not a complete inventory. Addresses and building footprints are also sampled. This migration preserves the existing scope and visual design.

Map data was retrieved on 28 September 2026. Inspection, boundaries, routing and Wales-wide streaming are future work, not implemented commands. Regional tile-derived identifiers such as `place/Cardiff` are internal search keys rather than OSM object IDs.

### Rebuild the datasets

Install Python dependencies in a virtual environment, fetch the bounded source extracts, and run the preparation scripts. Downloaded raw files are cached under `data/raw/` and excluded from git. The scripts do not run in GitHub Pages or on every deployment.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r tools/requirements.txt
python tools/fetch_data.py both
python tools/prepare_osm.py
python tools/prepare_region.py
python tools/pack_data.py
```

The fetch script requires `curl`. Review resulting data changes before committing: live OSM data can differ from the original extract. Use prepared regional extracts or a tile pipeline for future Wales-wide coverage rather than bulk requests to the OSM editing API.

## Attribution

Map data: OpenStreetMap contributors, ODbL 1.0. Display effects: RetroZone, MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
