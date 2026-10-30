# LUC Vector Map

A terminal-controlled Cardiff and Vale of Glamorgan map with vector CRT glow and phosphor sustain. Plain JavaScript modules, static map sections and GitHub Pages; no runtime backend.

## Run locally

```sh
python3 -m http.server 8000 --directory public
```

Open http://localhost:8000. The app must be served over HTTP.

## Commands

Click the screen, type a command, then Enter.

| Command | Action |
| --- | --- |
| `move LUC` | Centre on Brunel House; retain its name and gold footprint |
| `move Cardiff` | Search and move to a named destination |
| `move place Cowbridge` | Search places |
| `move street Park Place` | Search streets |
| `move landmark castle` | Search named landmarks |
| `move address 10 Duke Street` | Search mapped addresses |
| `move coords -3.2,51.5` | Move to longitude, latitude |
| `move id way/26579743` | Search an OSM feature ID |
| `zoom 1` to `zoom 10` | Overview through building detail |
| `radar cafes` | Expanding pulse reveals mapped cafes in view |
| `radar pubs`, `radar restaurants`, `radar parks` | Other radar categories |
| `radar next`, `radar prev` | Page through radar results |
| `radar clear` | Clear the scan and markers |
| `print` | Download the current display as a PNG |
| `help` | Show command help |

Up/Down recalls commands and preserves an unfinished draft. Tab completes commands and destinations; repeat it to cycle matches. With search or radar results showing, Up/Down or 1-4 selects a result and Enter navigates there. Escape clears input, results and radar. Failed commands clear the entry. History lasts for the current session.

PNG export captures the composited CRT frame, including glow and sustain. Without WebGL it copies the map canvas. The command does not open the browser print dialog.

## Coverage and loading

Detailed geometry is selected from the complete Geofabrik Wales OSM PBF using the actual Cardiff and Vale of Glamorgan council boundaries (OSM relations 1625787 and 103776). All mapped roads and paths, building footprints, relevant green areas, waterways and water polygons intersecting those boundaries are processed. Multipolygon relations and courtyard rings are included. Geometry is clipped at the council boundary, rounded to 0.1 metre, and assigned to 4 km sections without sampling roads or buildings.

Overview levels use the existing simplified regional layer, including surrounding context towards Pontypridd and Rogerstone. From level 3 the browser loads the detailed sections intersecting the view. Loaded sections appear progressively and remain visible while neighbouring sections load or retry; buildings and smaller paths appear from level 5. Outside the two councils, detailed coverage is not provided. A loading or failure message is shown on the display rather than silently presenting partial detail as complete.

Sections are gzip-compressed and base64-encoded into content-named static chunks. The loader limits concurrent section loads to four and network requests to six, retries temporary network/server failures, ignores late results for previous views, reuses loaded sections, and evicts old sections beyond a small cache while retaining those needed for the current view. The browser downloads no raw PBF and makes no requests to public map APIs.

Search metadata and matching radar POIs are collected throughout both councils. OSM itself may omit real-world features or business information. The detail manifest records the source timestamp, boundaries and feature counts.

## Rebuild full coverage

Python 3, curl and the pinned requirements are needed. Source downloads and prepared intermediates are ignored by git.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r tools/requirements.txt
python tools/fetch_data.py full
python tools/build_full_coverage.py
python tools/pack_data.py cardiff-map
```

The PBF is downloaded from https://download.geofabrik.de/europe/united-kingdom/wales-latest.osm.pbf. `build_full_coverage.py` assembles the council boundaries, fails if either is absent, and exports geometry, a search index, POIs and the section manifest. Invalid source geometry causes the build to fail. Only `public/` is deployed.

The older `prepare_osm.py`, `prepare_region.py` and `prepare_pois.py` scripts are retained as the original sample-data pipeline. Do not run them over the full-coverage outputs. The regional overview can be rebuilt separately with `fetch_data.py regional`, `prepare_region.py` and `pack_data.py regional-map`.

## Source structure

- `public/js/app.js`: startup, redraw and resize handling.
- `map-data.js`, `detail-loader.js`: metadata loading, section selection, cache and request scheduling.
- `renderer.js`: map geometry, adaptive labels, radar markers and terminal display.
- `camera.js`, `search.js`, `terminal.js`: navigation, matching and commands.
- `radar.js`, `export-map.js`: POI scanning and PNG export.
- `crt-overlay.js`, `shaders.js`: WebGL display effects.
- `public/data/detail/`: static geometry sections.
- `tools/`: reproducible data preparation.
- `tests/`: command, camera, loader, coverage and rendering checks.

## Validation and deployment

Node 24 or later:

```sh
npm test
```

GitHub Actions tests pushes to `main` and deploys `public/` to https://david-w-dev.github.io/LUC_30DMC_2026/. Pull requests run tests without deploying. GitHub Pages must use GitHub Actions as its publishing source.

## Attribution

Map data: OpenStreetMap contributors, ODbL 1.0. Full extract provided by Geofabrik. Display effects: RetroZone, MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
