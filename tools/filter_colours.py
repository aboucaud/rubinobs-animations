"""Perceived colours of the LSST filters, in transmission and in reflection.

The filters are all-dielectric interference coatings on fused silica: absorption is negligible,
so energy conservation gives R(λ) ≈ 1 − T(λ). Out-of-band light is reflected, which is why a
filter seen in reflection shows the complementary colour of the light it transmits.

Colours: spectrum × CIE 1931 2° colour-matching functions (Wyman, Sloan & Shirley 2013
multi-lobe fit) → XYZ → linear sRGB, white-balanced so that a perfect reflector is white
(equal-energy illuminant), then the sRGB transfer curve. Data: lsst/throughputs baseline/filter_*.dat,
downloaded on first use into tools/throughputs/ (not versioned). Run: python3 tools/filter_colours.py
"""
import json
import urllib.request
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / 'throughputs'
URL = 'https://raw.githubusercontent.com/lsst/throughputs/main/baseline/filter_{}.dat'
OUT = HERE.parent / 'src' / 'data' / 'filter_colours.json'


def throughput(band):
    f = DATA / f'filter_{band}.dat'
    if not f.exists():
        DATA.mkdir(exist_ok=True)
        print('downloading', URL.format(band))
        urllib.request.urlretrieve(URL.format(band), f)
    return np.loadtxt(f)


def g(x, mu, s1, s2):
    s = np.where(x < mu, s1, s2)
    return np.exp(-0.5 * ((x - mu) / s) ** 2)


def cmf(lam):
    x = 1.056 * g(lam, 599.8, 37.9, 31.0) + 0.362 * g(lam, 442.0, 16.0, 26.7) - 0.065 * g(lam, 501.1, 20.4, 26.2)
    y = 0.821 * g(lam, 568.8, 46.9, 40.5) + 0.286 * g(lam, 530.9, 16.3, 31.1)
    z = 1.217 * g(lam, 437.0, 11.8, 36.0) + 0.681 * g(lam, 459.0, 26.0, 13.8)
    return np.stack([x, y, z], -1)


M = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
lam = np.arange(380.0, 781.0, 1.0)
C = cmf(lam)
white = M @ C.sum(0)


def to_rgb(spec):
    rgb = (M @ (C * spec[:, None]).sum(0)) / white  # white-balanced linear sRGB
    return np.clip(rgb, 0, None)


def srgb_hex(lin, norm=None):
    if norm:
        lin = lin / max(lin.max(), 1e-9) * norm
    lin = np.clip(lin, 0, 1)
    s = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
    return '#' + ''.join(f'{int(round(v * 255)):02x}' for v in s)


out = {}
for b in 'ugrizy':
    d = throughput(b)
    T = np.interp(lam, d[:, 0], d[:, 1], left=0, right=0)
    R = 1 - T
    t_lin = to_rgb(T)
    r_lin = to_rgb(R)
    out[b] = {
        'transmitted_linear': [round(float(v), 4) for v in t_lin],
        'reflected_linear': [round(float(v), 4) for v in r_lin],
        'transmitted_hex': srgb_hex(t_lin),
        'reflected_hex': srgb_hex(r_lin),
        'transmitted_hue_hex': srgb_hex(t_lin, 1.0),
        'visible_transmission': round(float((C[:, 1] * T).sum() / C[:, 1].sum()), 3),
        'visible_reflection': round(float((C[:, 1] * R).sum() / C[:, 1].sum()), 3),
    }
    print(b, out[b]['transmitted_hex'], out[b]['reflected_hex'], 'Tvis', out[b]['visible_transmission'], 'Rvis', out[b]['visible_reflection'])
OUT.write_text(json.dumps(out, indent=1))
