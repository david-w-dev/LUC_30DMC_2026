"""Convert small OSM API extracts around central Cardiff into compact demo geometry."""

from collections import defaultdict
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUTPUT = ROOT / "data" / "prepared"
OUTPUT.mkdir(parents=True, exist_ok=True)
import xml.etree.ElementTree as ET
from math import cos, radians, hypot

FILES = [
    'cardiff-osm-sample.xml', 'cathays-osm-sample.xml',
    'castle.osm', 'centre.osm', 'cathays_east.osm',
    'northwest.osm', 'midnorth.osm',
    'bay_w.osm', 'bay_e.osm', 'roath_e.osm', 'roath_far_e.osm', 'north.osm', 'riverside_w.osm',
]
BOUNDS = (-3.196, 51.470, -3.158, 51.495)
LON0, LAT0 = -3.182, 51.4835
METRES_X = 111320 * cos(radians(LAT0))
METRES_Y = 111320


def xy(lon, lat):
    return [round((lon - LON0) * METRES_X), round((LAT0 - lat) * METRES_Y)]


def inside(lon, lat):
    return BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]


def dist_segment(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == dy == 0:
        return hypot(p[0] - a[0], p[1] - a[1])
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def simplify(points, tolerance):
    if len(points) < 3:
        return points
    farthest = max(range(1, len(points) - 1), key=lambda i: dist_segment(points[i], points[0], points[-1]))
    if dist_segment(points[farthest], points[0], points[-1]) <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:farthest + 1], tolerance)[:-1] + simplify(points[farthest:], tolerance)


def tags(element):
    return {tag.get('k'): tag.get('v') for tag in element.findall('tag')}


nodes, ways = {}, {}
for filename in FILES:
    root = ET.parse(RAW / filename).getroot()
    nodes.update({n.get('id'): n for n in root.findall('node')})
    ways.update({w.get('id'): w for w in root.findall('way')})

roads, buildings, water, green, targets = [], [], [], [], []
luc_building = []
road_by_name = defaultdict(list)
seen_target = set()


def target(category, name, element, point, tag_data):
    if not name or not point:
        return
    item_id = f'{element.tag}/{element.get("id")}'
    key = (category, item_id)
    if key in seen_target:
        return
    seen_target.add(key)
    targets.append({
        'category': category, 'name': name, 'id': item_id,
        'point': point, 'cy': tag_data.get('name:cy', ''),
    })


for n in nodes.values():
    lon, lat = float(n.get('lon')), float(n.get('lat'))
    if not inside(lon, lat):
        continue
    t = tags(n)
    pt = xy(lon, lat)
    if t.get('place') and t.get('name'):
        target('place', t['name'], n, pt, t)
    elif t.get('name') and any(k in t for k in ('historic', 'tourism', 'amenity', 'leisure', 'railway')):
        target('landmark', t['name'], n, pt, t)
    if t.get('addr:housenumber') and t.get('addr:street'):
        target('address', f'{t["addr:housenumber"]} {t["addr:street"]}', n, pt, t)

for w in ways.values():
    t = tags(w)
    coords = []
    for nd in w.findall('nd'):
        node = nodes.get(nd.get('ref'))
        if node is not None:
            coords.append((float(node.get('lon')), float(node.get('lat'))))
    if len(coords) < 2 or not any(inside(*p) for p in coords):
        continue
    pts = [xy(*p) for p in coords]
    representative = xy(*coords[len(coords) // 2])
    if t.get('highway'):
        kind = t['highway']
        if kind not in ('steps', 'platform', 'construction', 'proposed'):
            roads.append({'class': kind, 'points': simplify(pts, 2.5)})
        if t.get('name') and kind != 'bus_stop':
            road_by_name[t['name']].append((pts, w, t))
    if t.get('waterway') or t.get('natural') == 'water':
        water.append(simplify(pts, 2.0))
    is_green = (
        t.get('leisure') in ('park', 'garden', 'nature_reserve', 'recreation_ground', 'pitch')
        or t.get('landuse') in ('grass', 'forest', 'meadow', 'recreation_ground', 'village_green')
        or t.get('natural') in ('wood', 'grassland', 'scrub')
    )
    if is_green and len(pts) >= 4 and pts[0] == pts[-1]:
        green.append(simplify(pts, 2.5))
    if t.get('building') and len(pts) >= 4 and all(inside(*p) for p in coords):
        buildings.append(simplify(pts, 1.5))
        if t.get('addr:housename') == 'Brunel House':
            luc_building = simplify(pts, 1.5)
            target('landmark', 'Brunel House', w, representative, t)
    if t.get('name') and any(k in t for k in ('building', 'historic', 'tourism', 'amenity', 'leisure')):
        target('landmark', t['name'], w, representative, t)
    if t.get('addr:housenumber') and t.get('addr:street'):
        target('address', f'{t["addr:housenumber"]} {t["addr:street"]}', w, representative, t)

for name, segments in road_by_name.items():
    # Use the segment nearest the centre of the extract for a stable street target.
    points, way, t = min(segments, key=lambda v: min(p[0] ** 2 + p[1] ** 2 for p in v[0]))
    target('street', name, way, points[len(points) // 2], t)

# Keep a representative building and address sample within the inline preview budget.
if len(buildings) > 5500:
    buildings = [building for i, building in enumerate(buildings) if i * 5500 // len(buildings) != (i - 1) * 5500 // len(buildings)]
addresses = [t for t in targets if t['category'] == 'address']
if len(addresses) > 2000:
    selected = {id(t) for i, t in enumerate(addresses) if i * 2000 // len(addresses) != (i - 1) * 2000 // len(addresses)}
    targets = [t for t in targets if t['category'] != 'address' or id(t) in selected or t['name'] == '10 Duke Street']

result = {
    'source': 'OpenStreetMap contributors', 'bounds': BOUNDS,
    'origin': [LON0, LAT0],
    'roads': [[r['class'], r['points']] for r in roads],
    'buildings': buildings, 'water': water, 'green': green, 'luc': luc_building,
    'targets': [
        [t['category'][0], t['name'], t['id'], *t['point'], t['cy']]
        for t in sorted(targets, key=lambda t: (t['category'], t['name'].casefold()))
    ],
}
(OUTPUT / 'cardiff-map.json').write_text(json.dumps(result, separators=(',', ':'), ensure_ascii=True))
from collections import Counter
print('geometry:', len(roads), 'roads,', len(buildings), 'buildings,', len(water), 'water,', len(green), 'green areas')
print('targets:', Counter(t['category'] for t in targets))
print('bytes:', (OUTPUT / 'cardiff-map.json').stat().st_size)
for query in ('Cardiff Castle', 'Civic Centre', 'Park Place', '10 Duke Street'):
    print(query, [(t['category'], t['name']) for t in targets if query.casefold() in t['name'].casefold()][:3])
