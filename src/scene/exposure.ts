// Focal-plane "image" for the exposure & readout animation, drawn on a 2D canvas that maps
// the focal plane square (±0.33 m) onto the texture. Only CCD areas receive light.
import { LAYOUT, CcdInfo } from './focalplane';

const HALF = 0.33;

export class FocalPlaneImage {
  readonly size: number;
  private sky: HTMLCanvasElement; // masked "true sky" image for the current band
  private out: CanvasRenderingContext2D;
  private rng = mulberry32(7);

  constructor(canvas: HTMLCanvasElement) {
    this.size = canvas.width;
    this.out = canvas.getContext('2d')!;
    this.sky = document.createElement('canvas');
    this.sky.width = this.sky.height = this.size;
  }

  X(x: number) {
    return ((x + HALF) / (2 * HALF)) * this.size;
  }
  Y(y: number) {
    return ((HALF - y) / (2 * HALF)) * this.size;
  }

  /** Build a synthetic deep sky field (stars, galaxies) plus the traced stars at their exact landing points. */
  makeSky(tint: string, traced: { x: number; y: number }[]) {
    const c = this.sky.getContext('2d')!;
    const S = this.size;
    c.fillStyle = '#000';
    c.fillRect(0, 0, S, S);
    c.save();
    // clip to the CCDs
    c.beginPath();
    for (const d of LAYOUT) c.rect(this.X(d.cx - d.w / 2), this.Y(d.cy + d.h / 2), (d.w / (2 * HALF)) * S, (d.h / (2 * HALF)) * S);
    c.clip();
    // faint sky background with a hint of the band colour
    c.fillStyle = tint;
    c.globalAlpha = 0.07;
    c.fillRect(0, 0, S, S);
    c.globalAlpha = 1;
    this.rng = mulberry32(7);
    const r = this.rng;
    // galaxies
    for (let i = 0; i < 260; i++) {
      const x = r() * S;
      const y = r() * S;
      const a = 1 + r() * 3.5;
      const e = 0.3 + r() * 0.7;
      c.save();
      c.translate(x, y);
      c.rotate(r() * Math.PI);
      c.scale(1, e);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, a * 2.2);
      g.addColorStop(0, 'rgba(255,240,220,0.75)');
      g.addColorStop(1, 'rgba(255,240,220,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, a * 2.2, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    // stars: power-law brightness
    for (let i = 0; i < 2600; i++) {
      const x = r() * S;
      const y = r() * S;
      const f = Math.pow(r(), 6);
      this.star(c, x, y, 0.6 + f * 5, 0.35 + 0.65 * Math.min(1, f * 4));
    }
    // the stars whose light is traced in 3D
    for (const t of traced) this.star(c, this.X(t.x), this.Y(t.y), 7, 1, true);
    // a couple of cosmic-ray tracks
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const x = r() * S;
      const y = r() * S;
      const a = r() * Math.PI;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      c.stroke();
    }
    c.restore();
  }

  private star(c: CanvasRenderingContext2D, x: number, y: number, rad: number, a: number, spikes = false) {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.3, `rgba(255,255,255,${a * 0.35})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rad, 0, Math.PI * 2);
    c.fill();
    if (spikes) {
      // diffraction spikes from the spider vanes (rotated 45°)
      c.strokeStyle = `rgba(255,255,255,${a * 0.5})`;
      c.lineWidth = 0.7;
      for (const ang of [Math.PI / 4, -Math.PI / 4]) {
        c.beginPath();
        c.moveTo(x - Math.cos(ang) * rad * 3, y - Math.sin(ang) * rad * 3);
        c.lineTo(x + Math.cos(ang) * rad * 3, y + Math.sin(ang) * rad * 3);
        c.stroke();
      }
    }
  }

  clear() {
    this.out.clearRect(0, 0, this.size, this.size);
  }

  /** Accumulated exposure: level 0..1 */
  drawExposure(level: number) {
    this.clear();
    this.out.globalAlpha = Math.max(0, Math.min(1, level));
    this.out.drawImage(this.sky, 0, 0);
    this.out.globalAlpha = 1;
  }

  /**
   * Readout at progress p (0..1). Each CCD is split in two halves; charge is clocked toward the
   * serial registers on the outer edges, where 8 amplifiers per half read the segments in parallel.
   */
  drawReadout(p: number, level = 1) {
    const o = this.out;
    this.clear();
    const S = this.size;
    const k = S / (2 * HALF);
    for (const d of LAYOUT) {
      const halves = this.halves(d);
      for (const h of halves) {
        const x0 = this.X(d.cx - d.w / 2);
        const w = d.w * k;
        const yTop = this.Y(h.y1);
        const hh = (h.y1 - h.y0) * k;
        const shift = p * hh * h.dir; // canvas: dir −1 → moves up (toward +y)
        o.save();
        o.beginPath();
        o.rect(x0, yTop, w, hh);
        o.clip();
        o.globalAlpha = level;
        o.drawImage(this.sky, x0, yTop, w, hh, x0, yTop + shift, w, hh);
        o.globalAlpha = 1;
        o.restore();
        // serial register glow + 8 amplifiers along the outer edge
        if (p < 1) {
          const ey = h.dir < 0 ? yTop : yTop + hh;
          const pulse = 0.55 + 0.45 * Math.sin(p * 60);
          o.fillStyle = `rgba(90,220,255,${0.75 * pulse})`;
          o.fillRect(x0, ey - 1, w, 2);
          o.fillStyle = 'rgba(160,255,255,0.9)';
          for (let a = 0; a < 8; a++) o.fillRect(x0 + ((a + 0.5) * w) / 8 - 1, ey - 1.5, 2, 3);
        }
      }
    }
  }

  private halves(d: CcdInfo) {
    if (d.kind === 'wfs') return [{ y0: d.cy - d.h / 2, y1: d.cy + d.h / 2, dir: d.cy > 0 ? -1 : 1 }];
    return [
      { y0: d.cy, y1: d.cy + d.h / 2, dir: -1 }, // upper half moves toward +y
      { y0: d.cy - d.h / 2, y1: d.cy, dir: 1 },
    ];
  }
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
