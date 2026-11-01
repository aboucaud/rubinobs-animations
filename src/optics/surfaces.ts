// Axisymmetric optical surfaces in the Rubin Optical Coordinate System (OCS).
// Conventions follow batoid: sag z(r) = r² / (R (1 + sqrt(1 - (1+k) r²/R²))) + Σ coefs[i] r^(2i+4),
// measured from the surface vertex at OCS height `z0`. Units: metres.

export type V3 = [number, number, number];

export interface SurfaceSpec {
  name: string;
  z: number; // vertex position along the optical axis
  type: 'Asphere' | 'Sphere' | 'Quadric' | 'Plane';
  R?: number;
  k?: number;
  coefs?: number[];
  inner?: number; // clear aperture (annulus) inner radius
  outer?: number; // clear aperture outer radius
  radius?: number; // clear aperture (circle) radius
}

export class Surface {
  readonly name: string;
  readonly z0: number;
  readonly curv: number; // 1/R (0 for plane)
  readonly k: number;
  readonly coefs: number[];
  readonly rIn: number;
  readonly rOut: number;

  constructor(s: SurfaceSpec) {
    this.name = s.name;
    this.z0 = s.z;
    this.curv = s.type === 'Plane' || !s.R ? 0 : 1 / s.R;
    this.k = s.k ?? 0;
    this.coefs = s.coefs ?? [];
    this.rIn = s.inner ?? 0;
    this.rOut = s.outer ?? s.radius ?? Infinity;
  }

  /** Sag relative to the vertex at radius r. */
  sag(r: number): number {
    const c = this.curv;
    const r2 = r * r;
    let z = 0;
    if (c !== 0) z = (c * r2) / (1 + Math.sqrt(Math.max(0, 1 - (1 + this.k) * c * c * r2)));
    let rp = r2 * r2; // r^4
    for (const a of this.coefs) {
      z += a * rp;
      rp *= r2;
    }
    return z;
  }

  /** dz/dr */
  dsag(r: number): number {
    const c = this.curv;
    const r2 = r * r;
    let d = 0;
    if (c !== 0) d = (c * r) / Math.sqrt(Math.max(1e-12, 1 - (1 + this.k) * c * c * r2));
    let rp = r2 * r; // r^3
    let n = 4;
    for (const a of this.coefs) {
      d += n * a * rp;
      rp *= r2;
      n += 2;
    }
    return d;
  }

  /** Global z of the surface at (x, y). */
  zAt(x: number, y: number): number {
    return this.z0 + this.sag(Math.hypot(x, y));
  }

  /** Unit normal at (x, y), oriented toward +z. */
  normal(x: number, y: number): V3 {
    const r = Math.hypot(x, y);
    if (r < 1e-12) return [0, 0, 1];
    const d = this.dsag(r);
    const nx = (-d * x) / r;
    const ny = (-d * y) / r;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    return [nx * inv, ny * inv, inv];
  }

  /** Newton-Raphson intersection of the ray p + t·d with the surface. Returns t or null. */
  intersect(p: V3, d: V3): number | null {
    if (Math.abs(d[2]) < 1e-12) return null;
    let t = (this.z0 - p[2]) / d[2];
    for (let i = 0; i < 30; i++) {
      const x = p[0] + t * d[0];
      const y = p[1] + t * d[1];
      const r = Math.hypot(x, y);
      const f = p[2] + t * d[2] - this.z0 - this.sag(r);
      let dfdt = d[2];
      if (r > 1e-12) {
        const ds = this.dsag(r);
        dfdt -= (ds * (x * d[0] + y * d[1])) / r;
      }
      const dt = f / dfdt;
      t -= dt;
      if (Math.abs(dt) < 1e-13) break;
    }
    return t;
  }

  inAperture(x: number, y: number): boolean {
    const r = Math.hypot(x, y);
    return r >= this.rIn && r <= this.rOut;
  }
}

/** Fused silica Sellmeier index (batoid constants), wavelength in metres. */
export function silicaIndex(wavelength: number): number {
  const l2 = (wavelength * 1e6) ** 2;
  const B = [0.69618302, 0.407925877, 0.897464057];
  const C = [0.00467926519, 0.0135122244, 97.9323636];
  let n2 = 1;
  for (let i = 0; i < 3; i++) n2 += (B[i] * l2) / (l2 - C[i]);
  return Math.sqrt(n2);
}
