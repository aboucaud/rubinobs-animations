// LSSTCam Filter Exchange System (FES), built by IN2P3/CNRS: carousel + autochanger + filters.
// Geometry and kinematics follow the CNRS animation, the FES paper (arXiv:2606.31995) and the
// LSST camera posters; dimensions not published are schematic. OCS-aligned local frame (util.ts):
// local Y = OCS z = optical axis (light travels +z), OCS +y = "up" (the standby socket).
//
// Kinematics: each filter carrier has two pins per side. Leaving the top (standby) socket, the
// filter slides straight forward, then turns by 90° about a fixed pivot (its pins run along the
// arcs of the large circular groove of the autochanger plates), wrapping around the front corner of
// the cryostat, and finally drops straight down into its online position, where clamps hold it to
// 0.1 mm. Everything fits inside the Ø1.6 m camera body.
import * as THREE from 'three';
import { Band } from '../optics/trace';
import { Surface } from '../optics/surfaces';
import prescription from '../data/prescription.json';
import filterColours from '../data/filter_colours.json';
import { cutPlane } from './materials';
import { lathe, ocs, tube } from './util';
import type { Label } from './telescope';

const P = prescription as unknown as Record<Band, { surfaces: any[] }>;
export const BANDS: Band[] = ['u', 'g', 'r', 'i', 'z', 'y'];

export const FES = {
  R: 0.53, // distance from the axis to a stored filter's outer face (pentagon apothem)
  zC: 4.95, // centre of the stored filters along the axis
  half: 0.375, // filter radius (75 cm filters)
  pinX: 0.42, // pins on the side lugs of the filter frame
  pinD: 0.3, // pins on the side lugs, ±0.3 m from the filter centre
  plateX: 0.45, // inner face of the autochanger side plates
  zFront: 4.12, // front of the autochanger frame (the leading pins swing slightly in front of the beam plane)
  zArmEnd: 5.36, // rear end of the top rails
  zRing: 5.42, // carousel ring (front face)
};

export const BAND_HEX: Record<Band, string> = {
  u: '#9b6bff',
  g: '#34b8ff',
  r: '#ff6a2e',
  i: '#ff2f5e',
  z: '#e04bff',
  y: '#ffd43a',
};

// ---------------------------------------------------------------- materials (CNRS-like anodised greys)
const clip = [cutPlane];
const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.55, roughness: 0.42, clippingPlanes: clip, side: THREE.DoubleSide }),
  darker: new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.5, roughness: 0.5, clippingPlanes: clip, side: THREE.DoubleSide }),
  alu: new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.8, roughness: 0.32, clippingPlanes: clip, side: THREE.DoubleSide }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9eaec, metalness: 0.2, roughness: 0.45, clippingPlanes: clip, side: THREE.DoubleSide }),
  groove: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.3, roughness: 0.8, clippingPlanes: clip }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 0.9, roughness: 0.3, clippingPlanes: clip }),
  motor: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.6, roughness: 0.35, clippingPlanes: clip }),
  clampOpen: new THREE.MeshStandardMaterial({ color: 0xd9822b, metalness: 0.3, roughness: 0.5, clippingPlanes: clip }),
  clampShut: new THREE.MeshStandardMaterial({ color: 0x3fb37f, metalness: 0.3, roughness: 0.5, clippingPlanes: clip }),
};

function slottedAlpha(slots: number) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 2048, 64);
  g.fillStyle = '#000';
  const pitch = 2048 / slots;
  for (let i = 0; i < slots; i++) g.fillRect(i * pitch + pitch * 0.18, 14, pitch * 0.64, 36);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function boxAt(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sz, sy), mat);
  m.position.copy(ocs(cx, cy, cz));
  return m;
}

function lensSolid(front: (r: number) => number, back: (r: number) => number, rClear: number, rEdge: number, mat: THREE.Material) {
  const n = 40;
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) prof.push([(rEdge * i) / n, front(Math.min((rEdge * i) / n, rClear))]);
  for (let i = n; i >= 0; i--) prof.push([(rEdge * i) / n, back(Math.min((rEdge * i) / n, rClear))]);
  return lathe(prof, 112, mat);
}

