// Sequential ray tracer for the Simonyi Survey Telescope + LSSTCam.
// Validated against batoid (tools/validate.ts).
import prescription from '../data/prescription.json';
import baffles from '../data/baffles.json';
import { Surface, SurfaceSpec, V3, silicaIndex } from './surfaces';

export type Band = 'u' | 'g' | 'r' | 'i' | 'z' | 'y';
export const BANDS: Band[] = ['u', 'g', 'r', 'i', 'z', 'y'];

type BandData = { wavelength: number; n_silica: number; surfaces: SurfaceSpec[] };
const P = prescription as unknown as Record<Band, BandData>;

export interface Obscuration {
  name: string;
  z: number;
  /** returns true if (x,y) on the plane z is blocked */
  blocks(x: number, y: number): boolean;
}

function annulus(name: string, z: number, inner: number, outer: number): Obscuration {
  return {
    name,
    z,
    blocks: (x, y) => {
      const r = Math.hypot(x, y);
      return r >= inner && r <= outer;
    },
  };
}

/** Rectangles of the centre plate and spider vanes (batoid LTS-213 model, z = 8.618 m). */
export const SPIDER = {
  z: 8.6180006,
  rects: [
    { w: 2.8454, h: 1.6764, x: 0, y: 0, th: 0 },
    { w: 1.6764, h: 2.8454, x: 0, y: 0, th: 0 },
    { w: 0.8, h: 3.2, x: 0, y: 0, th: Math.PI / 4 },
    { w: 0.8, h: 3.2, x: 0, y: 0, th: -Math.PI / 4 },
    { w: 0.05, h: 9.6, x: 0, y: 0.5656854249, th: Math.PI / 4 },
    { w: 0.05, h: 9.6, x: 0, y: 0.5656854249, th: (3 * Math.PI) / 4 },
    { w: 0.05, h: 9.6, x: 0, y: -0.5656854249, th: Math.PI / 4 },
    { w: 0.05, h: 9.6, x: 0, y: -0.5656854249, th: (3 * Math.PI) / 4 },
  ],
};

function spiderObsc(): Obscuration {
  return {
    name: 'Spider',
    z: SPIDER.z,
    blocks: (x, y) => {
      for (const r of SPIDER.rects) {
        const dx = x - r.x;
        const dy = y - r.y;
        const c = Math.cos(r.th);
        const s = Math.sin(r.th);
        const u = c * dx + s * dy;
        const v = -s * dx + c * dy;
        if (Math.abs(u) <= r.w / 2 && Math.abs(v) <= r.h / 2) return true;
      }
      return false;
    },
  };
}

const B = baffles as { name: string; z: number; inner: number; outer: number }[];

/** Obscurations crossed by the incoming beam (sky → M1), ordered by decreasing z. */
function incomingObscurations(): Obscuration[] {
  const list: Obscuration[] = [
    annulus('CenterCap', 9.818006, 0, 1.1),
    spiderObsc(),
    ...B.filter((b) => b.name !== 'M1CaBaffle2').map((b) => annulus(b.name, b.z, b.inner, b.outer)),
  ];
  return list.sort((a, b) => b.z - a.z);
}

export interface TraceResult {
  /** polyline vertices (OCS) from start to last hit */
  points: V3[];
  /** names of the element hit at each vertex after the start */
  hits: string[];
  /** true if the ray reached the detector */
  ok: boolean;
  /** what stopped the ray, if not ok */
  stoppedBy?: string;
}

interface Step {
  surface?: Surface;
  kind: 'mirror' | 'refract' | 'detector' | 'obsc';
  n2?: number; // index after the interface
  obsc?: Obscuration[];
}

export class Rubin {
  readonly band: Band;
  readonly wavelength: number;
  readonly nSilica: number;
  readonly surfaces: Record<string, Surface> = {};
  private steps: Step[] = [];

  constructor(band: Band, wavelength?: number) {
    this.band = band;
    const d = P[band];
    this.wavelength = wavelength ?? d.wavelength;
    this.nSilica = silicaIndex(this.wavelength);
    for (const s of d.surfaces) this.surfaces[s.name] = new Surface(s);
    const S = this.surfaces;
    const n = this.nSilica;
    const camBody = annulus('CameraBody', 3.5019725882045593, 0, 0.80469);
    const m1ca2 = B.find((b) => b.name === 'M1CaBaffle2')!;
    this.steps = [
      { kind: 'obsc', obsc: incomingObscurations() },
      { surface: S.M1, kind: 'mirror' },
      { kind: 'obsc', obsc: [annulus('M1CaBaffle2', m1ca2.z, m1ca2.inner, m1ca2.outer)] },
      { surface: S.M2, kind: 'mirror' },
      { kind: 'obsc', obsc: [camBody] },
      { surface: S.M3, kind: 'mirror' },
      { surface: S.L1_entrance, kind: 'refract', n2: n },
      { surface: S.L1_exit, kind: 'refract', n2: 1 },
      { surface: S.L2_entrance, kind: 'refract', n2: n },
      { surface: S.L2_exit, kind: 'refract', n2: 1 },
      { surface: S.Filter_entrance, kind: 'refract', n2: n },
      { surface: S.Filter_exit, kind: 'refract', n2: 1 },
      { surface: S.L3_entrance, kind: 'refract', n2: n },
      { surface: S.L3_exit, kind: 'refract', n2: 1 },
      { surface: S.Detector, kind: 'detector' },
    ];
  }

