"""Build complete mapped geometry inside Cardiff and Vale council boundaries.

Input: Geofabrik Wales OSM PBF. Output: static, compressed 4 km detail sections,
full place/street/address index, and POIs. No sampling of roads or buildings.
"""
import argparse
import base64
from collections import Counter, defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
import osmium
from shapely import from_wkb, make_valid
from shapely.geometry import LineString, Point, box, mapping
from shapely.ops import transform, unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'tools/regional-config.json').read_text())
LON0, LAT0 = CONFIG['origin']
MX = 111320 * math.cos(math.radians(LAT0))
MY = 111320
SIZE = 4000
COUNCILS = {103776: 'Vale of Glamorgan', 1625787: 'Cardiff'}
GREEN = {'forest', 'wood', 'grass', 'grassland', 'park', 'garden', 'recreation_ground',
         'meadow', 'heath', 'orchard', 'allotments', 'nature_reserve', 'village_green', 'golf_course', 'common'}
POI = {'cafe': 'cafes', 'pub': 'pubs', 'restaurant': 'restaurants', 'park': 'parks'}
factory = osmium.geom.WKBFactory()

def project(x, y, z=None):
    return (x - LON0) * MX, (LAT0 - y) * MY

def rounded(coords):
    return [[round(x, 1), round(y, 1)] for x, y in coords]

def polygons(geometry):
    if geometry.geom_type == 'Polygon': yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms: yield from polygons(part)

def lines(geometry):
    if geometry.geom_type in ('LineString', 'LinearRing'): yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms: yield from lines(part)

def packed_file(path, data):
    raw = json.dumps(data, separators=(',', ':'), ensure_ascii=True).encode()
    encoded = base64.b64encode(gzip.compress(raw, mtime=0, compresslevel=9)).decode()
    digest = hashlib.sha256(raw).hexdigest()[:12]
    names = []
    for i, start in enumerate(range(0, len(encoded), 40000)):
        name = f'{path.stem}-{digest}-{i:02d}.txt'
        (path.parent / name).write_text(encoded[start:start + 40000])
        names.append(name)
    path.write_text(json.dumps({'encoding': 'gzip-base64', 'chunks': names}, separators=(',', ':')))
    return len(encoded)

