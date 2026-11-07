// Summit facility on Cerro Pachón: terrain, fixed lower enclosure, rotating dome (EIE), service
// building and the Auxiliary Telescope. Proportions from published numbers (30 m dome, 11 m slit,
// top of dome ≈ 38–40 m) and Alexandre's photos (reference only). Everything here is schematic.
import * as THREE from 'three';
import { PALETTE } from './textures';
import { mergeStatic } from './optimize';

export const SITE = {
  drumR: 15, // 30 m lower enclosure
  drumH: 14, // fixed drum height above the summit platform
  azFloor: 16, // top of the 16 m telescope pier
  baseH: 4.5, // white cylindrical base that rotates with the dome, between drum and box
  domeH: 20.5, // faceted box height above the base (top ≈ 39 m)
  slitHalf: 5.5, // 11 m clear slit
  // front (photos): the sloped roof doors run down to the top front edge of a deep white box,
  // the light/wind screen housing ("chin"), which sticks out well beyond the silver body
  frontZ: 12.5, // = chinZ: no vertical strip above the chin
  chinZ: 12.5, // front of the light/wind screen housing (slim, photos 2026-11-02)
  chinBack: 7, // where the white housing meets the silver body on the sides
  chinTop: 6.5,
  chinUnder: 2.5, // the housing's front face stops 2.5 m above the box bottom...
  chinUnderBack: 3, // ...and its underside slopes back 3 m to the box bottom
  slopeLow: 6.5, // the slope starts at the chin's top front edge
  roofBreak: -4, // z where the sloped roof meets the flat roof
  slitBack: -7.5, // slit continues over the flat roof to here
  halfW: 15,
  chamfer: 4,
};

/** a dome-wide cut plane (used for the "inside" views); only dome/drum/building materials use it */
export const domeCut = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);

// ------------------------------------------------------------------ textures
function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// corrugated cladding: vertical ribs every 0.2 m (texture spans 1 m)
const corrBump = tex(64, 4, (g) => {
  for (let x = 0; x < 64; x++) {
    const v = 128 + 110 * Math.sin((x / 64) * Math.PI * 2 * 5);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 4);
  }
});
// panel seams every 3 m for the cladding colour map (texture spans 3 m × 3 m)
const claddingMap = tex(
  192,
  192,
  (g) => {
    g.fillStyle = PALETTE.domeCladding;
    g.fillRect(0, 0, 192, 192);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,55,50'},0.03)`;
      g.fillRect(Math.random() * 192, Math.random() * 192, 20, 2);
    }
    g.fillStyle = 'rgba(40,40,40,0.35)';
    g.fillRect(0, 0, 192, 1.5);
    g.fillRect(0, 0, 1.5, 192);
  },
  true,
);
claddingMap.repeat.set(1 / 3, 1 / 3);
// black interior louvers (horizontal blades every 0.5 m)
const louverMap = tex(
  8,
  64,
  (g) => {
    for (let y = 0; y < 64; y++) {
      const v = 10 + 26 * Math.max(0, Math.sin((y / 64) * Math.PI * 2 * 2));
      g.fillStyle = `rgb(${v},${v},${v + 2})`;
      g.fillRect(0, y, 8, 1);
    }
  },
  true,
);

const clip = [domeCut];
export const OBS_MAT = {
  cladding: new THREE.MeshStandardMaterial({ color: 0xffffff, map: claddingMap, bumpMap: corrBump, bumpScale: 0.6, metalness: 0.4, roughness: 0.5, clippingPlanes: clip, side: THREE.DoubleSide }),
  louvers: new THREE.MeshStandardMaterial({ color: 0xffffff, map: louverMap, metalness: 0.2, roughness: 0.85, clippingPlanes: clip, side: THREE.DoubleSide }),
  whiteNoClip: new THREE.MeshStandardMaterial({ color: PALETTE.buildingWhite, metalness: 0.05, roughness: 0.7, side: THREE.DoubleSide }),
  whiteRoof: new THREE.MeshStandardMaterial({ color: 0xdedad6, metalness: 0.3, roughness: 0.55, side: THREE.DoubleSide }),
  chinWhite: new THREE.MeshStandardMaterial({ color: 0xf1efec, bumpMap: corrBump, bumpScale: 0.4, metalness: 0.15, roughness: 0.55, clippingPlanes: clip, side: THREE.DoubleSide }),
  drum: new THREE.MeshStandardMaterial({ color: 0xe9e6e2, bumpMap: corrBump, bumpScale: 0.5, metalness: 0.25, roughness: 0.55, clippingPlanes: clip, side: THREE.DoubleSide }),
  bldg: new THREE.MeshStandardMaterial({ color: 0xe6e3df, bumpMap: corrBump, bumpScale: 0.5, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide }),
  bldgGrey: new THREE.MeshStandardMaterial({ color: 0x8b8f94, bumpMap: corrBump, bumpScale: 0.5, metalness: 0.3, roughness: 0.6 }),
  ringBand: new THREE.MeshStandardMaterial({ color: 0x6b4c3c, metalness: 0.4, roughness: 0.6, clippingPlanes: clip }),
  teal: new THREE.MeshStandardMaterial({ color: PALETTE.rubinTeal, metalness: 0.25, roughness: 0.5, clippingPlanes: clip }),
  lws: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.4, roughness: 0.7, clippingPlanes: clip, side: THREE.DoubleSide }),
  slat: new THREE.MeshStandardMaterial({ color: 0xa9a49d, metalness: 0.7, roughness: 0.45, clippingPlanes: clip, side: THREE.DoubleSide }),
  ventBack: new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 1, clippingPlanes: clip }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8f8d8a, roughness: 0.95, clippingPlanes: clip, side: THREE.DoubleSide }),
  floor: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.8, clippingPlanes: clip, side: THREE.DoubleSide }),
};

