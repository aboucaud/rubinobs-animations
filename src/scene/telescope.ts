// Geometry of the Simonyi Survey Telescope optical tube assembly, built in the OCS-aligned
// local frame (see util.ts). Optics come straight from the batoid prescription; mechanics from
// the batoid LTS-213 baffle model and published dimensions. Items marked APPROX are schematic.
import * as THREE from 'three';
import baffles from '../data/baffles.json';
import { Rubin, SPIDER } from '../optics/trace';
import { MAT } from './materials';
import { annulusMesh, beam, box, lathe, ocs, sagProfile, tube, cylinderBetween } from './util';
import { buildLSSTCam } from './lsstcam';
import { perforatedAlpha } from './textures';
import { mergeStatic } from './optimize';

/** Elevation axis height above the M1 vertex (inferred from the M1M3 actuator table). */
export const ELEV_AXIS_ABOVE_M1 = 1.69;

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
  const cellBot = cellTop - 2.0; // media kit: 9 m × 9 m × 2 m steel structure
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
    const sh = oct(4.5);
    const g = new THREE.ExtrudeGeometry(sh, { depth: cellTop - cellBot, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); // extrude along +Y (OCS z)
    g.translate(0, cellBot, 0);
    const m = new THREE.Mesh(g, MAT.cellGrey);
    cell.add(m);
    // vertical stiffening ribs on the outer faces (dark grey cell seen between the teal structures)
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const half = 4.5 * Math.tan(Math.PI / 8);
      for (let j = -3; j <= 3; j++) {
        const t = (j / 3.5) * half;
        const r = box(4.52 * nx - t * ny, 4.52 * ny + t * nx, (cellTop + cellBot) / 2, 0.06, 0.06, cellTop - cellBot - 0.1, MAT.cellGrey);
        cell.add(r);
      }
    }
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
    // ---------------------------------------------------------------- elevation rings + lower cross-box (photos)
    // Two large rings centred on the elevation axis carry the whole tube; a teal box with oval
    // lightening holes closes the bottom of the cradle under the dark-grey mirror cell.
    const zAx = ELEV_AXIS_ABOVE_M1;
    const rOut = 6.25;
    const rIn = 5.45;
    for (const sg of [-1, 1]) {
      const ring = new THREE.Shape();
      ring.absarc(0, 0, rOut, 0, Math.PI * 2, false);
      const inner = new THREE.Path();
      inner.absarc(0, 0, rIn, 0, Math.PI * 2, true);
      ring.holes.push(inner);
      const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.7, bevelEnabled: false, curveSegments: 128 });
      const rm = new THREE.Mesh(ringGeo, MAT.paintCut);
      rm.rotation.y = Math.PI / 2; // shape plane → three YZ, extrusion along X
      rm.position.set(sg > 0 ? 5.75 : -6.45, zAx, 0);
      ota.add(rm);
      // dark bearing track on the rim
      const track = new THREE.Mesh(new THREE.CylinderGeometry(rOut + 0.02, rOut + 0.02, 0.5, 160, 1, true), MAT.steel);
      track.rotation.z = Math.PI / 2;
      track.position.set(sg * 6.1, zAx, 0);
      ota.add(track);
      // round lightening holes, drawn as dark discs on both faces
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), MAT.holeDark);
        hole.rotation.y = (sg * Math.PI) / 2;
        hole.position.copy(ocs(sg * 6.46, 5.85 * Math.cos(a), zAx + 5.85 * Math.sin(a)));
        ota.add(hole);
      }
    }
    {
      // lower cross-box: octagonal section in (OCS y, z), extruded along x between the rings
      const zt = cellBot - 0.05;
      const zb = zAx - rOut + 0.35;
      const hy = 3.2;
      const ch = 0.9;
      const sec = new THREE.Shape();
      const pts: [number, number][] = [[-hy + ch, zb], [hy - ch, zb], [hy, zb + ch], [hy, zt], [-hy, zt], [-hy, zb + ch]];
      sec.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) sec.lineTo(p[0], p[1]);
      sec.closePath();
      const bg = new THREE.ExtrudeGeometry(sec, { depth: 11.5, bevelEnabled: false });
      // shape x = OCS y → three −Z ; shape y = OCS z → three Y ; extrusion → three X
      bg.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
      bg.translate(-5.75, 0, 0);
      const lb = new THREE.Mesh(bg, MAT.paintCut);
      ota.add(lb);
      // oval lightening holes along both long faces
      for (const sy of [-1, 1])
        for (let k = 0; k < 7; k++) {
          const x = -4.5 + k * 1.5;
          const o = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), MAT.holeDark);
          o.scale.set(k % 2 ? 0.75 : 1.0, 1.25, 1);
          o.position.copy(ocs(x, sy * (hy + 0.01), (zt + zb + ch) / 2));
          o.rotation.y = sy > 0 ? Math.PI : 0;
          ota.add(o);
        }
      groups.lowerBox = lb;
    }
  }

  // ------------------------------------------------------------------ Top-end assembly piers (APPROX, 4 X-braced trusses)
  const piers = new THREE.Group();
  const zP0 = 2.878;
  const zP1 = 7.263;
  // round teal tubes in V pairs (photos), from the centre section up to the top-end ring
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const P = (da: number, z: number, rr: number) => ocs(rr * Math.cos(a + da), rr * Math.sin(a + da), z);
    for (const sg of [-1, 1]) {
      piers.add(cylinderBetween(P(sg * 0.32, zP0, 5.05), P(sg * 0.04, zP1, 4.85), 0.24, MAT.paint, 20));
      // end plates
      const plate = box(0, 0, 0, 0.7, 0.7, 0.12, MAT.paint);
      plate.position.copy(P(sg * 0.32, zP0 + 0.06, 5.05));
      piers.add(plate);
    }
  }
  ota.add(piers);
  groups.piers = piers;

  // Mid-level baffle ring
  const mid = BF.find((b) => b.name === 'MidLevel')!;
  ota.add(annulusMesh(mid.inner, mid.outer, mid.z, MAT.black, 0.03));
  ota.add(tube(5.0, 5.125, mid.z - 0.45, mid.z, MAT.paint));

  // ------------------------------------------------------------------ Top-end ring (I-beam: flanges are the two baffles)
  const ter = new THREE.Group();
  const up = BF.find((b) => b.name === 'UpperTopEnd')!;
  const lo = BF.find((b) => b.name === 'LowerTopEnd')!;
  // flanges = the two batoid baffles; the ring itself is unpainted metal (photos)
  ter.add(annulusMesh(up.inner, up.outer, up.z, MAT.bare, 0.04)); // sky-facing flange: bare metal
  ter.add(annulusMesh(lo.inner, lo.outer, lo.z, MAT.black, 0.04)); // lower flange: black baffle
  // box-section webs perforated with round lightening holes
  const webH = up.z - lo.z - 0.04;
  const zMid = (up.z + lo.z) / 2;
  for (const [rw, holes] of [[4.47, 36], [4.88, 40]] as [number, number][]) {
    const m = (rw > 4.6 ? MAT.paint : MAT.bare).clone();
    m.alphaMap = perforatedAlpha(holes, 0.6);
    m.alphaTest = 0.5;
    m.side = THREE.DoubleSide;
    const web = new THREE.Mesh(new THREE.CylinderGeometry(rw, rw, webH, 256, 1, true), m);
    web.position.y = zMid;
    ter.add(web);
  }
  // radial diaphragms between the webs
  for (let k = 0; k < 36; k++) {
    const a = ((k + 0.5) / 36) * Math.PI * 2;
    const d = box(4.675 * Math.cos(a), 4.675 * Math.sin(a), zMid, 0.4, 0.015, webH, MAT.paint);
    d.rotation.y = a;
    ter.add(d);
  }
  ota.add(ter);
  groups.topEnd = ter;
  L('ter', 'Top-end ring', 'Steel I-beam ring 9.8 m across. Its two flanges double as light baffles at the top of the telescope.', ocs(0, 4.9, 8.06));

  // ------------------------------------------------------------------ Spider spindle, centre plate, vanes
  const spider = new THREE.Group();
  const zCap = 9.818006;
  spider.add(tube(1.05, 1.1, 6.95, zCap, MAT.paint, 64));
  spider.add(annulusMesh(0, 1.1, zCap, MAT.paint, 0.05, 64));
  for (const r of SPIDER.rects.slice(0, 4)) {
    const m = box(0, 0, SPIDER.z, r.w, r.h, 0.06, MAT.spiderGrey);
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
      spider.add(beam(a, b, 0.05, 0.44, MAT.spiderGrey));
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
  // the tube structure is rigid: bake it into one mesh per material before adding the camera
  // (if a part of the tube is ever animated or toggled, pass it as mergeStatic(ota, [part]))
  mergeStatic(ota);

  const camModel = buildLSSTCam(rubin, { uniformSensors: true }); // CCD types are detailed on the camera page
  const cam = camModel.group;
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
  L('fp', 'Focal plane', '189 science CCDs in 21 rafts + 4 corner rafts for guiding and wavefront sensing. 64 cm across, flat to < 10 µm, kept at −100 °C.', ocs(-0.3, 0, zDet));

  return { ota, labels, filter, setBand: buildFilter, groups };
}
