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

The overview fits the available screen. Zoom levels 1-2 show major roads and larger green outlines; level 3 adds tertiary roads, level 4 adds sparse green hatching, and level 5 adds minor regional roads. Central Cardiff streets and buildings appear at finer scales.

Use Up/Down to recall command history, preserving an unfinished draft. Tab completes commands and place names; repeat Tab to cycle matches. Commands run only when you press Enter. History lasts for the current session.

When search lists several matches, use Up/Down or press the result number to highlight it, then Enter to navigate. Escape clears the entry and results. Failed commands clear the entry. The attribution on the screen links to OpenStreetMap's copyright page.

## Radar and PNG export

- `radar cafes` (or simply `radar`), `radar pubs`, `radar restaurants`, `radar parks`: expand a pulse from the current map centre, revealing imported POIs as it reaches them. Only POIs visible above the results panel are included.
- Revealed markers stay on the display; numbers 1-4 and Enter navigate to the current page's results. Distances are straight-line distances from the scan origin.
- `radar next` / `radar prev`: page through results; `radar clear` or Escape clears the pulse and markers. Moving, zooming or resizing cancels the scan.
- `print`: download the current display as a PNG, including CRT glow and sustain when WebGL is available. Browsers without WebGL export the map canvas. This command does not open the browser print dialog.

POIs are static OSM zoom-14 samples around Cardiff, Barry, Penarth, Cowbridge, Llantwit Major, St Athan, Ogmore-by-Sea and Rhoose, rather than a complete regional business inventory. Rebuild with `python tools/prepare_pois.py` after installing the existing Python requirements. The browser makes no live POI requests.

## Source structure

- `public/index.html`, `styles.css`: the full-window map screen.
- `public/js/app.js`: startup and application state.
- `public/js/map-data.js`: fetch and decode the static datasets.
- `public/js/renderer.js`: geometry, dynamic labels, legend and terminal display.
- `public/js/camera.js`: smooth pan and logarithmic zoom.
- `public/js/search.js`, `terminal.js`: matching and command input.
- `public/js/crt-overlay.js`, `shaders.js`: the adapted RetroZone WebGL effect.
- `public/data/`: compressed datasets split into small static files with content-based filenames; these make the deployed app independent of third-party map requests.
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

The current map covers Cardiff and the Vale of Glamorgan, west to Ogmore-by-Sea, including Cowbridge, Llantwit Major, St Athan, Barry and Penarth. Existing coverage towards Pontypridd and Rogerstone is retained. The display uses a rectangular regional extract rather than clipping to council boundaries. Central Cardiff has finer building and street geometry. Regional geometry is simplified, with sampled residential roads and larger green areas; it is not a complete inventory. Addresses and building footprints are also sampled. This migration preserves the existing scope and visual design.

Central Cardiff data was retrieved on 28 September 2026. The regional extract was expanded on 30 October 2026 using cached source tiles and newly fetched western and northern tiles. Inspection, boundaries, routing and Wales-wide streaming are future work, not implemented commands. Regional tile-derived identifiers such as `place/Cardiff` are internal search keys rather than OSM object IDs.

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

Regional bounds, zoom and projection origin are configured in `tools/regional-config.json`; the fetch script calculates the required tile range from those bounds. The fetch script requires `curl`. Review resulting data changes before committing: live OSM data can differ from the original extract. Use prepared regional extracts or a tile pipeline for future Wales-wide coverage rather than bulk requests to the OSM editing API.

## Attribution

Map data: OpenStreetMap contributors, ODbL 1.0. Display effects: RetroZone, MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