// ------------------------------------------------------------------ helpers
/** Flat polygon panel. pts are 2D (u, v) in metres, mapped to 3D with origin + u·U + v·V. UVs in metres. */
function panel(pts: [number, number][], origin: THREE.Vector3, U: THREE.Vector3, V: THREE.Vector3, mat: THREE.Material) {
  const s = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ShapeGeometry(s);
  const pos = g.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    p.copy(origin).addScaledVector(U, u).addScaledVector(V, v);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
/** Quad strip between two polylines with the same number of points. */
function quadStrip(bot: THREE.Vector3[], top: THREE.Vector3[], mat: THREE.Material) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < bot.length; i++) pos.push(bot[i].x, bot[i].y, bot[i].z, top[i].x, top[i].y, top[i].z);
  for (let i = 0; i < bot.length - 1; i++) idx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // planar UVs in metres for the corrugation
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] + pos[i + 2], pos[i + 1]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ terrain
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 6) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
// Layout from a satellite view (north up, ~0.12 m/px), rotated so the service building runs along +x:
// AuxTel ~135 m away on its hill, roads loop around the west and south of the building, climb to
// AuxTel and continue down the mountain to the south-east.
export const AUXTEL_POS = new THREE.Vector2(68.7, -115.8);
const AUXTEL_TOP = -6;
export const ROADS: [number, number][][] = [
  [[-8.4, 32.1], [-0.5, 48.3], [10.1, 64.5], [19.7, 77.5], [34.1, 80.8], [45.0, 70.2], [58.2, 33.8], [63.9, -3.7], [64.2, -37.2], [70.8, -54.1], [85.4, -66.8], [110.8, -87.5], [129.8, -111.5], [161.7, -128.9], [181.1, -140.5], [230, -175], [300, -205]],
  [[64.2, -37.2], [53.6, -46.7], [48.8, -58.6], [53.8, -76.2], [65.7, -83.6], [82.4, -87.2], [94.9, -102.4], [94.5, -118.8], [84.6, -125.9], [72.0, -122.2], [67.6, -116.4]],
  [[34.6, -25.4], [42.8, -41.5], [47.2, -55.4]],
];
const ROAD_HALF = 3.5;

function baseTerrain(x: number, z: number) {
  const r = Math.hypot(x, z);
  // regional relief: the summit ridge drops away; distant peaks rise again
  let h = -Math.pow(Math.max(0, r - 40), 1.08) * 0.42;
  h += (fbm(x / 400, z / 400, 5) - 0.5) * 140 * Math.min(1, r / 500);
  h += (fbm(x / 60, z / 60, 4) - 0.5) * 14 * Math.min(1, Math.max(0, r - 45) / 40);
  h += Math.max(0, r - 900) * 0.25 * fbm(x / 900 + 3, z / 900, 3); // far ranges
  // calibration hill for AuxTel
  const da = Math.hypot(x - AUXTEL_POS.x, z - AUXTEL_POS.y);
  h = Math.max(h, AUXTEL_TOP - Math.max(0, da - 10) * 0.45);
  // summit platform (r < 45 m) + the service-building pad stepping down toward the south-east (+x)
  const padY = (xx: number) => (xx < 24 ? 0 : xx < 40 ? -((xx - 24) / 16) * 9 : -9 - Math.min(5, Math.max(0, xx - 55) * 0.4));
  const dPlat = Math.max(0, r - 45);
  const dPad = Math.hypot(Math.max(10 - x, 0, x - 72), Math.max(Math.abs(z) - 30, 0));
  const target = dPad < dPlat ? padY(x) : 0;
  const d = Math.min(dPlat, dPad);
  const k = Math.min(1, d / 30);
  const ks = k * k * (3 - 2 * k);
  return target * (1 - ks) + h * ks;
}