/**
 * Interference filters barely absorb: what is not transmitted is reflected (R = 1 − T).
 * Colours computed from lsst/throughputs (tools/filter_colours.py). Rendered with two layers:
 * the glass multiplies what is behind it by the transmitted colour, and the coating adds a
 * mirror reflection tinted by the reflected colour. So g looks orange-gold in reflection and
 * cyan when looked through, r the opposite, and u, i, z, y are near-perfect visible mirrors.
 */
const FC = filterColours as Record<Band, { transmitted_linear: number[]; reflected_linear: number[]; transmitted_hex: string; reflected_hex: string }>;
function filterMaterials(b: Band) {
  const t = FC[b].transmitted_linear.map((v) => Math.min(1, v) * 0.93);
  const r = FC[b].reflected_linear.map((v) => Math.min(1, v));
  const through = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(t[0], t[1], t[2]),
    blending: THREE.MultiplyBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    clippingPlanes: clip,
    toneMapped: false,
  });
  const reflect = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(r[0], r[1], r[2]),
    metalness: 1,
    roughness: 0.04,
    envMapIntensity: 1.3,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    clippingPlanes: clip,
  });
  return { through, reflect };
}

/** One filter: meniscus from its band's batoid surfaces, frame ring, two side lugs with two pins each.
 *  Local frame: origin = front (entrance) vertex, local +Y = normal (light direction when online),
 *  local +Z = leading edge (points down when online). */
function buildFilter(b: Band) {
  const s = P[b].surfaces;
  const fe = new Surface(s.find((x: any) => x.name === 'Filter_entrance'));
  const fx = new Surface(s.find((x: any) => x.name === 'Filter_exit'));
  const z0 = fe.z0;
  const th = fx.z0 - z0;
  const g = new THREE.Group();
  g.name = `filter-${b}`;
  const fm = filterMaterials(b);
  const glass = lensSolid((r) => fe.zAt(r, 0) - z0, (r) => fx.zAt(r, 0) - z0, 0.375, 0.375, fm.through);
  glass.renderOrder = 5;
  g.add(glass);
  // coating: reflective layer on the entrance surface (and a weaker one on the exit side)
  const coat = lathe(Array.from({ length: 41 }, (_, i) => [(0.375 * i) / 40, fe.zAt((0.375 * i) / 40, 0) - z0 - 0.0005] as [number, number]), 112, fm.reflect);
  coat.renderOrder = 6;
  g.add(coat);
  const coatBack = lathe(Array.from({ length: 41 }, (_, i) => [(0.375 * (40 - i)) / 40, fx.zAt((0.375 * (40 - i)) / 40, 0) - z0 + 0.0005] as [number, number]), 112, fm.reflect);
  coatBack.renderOrder = 6;
  g.add(coatBack);
  // aluminium frame ring
  g.add(tube(0.375, 0.398, -0.006, th + 0.03, M.dark, 96));
  g.add(tube(0.398, 0.402, 0.004, th + 0.02, M.alu, 96));
  // side lugs (±x) carrying two pins each, at ±pinD along local Z
  for (const sx of [-1, 1]) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.8), M.dark);
    lug.position.set(sx * 0.405, th / 2 + 0.01, 0);
    g.add(lug);
    for (const sz of [-1, 1]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 16), M.steel);
      pin.rotation.z = Math.PI / 2;
      pin.position.set(sx * 0.44, th / 2 + 0.01, sz * FES.pinD);
      g.add(pin);
    }
  }
  // small label tab (band letter area) at the trailing edge
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.04), M.white);
  tab.position.set(0, th / 2, -0.405);
  g.add(tab);
  g.userData = { zBeam: z0, thickness: th, band: b };
  return g;
}

/** Pivot depth of the autochanger rotation below the top rail (m). */
const PIVOT_H = 0.3;

/**
 * Pose along the autochanger path. s = 0: standby (top socket), s = 1: online (in the beam).
 * Three phases (photo of the real autochanger plate: a large circular groove):
 *  A. the filter slides straight forward out of the standby socket;
 *  B. it rotates by 90° about a fixed pivot, its pins running along arcs of the circular groove
 *     (the pivot is placed so the filter wraps around the front corner of the cryostat);
 *  C. it drops straight down into the online position in front of the shutter.
 */
