// Survey footprint and per-band visit ratios, after rubin_scheduler `Phase3AreaMap` (v4.6.1):
// each sky direction belongs to the first region that claims it, in the scheduler's order, and the
// region sets the ratio of visits wanted in each band (low-dust WFD r = 1 by convention).
// Simplification: the E(B-V) < 0.2 low-dust cut (from the SFD dust map) is approximated by |b| > 15°,
// and the Euclid-overlap region is left out.
import type { Band } from '../scene/bands';
import { D2R, eclipticLat, galactic } from './astro';

type Ratios = Record<Band, number>;
const r = (u: number, g: number, rr: number, i: number, z: number, y: number): Ratios => ({ u, g, r: rr, i, z, y });

export const REGIONS = {
  lmc_smc: { name: 'Magellanic Clouds', ratios: r(0.65, 0.65, 1.1, 1.1, 0.34, 0.35) },
  lowdust: { name: 'Wide-Fast-Deep (low dust)', ratios: r(0.35, 0.4, 1, 1, 0.9, 0.9) },
  virgo: { name: 'Virgo cluster', ratios: r(0.35, 0.4, 1, 1, 0.9, 0.9) },
  bulgy: { name: 'Galactic bulge and plane', ratios: r(0.17, 0.93, 0.98, 0.98, 0.93, 0.21) },
  nes: { name: 'North Ecliptic Spur', ratios: r(0, 0.255, 0.33, 0.33, 0.23, 0) },
  dusty: { name: 'Dusty plane', ratios: r(0.093, 0.26, 0.26, 0.26, 0.26, 0.093) },
  scp: { name: 'South Celestial Pole', ratios: r(0.1, 0.175, 0.1, 0.135, 0.046, 0.047) },
} as const;
type Region = keyof typeof REGIONS;

// [ra, dec, radius] (degrees) of the circles making up the 'bulgy' galactic-plane region
const BULGY = [
  [100.9, 9.55, 3], [84.92, -5.71, 3], [266.3, -29, 17], [279, -13, 10], [256, -45, 11], [155, -56.5, 6.5],
  [172, -62, 5], [190, -65, 5], [210, -64, 5], [242, -58, 6.5], [225, -60, 6.5],
];
const LMC = [80.89386, -69.756126, 6];
const SMC = [13.186588, -72.828599, 4];
const VIRGO = [186.75, 12.717, 8.75];

const within = (ra: number, dec: number, c: number[]) => {
  const a = Math.sin(dec) * Math.sin(c[1] * D2R) + Math.cos(dec) * Math.cos(c[1] * D2R) * Math.cos(ra - c[0] * D2R);
  return a > Math.cos(c[2] * D2R);
};

/** Region of a direction (radians), or null outside the survey. */
export function region(ra: number, dec: number): Region | null {
  const decD = dec / D2R;
  const raD = ra / D2R;
  const { l, b } = galactic(ra, dec);
  const bD = b / D2R;
  const lD = l / D2R;
  const lowDust = Math.abs(bD) > 15;
  // the clouds plus a rectangular bridge between them
  if (within(ra, dec, LMC) || within(ra, dec, SMC) || (raD > SMC[0] && raD < LMC[0] && decD > -76.8 && decD < -63.8)) return 'lmc_smc';
  if (lowDust && decD > -70 && decD < 15 && !(bD < 0 && decD > 15 - 12)) return 'lowdust';
  if (within(ra, dec, VIRGO)) return 'virgo';
  if (BULGY.some((c) => within(ra, dec, c))) return 'bulgy';
  const el = eclipticLat(ra, dec) / D2R;
  if ((el > -10 || decD > 0) && el < 10 && lD >= 45 && lD <= 315) return 'nes';
  if (!lowDust && decD < 15) return 'dusty';
  if (decD < -60) return 'scp';
  return null;
}

// ---------------------------------------------------------------- field grid
/** Pointing centres: a Fibonacci lattice with one field per ~9 deg² (the field covers 9.6 deg²). */
export interface Field {
  ra: number;
  dec: number;
  ratios: Ratios;
  /** unit vector */
  x: number;
  y: number;
  z: number;
}

export function makeFields(n = 4600): Field[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Field[] = [];
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n;
    const dec = Math.asin(z);
    const ra = (((i * golden) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const reg = region(ra, dec);
    if (!reg) continue;
    out.push({ ra, dec, ratios: REGIONS[reg].ratios, x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z });
  }
  return out;
}