/** Densified, smoothed road centre-lines with their heights. */
export const ROAD_PATHS: { x: number; z: number; h: number }[][] = ROADS.map((poly) => {
  const pts: { x: number; z: number; h: number }[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, h: 0 });
    }
  }
  const last = poly[poly.length - 1];
  pts.push({ x: last[0], z: last[1], h: 0 });
  // Catmull-Rom-ish smoothing of the corners
  for (let it = 0; it < 3; it++)
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i].x = (pts[i - 1].x + 2 * pts[i].x + pts[i + 1].x) / 4;
      pts[i].z = (pts[i - 1].z + 2 * pts[i].z + pts[i + 1].z) / 4;
    }
  const raw = pts.map((p) => baseTerrain(p.x, p.z));
  const W = 8;
  pts.forEach((p, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(pts.length - 1, i + W); j++) {
      s += raw[j];
      n++;
    }
    p.h = s / n;
  });
  return pts;
});

// Road segments bucketed on a coarse grid: the terrain asks for the nearest road at ~180k
// vertices, but only roads closer than ROAD_REACH change the height there, so each lookup only
// needs the few segments registered in its cell (exact same result as a full scan).
const ROAD_REACH = ROAD_HALF + 12;
const CELL = 16;
const ROAD_SEGS: { ax: number; az: number; ah: number; ex: number; ez: number; eh: number; l2: number }[] = [];
const ROAD_GRID = new Map<number, number[]>();
const cellKey = (i: number, j: number) => i * 65536 + j;
for (const path of ROAD_PATHS)
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const id = ROAD_SEGS.length;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    ROAD_SEGS.push({ ax: a.x, az: a.z, ah: a.h, ex, ez, eh: b.h - a.h, l2: ex * ex + ez * ez || 1 });
    const i0 = Math.floor((Math.min(a.x, b.x) - ROAD_REACH) / CELL);
    const i1 = Math.floor((Math.max(a.x, b.x) + ROAD_REACH) / CELL);
    const j0 = Math.floor((Math.min(a.z, b.z) - ROAD_REACH) / CELL);
    const j1 = Math.floor((Math.max(a.z, b.z) + ROAD_REACH) / CELL);
    for (let ci = i0; ci <= i1; ci++)
      for (let cj = j0; cj <= j1; cj++) {
        const k = cellKey(ci, cj);
        const list = ROAD_GRID.get(k);
        if (list) list.push(id);
        else ROAD_GRID.set(k, [id]);
      }
  }

/** Nearest road (distance, road height), exact whenever the distance is below ROAD_REACH. */
function nearestRoad(x: number, z: number) {
  let best = Infinity;
  let h = 0;
  const ids = ROAD_GRID.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!ids) return { d: best, h };
  for (const id of ids) {
    const s = ROAD_SEGS[id];
    const t = Math.max(0, Math.min(1, ((x - s.ax) * s.ex + (z - s.az) * s.ez) / s.l2));
    const d = Math.hypot(x - (s.ax + t * s.ex), z - (s.az + t * s.ez));
    if (d < best) {
      best = d;
      h = s.ah + t * s.eh;
    }
  }
  return { d: best, h };
}

/** Terrain height (m) relative to the summit platform at y = 0, with the roads cut in. */
export function terrainHeight(x: number, z: number) {
  const h = baseTerrain(x, z);
  if (Math.hypot(x, z) > 420) return h;
  const r = nearestRoad(x, z);
  if (r.d > ROAD_REACH) return h;
  const k = THREE.MathUtils.smoothstep(r.d, ROAD_HALF + 0.5, ROAD_REACH);
  return r.h * (1 - k) + h * k;
}

/** Dirt road ribbons draped on the smoothed road profile. */
function buildRoads() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8c7b69, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const path of ROAD_PATHS) {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(path.length - 1, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const nx = -tz;
      const nz = tx;
      const p = path[i];
      pos.push(p.x + nx * ROAD_HALF, p.h + 0.35, p.z + nz * ROAD_HALF, p.x - nx * ROAD_HALF, p.h + 0.35, p.z - nz * ROAD_HALF);
      if (i < path.length - 1) idx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.material.side = THREE.DoubleSide;
    g.add(m);
  }
  return g;
}

