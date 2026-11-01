// Compare the TypeScript tracer against batoid reference traces.
import P from '../src/data/prescription.json';
import { Rubin, BANDS, Band } from '../src/optics/trace';

let worst = 0;
const tel = new Rubin('r');
for (const r of (P as any).raw_r) {
  const res = tel.trace(r.p, r.d, false);
  const last = res.points[res.points.length - 1];
  const err = Math.hypot(last[0] - r.out[0], last[1] - r.out[1]);
  if (!r.vig) worst = Math.max(worst, err);
  console.log(`batoid vig=${r.vig}  ours ok=${res.ok} stop=${res.stoppedBy ?? '-'}  err=${(err * 1e9).toFixed(3)} nm`);
}
console.log(`raw rays, worst position error (unvignetted): ${(worst * 1e9).toFixed(3)} nm`);

for (const b of BANDS as Band[]) {
  const t = new Rubin(b);
  const row: string[] = [];
  for (const ref of (P as any)[b].ref) {
    const th = (ref.theta * Math.PI) / 180;
    const rays = t.traceStar(0, th, { rings: 6, perRing: 24, rInner: 2.6 }).filter((r) => r.ok);
    const xs = rays.map((r) => r.points[r.points.length - 1]);
    const my = xs.reduce((s, p) => s + p[1], 0) / xs.length;
    row.push(`${ref.theta}°: y=${(my * 1e3).toFixed(3)}mm (batoid ${(ref.y * 1e3).toFixed(3)})`);
  }
  console.log(b, `n=${t.nSilica.toFixed(6)} (batoid ${(P as any)[b].n_silica.toFixed(6)})`, row.join(' | '));
}
