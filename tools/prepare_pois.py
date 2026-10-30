"""Fetch bounded OSM zoom-14 POI samples around Cardiff and the main Vale towns."""
import concurrent.futures
import json
import hashlib
import math
from pathlib import Path
import mapbox_vector_tile
from fetch_data import download

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'tools/regional-config.json').read_text())
LON0, LAT0 = CONFIG['origin']
METRES_X = 111320 * math.cos(math.radians(LAT0))
ZOOM = 14
region = json.loads((ROOT / 'data/prepared/regional-map.json').read_text())
names = {'Cardiff': 1, 'Barry': 1, 'Penarth': 0, 'Cowbridge': 0,
         'Llantwit Major': 0, 'St Athan': 0, 'Ogmore-by-Sea': 0, 'Rhoose': 0}
tiles = set()
for category, name, _, x, y, *_ in region['targets']:
    if category != 'p' or name not in names:
        continue
    lon, lat = LON0 + x / METRES_X, LAT0 - y / 111320
    tx = int((lon + 180) / 360 * 2 ** ZOOM)
    ty = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** ZOOM)
    radius = names[name]
    tiles.update((tx + dx, ty + dy) for dx in range(-radius, radius + 1) for dy in range(-radius, radius + 1))
cache = ROOT / 'data/raw/poi_tiles'
def fetch(tile):
    x, y = tile
    download(f'https://vector.openstreetmap.org/shortbread_v1/{ZOOM}/{x}/{y}.mvt', cache / f'{x}_{y}.mvt')
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(fetch, sorted(tiles)))
pois = []
seen = set()
category_names = {'cafe': 'cafes', 'pub': 'pubs', 'restaurant': 'restaurants', 'park': 'parks'}
for tx, ty in sorted(tiles):
    layers = mapbox_vector_tile.decode((cache / f'{tx}_{ty}.mvt').read_bytes())
    for layer_name in ('pois', 'sites'):
        layer = layers.get(layer_name, {})
        for feature in layer.get('features', []):
            tags = feature['properties']
            category = category_names.get(tags.get('amenity') or tags.get('leisure'))
            if not category:
                continue
            geometry = feature['geometry']
            coords = geometry['coordinates']
            if geometry['type'] == 'Point':
                px, py = coords
            elif geometry['type'] == 'Polygon':
                ring = coords[0]; px = sum(p[0] for p in ring) / len(ring); py = sum(p[1] for p in ring) / len(ring)
            else:
                continue
            extent = layer['extent']
            lon = (tx + px / extent) / 2 ** ZOOM * 360 - 180
            lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + 1 - py / extent) / 2 ** ZOOM))))
            west, south, east, north = CONFIG['bounds']
            if not west <= lon <= east or not south <= lat <= north:
                continue
            x, y = round((lon - LON0) * METRES_X), round((LAT0 - lat) * 111320)
            name = tags.get('name') or tags.get('brand') or {'cafes':'Unnamed cafe','pubs':'Unnamed pub','restaurants':'Unnamed restaurant','parks':'Unnamed park'}[category]
            key = (category, name.casefold(), round(x / 20), round(y / 20))
            if key in seen:
                continue
            seen.add(key)
            pois.append({'id': f'poi/{category}/{x}/{y}/' + hashlib.sha1(name.encode()).hexdigest()[:8], 'name': name, 'category': category, 'point': [x,y]})
output = {'source':'OpenStreetMap contributors', 'scope':'Zoom-14 samples around Cardiff and main Vale towns; not a complete regional inventory',
          'date':'2026-10-30', 'tiles':sorted([list(t) for t in tiles]), 'pois':pois}
(ROOT / 'public/data/pois.json').write_text(json.dumps(output, separators=(',', ':'), ensure_ascii=True))
from collections import Counter
print('POIs:', dict(Counter(p['category'] for p in pois)), flush=True)