function buildTerrain() {
  const size = 3200;
  const seg = 420;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col: number[] = [];
  const cA = new THREE.Color('#9a7b64'); // dusty brown
  const cB = new THREE.Color('#6f6460'); // grey rock
  const cC = new THREE.Color('#b8a48d'); // platform gravel
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    // denser sampling near the summit: warp radius
    let x = pos.getX(i);
    let z = pos.getZ(i);
    const r = Math.hypot(x, z) / (size / 2);
    const w = Math.pow(r, 2.0) / Math.max(r, 1e-6);
    x *= w;
    z *= w;
    const y = terrainHeight(x, z);
    pos.setXYZ(i, x, y, z);
    const n = fbm(x / 30, z / 30, 3);
    c.copy(cA).lerp(cB, Math.min(1, Math.max(0, n * 1.4 - 0.2)));
    if (Math.hypot(x, z) < 46 || (x > 10 && x < 72 && Math.abs(z) < 31)) c.lerp(cC, 0.7);
    if (Math.hypot(x - AUXTEL_POS.x, z - AUXTEL_POS.y) < 11) c.lerp(cC, 0.6);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ rotating dome
export interface Dome {
  group: THREE.Group; // rotates in azimuth; slit faces local +z
  setOpen(t: number): void; // 0 closed .. 1 open (doors)
  setVents(t: number): void;
  setLWS(elevationDeg: number, open: number): void;
  labels: { title: string; text: string; pos: THREE.Vector3 }[];
}

function buildDome(): Dome {
  const S = SITE;
  const g = new THREE.Group();
  const W = S.halfW;
  const H = S.domeH;
  const c = S.chamfer;
  const slopeY = (z: number) => S.slopeLow + ((S.frontZ - z) * (H - S.slopeLow)) / (S.frontZ - S.roofBreak);
  const inset = 0.45;
  const hc = 3; // rear roof hip

  const shell = (mat: THREE.Material, d: number) => {
    const o = new THREE.Group();
    // side walls (x = ±W)
    for (const sg of [-1, 1]) {
      const prof: [number, number][] = [
        [-(W - c), 0],
        [S.chinZ - S.chinUnderBack, 0],
        [S.chinZ, S.chinUnder],
        [S.chinZ, S.chinTop],
        [S.roofBreak, H],
        [-(W - c) + hc, H],
        [-(W - c), H - hc],
      ];
      o.add(panel(prof.map(([z, y]) => [z, y] as [number, number]), new THREE.Vector3(sg * (W - d), 0, 0), Z, Y, mat));
    }
    // back wall + chamfers
    o.add(panel([[-(W - c), 0], [W - c, 0], [W - c, H - hc], [-(W - c), H - hc]], new THREE.Vector3(0, 0, -W + d), X, Y, mat));
    for (const sg of [-1, 1]) {
      const a = new THREE.Vector3(sg * (W - d), 0, -(W - c));
      const b = new THREE.Vector3(sg * (W - c), 0, -W + d);
      const U = b.clone().sub(a);
      const L = U.length();
      U.normalize();
      o.add(panel([[0, 0], [L, 0], [L, H - hc], [0, H - hc]], a, U, Y, mat));
    }
    // rear hip: sloped strip from the top of the back walls to the roof
    {
      const bot = [
        new THREE.Vector3(W - d, H - hc, -(W - c)),
        new THREE.Vector3(W - c, H - hc, -W + d),
        new THREE.Vector3(-(W - c), H - hc, -W + d),
        new THREE.Vector3(-(W - d), H - hc, -(W - c)),
      ];
      const top = bot.map((p) => new THREE.Vector3(p.x, H - d, p.z + hc));
      o.add(quadStrip(bot, top, mat));
    }
    // chin (light/wind screen housing): front, sides; top either side of the slit
    const cw = W - d;
    o.add(panel([[-cw, S.chinUnder], [cw, S.chinUnder], [cw, S.chinTop], [-cw, S.chinTop]], new THREE.Vector3(0, 0, S.chinZ - d), X, Y, mat));
    {
      // sloped underside of the housing
      const a = new THREE.Vector3(0, 0 + d, S.chinZ - S.chinUnderBack);
      const b = new THREE.Vector3(0, S.chinUnder, S.chinZ - d);
      const U = b.clone().sub(a);
      const Lu = U.length();
      U.normalize();
      o.add(panel([[-cw, 0], [cw, 0], [cw, Lu], [-cw, Lu]], a, X, U, mat));
    }
    // sloped roof either side of the slit
    const lowP = new THREE.Vector3(0, S.slopeLow - d, S.frontZ - d);
    const highP = new THREE.Vector3(0, H - d, S.roofBreak - d);
    const Uup = highP.clone().sub(lowP);
    const Ls = Uup.length();
    Uup.normalize();
    for (const sg of [-1, 1]) {
      const x0 = sg * S.slitHalf;
      const x1 = sg * (W - d);
      o.add(panel([[Math.min(x0, x1), 0], [Math.max(x0, x1), 0], [Math.max(x0, x1), Ls], [Math.min(x0, x1), Ls]], lowP, X, Uup, mat));
    }
    // flat roof with the slit notch
    const sh = S.slitHalf;
    o.add(
      panel(
        [
          [-(W - d), S.roofBreak],
          [-sh, S.roofBreak],
          [-sh, S.slitBack],
          [sh, S.slitBack],
          [sh, S.roofBreak],
          [W - d, S.roofBreak],
          [W - d, -(W - c) + hc],
          [W - c, -(W - d) + hc],
          [-(W - c), -(W - d) + hc],
          [-(W - d), -(W - c) + hc],
        ],
        new THREE.Vector3(0, H - d, 0),
        X,
        Z,
        mat,
      ),
    );
    return o;
  };
  g.add(shell(OBS_MAT.cladding, 0));
  g.add(shell(OBS_MAT.louvers, inset)); // black louvered inner wall

  // slit jambs: teal steel frames along the opening (seen through the open slit)
  for (const sg of [-1, 1]) {
    const x = sg * (S.slitHalf + 0.25);
    const pts = [
      new THREE.Vector3(x, S.chinTop, S.frontZ - 0.2),
      new THREE.Vector3(x, S.slopeLow, S.frontZ - 0.2),
      new THREE.Vector3(x, H - 0.2, S.roofBreak - 0.2),
      new THREE.Vector3(x, H - 0.2, S.slitBack - 0.2),
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.distanceTo(b) < 0.05) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, a.distanceTo(b), 0.9), OBS_MAT.teal);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
      g.add(m);
    }
  }
  // arched teal ribs across the slit (inside), like the steel seen through the opening
  for (const zr of [8, 2, -4]) {
    const y = zr > S.roofBreak ? slopeY(zr) - 0.8 : H - 0.8;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 * W - 1.2, 0.4, 0.4), OBS_MAT.teal);
    m.position.set(0, y, zr - 0.6);
    g.add(m);
  }

  // doors: two dark panels covering the slit on the slope + flat roof; slide sideways to open
  const doors: THREE.Group[] = [];
  const lowP = new THREE.Vector3(0, S.slopeLow + 0.15, S.frontZ + 0.15);
  const highP = new THREE.Vector3(0, H + 0.15, S.roofBreak + 0.15);
  const Uup = highP.clone().sub(lowP);
  const Ls = Uup.length();
  Uup.normalize();
  for (const sg of [-1, 1]) {
    const d = new THREE.Group();
    const x0 = 0;
    const x1 = sg * (S.slitHalf + 0.6);
    d.add(panel([[Math.min(x0, x1), 0], [Math.max(x0, x1), 0], [Math.max(x0, x1), Ls], [Math.min(x0, x1), Ls]], lowP, X, Uup, OBS_MAT.cladding));
    d.add(panel([[Math.min(x0, x1), S.roofBreak + 0.15], [Math.max(x0, x1), S.roofBreak + 0.15], [Math.max(x0, x1), S.slitBack - 0.6], [Math.min(x0, x1), S.slitBack - 0.6]], new THREE.Vector3(0, H + 0.15, 0), X, Z, OBS_MAT.cladding));
    d.userData.sg = sg;
    g.add(d);
    doors.push(d);
  }

  // louvered vents (34): slats rotate open
  const slats: THREE.Mesh[] = [];
  const slatGeo = new THREE.BoxGeometry(3.6, 0.42, 0.05);
  const addVent = (center: THREE.Vector3, along: THREE.Vector3, normal: THREE.Vector3) => {
    const v = new THREE.Group();
    v.position.copy(center).addScaledVector(normal, 0.08);
    v.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, Y, normal));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.6), OBS_MAT.ventBack);
    back.position.z = -0.03;
    v.add(back);
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(slatGeo, OBS_MAT.slat);
      s.position.y = -1.05 + k * 0.42;
      v.add(s);
      slats.push(s);
    }
    g.add(v);
  };
  let n = 0;
  for (const sg of [-1, 1])
    for (const z of [-7.5, -2.5, 2.5, 7.5])
      for (const y of [4, 9, 14, 19]) {
        if (y + 1.4 > slopeY(Math.min(S.frontZ, z + 2)) - 0.5 && z > S.roofBreak) continue;
        if (z + 2 > S.chinBack && y - 1.3 < S.chinTop) continue;
        if (n >= 26) continue;
        addVent(new THREE.Vector3(sg * W, y, z), new THREE.Vector3(0, 0, -sg), new THREE.Vector3(sg, 0, 0));
        n++;
      }
  for (const x of [-7, -2.4, 2.4, 7])
    for (const y of [7, 16]) {
      if (n >= 34) continue;
      addVent(new THREE.Vector3(x, y, -W), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1));
      n++;
    }

  // teal brackets sticking out of the sides (platform/crane supports, photos)
  for (const sg of [-1, 1])
    for (const [y, z] of [[S.chinTop - 0.3, 10.5], [12.5, -9], [16.5, -12]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 1.2), OBS_MAT.teal);
      b.position.set(sg * (W + 1.5), y, z);
      g.add(b);
    }
  // roof railing (teal)
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * W - 2, 0.08, 0.08), OBS_MAT.teal);
  rail.position.set(0, H + 1.1, -W + 1);
  g.add(rail);

  // white light/wind-screen housing: side and front faces over the silver cladding (photos)
  for (const sg of [-1, 1])
    g.add(panel([[S.chinBack, 0], [S.chinZ - S.chinUnderBack, 0], [S.chinZ, S.chinUnder], [S.chinZ, S.chinTop], [S.chinBack, S.chinTop]], new THREE.Vector3(sg * (W + 0.06), 0, 0), Z, Y, OBS_MAT.chinWhite));
  g.add(panel([[-W, S.chinUnder], [W, S.chinUnder], [W, S.chinTop], [-W, S.chinTop]], new THREE.Vector3(0, 0, S.chinZ + 0.06), X, Y, OBS_MAT.chinWhite));
  // underside of the box (shadowed band seen where the box overhangs the base)
  {
    const under = panel(
      [[-W, -(W - c)], [-(W - c), -W], [W - c, -W], [W, -(W - c)], [W, S.chinZ - S.chinUnderBack], [-W, S.chinZ - S.chinUnderBack]],
      new THREE.Vector3(0, 0.02, 0),
      X,
      Z,
      OBS_MAT.cladding,
    );
    g.add(under);
  }
  // white cylindrical base rotating with the dome, between the drum and the box
  {
    const geo = new THREE.CylinderGeometry(S.drumR + 0.25, S.drumR + 0.25, S.baseH, 160, 1, true);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * S.drumR, uv.getY(i) * S.baseH);
    const base = new THREE.Mesh(geo, OBS_MAT.drum);
    base.position.y = -S.baseH / 2;
    g.add(base);
    // top of the base around the box footprint (closes the gap under the slim housing)
    const cap = new THREE.Mesh(new THREE.RingGeometry(12.2, S.drumR + 0.25, 160), OBS_MAT.cladding);
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = -0.02;
    g.add(cap);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(S.drumR + 0.45, S.drumR + 0.45, 0.5, 160, 1, true), OBS_MAT.chinWhite);
    lip.position.y = -S.baseH + 0.25;
    g.add(lip);
  }

  // light/wind screen: dark panel filling the slit from its bottom up to the beam
  // fixed-size strip updated in place (no per-frame allocation)
  const LWS_N = 40;
  const lwsGeo = new THREE.BufferGeometry();
  const lwsPos = new THREE.BufferAttribute(new Float32Array((LWS_N + 1) * 2 * 3), 3);
  lwsPos.setUsage(THREE.DynamicDrawUsage);
  lwsGeo.setAttribute('position', lwsPos);
  const lwsIdx: number[] = [];
  for (let i = 0; i < LWS_N; i++) lwsIdx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  lwsGeo.setIndex(lwsIdx);
  const lws = new THREE.Mesh(lwsGeo, OBS_MAT.lws);
  lws.frustumCulled = false;
  lws.visible = false;
  g.add(lws);
  let lwsKey = '';
  const slitPath = [
    new THREE.Vector2(S.frontZ, S.chinTop),
    new THREE.Vector2(S.frontZ, S.slopeLow),
    new THREE.Vector2(S.roofBreak, H),
    new THREE.Vector2(S.slitBack, H),
  ].filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 0.01);
  const segLen = slitPath.slice(1).map((p, i) => p.distanceTo(slitPath[i]));
  const totalLen = segLen.reduce((a, b) => a + b, 0);
  const pointAt = (s: number) => {
    let d = s;
    for (let i = 0; i < segLen.length; i++) {
      if (d <= segLen[i]) return slitPath[i].clone().lerp(slitPath[i + 1], d / segLen[i]);
      d -= segLen[i];
    }
    return slitPath[slitPath.length - 1].clone();
  };
  /** arc-length position where a ray from the axis point hits the slit path */
  const hitS = (oz: number, oy: number, dz: number, dy: number) => {
    let acc = 0;
    for (let i = 0; i < segLen.length; i++) {
      const a = slitPath[i];
      const b = slitPath[i + 1];
      // solve o + t d = a + u (b - a)
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const det = dz * -ey - dy * -ex;
      if (Math.abs(det) > 1e-9) {
        const rx = a.x - oz;
        const ry = a.y - oy;
        const t = (rx * -ey - ry * -ex) / det;
        const u = (dz * ry - dy * rx) / det;
        if (t > 0 && u >= 0 && u <= 1) return acc + u * segLen[i];
      }
      acc += segLen[i];
    }
    return totalLen;
  };

  // the dome turns as one block: bake everything but the doors, vent slats and screen
  mergeStatic(g, [...doors, ...slats, lws]);

  const labels = [
    { title: 'Rotating dome', text: '30 m wide, built by EIE (Italy). It turns independently of the telescope at up to 1.5°/s and is clad in corrugated aluminium.', pos: new THREE.Vector3(-W, 14, 0) },
    { title: 'Slit', text: 'An 11 m wide opening running up the front and over the top. Two roof doors slide sideways to open it.', pos: new THREE.Vector3(0, H + 0.5, -2) },
    { title: 'Light/wind screen', text: 'A moving screen inside the slit that leaves just the opening the beam needs (11 × 10 m), blocking wind and stray light.', pos: new THREE.Vector3(0, S.chinTop + 0.5, S.chinZ) },
    { title: 'Vents', text: '34 louvered vents open in under 30 s to flush warm air out of the dome, so the air in front of the mirror stays at night-time temperature.', pos: new THREE.Vector3(W + 0.2, 12, -2.5) },
  ];

  return {
    group: g,
    labels,
    setOpen(t: number) {
      for (const d of doors) d.position.x = d.userData.sg * t * (S.slitHalf + 0.9);
    },
    setVents(t: number) {
      for (const s of slats) s.rotation.x = t * 1.15;
    },
    setLWS(el: number, open: number) {
      if (open < 0.01) {
        lws.visible = false;
        return;
      }
      lws.visible = true;
      const key = `${el.toFixed(3)}|${open.toFixed(4)}`;
      if (key === lwsKey) return;
      lwsKey = key;
      const e = (el * Math.PI) / 180;
      const axisY = SITE.azFloor + 7 - SITE.drumH - SITE.baseH; // elevation axis height in box coordinates
      // beam bottom edge: 5 m below the optical axis, measured perpendicular to it
      const oz = -Math.sin(e) * -5;
      const oy = axisY + Math.cos(e) * -5;
      const sTop = Math.max(0, hitS(oz, oy, Math.cos(e), Math.sin(e)) - 0.6) * open;
      for (let i = 0; i <= LWS_N; i++) {
        const p = pointAt((sTop * i) / LWS_N);
        // sit just inside the cladding
        lwsPos.setXYZ(2 * i, -S.slitHalf, p.y - 0.25, p.x - 0.25);
        lwsPos.setXYZ(2 * i + 1, S.slitHalf, p.y - 0.25, p.x - 0.25);
      }
      lwsPos.needsUpdate = true;
      lwsGeo.computeVertexNormals();
    },
  };
}

