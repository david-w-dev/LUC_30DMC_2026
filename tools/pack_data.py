"""Package prepared JSON as small, self-contained compressed static assets."""
import base64
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'data'

for name in ('cardiff-map', 'regional-map'):
    raw = (ROOT / 'data' / 'prepared' / f'{name}.json').read_bytes()
    encoded = base64.b64encode(gzip.compress(raw, compresslevel=9, mtime=0)).decode('ascii')
    chunks = []
    for old in OUTPUT.glob(f'{name}-*.txt'):
        old.unlink()
    for i, offset in enumerate(range(0, len(encoded), 40000)):
        filename = f'{name}-{i:02d}.txt'
        (OUTPUT / filename).write_text(encoded[offset:offset + 40000])
        chunks.append(filename)
    (OUTPUT / f'{name}.json').write_text(json.dumps({
        'encoding': 'gzip-base64', 'chunks': chunks,
    }, indent=2) + '\n')
    print(name, len(raw), 'bytes ->', len(encoded), 'characters in', len(chunks), 'chunks')