  /** Unit direction of light arriving from field angle (thx, thy) in radians (Postel projection, as batoid). */
  static fieldDirection(thx: number, thy: number): V3 {
    const rho = Math.hypot(thx, thy);
    if (rho < 1e-15) return [0, 0, -1];
    const s = Math.sin(rho) / rho;
    return [s * thx, s * thy, -Math.cos(rho)];
  }

  trace(p0: V3, d0: V3, checkObscurations = true): TraceResult {
    let p: V3 = [...p0];
    let d: V3 = [...d0];
    let n1 = 1;
    const points: V3[] = [[...p]];
    const hits: string[] = [];
    for (const st of this.steps) {
      if (st.kind === 'obsc') {
        if (!checkObscurations) continue;
        for (const o of st.obsc!) {
          const t = (o.z - p[2]) / d[2];
          if (t <= 0) continue;
          const x = p[0] + t * d[0];
          const y = p[1] + t * d[1];
          if (o.blocks(x, y)) {
            points.push([x, y, o.z]);
            hits.push(o.name);
            return { points, hits, ok: false, stoppedBy: o.name };
          }
        }
        continue;
      }
      const s = st.surface!;
      const t = s.intersect(p, d);
      if (t === null || t <= 0) return { points, hits, ok: false, stoppedBy: s.name };
      p = [p[0] + t * d[0], p[1] + t * d[1], p[2] + t * d[2]];
      points.push([...p]);
      hits.push(s.name);
      if (!s.inAperture(p[0], p[1])) return { points, hits, ok: false, stoppedBy: s.name };
      const nrm = s.normal(p[0], p[1]);
      const cosI = d[0] * nrm[0] + d[1] * nrm[1] + d[2] * nrm[2];
      if (st.kind === 'mirror') {
        d = [d[0] - 2 * cosI * nrm[0], d[1] - 2 * cosI * nrm[1], d[2] - 2 * cosI * nrm[2]];
      } else if (st.kind === 'refract') {
        const n2 = st.n2!;
        // orient normal against the incoming ray
        const sgn = cosI < 0 ? 1 : -1;
        const nn: V3 = [nrm[0] * sgn, nrm[1] * sgn, nrm[2] * sgn];
        const ci = -(d[0] * nn[0] + d[1] * nn[1] + d[2] * nn[2]);
        const eta = n1 / n2;
        const k = 1 - eta * eta * (1 - ci * ci);
        if (k < 0) return { points, hits, ok: false, stoppedBy: s.name + ' (TIR)' };
        const f = eta * ci - Math.sqrt(k);
        d = [eta * d[0] + f * nn[0], eta * d[1] + f * nn[1], eta * d[2] + f * nn[2]];
        n1 = n2;
      } else {
        return { points, hits, ok: true };
      }
    }
    return { points, hits, ok: false };
  }

  /**
   * Trace a bundle of parallel rays from a star at field angle (thx, thy).
   * Rays are aimed through the entrance pupil (plane z = 0.4394 m), sampled on rings
   * over the annular pupil, and started `startZ` metres above the M1 vertex.
   */
  traceStar(
    thx: number,
    thy: number,
    opts: { rings?: number; perRing?: number; startZ?: number; rOuter?: number; rInner?: number; pattern?: 'bundle' | 'fan'; fanAngle?: number } = {},
  ) {
    const rings = opts.rings ?? 7;
    const per = opts.perRing ?? 24;
    const startZ = opts.startZ ?? 12;
    const rO = opts.rOuter ?? 4.18;
    const rI = opts.rInner ?? 2.0; // a bit inside the obscuration so the shadow of the camera/M2 shows
    const d = Rubin.fieldDirection(thx, thy);
    const zp = 0.4393899;
    const pupil: [number, number][] = [];
    if (opts.pattern === 'fan') {
      // rays along one diameter of the pupil (a planar fan), angle measured from OCS +x
      const a = opts.fanAngle ?? 0;
      const n = rings * 2;
      for (const sg of [-1, 1])
        for (let i = 0; i < n; i++) {
          const r = sg * (rI + ((rO - rI) * (i + 0.5)) / n);
          pupil.push([r * Math.cos(a), r * Math.sin(a)]);
        }
    } else {
      for (let i = 0; i < rings; i++) {
        const r = rI + ((rO - rI) * (i + 0.5)) / rings;
        const nAz = Math.max(6, Math.round((per * r) / rO));
        for (let j = 0; j < nAz; j++) {
          const a = ((j + (i % 2) * 0.5) / nAz) * Math.PI * 2;
          pupil.push([r * Math.cos(a), r * Math.sin(a)]);
        }
      }
    }
    const t = (startZ - zp) / -d[2];
    return pupil.map(([px, py]) => this.trace([px - t * d[0], py - t * d[1], startZ], d));
  }
}
