"""Background sky for the survey page, from the d3-celestial data files (BSD-3-Clause).

    python3 tools/sky_data.py

Downloads the d3-celestial npm package on first use (into tools/d3-celestial/, git-ignored) and writes
  src/data/stars.json     stars to V = 6 (XHIP / Hipparcos): flat [ra, dec, mag, b-v, ...], degrees
  src/data/milkyway.png   Milky Way brightness (Vieira's outline catalogue, 5 levels), equirectangular,
                          x = RA 0..360 deg, y = Dec +90..-90 deg, slightly blurred
Needs numpy and Pillow.
"""
import json
import pathlib
import subprocess
import tarfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / 'd3-celestial'
W, H = 1024, 512


def data_dir():
    data = CACHE / 'package' / 'data'
    if not data.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        tgz = subprocess.run(['npm', 'pack', 'd3-celestial@0.7.35'], cwd=CACHE, check=True,
                             capture_output=True, text=True).stdout.strip().splitlines()[-1]
        with tarfile.open(CACHE / tgz) as t:
            t.extractall(CACHE, filter='data')
    return data


def stars(data):
    out = []
    for f in json.load(open(data / 'stars.6.json'))['features']:
        lon, lat = f['geometry']['coordinates']
        p = f['properties']
        bv = float(p['bv']) if p['bv'] not in ('', None) else 0.6
        out += [round(lon % 360, 2), round(lat, 2), round(float(p['mag']), 1), round(bv, 2)]
    return out


def ring_mask(ring):
    """Mask of one ring; a ring that goes once around the pole is closed through the north pole."""
    lon = np.unwrap(np.radians([p[0] for p in ring]))
    lon = np.degrees(lon)
    lat = np.array([p[1] for p in ring])
    pts = list(zip(lon, lat))
    if abs(lon[-1] - lon[0]) > 180:
        pts += [(lon[-1], 90.0), (lon[0], 90.0)]
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    for k in (-720, -360, 0, 360, 720):
        d.polygon([((x + k) / 360 * W, (90 - y) / 180 * H) for x, y in pts], fill=1)
    return np.array(img, dtype=np.uint8)


def milky_way(data):
    total = np.zeros((H, W), np.float32)
    for f in json.load(open(data / 'mw.json'))['features']:
        level = np.zeros((H, W), np.uint8)
        for poly in f['geometry']['coordinates']:
            for ring in poly:
                level ^= ring_mask(ring)
        total += level
    img = Image.fromarray(np.clip(total * 51, 0, 255).astype(np.uint8), 'L')
    return img.filter(ImageFilter.GaussianBlur(1.5))


if __name__ == '__main__':
    d = data_dir()
    s = stars(d)
    (ROOT / 'src' / 'data' / 'stars.json').write_text(json.dumps(s, separators=(',', ':')))
    milky_way(d).save(ROOT / 'src' / 'data' / 'milkyway.png', optimize=True)
    print(f'{len(s) // 4} stars, Milky Way {W}x{H}')