class Boundaries(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.geometry = {}
    def area(self, area):
        if not area.from_way() and area.orig_id() in COUNCILS:
            geom = make_valid(from_wkb(factory.create_multipolygon(area)))
            self.geometry[area.orig_id()] = geom
            print('Council boundary:', COUNCILS[area.orig_id()], geom.bounds, flush=True)

class Extract(osmium.SimpleHandler):
    def __init__(self, coverage):
        super().__init__()
        self.coverage = coverage; self.covered = prep(coverage); self.bounds = coverage.bounds
        self.tiles = defaultdict(lambda: {'roads': [], 'buildings': [], 'water': [], 'green': []})
        self.targets = {}; self.pois = {}; self.counts = Counter(); self.luc = []
        self.invalid = Counter()
    def in_box(self, coords):
        if not coords: return False
        x0,y0,x1,y1 = self.bounds
        xs,ys = zip(*coords)
        return max(xs) >= x0 and min(xs) <= x1 and max(ys) >= y0 and min(ys) <= y1
    def add_target(self, kind, name, ident, point, cy=''):
        if name: self.targets[(kind, name, ident)] = [kind, name, ident, round(point[0]), round(point[1]), cy]
    def metadata(self, tags, ident, point):
        name = tags.get('name') or tags.get('addr:housename', '')
        if tags.get('place'):
            self.add_target('p', name, ident, point, tags.get('name:cy', ''))
        elif name and not tags.get('highway'):
            self.add_target('l', name, ident, point, tags.get('name:cy', ''))
        if tags.get('addr:housenumber') and tags.get('addr:street'):
            self.add_target('a', tags['addr:housenumber'] + ' ' + tags['addr:street'], ident, point)
        category = POI.get(tags.get('amenity') or tags.get('leisure'))
        if category:
            self.pois[ident] = {'id': ident, 'category': category, 'name': name or 'Unnamed ' + category.rstrip('s'), 'point': [round(point[0]), round(point[1])]}
    def node(self, node):
        if not len(node.tags) or not node.location.valid(): return
        tags = dict(node.tags)
        if not any(k in tags for k in ('name', 'place', 'amenity', 'leisure', 'addr:housenumber', 'addr:housename')): return
        point = project(node.location.lon, node.location.lat)
        if self.covered.covers(Point(point)): self.metadata(tags, f'node/{node.id}', point)
    def store(self, layer, geom, kind=None):
        if geom.is_empty or not self.covered.intersects(geom): return
        if not self.covered.covers(geom): geom = make_valid(geom.intersection(self.coverage))
        if geom.is_empty: return
        parts = list(lines(geom)) if layer == 'roads' else list(polygons(geom)) if geom.geom_type not in ('LineString', 'MultiLineString') else list(lines(geom))
        for part in parts:
            if part.is_empty: continue
            x0,y0,x1,y1 = part.bounds
            # Store full polygon rings in intersecting sections: no artificial polygon seams.
            paths = [rounded(part.exterior.coords), *[rounded(r.coords) for r in part.interiors]] if part.geom_type == 'Polygon' else [rounded(part.coords)]
            for tx in range(math.floor(x0 / SIZE), math.floor(x1 / SIZE) + 1):
                for ty in range(math.floor(y0 / SIZE), math.floor(y1 / SIZE) + 1):
                    if not part.intersects(box(tx*SIZE,ty*SIZE,(tx+1)*SIZE,(ty+1)*SIZE)): continue
                    self.tiles[(tx,ty)][layer].extend([[kind,p] for p in paths] if layer == 'roads' else paths)
    def way(self, way):
        tags = dict(way.tags)
        kind = tags.get('highway')
        if kind in ('proposed', 'construction'): kind = None
        water = (tags.get('waterway') and tags.get('area') != 'yes') or tags.get('natural') == 'coastline'
        if not kind and not water and not any(k in tags for k in ('name','amenity','leisure','addr:housenumber','addr:housename')): return
        try: coords = [project(n.lon,n.lat) for n in way.nodes]
        except osmium.InvalidLocationError: self.invalid['ways'] += 1; return
        if len(coords) < 2 or not self.in_box(coords): return
        geom = LineString(coords)
        if not self.covered.intersects(geom): return
        if kind:
            self.store('roads', geom, kind); self.counts['roads'] += 1
            point = geom.interpolate(0.5, normalized=True)
            if not self.covered.covers(point): point = geom.intersection(self.coverage).representative_point()
            self.add_target('s', tags.get('name',''), f'way/{way.id}', (point.x,point.y), tags.get('name:cy',''))
        if water: self.store('water', geom); self.counts['water_lines'] += 1
        point = geom.representative_point()
        if self.covered.covers(point): self.metadata(tags,f'way/{way.id}',(point.x,point.y))
    def area(self, area):
        tags = dict(area.tags)
        building = bool(tags.get('building') and tags.get('building') != 'no')
        green = any(tags.get(k) in GREEN for k in ('landuse','natural','leisure'))
        water = tags.get('natural') == 'water' or tags.get('landuse') in ('reservoir','basin') or tags.get('waterway') == 'riverbank'
        if not (building or green or water): return
        try:
            outer = [project(n.lon,n.lat) for ring in area.outer_rings() for n in ring]
            if not self.in_box(outer): return
            geom = transform(project, make_valid(from_wkb(factory.create_multipolygon(area))))
        except (osmium.InvalidLocationError, ValueError, RuntimeError): self.invalid['areas'] += 1; return
        if not self.covered.intersects(geom): return
        ident = ('way/' if area.from_way() else 'relation/') + str(area.orig_id())
        point = geom.representative_point()
        if self.covered.covers(point): self.metadata(tags,ident,(point.x,point.y))
        if building:
            self.store('buildings',geom); self.counts['buildings'] += 1
            if ident == 'way/26579743': self.luc = rounded(next(polygons(geom)).exterior.coords)
        if green: self.store('green',geom); self.counts['green'] += 1
        if water: self.store('water',geom); self.counts['water_areas'] += 1

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pbf', type=Path, default=ROOT/'data/raw/wales-latest.osm.pbf')
args = parser.parse_args()
print('Assembling council boundaries...', flush=True)
boundary = Boundaries(); boundary.apply_file(str(args.pbf), locations=True)
if set(boundary.geometry) != set(COUNCILS): raise RuntimeError('Both complete council boundaries are required')
geo_coverage = unary_union(list(boundary.geometry.values()))
coverage = transform(project, geo_coverage)
print('Extracting all mapped roads, buildings and land/water features...', flush=True)
extract = Extract(coverage); extract.apply_file(str(args.pbf), locations=True)
if extract.invalid: raise RuntimeError(f'Incomplete source geometry: {dict(extract.invalid)}')
output = ROOT/'public/data/detail'; output.mkdir(parents=True,exist_ok=True)
for old in output.glob('*'): old.unlink()
entries = []; total_bytes = 0
for (x,y), data in sorted(extract.tiles.items()):
    path = output/f'{x}_{y}.json'
    total_bytes += packed_file(path,data)
    entries.append({'key':f'{x}_{y}','bounds':[x*SIZE,y*SIZE,(x+1)*SIZE,(y+1)*SIZE], 'path':'detail/'+path.name,
                    'counts':{k:len(v) for k,v in data.items()}})
reader = osmium.io.Reader(str(args.pbf))
source_timestamp = reader.header().get('osmosis_replication_timestamp'); reader.close()
manifest = {'sourceTimestamp':source_timestamp,'version':1,'sectionSize':SIZE,'origin':CONFIG['origin'],'bounds':list(geo_coverage.bounds),
            'councils':[{'id':k,'name':COUNCILS[k],'geometry':mapping(v)} for k,v in boundary.geometry.items()],
            'source':'Geofabrik Wales OSM extract','sourceBytes':args.pbf.stat().st_size,
            'features':dict(extract.counts),'tiles':entries}
(ROOT/'public/data/detail-manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
# Preserve existing regional search destinations; replace the old central-only geometry.
prepared = ROOT/'data/prepared/cardiff-map.json'
if prepared.exists():
    old = json.loads(prepared.read_text())
else:
    manifest = json.loads((ROOT/'public/data/cardiff-map.json').read_text())
    encoded = ''.join((ROOT/'public/data'/name).read_text() for name in manifest['chunks'])
    old = json.loads(gzip.decompress(base64.b64decode(encoded)))
index = extract.targets
old.update({'roads':[],'buildings':[],'water':[],'green':[], 'targets':list(index.values()),
            'luc':extract.luc or old['luc'],'fullCoverage':True,'bounds':list(geo_coverage.bounds)})
(ROOT/'data/prepared/cardiff-map.json').write_text(json.dumps(old,separators=(',',':')))
pois = {'source':'OpenStreetMap contributors / Geofabrik','scope':'All matching mapped POIs inside Cardiff and Vale council boundaries',
        'pois':list(extract.pois.values())}
(ROOT/'public/data/pois.json').write_text(json.dumps(pois,separators=(',',':')))
print('Feature totals:',dict(extract.counts),flush=True)
print('Search targets:',len(index),'POIs:',len(extract.pois),'Sections:',len(entries),'Compressed encoded bytes:',total_bytes,flush=True)
