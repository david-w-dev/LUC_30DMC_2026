"""Prepare a compact regional overlay from official OpenStreetMap vector tiles."""
import json
import math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUTPUT = ROOT / "data" / "prepared"
OUTPUT.mkdir(parents=True, exist_ok=True)

import mapbox_vector_tile

ZOOM = 12
TILE_SIZE = 4096
BOUNDS = (-3.38, 51.375, -3.02, 51.62)
LON0, LAT0 = -3.182, 51.4835
METRES_X = 111320 * math.cos(math.radians(LAT0))
METRES_Y = 111320


def project(tile_x, tile_y, x, y, extent=TILE_SIZE):
    lon = (tile_x + x / extent) / (1 << ZOOM) * 360 - 180
    latitude = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (tile_y + 1 - y / extent) / (1 << ZOOM)))))
    return lon, latitude, [round((lon - LON0) * METRES_X), round((LAT0 - latitude) * METRES_Y)]


def simplify(points, tolerance):
    if len(points) < 3:
        return points
    result = [points[0]]
    for point in points[1:-1]:
        if math.dist(point, result[-1]) >= tolerance:
            result.append(point)
    if result[-1] != points[-1]:
        result.append(points[-1])
    return result


def line_parts(geometry):
    kind, coords = geometry['type'], geometry['coordinates']
    if kind == 'LineString':
        return [coords]
    if kind == 'MultiLineString':
        return coords
    if kind == 'Polygon':
        return coords
    if kind == 'MultiPolygon':
        return [ring for polygon in coords for ring in polygon]
    return []


roads, water, green, places, street_names, label_names = [], [], [], {}, {}, set()
green_kinds = {'forest', 'wood', 'grass', 'grassland', 'park', 'garden', 'recreation_ground', 'meadow', 'heath', 'orchard', 'allotments', 'nature_reserve'}
road_kinds = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified'}
for path in sorted((RAW / 'region_tiles').glob('*.mvt')):
    tile_x, tile_y = map(int, path.stem.split('_'))
    layers = mapbox_vector_tile.decode(path.read_bytes())
    def convert(layer_name, point):
        return project(tile_x, tile_y, *point, layers[layer_name]['extent'])
    for feature_index, feature in enumerate(layers.get('streets', {}).get('features', [])):
        kind = feature['properties'].get('kind')
        if kind not in road_kinds:
            continue
        if kind == 'residential' and feature_index % 4:
            continue
        if kind == 'unclassified' and feature_index % 2:
            continue
        for line in line_parts(feature['geometry']):
            projected = [convert('streets', point)[2] for point in line]
            if len(projected) >= 2:
                roads.append([kind, simplify(projected, 13 if kind in {'residential', 'unclassified'} else 8)])
    for layer_name in ('water_lines', 'water_polygons'):
        for feature in layers.get(layer_name, {}).get('features', []):
            for line in line_parts(feature['geometry']):
                points = simplify([convert(layer_name, point)[2] for point in line], 16)
                if len(points) >= 2:
                    water.append(points)
    for feature in layers.get('land', {}).get('features', []):
        if feature['properties'].get('kind') not in green_kinds:
            continue
        for ring in line_parts(feature['geometry']):
            points = simplify([convert('land', point)[2] for point in ring], 65)
            if len(points) >= 4 and sum(math.dist(a, b) for a, b in zip(points, points[1:])) > 1000:
                if points[0] != points[-1]:
                    points.append(points[0])
                green.append(points)
    for feature in layers.get('place_labels', {}).get('features', []):
        properties = feature['properties']
        name = properties.get('name')
        if not name or feature['geometry']['type'] != 'Point':
            continue
        lon, lat, point = convert('place_labels', feature['geometry']['coordinates'])
        if BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]:
            places.setdefault(name, ['p', name, f'place/{name}', *point, properties.get('name_cy', '')])
            if properties.get('kind') in ('city', 'state_capital', 'town', 'village'):
                label_names.add(name)
    for feature in layers.get('street_labels', {}).get('features', []):
        name = feature['properties'].get('name')
        if not name or name in street_names:
            continue
        lines = line_parts(feature['geometry'])
        if lines and lines[0]:
            lon, lat, point = convert('street_labels', lines[0][len(lines[0]) // 2])
            if BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]:
                street_names[name] = ['s', name, f'street/{name}', *point, '']

data = {'bounds': BOUNDS, 'roads': roads, 'water': water, 'green': green, 'labels': sorted(label_names),
        'targets': list(places.values()) + list(street_names.values())}
(OUTPUT / 'regional-map.json').write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=True))
print('Regional geometry:', len(roads), 'roads,', len(water), 'water,', len(green), 'green')
print('Regional targets:', len(places), 'places,', len(street_names), 'streets')
print('Regional bytes:', (OUTPUT / 'regional-map.json').stat().st_size)
for name in ('Rhoose', 'Pontypridd', 'Rogerstone'):
    print(name, name in places)
