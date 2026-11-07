// Compare the TypeScript tracer against batoid reference traces (exported by
// tools/export_prescription.py). Exits with an error if they disagree, so CI catches regressions.
import P from '../src/data/prescription.json';
import { Rubin, BANDS } from '../src/optics/trace';

declare const process: { exit(code: number): never }; // (no @types/node in this project)

const MAX_POS_ERR = 1e-9; // 1 nm on individual rays
const MAX_CENTROID_ERR = 5e-6; // 5 µm on centroids (different pupil sampling than batoid's)
let failures = 0;

// 1. individual rays (r band), traced without obscurations: same landing point as batoid
let worst = 0;
let compared = 0;
const tel = new Rubin('r');
for (const r of (P as any).raw_r) {
  if (r.vig) continue; // vignetted by batoid: its final position is meaningless
  const res = tel.trace(r.p, r.d, false);
  const last = res.points[res.points.length - 1];
  worst = Math.max(worst, Math.hypot(last[0] - r.out[0], last[1] - r.out[1]));
  compared++;
}
console.log(`individual rays: ${compared} compared, worst position error ${(worst * 1e9).toFixed(3)} nm`);
if (worst > MAX_POS_ERR) failures++;
// with baffles and spider: the same rays are vignetted as in batoid
const raw = (P as any).raw_r as { p: any; d: any; vig: boolean }[];
const sameVig = raw.filter((r) => tel.trace(r.p, r.d, true).ok === !r.vig).length;
console.log(`vignetting: ${sameVig}/${raw.length} rays agree with batoid`);
if (sameVig !== raw.length) failures++;

// 2. star centroids in every band, field angles 0–1.75°
for (const b of BANDS) {
  const t = new Rubin(b);
  const row: string[] = [];
  for (const ref of (P as any)[b].ref) {
    const th = (ref.theta * Math.PI) / 180;
    const rays = t.traceStar(0, th, { rings: 6, perRing: 24, rInner: 2.6 }).filter((r) => r.ok);
    const my = rays.reduce((s, r) => s + r.points[r.points.length - 1][1], 0) / rays.length;
    const err = Math.abs(my - ref.y);
    if (err > MAX_CENTROID_ERR) failures++;
    row.push(`${ref.theta}°: ${(my * 1e3).toFixed(3)} mm (Δ ${(err * 1e6).toFixed(2)} µm)`);
  }
  const dn = Math.abs(t.nSilica - (P as any)[b].n_silica);
  if (dn > 1e-6) failures++;
  console.log(`${b}  n = ${t.nSilica.toFixed(6)} (Δ ${dn.toExponential(1)}) | ${row.join(' | ')}`);
}

if (failures) {
  console.error(`FAILED: ${failures} check(s) out of tolerance`);
  process.exit(1);
}
console.log('OK: ray tracer agrees with batoid');