export function fesPose(s: number, zF: number) {
  const { R, zC } = FES;
  const h = PIVOT_H;
  const pz = zF + h; // pivot
  const py = R - h;
  const lenA = zC - pz;
  const lenB = (h * Math.PI) / 2;
  const lenC = py;
  const total = lenA + lenB + lenC;
  const d = THREE.MathUtils.clamp(s, 0, 1) * total;
  if (d <= lenA) return { cy: R, cz: zC - d, theta: 0, total };
  if (d <= lenA + lenB) {
    const th = (d - lenA) / h;
    return { cy: py + h * Math.cos(th), cz: pz - h * Math.sin(th), theta: th, total };
  }
  return { cy: py - (d - lenA - lenB), cz: zF, theta: Math.PI / 2, total };
}

/** Pin position (OCS y, z) for the leading (+1) or trailing (−1) pin. */
export function pinPos(s: number, zF: number, which: 1 | -1) {
  const p = fesPose(s, zF);
  const uy = -Math.sin(p.theta);
  const uz = -Math.cos(p.theta);
  return { y: p.cy + which * FES.pinD * uy, z: p.cz + which * FES.pinD * uz, theta: p.theta };
}

export interface FESState {
  sockets: (Band | null)[];
  home: Partial<Record<Band, number>>;
  beam: Band | null;
  transit: { band: Band; s: number } | null;
  carouselAngle: number;
  onlineClamp: number; // 0 open .. 1 clamped
  socketClamp: number; // standby socket clamps: 0 unlocked .. 1 locked
  latch: number; // autochanger latches on the filter pins: 0 open .. 1 engaged
  loaderOut: Band | null; // filter currently in the loader (6th filter)
}

export interface FESStep {
  label: string;
  detail: string;
  real: number; // seconds on the real camera
  run: (t: number) => void;
  done?: () => void;
}

