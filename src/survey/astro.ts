// Low-precision positional astronomy for the survey page (Astronomical Almanac formulas):
// sidereal time, Sun and Moon, horizontal / ecliptic / galactic coordinates. Accuracy ~0.01° for the
// Sun and ~0.3° for the Moon (geocentric), plenty for a 3.5° field of view. Angles in radians.

export const D2R = Math.PI / 180;

/** Rubin Observatory (Cerro Pachón), from rubin_scheduler `Site("LSST")`. */
export const SITE = { lat: -30.244628 * D2R, lon: -70.74941 * D2R };

export const jdFromMs = (ms: number) => ms / 86400000 + 2440587.5;
export const msFromJd = (jd: number) => (jd - 2440587.5) * 86400000;

const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** Local mean sidereal time at the site. */
export function lst(jd: number) {
  const d = jd - 2451545.0;
  const t = d / 36525;
  return wrap((280.46061837 + 360.98564736629 * d + 0.000387933 * t * t) * D2R + SITE.lon);
}

const obliquity = (jd: number) => (23.439 - 0.0000004 * (jd - 2451545.0)) * D2R;

interface RaDec {
  ra: number;
  dec: number;
}

function eclToEq(lambda: number, beta: number, jd: number): RaDec {
  const e = obliquity(jd);
  const sl = Math.sin(lambda);
  const ra = Math.atan2(sl * Math.cos(e) - Math.tan(beta) * Math.sin(e), Math.cos(lambda));
  const dec = Math.asin(Math.sin(beta) * Math.cos(e) + Math.cos(beta) * Math.sin(e) * sl);
  return { ra: wrap(ra), dec };
}

/** Ecliptic latitude of an equatorial direction (J2000 obliquity). */
export function eclipticLat(ra: number, dec: number) {
  const e = 23.4393 * D2R;
  return Math.asin(Math.sin(dec) * Math.cos(e) - Math.cos(dec) * Math.sin(e) * Math.sin(ra));
}

export function sun(jd: number): RaDec {
  const n = jd - 2451545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * D2R;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  return eclToEq(lambda, 0, jd);
}

/** Geocentric Moon with the main periodic terms. */
export function moon(jd: number): RaDec {
  const d = jd - 2451545.0;
  const L = 218.316 + 13.176396 * d;
  const M = (134.963 + 13.064993 * d) * D2R;
  const F = (93.272 + 13.22935 * d) * D2R;
  const D = (297.85 + 12.190749 * d) * D2R;
  const Ms = (357.529 + 0.98560028 * d) * D2R;
  const lambda =
    L + 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * M) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F);
  const beta = 5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F) + 0.173 * Math.sin(2 * D - F);
  return eclToEq(lambda * D2R, beta * D2R, jd);
}

const separation = (a: RaDec, b: RaDec) =>
  Math.acos(Math.min(1, Math.sin(a.dec) * Math.sin(b.dec) + Math.cos(a.dec) * Math.cos(b.dec) * Math.cos(a.ra - b.ra)));

/** Illuminated fraction of the Moon (0–1). */
export const moonIllumination = (jd: number) => (1 - Math.cos(separation(sun(jd), moon(jd)))) / 2;

interface AltAz {
  alt: number;
  /** from north through east */
  az: number;
}

export function altAz(ra: number, dec: number, lstRad: number): AltAz {
  const h = lstRad - ra;
  const sa = Math.sin(dec) * Math.sin(SITE.lat) + Math.cos(dec) * Math.cos(SITE.lat) * Math.cos(h);
  const alt = Math.asin(sa);
  const az = Math.atan2(-Math.cos(dec) * Math.sin(h), Math.sin(dec) * Math.cos(SITE.lat) - Math.cos(dec) * Math.sin(SITE.lat) * Math.cos(h));
  return { alt, az: wrap(az) };
}

/** Parallactic angle (radians) of a direction at hour angle lst - ra. */
export function parallactic(ra: number, dec: number, lstRad: number) {
  const h = lstRad - ra;
  return Math.atan2(Math.sin(h), Math.tan(SITE.lat) * Math.cos(dec) - Math.sin(dec) * Math.cos(h));
}

/** Airmass (plane-parallel, enough above 20° altitude). */
export const airmass = (alt: number) => 1 / Math.sin(Math.max(alt, 0.05));

// J2000 equatorial → galactic rotation (Hipparcos definition)
const G = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

export function galactic(ra: number, dec: number) {
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const gx = G[0][0] * x + G[0][1] * y + G[0][2] * z;
  const gy = G[1][0] * x + G[1][1] * y + G[1][2] * z;
  const gz = G[2][0] * x + G[2][1] * y + G[2][2] * z;
  return { l: wrap(Math.atan2(gy, gx)), b: Math.asin(gz) };
}

export const GAL_MATRIX = G;

export const sunAlt = (jd: number) => {
  const s = sun(jd);
  return altAz(s.ra, s.dec, lst(jd)).alt;
};

/** First time after `jd` (searching up to `span` days) when the Sun crosses `alt` going down / up. */
export function sunCrossing(jd: number, altDeg: number, rising: boolean, span = 1) {
  const step = 10 / 1440;
  const target = altDeg * D2R;
  let prev = sunAlt(jd) - target;
  for (let t = jd + step; t <= jd + span; t += step) {
    const cur = sunAlt(t) - target;
    if ((rising && prev < 0 && cur >= 0) || (!rising && prev > 0 && cur <= 0)) {
      let a = t - step;
      let b = t;
      for (let i = 0; i < 30; i++) {
        const m = (a + b) / 2;
        const v = sunAlt(m) - target;
        if ((v < 0) === rising) a = m;
        else b = m;
      }
      return (a + b) / 2;
    }
    prev = cur;
  }
  return NaN;
}
