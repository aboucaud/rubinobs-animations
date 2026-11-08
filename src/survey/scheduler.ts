// A compact survey scheduler in the spirit of rubin_scheduler (v4.6.1): visits are taken in "blobs"
// of neighbouring fields observed twice ~33 minutes apart in a pair of bands (ug, ur, gr, ri, iz, zy, yy),
// chosen from the visit deficit of each field and band, the airmass and the sky brightness (Moon,
// twilight). Slews follow the rubin_scheduler kinematic model of the mount and dome; filter changes take
// the time of the LSSTCam exchange sequence. Simplified on purpose: no weather, no deep-drilling
// fields, no twilight near-Sun survey, no rolling cadence.
import type { Band } from '../scene/bands';
import { exchangeTime } from '../scene/fes_times';
import { D2R, airmass, altAz, lst, moon, moonIllumination, parallactic, sun, sunCrossing } from './astro';
import { makeFields, type Field } from './footprint';

const BAND_INDEX: Record<Band, number> = { u: 0, g: 1, r: 2, i: 3, z: 4, y: 5 };
const BANDS_ALL: Band[] = ['u', 'g', 'r', 'i', 'z', 'y'];

/** Timings (s) and limits. Sources: rubin_scheduler kinem_model / lsst_surveys, media kit, FES paper. */
const OPS = {
  exptime: 30,
  uExptime: 38,
  shutter: 0.9,
  readout: 2,
  tel: { altV: 3.5, altA: 3.5, azV: 7, azA: 7, settle: 3, azMin: -250, azMax: 250 },
  dome: { altV: 1.75, altA: 0.875, azV: 1.5, azA: 0.75, azFree: 4, settle: 1 },
  /** active-optics closed loop after a large change of elevation */
  closedLoop: { dAlt: 9, delay: 36 },
  minAlt: 20,
  blobMaxAlt: 76,
  moonAvoid: 30,
  pairTime: 33 * 60,
  twilight: -12,
  /** Moon illumination at sunset above which u is swapped out for y (rubin_scheduler illum_limit) */
  illumLimit: 0.4,
  ditherDeg: 0.7,
  rotTelMax: 80,
};

const PAIRS: [Band, Band][] = [['u', 'g'], ['u', 'r'], ['g', 'r'], ['r', 'i'], ['i', 'z'], ['z', 'y'], ['y', 'y']];
/** socket of each band in the carousel (the 6th filter shares a socket with u, see fes.ts) */
const SOCKET: Record<Band, number> = { u: 0, y: 0, g: 1, r: 2, i: 3, z: 4 };

export interface Visit {
  /** JD when the shutter starts to open */
  t0: number;
  /** seconds from the shutter starting to open to fully closed */
  dur: number;
  /** seconds between the end of the previous visit and this one (slew, settle, filter change, readout) */
  gap: number;
  filterChange: boolean;
  closedLoop: boolean;
  band: Band;
  ra: number;
  dec: number;
  /** rotSkyPos (radians) */
  rot: number;
  field: number;
  alt: number;
  airmass: number;
  /** 1st or 2nd visit of the pair */
  pass: 1 | 2;
}

export interface Night {
  index: number;
  /** evening and morning -12° twilight (JD) */
  start: number;
  end: number;
  mounted: Band[];
  visits: Visit[];
}

