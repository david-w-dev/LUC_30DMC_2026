"""Package prepared JSON as small, self-contained compressed static assets."""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'data'

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('datasets', nargs='*', choices=['cardiff-map', 'regional-map'])
args = parser.parse_args()
for name in args.datasets or ('cardiff-map', 'regional-map'):
    raw = (ROOT / 'data' / 'prepared' / f'{name}.json').read_bytes()
    encoded = base64.b64encode(gzip.compress(raw, compresslevel=9, mtime=0)).decode('ascii')
    revision = hashlib.sha256(raw).hexdigest()[:12]
    chunks = []
    for old in OUTPUT.glob(f'{name}-*.txt'):
        old.unlink()
    for i, offset in enumerate(range(0, len(encoded), 40000)):
        filename = f'{name}-{revision}-{i:02d}.txt'
        (OUTPUT / filename).write_text(encoded[offset:offset + 40000])
        chunks.append(filename)
    (OUTPUT / f'{name}.json').write_text(json.dumps({
        'encoding': 'gzip-base64', 'chunks': chunks,
    }, indent=2) + '\n')
    print(name, len(raw), 'bytes ->', len(encoded), 'characters in', len(chunks), 'chunks')
