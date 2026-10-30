"""Fetch the bounded source extracts used for the checked-in demo datasets."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'


def download(url, destination):
    if destination.exists() and destination.stat().st_size:
        print('Cached:', destination.name)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + '.partial')
    try:
        subprocess.run([
            'curl', '--fail', '--location', '--silent', '--show-error',
            '--retry', '2', '--max-time', '90',
            '--user-agent', 'LUC-Vector-Map/0.1 (bounded project data preparation)',
            url, '--output', str(temporary),
        ], check=True)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print('Downloaded:', destination.name)
    time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', choices=['central', 'regional', 'both'])
    args = parser.parse_args()
    if args.dataset in ('central', 'both'):
        extracts = json.loads((ROOT / 'tools' / 'central-extracts.json').read_text())
        for name, bounds in extracts.items():
            download(f'https://api.openstreetmap.org/api/0.6/map?bbox={bounds}', RAW / name)
    if args.dataset in ('regional', 'both'):
        config = json.loads((ROOT / 'tools' / 'regional-config.json').read_text())
        west, south, east, north = config['bounds']
        zoom = config['zoom']
        def tile(lon, lat):
            return (math.floor((lon + 180) / 360 * 2 ** zoom),
                    math.floor((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** zoom))
        x0, y0 = tile(west, north)
        x1, y1 = tile(east, south)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                download(
                    f'https://vector.openstreetmap.org/shortbread_v1/{zoom}/{x}/{y}.mvt',
                    RAW / 'region_tiles' / f'{x}_{y}.mvt',
                )


if __name__ == '__main__':
    main()