// ------------------------------------------------------------------ fixed parts
function buildDrum() {
  const S = SITE;
  const g = new THREE.Group();
  const drumGeo = new THREE.CylinderGeometry(S.drumR, S.drumR, S.drumH, 160, 1, true);
  // UVs in metres so the corrugation keeps its 0.2 m pitch
  const uvA = drumGeo.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 2 * Math.PI * S.drumR, uvA.getY(i) * S.drumH);
  const drum = new THREE.Mesh(drumGeo, OBS_MAT.drum);
  drum.position.y = S.drumH / 2;
  g.add(drum);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(S.drumR + 0.12, S.drumR + 0.12, 0.9, 128, 1, true), OBS_MAT.ringBand);
  band.position.y = S.drumH - 0.45;
  g.add(band);
  // telescope pier (16 m hollow concrete cylinder) and azimuth floor
  const pier = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, S.azFloor, 96, 1, true), OBS_MAT.concrete);
  pier.position.y = S.azFloor / 2;
  g.add(pier);
  const floor = new THREE.Mesh(new THREE.RingGeometry(8.6, S.drumR, 96), OBS_MAT.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = S.azFloor - 0.6;
  g.add(floor);
  // exterior stair spiralling up the drum (teal, photos)
  {
    const steps = 40;
    for (let k = 0; k < steps; k++) {
      const a0 = 2.1 + (k / steps) * 0.75;
      const y = 0.3 + (k / steps) * (S.drumH - 4);
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.9), OBS_MAT.teal);
      st.position.set((S.drumR + 0.8) * Math.sin(a0), y, (S.drumR + 0.8) * Math.cos(a0));
      st.rotation.y = a0;
      g.add(st);
    }
    const lAnd = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.6), OBS_MAT.teal);
    lAnd.position.set((S.drumR + 0.8) * Math.sin(2.88), S.drumH - 3.7, (S.drumR + 0.8) * Math.cos(2.88));
    lAnd.rotation.y = 2.88;
    g.add(lAnd);
  }
  // entrance
  const door = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 }));
  door.position.set(-S.drumR * Math.sin(0.5), 2.25, S.drumR * Math.cos(0.5));
  door.rotation.y = -0.5;
  g.add(door);
  return g;
}

