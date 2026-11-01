// Geometry of the Simonyi Survey Telescope optical tube assembly, built in the OCS-aligned
// local frame (see util.ts). Optics come straight from the batoid prescription; mechanics from
// the batoid LTS-213 baffle model and published dimensions. Items marked APPROX are schematic.
import * as THREE from 'three';
import baffles from '../data/baffles.json';
import { Rubin, SPIDER } from '../optics/trace';
import { MAT } from './materials';
import { annulusMesh, beam, box, lathe, ocs, sagProfile, tube, cylinderBetween } from './util';
import { buildLSSTCam } from './lsstcam';

export interface Label {
  id: string;
  title: string;
  text: string;
  pos: THREE.Vector3; // in OTA frame
  parent?: THREE.Object3D; // if set, pos is in this object's local frame
}

export interface Telescope {
  ota: THREE.Group;
  labels: Label[];
  filter: THREE.Group;
  setBand(rubin: Rubin): void;
  groups: Record<string, THREE.Object3D>;
}

const BF = baffles as { name: string; z: number; inner: number; outer: number }[];

/** Lens/filter solid of revolution between two surfaces (front at lower z). */
export function lensSolid(front: (r: number) => number, back: (r: number) => number, rClear: number, rEdge: number, mat: THREE.Material) {
  const n = 48;
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const r = (rEdge * i) / n;
    prof.push([r, front(Math.min(r, rClear))]);
  }
  for (let i = n; i >= 0; i--) {
    const r = (rEdge * i) / n;
    prof.push([r, back(Math.min(r, rClear))]);
  }
  return lathe(prof, 128, mat);
}