export interface FilterExchanger {
  carousel: THREE.Group;
  autochanger: THREE.Group;
  filterRoot: THREE.Group;
  fixed: THREE.Group;
  filters: Record<Band, THREE.Group>;
  state: FESState;
  labels: Label[];
  update(opts?: { carouselDz?: number; beamDz?: number }): void;
  stepsTo(target: Band | null): FESStep[];
  instantBeam(b: Band | null): void;
  swapLoader(incoming: Band): void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** trapezoidal velocity profile with slow approach at both ends (main move + 9 cm approach) */
function moveProfile(t: number, slowFrac = 0.17) {
  // first slowFrac of time covers ~4.5 % of the distance, same at the end; ease in between
  if (t < slowFrac) return 0.045 * (t / slowFrac);
  if (t > 1 - slowFrac) return 1 - 0.045 * ((1 - t) / slowFrac);
  const u = (t - slowFrac) / (1 - 2 * slowFrac);
  return 0.045 + 0.91 * ease(u);
}

export function buildFES(): FilterExchanger {
  const { R, zC } = FES;
  const zFref = P.r.surfaces.find((x: any) => x.name === 'Filter_entrance').z;
  const labels: Label[] = [];
  const L = (id: string, title: string, text: string, pos: THREE.Vector3, parent: THREE.Object3D) => labels.push({ id, title, text, pos, parent });

  // ================================================================ carousel (rotates about the axis)
  const carousel = new THREE.Group();
  carousel.name = 'carousel';
  const zR = FES.zRing;
  {
    // slotted box ring at the back: Ø ≈ 1.4 m with 550 gear teeth (IN2P3 poster)
    const outer = M.dark.clone();
    outer.alphaMap = slottedAlpha(40);
    outer.alphaTest = 0.5;
    const ringOut = new THREE.Mesh(new THREE.CylinderGeometry(0.715, 0.715, 0.11, 200, 1, true), outer);
    ringOut.position.y = zR + 0.055;
    carousel.add(ringOut);
    carousel.add(tube(0.6, 0.62, zR, zR + 0.11, M.dark, 160));
    for (const z of [zR, zR + 0.11]) {
      const a = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.715, 160), M.dark);
      a.rotation.x = -Math.PI / 2;
      a.position.y = z;
      carousel.add(a);
    }
    // radial webs visible through the slots
    for (let i = 0; i < 40; i++) {
      const a = ((i + 0.5) / 40) * Math.PI * 2;
      const w = boxAt(0.665 * Math.cos(a), 0.665 * Math.sin(a), zR + 0.055, 0.1, 0.008, 0.11, M.darker);
      w.rotation.y = a;
      carousel.add(w);
    }
    // gear teeth
    const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.035, 0.012), M.steel, 550);
    teeth.material = M.steel;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 550; i++) {
      const a = (i / 550) * Math.PI * 2;
      m4.makeRotationY(a);
      m4.setPosition(ocs(0.722 * Math.cos(a), 0.722 * Math.sin(a), zR + 0.09));
      teeth.setMatrixAt(i, m4);
    }
    carousel.add(teeth);
  }
  // five sockets: two side guide rails, rear stop, two self-locking clamps
  const socketClamps: THREE.Mesh[][] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5 + Math.PI / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const at = (rad: number, tan: number, z: number) => ({ x: rad * c - tan * sn, y: rad * sn + tan * c, z });
    const sg = new THREE.Group();
    const clamps: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      // guide rail along z
      const p = at(R - 0.035, side * 0.415, (zC + zR) / 2 - 0.15);
      const rail = boxAt(p.x, p.y, p.z, 0.035, 0.035, zR - (zC - 0.4), M.dark);
      rail.rotation.y = a - Math.PI / 2;
      sg.add(rail);
      // standoff to the ring
      const q = at(R + 0.02, side * 0.415, zR - 0.03);
      const st = boxAt(q.x, q.y, q.z, 0.06, 0.12, 0.06, M.dark);
      st.rotation.y = a - Math.PI / 2;
      sg.add(st);
      // clamp (self-locking, orange = open, green = locked)
      for (const dz of [-0.22, 0.18]) {
        const r = at(R - 0.005, side * 0.432, zC + dz);
        const cl = boxAt(r.x, r.y, r.z, 0.03, 0.045, 0.07, M.clampShut);
        cl.rotation.y = a - Math.PI / 2;
        cl.userData.base = cl.position.clone();
        cl.userData.out = ocs(side * 0.03 * -sn, side * 0.03 * c, 0); // tangential retreat when unlocked
        sg.add(cl);
        clamps.push(cl);
      }
    }
    // rear stop
    const r = at(R - 0.02, 0, zR - 0.02);
    const stop = boxAt(r.x, r.y, r.z, 0.16, 0.05, 0.04, M.alu);
    stop.rotation.y = a - Math.PI / 2;
    sg.add(stop);
    carousel.add(sg);
    socketClamps.push(clamps);
  }
  L('carousel', 'Carousel', 'Stores five filters standing in a pentagon around the cryostat. A Ø1.4 m ring with 550 teeth turns it 1/5 or 2/5 of a turn to bring the chosen filter to the top "standby" socket. Each socket holds its filter with self-locking clamps.', ocs(0, -0.74, zR + 0.05), carousel);

  // ================================================================ fixed parts: carousel drive, autochanger frame
  const fixed = new THREE.Group();
  fixed.name = 'fes-fixed';
  {
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 24), M.motor);
    motor.position.copy(ocs(0.2, -0.76, zR + 0.15));
    fixed.add(motor);
    const pinion = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 24), M.steel);
    pinion.position.copy(ocs(0.2, -0.745, zR + 0.09));
    fixed.add(pinion);
    const bracket = boxAt(0.2, -0.79, zR + 0.06, 0.12, 0.05, 0.14, M.dark);
    fixed.add(bracket);
  }
  L('drive', 'Carousel drive', 'A motor and brake turn the carousel ring through its gear. Before a filter can leave, the carousel is realigned to better than 0.1 mm with the autochanger.', ocs(0.2, -0.8, zR + 0.15), fixed);

  const autochanger = new THREE.Group();
  autochanger.name = 'autochanger';
  const X = FES.plateX;
  const zFr = FES.zFront;
  const zArm = FES.zArmEnd;
  const DX = 0.33; // linear drives sit on top, inboard, to stay inside the camera body
  {
    // side plates: square front part + top arm running back over the standby socket
    const plateShape = new THREE.Shape();
    // front part: thin, in front of the shutter; top arm: runs back over the standby socket
    const pts: [number, number][] = [
      [zFr, -0.56],
      [4.295, -0.56],
      [4.295, 0.5],
      [zArm, 0.5],
      [zArm, 0.67],
      [zFr, 0.67],
    ];
    plateShape.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) plateShape.lineTo(p[0], p[1]);
    plateShape.closePath();
    const win = new THREE.Path();
    win.moveTo(4.55, 0.535);
    win.lineTo(zArm - 0.12, 0.535);
    win.lineTo(zArm - 0.12, 0.6);
    win.lineTo(4.55, 0.6);
    win.closePath();
    plateShape.holes.push(win);
    for (const sx of [-1, 1]) {
      const geo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.025, bevelEnabled: false });
      // shape (z, y) → three: shape x = OCS z → three Y; shape y = OCS y → three −Z; extrusion → three X
      geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)));
      const plate = new THREE.Mesh(geo, M.dark);
      plate.position.x = sx > 0 ? X : -X - 0.025;
      autochanger.add(plate);
    }
    // grooves (double rails): the trajectories of the leading and trailing pins
    for (const which of [1, -1] as const) {
      const pts3: THREE.Vector3[] = [];
      for (let i = 0; i <= 120; i++) {
        const p = pinPos(i / 120, zFref, which);
        pts3.push(new THREE.Vector3(0, p.z, -p.y));
      }
      const curve = new THREE.CatmullRomCurve3(pts3);
      for (const sx of [-1, 1]) {
        const g = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.014, 8, false), which === 1 ? M.groove : M.steel);
        g.position.x = sx * (X - 0.002);
        autochanger.add(g);
      }
    }
    // front frame: bottom beam, top beam, white V bar (as in the CNRS animation)
    autochanger.add(boxAt(0, -0.53, zFr + 0.02, 2 * X + 0.05, 0.06, 0.04, M.dark));
    autochanger.add(boxAt(0, 0.61, zFr + 0.02, 2 * X + 0.05, 0.06, 0.04, M.dark));
    // rear cross-beam at the end of the arms
    autochanger.add(boxAt(0, 0.62, zArm - 0.03, 2 * X + 0.05, 0.05, 0.05, M.dark));
    // linear drives: ball-screw rails on the outside of the arms, with motors at the rear
    for (const sx of [-1, 1]) {
      autochanger.add(boxAt(sx * DX, 0.67, (zFr + zArm) / 2 + 0.05, 0.05, 0.05, zArm - zFr - 0.05, M.alu));
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, zArm - zFr - 0.1, 12), M.steel);
      screw.position.copy(ocs(sx * DX, 0.70, (zFr + zArm) / 2 + 0.05));
      autochanger.add(screw);
      // cross-ties from the drive rail to the arm
      for (const z of [zFr + 0.06, 4.7, zArm - 0.06]) autochanger.add(boxAt(sx * (DX + X + 0.025) / 2, 0.65, z, X + 0.025 - DX, 0.03, 0.03, M.dark));
      const mot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 24), M.motor);
      mot.position.copy(ocs(sx * DX, 0.67, zArm + 0.1));
      autochanger.add(mot);
    }
  }
  // moving parts of the autochanger: carriages on the linear drives, linkage arms, trucks on the pins
  const carriages: THREE.Mesh[] = [];
  const links: THREE.Mesh[] = [];
  const trucks: { m: THREE.Mesh; sx: number; which: 1 | -1 }[] = [];
  const latches: { m: THREE.Mesh; sx: number; which: 1 | -1 }[] = [];
  for (const sx of [-1, 1]) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.085), M.white);
    autochanger.add(car);
    carriages.push(car);
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 12), M.alu);
    autochanger.add(link);
    links.push(link);
    for (const which of [1, -1] as const) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.06), M.alu);
      autochanger.add(tr);
      trucks.push({ m: tr, sx, which });
      const la = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.04), M.clampShut);
      autochanger.add(la);
      latches.push({ m: la, sx, which });
    }
  }
  // filter carrier: the V-shaped beam joining the two trailing trucks. It belongs to the moving
  // part of the autochanger: it rides with the filter to the carousel and back.
  const carrier = new THREE.Group();
  {
    const pts: [number, number][] = [[-0.445, -0.445], [0, -0.39], [0.445, -0.445]];
    for (let i = 0; i < 2; i++) {
      const a = new THREE.Vector3(pts[i][0], 0.02, pts[i][1]);
      const b = new THREE.Vector3(pts[i + 1][0], 0.02, pts[i + 1][1]);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b) + 0.03, 0.03, 0.05), M.dark);
      bar.position.copy(a).add(b).multiplyScalar(0.5);
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
      carrier.add(bar);
    }
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.05), M.darker);
    hub.position.set(0, 0.02, -0.395);
    carrier.add(hub);
    for (const sx of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), M.darker);
      end.position.set(sx * 0.445, 0.02, -0.43);
      carrier.add(end);
    }
  }
  autochanger.add(carrier);

  // online clamps on the front plates (filter held by its lower pins)
  const onlineClamps: { m: THREE.Mesh; sx: number }[] = [];
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.06), M.clampShut);
    autochanger.add(m);
    onlineClamps.push({ m, sx });
  }
  L('autochanger', 'Autochanger', 'Pulls the chosen filter out of the standby socket and guides it, with two pins per side running in two grooves, around the front of the cryostat into the beam: about 1 m in total, the main 91 cm in about 6 s, never more than 1.5 g.', ocs(X + 0.05, 0.2, 4.4), autochanger);
  L('rails', 'Guide grooves', 'The pins run in grooves cut in the side plates: straight along the top, then along a large circle that turns the filter through 90° around the front of the cryostat, then straight down into the beam.', ocs(X, 0.6, 4.9), autochanger);
  L('carrier', 'Filter carrier', 'The V-shaped beam and the four trucks belong to the moving part of the autochanger: they grip the filter by its pins and travel with it between the carousel and the beam.', ocs(0, 0.42, 4.2), carrier);
  L('online', 'Online clamps', 'Hold the filter in the beam, a few millimetres in front of the shutter and L3, repeatable to better than 0.1 mm.', ocs(X, -0.2, 4.3), autochanger);

  // ================================================================ filters
  const filterRoot = new THREE.Group();
  filterRoot.name = 'filters';
  const filters = {} as Record<Band, THREE.Group>;
  for (const b of BANDS) {
    filters[b] = buildFilter(b);
    filterRoot.add(filters[b]);
  }
  L('filter', 'Filter', '75 cm curved fused-silica disc with an interference coating; 25–38 kg. Each one passes a single colour band (u, g, r, i, z or y).', ocs(0, 0.0, 4.3), filterRoot);

  // ================================================================ state & update
  const state: FESState = {
    sockets: ['u', 'g', 'r', 'i', 'z'],
    home: { u: 0, g: 1, r: 2, i: 3, z: 4 },
    beam: null,
    transit: null,
    carouselAngle: 0,
    onlineClamp: 1,
    socketClamp: 1,
    latch: 1,
    loaderOut: 'y',
  };

  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  const qx = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const standbyIndex = () => {
    const step = (2 * Math.PI) / 5;
    const k = Math.round(-state.carouselAngle / step);
    return ((k % 5) + 5) % 5;
  };

  function placeOnPath(f: THREE.Group, s: number, dz = 0) {
    const zF = f.userData.zBeam as number;
    const p = fesPose(s, zF);
    qx.setFromAxisAngle(AX, Math.PI / 2 - p.theta);
    f.quaternion.copy(qx);
    f.position.copy(ocs(0, p.cy, p.cz + dz));
  }
  function placeInSocket(f: THREE.Group, k: number, dz = 0) {
    const a = state.carouselAngle + (k * 2 * Math.PI) / 5; // rotation from the top socket
    qy.setFromAxisAngle(AY, a);
    qx.setFromAxisAngle(AX, Math.PI / 2);
    f.quaternion.copy(qy).multiply(qx);
    const ang = a + Math.PI / 2;
    f.position.copy(ocs(R * Math.cos(ang), R * Math.sin(ang), zC + dz));
  }

  function update(opts: { carouselDz?: number; beamDz?: number } = {}) {
    const cdz = opts.carouselDz ?? 0;
    const bdz = opts.beamDz ?? 0;
    carousel.rotation.y = state.carouselAngle;
    carousel.position.copy(ocs(0, 0, cdz));
    for (const b of BANDS) {
      const f = filters[b];
      const k = state.home[b];
      f.visible = k !== undefined;
      if (k === undefined) continue;
      if (state.transit && state.transit.band === b) placeOnPath(f, state.transit.s, bdz * state.transit.s);
      else if (state.beam === b) placeOnPath(f, 1, bdz);
      else placeInSocket(f, k, cdz);
    }
    // the filter currently held by the autochanger (or the empty trucks parked at standby)
    const held = state.transit ? { b: state.transit.band, s: state.transit.s } : state.beam ? { b: state.beam, s: 1 } : null;
    const zF = held ? (filters[held.b].userData.zBeam as number) : zFref;
    const s = held ? held.s : 0;
    for (const t of trucks) {
      const p = pinPos(s, zF, t.which);
      t.m.position.copy(ocs(t.sx * (X - 0.012), p.y, p.z));
      t.m.quaternion.setFromAxisAngle(AX, Math.PI / 2 - p.theta);
    }
    for (const l of latches) {
      const p = pinPos(s, zF, l.which);
      const open = 1 - state.latch;
      l.m.position.copy(ocs(l.sx * (X - 0.035 + 0.02 * open), p.y + 0.03, p.z));
      l.m.material = state.latch > 0.5 ? M.clampShut : M.clampOpen;
    }
    {
      const p = fesPose(s, zF);
      carrier.quaternion.setFromAxisAngle(AX, Math.PI / 2 - p.theta);
      carrier.position.copy(ocs(0, p.cy, p.cz + (held && state.transit ? bdz * state.transit.s : held && state.beam ? bdz : 0)));
    }
    // linear-drive carriages follow the trailing pin along z; the linkage reaches down to it
    const tp = pinPos(s, zF, -1);
    const cz = THREE.MathUtils.clamp(tp.z, FES.zFront + 0.05, FES.zArmEnd - 0.05);
    carriages.forEach((c, i) => {
      const sx = i === 0 ? -1 : 1;
      c.position.copy(ocs(sx * DX, 0.65, cz));
      const a = ocs(sx * DX, 0.63, cz);
      const b = ocs(sx * (X - 0.01), tp.y, tp.z);
      const link = links[i];
      link.position.copy(a).add(b).multiplyScalar(0.5);
      link.scale.set(1, Math.max(0.01, a.distanceTo(b)), 1);
      link.quaternion.setFromUnitVectors(AY, b.clone().sub(a).normalize());
    });
    // online clamps: slide in on the lower pins when closed
    const lp = pinPos(1, zF, 1);
    for (const c of onlineClamps) {
      c.m.position.copy(ocs(c.sx * (X - 0.03 + 0.04 * (1 - state.onlineClamp)), lp.y - 0.045, lp.z));
      c.m.material = state.onlineClamp > 0.5 ? M.clampShut : M.clampOpen;
    }
    // standby socket clamps open/close; the other sockets stay locked
    const kS = standbyIndex();
    socketClamps.forEach((cl, k) => {
      const v = k === kS ? state.socketClamp : 1;
      for (const m of cl) {
        m.position.copy(m.userData.base).addScaledVector(m.userData.out, 1 - v);
        m.material = v > 0.5 ? M.clampShut : M.clampOpen;
      }
    });
  }

  /** Steps for an exchange. target = null stores the current filter: all five in the carousel. */
  function stepsTo(target: Band | null): FESStep[] {
    const st = state;
    const from = st.beam;
    if (from === target) return [];
    if (target && st.home[target] === undefined) return [];
    const out: FESStep[] = [
      {
        label: 'Checks',
        detail: 'Shutter closed, camera rotator within ±5° of its zero so the rails are aligned with gravity, carousel position confirmed.',
        real: 3,
        run: () => {},
      },
    ];
    if (from) {
      out.push(
        {
          label: `Unclamp the ${from} filter`,
          detail: 'The online clamps release the filter; it now hangs on the autochanger trucks only.',
          real: 5,
          run: (t) => (st.onlineClamp = 1 - ease(t)),
        },
        {
          label: `Return ${from} to its socket`,
          detail: 'Slow 9 cm start, then the main move: up the front, the 90° tilt, and straight back along the top rails into the empty standby socket. The carrier travels with it.',
          real: 14,
          run: (t) => {
            st.beam = null;
            st.transit = { band: from, s: 1 - moveProfile(t) };
          },
          done: () => {
            st.transit = null;
          },
        },
        {
          label: 'Lock in the carousel',
          detail: 'The socket clamps lock the filter; the autochanger latches let go of its pins.',
          real: 6,
          run: (t) => {
            st.socketClamp = ease(t);
            st.latch = 1 - ease(t);
          },
        },
      );
    }
    if (!target) {
      out.push({
        label: 'All five filters stored',
        detail: 'No filter in the beam: the carrier waits empty at the standby socket.',
        real: 1,
        run: () => {},
      });
      return out;
    }
    const kT = st.home[target]!;
    const a0 = st.carouselAngle;
    let a1 = -(kT * 2 * Math.PI) / 5;
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
    const slots = Math.round(Math.abs(a1 - a0) / ((2 * Math.PI) / 5));
    if (slots > 0)
      out.push({
        label: `Carousel turns ${slots}/5 of a turn`,
        detail: `Brake released, ${slots === 1 ? '72°' : '144°'} rotation of 200 kg of filters and structure, then realignment with the autochanger to better than 0.1 mm.`,
        real: slots === 1 ? 26 : 30.5,
        run: (t) => (st.carouselAngle = a0 + (a1 - a0) * ease(t)),
      });
    out.push(
      {
        label: `Grab ${target}`,
        detail: 'The autochanger latches close on the pins of the new filter; the socket clamps unlock (an unlocking cable is pulled).',
        real: 6,
        run: (t) => {
          st.latch = ease(t);
          st.socketClamp = 1 - ease(t);
        },
      },
      {
        label: `Bring ${target} into the beam`,
        detail: 'Straight out of the socket along the top rails, the 90° tilt around the front of the cryostat, then down into position: about 1 m, the main 91 cm in about 6 s.',
        real: 14,
        run: (t) => (st.transit = { band: target, s: moveProfile(t) }),
        done: () => {
          st.transit = null;
          st.beam = target;
        },
      },
      {
        label: 'Clamp online',
        detail: 'The online clamps close. The filter sits a few millimetres in front of the shutter and L3, repeatable to better than 0.1 mm.',
        real: 8,
        run: (t) => (st.onlineClamp = ease(t)),
      },
    );
    return out;
  }

  function instantBeam(b: Band | null) {
    if (b === null) {
      state.beam = null;
      state.transit = null;
      state.onlineClamp = 0;
      state.latch = 0;
      state.socketClamp = 1;
      update();
      return;
    }
    if (state.home[b] === undefined) swapLoader(b);
    state.beam = b;
    state.transit = null;
    state.carouselAngle = -((state.home[b]! * 2 * Math.PI) / 5);
    state.onlineClamp = 1;
    state.latch = 1;
    state.socketClamp = 0;
    update();
  }

  /** daytime swap with the loader: the 6th filter replaces the u or y filter in its socket */
  function swapLoader(incoming: Band) {
    const out: Band | undefined = (['u', 'y'] as Band[]).find((x) => x !== incoming && state.home[x] !== undefined);
    if (!out || state.beam === out) return;
    const k = state.home[out]!;
    delete state.home[out];
    state.home[incoming] = k;
    state.sockets[k] = incoming;
    state.loaderOut = out;
  }

  instantBeam('r');
  return { carousel, autochanger, filterRoot, fixed, filters, state, labels, update, stepsTo, instantBeam, swapLoader };
}