/**
 * Faceted bar extruded along +x from x0 to x1. `section` is the (z, y) outline (closed).
 * `prow` shears the far end: vertices at x1 move by prow·(y − yPivot), giving the undercut
 * "ship's bow" end seen in the photos.
 */
function facetedBar(section: [number, number][], x0: number, x1: number, y0: number, mat: THREE.Material, prow = 0, yPivot = 0) {
  const shape = new THREE.Shape(section.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); // extrusion (+z) → +x ; shape x → −z
  geo.translate(x0, y0, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getX(i) - x1) < 1e-3) p.setX(i, x1 + prow * (p.getY(i) - y0 - yPivot));
  }
  // planar UVs in metres (corrugation runs vertically on walls)
  const uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i) + p.getZ(i), p.getY(i));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function buildServiceBuilding() {
  const g = new THREE.Group();
  const M = OBS_MAT.bldg;
  // tall block against the drum (platform-lift shaft, camera & coating access), slanted top
  const tall = facetedBar([[-10, 0], [10, 0], [10, 15.5], [7, 17.5], [-10, 17.5]], 11, 27, 0, M);
  g.add(tall);
  // long service & operations building (photo 2026-11-02): widest at the bottom, a sloped lower
  // band stepping in, a near-vertical upper band, then the sloped roof; the far end leans back
  // toward the top (bottom further out than the top), like the sides
  const sec: [number, number][] = [
    [-15.5, 0], [15.5, 0],
    [13.5, 5], [13, 9], // sloped lower band, near-vertical upper band
    [9, 13], [-9, 13], // sloped roof up to the flat top
    [-13, 9], [-13.5, 5],
  ];
  const yb = -9; // the building steps down toward the saddle
  const bar = facetedBar(sec, 22, 64, yb, M, -0.45, 0);
  g.add(bar);
  // flat top roof strip and a ribbon of small windows under the upper eave
  const roof = facetedBar([[-9, 13], [9, 13], [8.5, 13.4], [-8.5, 13.4]], 22, 64 - 0.45 * 13, yb, OBS_MAT.whiteRoof, -0.45, 13);
  g.add(roof);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2a3a48, metalness: 0.6, roughness: 0.2, emissive: 0x000000 });
  for (let x = 26; x < 58; x += 3.2) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.1), winMat);
    w.position.set(x, yb + 8.3, 13.08);
    g.add(w);
  }
  // grey lower level at the far end (maintenance / loading)
  const base = facetedBar([[-14, 0], [14, 0], [14, 5], [-14, 5]], 44, 66, yb - 5, OBS_MAT.bldgGrey);
  g.add(base);
  // big roll-up door on the near side
  const door = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 0.2), new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.4, roughness: 0.6 }));
  door.position.set(40, yb + 2.6, 14.6);
  door.rotation.x = -Math.atan2(2, 5);
  g.add(door);
  g.userData.windows = winMat;
  return g;
}

function buildAuxTel() {
  const g = new THREE.Group();
  const y0 = terrainHeight(AUXTEL_POS.x, AUXTEL_POS.y);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 4, 48), OBS_MAT.whiteNoClip);
  wall.position.y = 2;
  g.add(wall);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.7, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe6e6e6, metalness: 0.3, roughness: 0.4 }));
  dome.position.y = 4;
  g.add(dome);
  g.position.set(AUXTEL_POS.x, y0, AUXTEL_POS.y);
  return g;
}

export function buildObservatory() {
  const root = new THREE.Group();
  const terrain = buildTerrain();
  root.add(terrain);
  const drum = buildDrum();
  mergeStatic(drum);
  root.add(drum);
  const dome = buildDome();
  dome.group.position.y = SITE.drumH + SITE.baseH;
  root.add(dome.group);
  const building = buildServiceBuilding();
  mergeStatic(building);
  root.add(building);
  root.add(buildRoads());
  const auxtel = buildAuxTel();
  root.add(auxtel);
  return { root, dome, drum, building, auxtel, terrain };
}
