// Survey coverage on an equirectangular grid (1/3° texels): visits per band, band and time of the
// last visit. Each visit is rasterised with the real outline of the LSSTCam science array
// (21 rafts of 127 mm at 20.006"/mm, corner rafts excluded), rotated to its rotSkyPos.
import * as THREE from 'three';
import type { Band } from '../scene/bands';
import { D2R } from './astro';
import { region } from './footprint';
import type { Visit } from './scheduler';

export const COV_W = 1080;
export const COV_H = 540;
/** degrees per mm on the focal plane (plate scale 20.006"/mm) */
export const DEG_PER_MM = 20.006 / 3600;
/** half width of the science array (2.5 rafts) and of the 3×3 central rafts, mm */
export const ARRAY_HALF = 317.5;
export const CORNER_HALF = 190.5;
const BAND_INDEX: Record<Band, number> = { u: 0, g: 1, r: 2, i: 3, z: 4, y: 5 };

const texel = (2 * Math.PI) / COV_W;
const decOf = (row: number) => Math.PI / 2 - (row + 0.5) * texel;

export class Coverage {
  /** u g r i visits */
  readonly a = new Uint8Array(COV_W * COV_H * 4);
  /** z y visits, last band + 1 */
  readonly b = new Uint8Array(COV_W * COV_H * 4);
  /** time of the last visit (days since `epoch`) */
  readonly last = new Float32Array(COV_W * COV_H).fill(-1e6);
  readonly texA: THREE.DataTexture;
  readonly texB: THREE.DataTexture;
  readonly texLast: THREE.DataTexture;
  /** survey footprint (255 inside), linearly filtered for a smooth outline */
  readonly texPlan: THREE.DataTexture;
  /** sky area with at least one visit, deg² */
  area = 0;
  /** footprint area, deg² */
  readonly footprintArea: number;
  private dirty = false;
  private lastDirty = false;
  private readonly rowArea = new Float64Array(COV_H);
  private readonly sinDec = new Float64Array(COV_H);
  private readonly cosDec = new Float64Array(COV_H);

  constructor(public epoch: number) {
    const mk = (d: Uint8Array<ArrayBuffer> | Float32Array<ArrayBuffer>, f: THREE.PixelFormat, t: THREE.TextureDataType) => {
      const tex = new THREE.DataTexture(d, COV_W, COV_H, f, t);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      return tex;
    };
    this.texA = mk(this.a, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texB = mk(this.b, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texLast = mk(this.last, THREE.RedFormat, THREE.FloatType);
    const plan = new Uint8Array(COV_W * COV_H);
    this.texPlan = mk(plan, THREE.RedFormat, THREE.UnsignedByteType);
    this.texPlan.magFilter = this.texPlan.minFilter = THREE.LinearFilter;
    let fp = 0;
    for (let row = 0; row < COV_H; row++) {
      const dec = decOf(row);
      this.sinDec[row] = Math.sin(dec);
      this.cosDec[row] = Math.cos(dec);
      this.rowArea[row] = (texel / D2R) ** 2 * Math.cos(dec);
      for (let col = 0; col < COV_W; col++) {
        if (region((col + 0.5) * texel, dec)) {
          plan[row * COV_W + col] = 255;
          fp += this.rowArea[row];
        }
      }
    }
    this.footprintArea = fp;
  }

  reset(epoch: number) {
    this.epoch = epoch;
    this.a.fill(0);
    this.b.fill(0);
    this.last.fill(-1e6);
    this.area = 0;
    this.dirty = true;
  }

  /** Add one visit. */
  add(v: Visit) {
    const bi = BAND_INDEX[v.band];
    const reach = 2.75 * D2R; // half diagonal of the array + margin
    const r0 = Math.max(0, Math.floor((Math.PI / 2 - v.dec - reach) / texel));
    const r1 = Math.min(COV_H - 1, Math.ceil((Math.PI / 2 - v.dec + reach) / texel));
    const s0 = Math.sin(v.dec);
    const c0 = Math.cos(v.dec);
    const cr = Math.cos(v.rot);
    const sr = Math.sin(v.rot);
    const mm = 1 / (DEG_PER_MM * D2R);
    const tLast = v.t0 - this.epoch;
    for (let row = r0; row <= r1; row++) {
      const sd = this.sinDec[row];
      const cd = this.cosDec[row];
      const span = cd < Math.sin(reach) ? Math.PI : Math.asin(Math.min(1, Math.sin(reach) / cd)) + texel;
      const c0i = Math.floor((v.ra - span) / texel);
      const c1i = Math.ceil((v.ra + span) / texel);
      for (let ci = c0i; ci <= c1i; ci++) {
        const col = ((ci % COV_W) + COV_W) % COV_W;
        const dra = (ci + 0.5) * texel - v.ra;
        const cdra = Math.cos(dra);
        const cosc = s0 * sd + c0 * cd * cdra;
        if (cosc < 0.99) continue;
        // gnomonic coordinates (east, north), then into the rotated focal plane, in mm
        const xi = (cd * Math.sin(dra)) / cosc;
        const eta = (c0 * sd - s0 * cd * cdra) / cosc;
        const x = Math.abs((xi * cr - eta * sr) * mm);
        const y = Math.abs((xi * sr + eta * cr) * mm);
        if (x > ARRAY_HALF || y > ARRAY_HALF || (x > CORNER_HALF && y > CORNER_HALF)) continue;
        const k = row * COV_W + col;
        const tgt = bi < 4 ? this.a : this.b;
        const o = k * 4 + (bi < 4 ? bi : bi - 4);
        if (this.a[k * 4] + this.a[k * 4 + 1] + this.a[k * 4 + 2] + this.a[k * 4 + 3] + this.b[k * 4] + this.b[k * 4 + 1] === 0) this.area += this.rowArea[row];
        if (tgt[o] < 255) tgt[o]++;
        this.b[k * 4 + 2] = bi + 1;
        this.last[k] = tLast;
      }
    }
    this.dirty = true;
  }

  /** Area (deg²) visited since `since` (days after the epoch). */
  areaSince(since: number) {
    let s = 0;
    for (let row = 0; row < COV_H; row++) {
      let n = 0;
      for (let col = 0, k = row * COV_W; col < COV_W; col++, k++) if (this.last[k] >= since) n++;
      s += n * this.rowArea[row];
    }
    return s;
  }

  /**
   * Push the arrays to the GPU if they changed (~5 MB, so the caller throttles it). The time of the
   * last visit is only uploaded when it is displayed.
   */
  upload(withLast: boolean) {
    if (this.dirty) {
      this.texA.needsUpdate = this.texB.needsUpdate = true;
      this.lastDirty = true;
      this.dirty = false;
    }
    if (withLast && this.lastDirty) {
      this.texLast.needsUpdate = true;
      this.lastDirty = false;
    }
  }
}