export function buildTelescope(rubin: Rubin): Telescope {
  const ota = new THREE.Group();
  ota.name = 'OTA';
  const S = rubin.surfaces;
  const labels: Label[] = [];
  const groups: Record<string, THREE.Object3D> = {};
  const L = (id: string, title: string, text: string, p: THREE.Vector3) => labels.push({ id, title, text, pos: p });

  // ------------------------------------------------------------------ M1M3 monolith
  const m1m3 = new THREE.Group();
  m1m3.name = 'M1M3';
  const zBack = -0.4736; // back plate (M1 vertex 473.6 mm above back surface)
  const rBlank = 8.417 / 2;
  const rHole = 0.525;
  const rM1M3 = 2.533; // where the M1 and M3 surfaces intersect
  // reflective faces
  m1m3.add(lathe(sagProfile(S.M1, rM1M3, rBlank - 0.01, 80), 192, MAT.silver));
  m1m3.add(lathe(sagProfile(S.M3, rHole + 0.02, rM1M3, 60), 192, MAT.silver));
  // glass body: hole wall, back plate, outer wall (thin shells so the cutaway shows the honeycomb gap)
  const zEdge = S.M1.zAt(rBlank, 0);
  const zHoleTop = S.M3.zAt(rHole, 0);
  m1m3.add(
    lathe(
      [
        [rHole, zHoleTop],
        [rHole, zBack],
        [rBlank, zBack],
        [rBlank, zEdge],
      ],
      192,
      MAT.borosilicate,
    ),
  );
  // honeycomb hint: ring ribs visible in cutaway
  for (let r = 0.9; r < rBlank - 0.1; r += 0.384) {
    const zt = r > rM1M3 ? S.M1.zAt(r, 0) : S.M3.zAt(r, 0);
    m1m3.add(tube(r - 0.006, r + 0.006, zBack + 0.025, zt - 0.03, MAT.borosilicate, 96));
  }
  ota.add(m1m3);
  groups.m1m3 = m1m3;
  L('M1', 'M1 — primary mirror', '8.4 m outer annulus of the M1M3 monolith (spin-cast honeycomb borosilicate). Concave hyperboloid, R = 19.835 m, k = −1.215. First reflection.', ocs(-3.6, 0, S.M1.zAt(3.6, 0)));
  L('M3', 'M3 — tertiary mirror', 'Inner 5 m of the same glass, 23.4 cm lower and more steeply curved (R = 8.34 m). Third reflection, sends light up into the camera.', ocs(1.4, 1.0, S.M3.zAt(1.7, 0)));

  // M1 clear-aperture baffle
  ota.add(annulusMesh(4.185, 4.675, 0.4394, MAT.black, 0.02));

  // ------------------------------------------------------------------ Mirror cell (APPROX envelope)
  const cell = new THREE.Group();
  const cellTop = zBack - 0.05;
  const cellBot = -2.35;
  const oct = (hw: number) => {
    const s = new THREE.Shape();
    const c = hw * Math.tan(Math.PI / 8);
    const pts = [
      [hw, -c],
      [hw, c],
      [c, hw],
      [-c, hw],
      [-hw, c],
      [-hw, -c],
      [-c, -hw],
      [c, -hw],
    ];
    s.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
    s.closePath();
    return s;
  };
  {
    const sh = oct(4.95);
    const g = new THREE.ExtrudeGeometry(sh, { depth: cellTop - cellBot, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); // extrude along +Y (OCS z)
    g.translate(0, cellBot, 0);
    const m = new THREE.Mesh(g, MAT.paintCut);
    cell.add(m);
    // actuator field (156 force actuators on a ~0.6 m grid inside r ≤ 4.03, schematic positions)
    const act = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10);
    let count = 0;
    for (let ix = -7; ix <= 7; ix++)
      for (let iy = -7; iy <= 7; iy++) {
        const x = ix * 0.58 + (iy % 2 ? 0.29 : 0);
        const y = iy * 0.5;
        const r = Math.hypot(x, y);
        if (r > 4.03 || r < 0.75 || count >= 156) continue;
        const a = new THREE.Mesh(act, MAT.steel);
        a.position.copy(ocs(x, y, cellTop - 0.26));
        cell.add(a);
        count++;
      }
  }
  ota.add(cell);
  groups.cell = cell;
  L('cell', 'M1M3 mirror cell', '~75 t steel cell. 156 pneumatic actuators + 6 hardpoints push on the glass to correct its shape (active optics). Blowers keep the glass at air temperature.', ocs(0, -4.95, -1.4));

  // ------------------------------------------------------------------ Centre section (APPROX)
  {
    const sh = oct(5.55);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 4.301, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    const z0 = 0.5;
    const z1 = 2.878;
    const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 96 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, z0, 0);
    const cs = new THREE.Mesh(g, MAT.paintCut);
    ota.add(cs);
    groups.center = cs;
    // inner black baffle surface
    ota.add(tube(4.29, 4.301, z0, z1, MAT.blackCut));
    L('center', 'Elevation centre section', 'Stiff steel ring that carries the mirror cell below and the four top-end piers above. The elevation axis runs through it.', ocs(5.55, 0, 2.2));
  }

  // ------------------------------------------------------------------ Top-end assembly piers (APPROX, 4 X-braced trusses)
  const piers = new THREE.Group();
  const zP0 = 2.878;
  const zP1 = 7.263;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const rad = 5.0;
    const half = 0.75;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tx = -sa;
    const ty = ca;
    const P = (s: number, z: number, rr = rad) => ocs(rr * ca + s * tx, rr * sa + s * ty, z);
    for (const s of [-half, half]) piers.add(beam(P(s, zP0), P(s, zP1), 0.28, 0.28, MAT.paint));
    const nb = 4;
    for (let i = 0; i < nb; i++) {
      const za = zP0 + ((zP1 - zP0) * i) / nb;
      const zb = zP0 + ((zP1 - zP0) * (i + 1)) / nb;
      piers.add(beam(P(-half, za), P(half, zb), 0.12, 0.12, MAT.paint));
      piers.add(beam(P(half, za), P(-half, zb), 0.12, 0.12, MAT.paint));
    }
    // V brace across (radial)
    piers.add(beam(P(0, zP0, rad + 0.6), P(0, (zP0 + zP1) / 2, rad), 0.14, 0.14, MAT.paint));
  }
  ota.add(piers);
  groups.piers = piers;
  L('tea', 'Top-end piers', 'Four X-braced steel trusses hold the top end (M2 + camera) about 6 m above the primary mirror.', ocs(5.0 * Math.cos(Math.PI / 4), 5.0 * Math.sin(Math.PI / 4), 4.6));

  // Mid-level baffle ring
  const mid = BF.find((b) => b.name === 'MidLevel')!;
  ota.add(annulusMesh(mid.inner, mid.outer, mid.z, MAT.black, 0.03));

  // ------------------------------------------------------------------ Top-end ring (I-beam: flanges are the two baffles)
  const ter = new THREE.Group();
  const up = BF.find((b) => b.name === 'UpperTopEnd')!;
  const lo = BF.find((b) => b.name === 'LowerTopEnd')!;
  ter.add(annulusMesh(up.inner, up.outer, up.z, MAT.black, 0.04));
  ter.add(annulusMesh(lo.inner, lo.outer, lo.z, MAT.black, 0.04));
  ter.add(tube(4.86, 4.9, lo.z, up.z, MAT.paint));
  ota.add(ter);
  groups.topEnd = ter;
  L('ter', 'Top-end ring', 'Steel I-beam ring 9.8 m across. Its two flanges double as light baffles at the top of the telescope.', ocs(0, 4.9, 8.06));

  // ------------------------------------------------------------------ Spider spindle, centre plate, vanes
  const spider = new THREE.Group();
  const zCap = 9.818006;
  spider.add(tube(1.05, 1.1, 6.95, zCap, MAT.paint, 64));
  spider.add(annulusMesh(0, 1.1, zCap, MAT.paint, 0.05, 64));
  for (const r of SPIDER.rects.slice(0, 4)) {
    const m = box(0, 0, SPIDER.z, r.w, r.h, 0.06, MAT.black);
    m.rotation.y = r.th; // OCS rotation about z == rotation about Y (sign flip of y absorbed)
    spider.add(m);
  }
  for (const r of SPIDER.rects.slice(4)) {
    const ux = -Math.sin(r.th);
    const uy = Math.cos(r.th);
    const cdotu = r.x * ux + r.y * uy;
    const fx = r.x - cdotu * ux;
    const fy = r.y - cdotu * uy;
    const d = Math.hypot(fx, fy);
    const s0 = Math.sqrt(1.1 * 1.1 - d * d);
    const s1 = Math.sqrt(4.45 * 4.45 - d * d);
    for (const sg of [-1, 1]) {
      const a = ocs(fx + sg * s0 * ux, fy + sg * s0 * uy, SPIDER.z - 0.22);
      const b = ocs(fx + sg * s1 * ux, fy + sg * s1 * uy, SPIDER.z - 0.22);
      spider.add(beam(a, b, 0.05, 0.44, MAT.black));
    }
  }
  ota.add(spider);
  groups.spider = spider;
  L('spider', 'Spider & spindle', 'Thin vanes (5 cm in projection) suspend the central spindle that carries M2 and the camera. They cast the diffraction spikes on bright stars.', ocs(2.6, 2.6 * 0.3, SPIDER.z));

  // ------------------------------------------------------------------ M2 + cell + baffle
  const m2 = new THREE.Group();
  const rM2 = 1.71;
  m2.add(lathe(sagProfile(S.M2, 0.9, rM2, 60), 160, MAT.silver));
  const back: [number, number][] = [];
  back.push([0.9, S.M2.zAt(0.9, 0)]);
  back.push([0.9, S.M2.zAt(0.9, 0) + 0.1]);
  back.push([rM2, S.M2.zAt(rM2, 0) + 0.1]);
  back.push([rM2, S.M2.zAt(rM2, 0)]);
  m2.add(lathe(back, 160, MAT.ule));
  // cell (APPROX)
  m2.add(tube(0.95, 1.8, S.M2.zAt(rM2, 0) + 0.12, 6.75, MAT.steelSolid, 96));
  // M2 hexapod struts to the spindle
  for (let k = 0; k < 6; k++) {
    const a0 = (k * Math.PI) / 3 + (k % 2 ? 0.25 : -0.25);
    const a1 = (k * Math.PI) / 3 + (k % 2 ? -0.35 : 0.35) + Math.PI / 6;
    m2.add(cylinderBetween(ocs(1.35 * Math.cos(a0), 1.35 * Math.sin(a0), 6.75), ocs(1.05 * Math.cos(a1), 1.05 * Math.sin(a1), 6.98), 0.035, MAT.steelSolid));
  }
  // M2 vane baffle: conical skirt + 21 ring vanes (edges from batoid)
  const vanes = BF.filter((b) => b.name.startsWith('M2Baffle')).sort((a, b) => b.z - a.z);
  const skirt: [number, number][] = vanes.map((v) => [v.inner + 0.14, v.z] as [number, number]);
  m2.add(lathe([...skirt, ...skirt.slice().reverse().map(([r, z]) => [r + 0.01, z] as [number, number])], 128, MAT.black));
  for (const v of vanes) m2.add(annulusMesh(v.inner, v.inner + 0.14, v.z, MAT.black, 0.004, 128));
  ota.add(m2);
  groups.m2 = m2;
  L('M2', 'M2 — secondary mirror', '3.42 m convex mirror (Corning ULE glass, 10 cm thick, 1.8 m central hole). Second reflection, sends light back down to M3.', ocs(-1.3, 0, S.M2.zAt(1.3, 0)));
  L('m2baffle', 'M2 baffle', '21 black anodised vanes around M2 stop stray light that would otherwise reach the camera directly.', ocs(-2.2, -0.8, 5.7));

  // ------------------------------------------------------------------ LSSTCam
  const camModel = buildLSSTCam(rubin);
  const cam = camModel.group;
  const zL1 = S.L1_entrance.z0;
  const zDet = S.Detector.z0;
  const filter = camModel.parts.filters as THREE.Group;
  const buildFilter = (r: Rubin) => camModel.instantBeam(r.band);
  ota.add(cam);
  groups.camera = cam;
  groups.lenses = camModel.parts.l1l2;
  groups.filter = camModel.parts.filters;
  groups.carousel = camModel.parts.carousel;
  groups.focalPlane = camModel.parts.focalPlane;
  L('camera', 'LSSTCam', 'The largest digital camera ever built for astronomy: 3.2 gigapixels, 1.65 m wide, 3.7 m long, 3 t. It hangs upside-down in the middle of the telescope, through the hole in M2.', ocs(0.8, 0, 6.2));
  L('L1', 'L1 lens', '1.57 m fused-silica lens, the largest high-performance optical lens ever made. Light enters the camera here.', ocs(0.0, -0.78, zL1));
  L('filter', 'Filter (u g r i z y)', '75 cm curved filter. Only one colour band passes at a time; five filters wait in the carousel around the cryostat.', ocs(0.37, 0, S.Filter_entrance.z0));
  L('fp', 'Focal plane', '189 science CCDs in 21 rafts + 4 corner rafts for guiding and wavefront sensing. 64 cm across, flat to < 10 µm, kept at −100 °C.', ocs(-0.3, 0, zDet));

  return { ota, labels, filter, setBand: buildFilter, groups };
}