const trap = (d: number, v: number, a: number) => (d <= 0 ? 0 : d < (v * v) / a ? 2 * Math.sqrt(d / a) : d / v + v / a);
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Small deterministic PRNG (mulberry32) so a given start date always gives the same survey. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Scheduler {
  readonly fields: Field[];
  /** visits per field and band (index f * 6 + band) */
  readonly counts: Float32Array;
  readonly bandTotals = new Float64Array(6);
  total = 0;
  private ratioSum = 0;
  private bandTarget = new Float64Array(6);
  private alt = 86.5;
  private az = 0;
  private band: Band = 'r';
  private nights = 0;
  private rand: () => number;

  constructor(seed = 1) {
    this.fields = makeFields();
    this.counts = new Float32Array(this.fields.length * 6);
    for (const f of this.fields) for (const b of BANDS_ALL) this.bandTarget[BAND_INDEX[b]] += f.ratios[b];
    this.ratioSum = this.bandTarget.reduce((a, b) => a + b, 0);
    for (let k = 0; k < 6; k++) this.bandTarget[k] /= this.ratioSum;
    this.rand = rng(seed);
  }

  /** Telescope + dome slew time (s) between two (alt, az) positions in degrees, settle included. */
  slewTime(alt0: number, az0: number, alt1: number, az1: number) {
    const { tel, dome } = OPS;
    const dAlt = Math.abs(alt1 - alt0);
    const dAz = Math.abs(az1 - az0);
    const telT = Math.max(trap(dAlt, tel.altV, tel.altA), trap(dAz, tel.azV, tel.azA)) + tel.settle;
    const dAzDome = Math.abs(wrapPi((az1 - az0) * D2R)) / D2R;
    const domeAz = dAzDome > dome.azFree ? trap(dAzDome, dome.azV, dome.azA) + dome.settle : 0;
    const domeT = Math.max(trap(dAlt, dome.altV, dome.altA), domeAz);
    return Math.max(telT, domeT);
  }

  /** Telescope azimuth (degrees, cable-wrap range ±250°) closest to the current one. */
  private wrapAz(azDeg: number) {
    let a = this.az + wrapPi((azDeg - this.az) * D2R) / D2R;
    if (a > OPS.tel.azMax) a -= 360;
    if (a < OPS.tel.azMin) a += 360;
    return a;
  }

  /** Plan the night starting after local noon `noonJd`. */
  planNight(noonJd: number): Night {
    const start = sunCrossing(noonJd, OPS.twilight, false);
    const end = sunCrossing(start, OPS.twilight, true);
    const sunset = sunCrossing(noonJd, 0, false);
    const illum = moonIllumination(sunset);
    const mounted: Band[] = illum > OPS.illumLimit ? ['g', 'r', 'i', 'z', 'y'] : ['u', 'g', 'r', 'i', 'z'];
    if (!mounted.includes(this.band)) this.band = 'r';
    const night: Night = { index: this.nights++, start, end, mounted, visits: [] };
    const rotTel: Partial<Record<Band, number>> = {};
    for (const b of mounted) rotTel[b] = (this.rand() * 2 - 1) * OPS.rotTelMax * D2R;
    const done = new Uint8Array(this.fields.length);
    const tonight = new Uint16Array(6);
    // per-night translational dither of each field (uniform in a 0.7° disc)
    const dither = new Float32Array(this.fields.length * 2);
    for (let k = 0; k < this.fields.length; k++) {
      const r = Math.sqrt(this.rand()) * OPS.ditherDeg * D2R;
      const a = this.rand() * 2 * Math.PI;
      dither[2 * k] = r * Math.cos(a);
      dither[2 * k + 1] = r * Math.sin(a);
    }

    let t = start;
    let lastEnd = start;
    while (t < end) {
      const blob = this.pickBlob(t, end, mounted, done, tonight);
      if (!blob) {
        t += 5 / 1440;
        continue;
      }
      const before = night.visits.length;
      tonight[BAND_INDEX[blob.bands[0]]]++;
      tonight[BAND_INDEX[blob.bands[1]]]++;
      for (const pass of [1, 2] as const) {
        const band = pass === 1 ? blob.bands[0] : blob.bands[1];
        if (pass === 2 && blob.single) break;
        for (const k of blob.fields) {
          const f = this.fields[k];
          const dec = f.dec + dither[2 * k + 1];
          const ra = f.ra + dither[2 * k] / Math.max(0.05, Math.cos(f.dec));
          const L = lst(t);
          const h = altAz(ra, dec, L);
          const alt = h.alt / D2R;
          if (alt < OPS.minAlt) continue;
          const az = this.wrapAz(h.az / D2R);
          let gap = Math.max(OPS.readout, this.slewTime(this.alt, this.az, alt, az));
          const change = band !== this.band;
          if (change) {
            const s = Math.abs(SOCKET[band] - SOCKET[this.band]);
            gap = Math.max(gap, exchangeTime(Math.min(s, 5 - s)));
          }
          const cl = Math.abs(alt - this.alt) >= OPS.closedLoop.dAlt;
          if (cl) gap += OPS.closedLoop.delay;
          const t0 = (t === start ? t : t + gap / 86400);
          const dur = (band === 'u' ? OPS.uExptime : OPS.exptime) + OPS.shutter;
          if (t0 + dur / 86400 > end) {
            t = end;
            break;
          }
          const pa = parallactic(ra, dec, lst(t0));
          night.visits.push({
            t0,
            dur,
            gap: (t0 - lastEnd) * 86400,
            filterChange: change,
            closedLoop: cl,
            band,
            ra,
            dec,
            rot: pa - rotTel[band]! - Math.PI / 2,
            field: k,
            alt,
            airmass: airmass(h.alt),
            pass,
          });
          this.alt = alt;
          this.az = az;
          this.band = band;
          this.counts[k * 6 + BAND_INDEX[band]]++;
          this.bandTotals[BAND_INDEX[band]]++;
          this.total++;
          done[k] = 1;
          t = lastEnd = t0 + dur / 86400;
        }
      }
      if (night.visits.length === before) t += 5 / 1440;
    }
    return night;
  }

  private pickBlob(t: number, end: number, mounted: Band[], done: Uint8Array, tonight: Uint16Array) {
    const remaining = (end - t) * 86400;
    const perVisit = OPS.exptime + OPS.shutter + 5;
    const single = remaining < 2 * 10 * perVisit;
    const n = Math.floor(Math.min(OPS.pairTime, single ? remaining : remaining / 2) / perVisit);
    if (n < 1) return null;
    const passT = (n * perVisit) / 86400;

    // sky conditions now
    const L = lst(t);
    const s = sun(t);
    const sunAlt = altAz(s.ra, s.dec, L).alt / D2R;
    const m = moon(t);
    const mh = altAz(m.ra, m.dec, L);
    const illum = moonIllumination(t);
    const moonSky = mh.alt > 0 ? illum * Math.sqrt(Math.sin(mh.alt)) : 0;
    const twi = Math.min(1, Math.max(0, (sunAlt + 18) / 6));
    const pen: Record<Band, number> = {
      u: 0.06 * moonSky + 0.08 * twi,
      g: 0.03 * moonSky + 0.05 * twi,
      r: 0.01 * moonSky + 0.02 * twi,
      i: 0.003 * moonSky + 0.008 * twi,
      z: 0,
      y: 0,
    };
    const N = this.total + 50;
    const need = (b: Band) => this.bandTarget[BAND_INDEX[b]] - (this.bandTotals[BAND_INDEX[b]] + 50 * this.bandTarget[BAND_INDEX[b]]) / N;
    let best: [Band, Band] | null = null;
    let bestScore = -Infinity;
    for (const p of PAIRS) {
      if (!mounted.includes(p[0]) || !mounted.includes(p[1])) continue;
      // spread the bands within a night: each blob already taken tonight in a band costs a little
      const used = 0.004 * (tonight[BAND_INDEX[p[0]]] + tonight[BAND_INDEX[p[1]]]);
      const sc = need(p[0]) + need(p[1]) - pen[p[0]] - pen[p[1]] - used - (p[0] !== this.band ? 0.004 : 0) + this.rand() * 0.002;
      if (sc > bestScore) {
        bestScore = sc;
        best = p;
      }
    }
    if (!best) return null;
    const [b1, b2] = best;
    const i1 = BAND_INDEX[b1];
    const i2 = BAND_INDEX[b2];

    // fields usable for the whole blob (now and at the end of the second pass)
    const tEnd = t + (single ? 1 : 2) * passT;
    const L2 = lst(tEnd);
    const mEnd = moon(tEnd);
    const cosMoon = Math.cos(OPS.moonAvoid * D2R);
    const mv = [Math.cos(m.dec) * Math.cos(m.ra), Math.cos(m.dec) * Math.sin(m.ra), Math.sin(m.dec)];
    const mv2 = [Math.cos(mEnd.dec) * Math.cos(mEnd.ra), Math.cos(mEnd.dec) * Math.sin(mEnd.ra), Math.sin(mEnd.dec)];
    const scale = this.total / this.ratioSum;
    const cand: number[] = [];
    const score = new Float32Array(this.fields.length);
    let seed = -1;
    let seedScore = -Infinity;
    for (let k = 0; k < this.fields.length; k++) {
      const f = this.fields[k];
      if (done[k] || f.ratios[b1] === 0 || f.ratios[b2] === 0) continue;
      if (f.x * mv[0] + f.y * mv[1] + f.z * mv[2] > cosMoon || f.x * mv2[0] + f.y * mv2[1] + f.z * mv2[2] > cosMoon) continue;
      const a1 = altAz(f.ra, f.dec, L).alt / D2R;
      const a2 = altAz(f.ra, f.dec, L2).alt / D2R;
      if (Math.min(a1, a2) < OPS.minAlt + 5 || Math.max(a1, a2) > OPS.blobMaxAlt) continue;
      cand.push(k);
      // relative deficit: how far behind its own target this field is, in this pair of bands
      const expected = (f.ratios[b1] + f.ratios[b2]) * scale;
      const deficit = (expected - this.counts[k * 6 + i1] - this.counts[k * 6 + i2]) / (expected + 2);
      const sc = deficit - 0.8 * (airmass(((a1 + a2) / 2) * D2R) - 1) + this.rand() * 0.02;
      score[k] = sc;
      if (sc > seedScore) {
        seedScore = sc;
        seed = k;
      }
    }
    if (seed < 0) return null;
    // the blob: the n best fields near the seed (distance penalty keeps it compact)
    const fs = this.fields[seed];
    const ranked = cand
      .map((k) => {
        const f = this.fields[k];
        const dist = Math.acos(Math.min(1, f.x * fs.x + f.y * fs.y + f.z * fs.z)) / D2R;
        return { k, v: score[k] - 0.03 * dist };
      })
      .sort((a, b) => b.v - a.v)
      .slice(0, n)
      .map((o) => o.k);
    // boustrophedon order: 3.5° declination strips, alternating direction in RA
    const strip = (k: number) => Math.floor(this.fields[k].dec / (3.5 * D2R));
    const raRel = (k: number) => wrapPi(this.fields[k].ra - fs.ra);
    ranked.sort((a, b) => strip(a) - strip(b) || (strip(a) % 2 ? -1 : 1) * (raRel(a) - raRel(b)));
    return { fields: ranked, bands: [b1, b2] as [Band, Band], single };
  }
}
