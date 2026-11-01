// LSSTCam: detailed (partly schematic) model of the Rubin camera, with animatable mechanisms.
// Built in the OCS-aligned local frame (util.ts): local Y = OCS z = optical axis, light travels +z.
// Exact: L1, L2, filters (per band), L3 surfaces and positions, focal-plane layout, body radius.
// Schematic: internal mechanics (rails, sockets, shutter frame, cryostat interior, utility trunk).
import * as THREE from 'three';
import { Rubin, Band } from '../optics/trace';
import { Surface } from '../optics/surfaces';
import prescription from '../data/prescription.json';
import { MAT, cutPlane } from './materials';
import { cameraSkin, PALETTE } from './textures';
import { annulusMesh, box, lathe, ocs, tube, cylinderBetween } from './util';
import { buildFocalPlane, LAYOUT, RAFT_PITCH } from './focalplane';
import type { Label } from './telescope';

const P = prescription as unknown as Record<Band, { surfaces: any[] }>;

/** Band display colours (i, z, y are false colour) */
export const BAND_HEX: Record<Band, string> = {
  u: '#9b6bff',
  g: '#34b8ff',
  r: '#ff6a2e',
  i: '#ff2f5e',
  z: '#e04bff',
  y: '#ffd43a',
};

export const CAM = {
  zL1: 3.3974725882045593,
  zBody0: 3.5019725882045593,
  rBody: 0.80469,
  zBodyTop: 5.45,
  zTrunkTop: 3.3974725882045593 + 3.73,
  zShutter: 4.312,
  zCarousel: 4.95,
  rSocket: 0.56, // apothem of the filter pentagon
  rTurn: 0.25, // autochanger 90° turn radius
  zFilterBeam: 4.271924608204559, // r-band filter front vertex (varies ±3 mm with band)
  shutterHalf: 0.385,
};

function lensSolid(front: (r: number) => number, back: (r: number) => number, rClear: number, rEdge: number, mat: THREE.Material) {
  const n = 48;
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) prof.push([(rEdge * i) / n, front(Math.min((rEdge * i) / n, rClear))]);
  for (let i = n; i >= 0; i--) prof.push([(rEdge * i) / n, back(Math.min((rEdge * i) / n, rClear))]);
  return lathe(prof, 128, mat);
}

function filterMaterial(b: Band) {
  const c = new THREE.Color(BAND_HEX[b]);
  return new THREE.MeshPhysicalMaterial({
    color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.35),
    metalness: 0.3,
    roughness: 0.06,
    transmission: 0.45,
    ior: 1.458,
    thickness: 0.02,
    iridescence: 1,
    iridescenceIOR: 1.9,
    iridescenceThicknessRange: [250, 700],
    envMapIntensity: 0.8,
    side: THREE.DoubleSide,
    clippingPlanes: [cutPlane],
  });
}

/** One physical filter: meniscus from the batoid surfaces of its band, in a frame. Origin = front vertex. */
function buildFilter(b: Band): THREE.Group {
  const s = P[b].surfaces;
  const fe = new Surface(s.find((x: any) => x.name === 'Filter_entrance'));
  const fx = new Surface(s.find((x: any) => x.name === 'Filter_exit'));
  const z0 = fe.z0;
  const g = new THREE.Group();
  g.name = `filter-${b}`;
  const lens = lensSolid((r) => fe.zAt(r, 0) - z0, (r) => fx.zAt(r, 0) - z0, 0.375, 0.375, filterMaterial(b));
  g.add(lens);
  g.add(tube(0.375, 0.392, -0.01, fx.z0 - z0 + 0.035, MAT.aluDark, 72));
  // two side pins for the autochanger trucks (±x)
  for (const sg of [-1, 1]) g.add(box(sg * 0.405, 0, 0.01, 0.03, 0.06, 0.04, MAT.steel));
  g.userData.thickness = fx.z0 - z0;
  g.userData.zBeam = z0;
  return g;
}

export interface LSSTCam {
  group: THREE.Group;
  labels: Label[];
  parts: Record<string, THREE.Object3D>;
  filters: Record<Band, THREE.Group>;
  state: CamState;
  update(): void;
  setExplode(t: number): void;
  /** instantly put a band in the beam (telescope page) */
  instantBeam(b: Band): void;
  focalPlaneImage: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; mesh: THREE.Mesh };
}

export interface CamState {
  sockets: (Band | null)[]; // 5 carousel sockets, socket 0 at standby when carouselAngle = 0
  home: Partial<Record<Band, number>>; // socket each loaded filter belongs to
  beam: Band | null; // filter clamped in the beam
  transit: { band: Band; s: number } | null; // s: 0 = standby socket, 1 = in beam
  carouselAngle: number;
  shutterA: number; // coverage fraction of blade stack A (+x side), 0 = stowed, 1 = closed
  shutterB: number;
  explode: number;
}

const SOCKET_ANGLE = (k: number, carousel: number) => carousel + (k * 2 * Math.PI) / 5 + Math.PI / 2;

/** Autochanger path in the (y, z) plane from the standby socket (s=0) to the beam (s=1). */
export function autochangerPose(s: number, zBeam: number) {
  const { rSocket: R, zCarousel: zC, rTurn: rt } = CAM;
  const L1 = zC - (zBeam + rt);
  const L2 = (Math.PI / 2) * rt;
  const L3 = R - rt;
  const L = L1 + L2 + L3;
  let d = s * L;
  if (d <= L1) return { y: R, z: zC - d, w: 1, length: L };
  d -= L1;
  if (d <= L2) {
    const a = d / rt; // 0..π/2
    return { y: R - rt + rt * Math.cos(a), z: zBeam + rt - rt * Math.sin(a), w: 1 - a / (Math.PI / 2), length: L };
  }
  d -= L2;
  return { y: R - rt - d, z: zBeam, w: 0, length: L };
}

export function buildLSSTCam(rubin: Rubin): LSSTCam {
  const group = new THREE.Group();
  group.name = 'LSSTCam';
  const S = rubin.surfaces;
  const labels: Label[] = [];
  const parts: Record<string, THREE.Object3D> = {};
  const L = (id: string, title: string, text: string, p: THREE.Vector3, parent?: THREE.Object3D) =>
    labels.push({ id, title, text, pos: p, parent } as Label);
  const mk = (name: string) => {
    const g = new THREE.Group();
    g.name = name;
    group.add(g);
    parts[name] = g;
    return g;
  };

  // ---------------------------------------------------------------- L1–L2 assembly
  const l1l2 = mk('l1l2');
  const zL2 = S.L2_entrance.z0;
  const lensL1 = lensSolid((r) => S.L1_entrance.zAt(r, 0), (r) => S.L1_exit.zAt(r, 0), 0.775, 0.785, MAT.silica);
  const lensL2 = lensSolid((r) => S.L2_entrance.zAt(r, 0), (r) => S.L2_exit.zAt(r, 0), 0.551, 0.56, MAT.silica);
  l1l2.add(lensL1, lensL2);
  // L1 toroidal ring with triangular section
  const zL1e = S.L1_entrance.zAt(0.785, 0);
  l1l2.add(lathe([[0.785, zL1e - 0.02], [0.84, zL1e + 0.06], [0.785, zL1e + 0.12], [0.785, zL1e - 0.02]], 128, MAT.cameraBlack));
  // L2 ring
  l1l2.add(tube(0.56, 0.6, zL2 - 0.01, zL2 + 0.07, MAT.aluDark, 96));
  // tubular space-frame cone between the rings
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2;
    const a1 = ((k + 0.5) / 12) * Math.PI * 2;
    l1l2.add(cylinderBetween(ocs(0.8 * Math.cos(a0), 0.8 * Math.sin(a0), zL1e + 0.11), ocs(0.6 * Math.cos(a1), 0.6 * Math.sin(a1), zL2 + 0.03), 0.012, MAT.alu));
    l1l2.add(cylinderBetween(ocs(0.8 * Math.cos(a0), 0.8 * Math.sin(a0), zL1e + 0.11), ocs(0.6 * Math.cos(a1 - Math.PI / 6), 0.6 * Math.sin(a1 - Math.PI / 6), zL2 + 0.03), 0.012, MAT.alu));
  }
  parts.lenses = new THREE.Group();
  L('L1', 'L1 — 1.57 m lens', 'The largest high-performance optical lens ever made: fused silica, 1.57 m wide, 82 mm thick. It is the camera’s front window to the telescope.', ocs(0, -0.84, zL1e + 0.06), l1l2);
  L('L2', 'L2 lens', '1.1 m fused-silica lens with one aspheric face. L1 and L2 share a light aluminium space-frame mount.', ocs(0.58, 0, zL2 + 0.03), l1l2);

  // ---------------------------------------------------------------- camera body (skin + front flange + internal rings)
  const body = mk('body');
  const rB = CAM.rBody;
  {
    // black anodised skin with bolted joints (from photos), inner wall plain
    const z0 = CAM.zBody0 + 0.08;
    const len = CAM.zBodyTop - z0;
    const skin = cameraSkin([0.06, 0.27, 0.5, 0.79, 0.95], 8, [0.55, 0.9]);
    const m = (MAT.cameraBlack as THREE.MeshStandardMaterial).clone();
    m.clippingPlanes = [cutPlane]; // clone() copies planes, keep the shared one
    m.color.set(0xffffff); // colour comes from the map
    m.map = skin.map;
    m.bumpMap = skin.bumpMap;
    m.bumpScale = 1.2;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rB, rB, len, 160, 1, true), m);
    c.position.y = z0 + len / 2;
    body.add(c);
    body.add(tube(rB - 0.02, rB - 0.005, z0, CAM.zBodyTop, MAT.aluDark));
  }
  body.add(lathe([[0.8, CAM.zBody0 - 0.02], [0.86, CAM.zBody0 + 0.02], [0.86, CAM.zBody0 + 0.1], [0.8, CAM.zBody0 + 0.12]], 128, MAT.cameraBlack)); // front flange
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    void a; // (longerons are inside the skin on the real camera)
  }
  body.add(annulusMesh(0.0, rB + 0.02, CAM.zBodyTop, MAT.cameraBlack, 0.06)); // back flange
  L('body', 'Camera body', 'Aluminium housing, 1.65 m wide. Holds the lenses, shutter and filter exchanger around the cryostat. Total camera mass: 3 t.', ocs(-0.7, -0.45, 4.75), body);

  // ---------------------------------------------------------------- shutter
  const shutter = mk('shutter');
  const zSh = CAM.zShutter;
  {
    const fr = new THREE.Shape();
    fr.moveTo(-0.72, -0.5);
    fr.lineTo(0.72, -0.5);
    fr.lineTo(0.72, 0.5);
    fr.lineTo(-0.72, 0.5);
    fr.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, CAM.shutterHalf, 0, Math.PI * 2, true);
    fr.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(fr, { depth: 0.028, bevelEnabled: false, curveSegments: 64 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, zSh - 0.006, 0);
    shutter.add(new THREE.Mesh(g, MAT.aluDark));
  }
  const bladeGeo = new THREE.BoxGeometry(0.275, 0.003, 0.82);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.6, roughness: 0.35, clippingPlanes: [cutPlane], side: THREE.DoubleSide });
  const blades: { m: THREE.Mesh; side: number; k: number }[] = [];
  parts.blades = new THREE.Group();
  shutter.add(parts.blades);
  for (const side of [1, -1])
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(bladeGeo, bladeMat);
      parts.blades.add(m);
      blades.push({ m, side, k });
    }
  L('shutter', 'Shutter', 'Two stacks of three telescoping carbon blades. One stack slides away to open, the other slides in from the opposite side to close, so every pixel gets exactly the same exposure. ~1 s per stroke.', ocs(0.62, -0.4, zSh), shutter);

  // ---------------------------------------------------------------- cryostat + L3 + focal plane + raft towers
  const cryo = mk('cryostat');
  const zDet = S.Detector.z0;
  const l3 = lensSolid((r) => S.L3_entrance.zAt(r, 0), (r) => S.L3_exit.zAt(r, 0), 0.361, 0.361, MAT.silica);
  cryo.add(l3);
  parts.L3 = l3;
  cryo.add(tube(0.361, 0.47, S.L3_entrance.z0 - 0.005, S.L3_exit.z0 + 0.02, MAT.steel, 96)); // Ti L3 ring
  cryo.add(tube(0.45, 0.47, S.L3_exit.z0 + 0.02, 5.16, MAT.steel, 96)); // vessel
  cryo.add(annulusMesh(0, 0.5, 5.17, MAT.steel, 0.03, 96)); // end cap
  const fp = buildFocalPlane(zDet);
  cryo.add(fp);
  parts.focalPlane = fp;
  // raft towers (≈60 cm), front-end electronics, SiC grid, cryo & cold plates
  const towerGeo = new THREE.BoxGeometry(RAFT_PITCH - 0.004, 0.52, RAFT_PITCH - 0.004);
  const feeGeo = new THREE.BoxGeometry(0.1, 0.18, 0.012);
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      const x = (col - 2) * RAFT_PITCH;
      const y = (row - 2) * RAFT_PITCH;
      const corner = (row === 0 || row === 4) && (col === 0 || col === 4);
      const t = new THREE.Mesh(towerGeo, corner ? MAT.aluDark : MAT.raftBase);
      t.position.copy(ocs(x, y, zDet + 0.09 + 0.26));
      cryo.add(t);
      for (const dy of [-0.035, 0, 0.035]) {
        const b = new THREE.Mesh(feeGeo, MAT.fee);
        b.position.copy(ocs(x, y + dy, zDet + 0.72 - 0.09));
        cryo.add(b);
      }
    }
  cryo.add(annulusMesh(0, 0.44, zDet + 0.2, MAT.sic, 0.03));
  cryo.add(annulusMesh(0, 0.44, zDet + 0.45, MAT.copper, 0.025));
  cryo.add(annulusMesh(0, 0.44, zDet + 0.62, MAT.copper, 0.025));
  L('L3', 'L3 — cryostat window', '72 cm lens that also seals the vacuum: it holds back 4.3 tonnes of air pressure. Last glass the light crosses.', ocs(-0.36, 0.2, S.L3_entrance.z0), cryo);
  L('fp', 'Focal plane', '189 science CCDs (3.2 gigapixels) on 21 rafts, plus 4 corner rafts for guiding and wavefront sensing. 64 cm across, flat to 10 µm, at −100 °C.', ocs(0.2, -0.3, zDet), cryo);
  L('rafts', 'Raft towers', 'Each 60 cm tower carries 9 CCDs and their electronics: 144 megapixels, a complete camera on its own.', ocs(0.32, 0.32, zDet + 0.4), cryo);
  L('cryostat', 'Cryostat', 'Vacuum vessel. Copper cryo-plates fed by a mixed-refrigerant system keep the sensors at −100 °C and the electronics at −40 °C.', ocs(-0.46, -0.1, 4.95), cryo);

  // focal-plane image layer (exposure / readout visualisation)
  const fpCanvas = document.createElement('canvas');
  fpCanvas.width = fpCanvas.height = 1024;
  const fpTex = new THREE.CanvasTexture(fpCanvas);
  fpTex.colorSpace = THREE.SRGBColorSpace;
  const fpImg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.66),
    new THREE.MeshBasicMaterial({ map: fpTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  // plane in OCS xy facing −z; texture u → +x, v → +y
  fpImg.rotation.x = Math.PI / 2;
  fpImg.scale.y = -1;
  fpImg.position.copy(ocs(0, 0, zDet - 0.0006));
  fpImg.renderOrder = 12;
  cryo.add(fpImg);

  // ---------------------------------------------------------------- filter carousel (rotates about the axis)
  const carousel = mk('carousel');
  const zC = CAM.zCarousel;
  {
    // ring bearing Ø1.4 m with gear teeth at the back
    carousel.add(tube(0.66, 0.7, zC + 0.42, zC + 0.47, MAT.steel));
    const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.05, 0.018), MAT.steel, 180);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      m.makeRotationY(-a);
      m.setPosition(ocs(0.708 * Math.cos(a), 0.708 * Math.sin(a), zC + 0.445));
      teeth.setMatrixAt(i, m);
    }
    carousel.add(teeth);
    carousel.add(tube(0.62, 0.66, zC - 0.43, zC - 0.39, MAT.aluDark));
    // 5 sockets: posts + clamps
    for (let k = 0; k < 5; k++) {
      const a = (k * 2 * Math.PI) / 5 + Math.PI / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (const sg of [-1, 1]) {
        const tx = -s * sg * 0.41;
        const ty = c * sg * 0.41;
        carousel.add(box(CAM.rSocket * c + tx, CAM.rSocket * s + ty, zC, 0.035, 0.035, 0.86, MAT.aluDark)); // posts
        carousel.add(box(CAM.rSocket * c + tx * 0.97, CAM.rSocket * s + ty * 0.97, zC, 0.05, 0.05, 0.07, MAT.blueCut)); // clamps
      }
      carousel.add(box(CAM.rSocket * c, CAM.rSocket * s, zC + 0.4, 0.08, 0.08, 0.05, MAT.blueCut)); // bottom guide
    }
  }
  L('carousel', 'Filter carousel', 'Stores five 75 cm filters (25–38 kg each) standing in a pentagon around the cryostat. It turns 1/5 or 2/5 of a turn to bring the next filter to the “standby” socket.', ocs(0, -0.75, zC), carousel);

  // ---------------------------------------------------------------- autochanger rails (fixed in the body, at the standby socket)
  const ac = mk('autochanger');
  const zBeamRef = CAM.zFilterBeam;
  const railPts = (dx: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const p = autochangerPose(i / 60, zBeamRef);
      pts.push(ocs(dx, p.y, p.z));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  for (const sg of [-1, 1])
    for (const off of [0.0, 0.035]) {
      const curve = railPts(sg * (0.43 + off));
      ac.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.011, 8, false), MAT.steel));
    }
  // motorised linear rails along the axis (drive the articulated linkage)
  for (const sg of [-1, 1]) ac.add(box(sg * 0.42, 0.62, (zC + zBeamRef) / 2 + 0.15, 0.04, 0.05, 0.9, MAT.blueCut));
  const trucks: THREE.Mesh[] = [];
  for (const sg of [-1, 1]) {
    const t = box(0, 0, 0, 0.06, 0.07, 0.09, MAT.blueCut);
    t.userData.sg = sg;
    ac.add(t);
    trucks.push(t);
  }
  L('autochanger', 'Autochanger', 'Pulls the chosen filter out of the carousel and drives it along curved double rails around the front of the cryostat into the beam: 91 cm in about 6 s, positioned to 0.1 mm.', ocs(0.47, 0.5, 4.55), ac);

  // ---------------------------------------------------------------- utility trunk + hexapod/rotator
  const trunk = mk('trunk');
  {
    const len = CAM.zTrunkTop - 0.28 - CAM.zBodyTop;
    const skin = cameraSkin([0.08, 0.5, 0.92], 6);
    const m = (MAT.cameraBlack as THREE.MeshStandardMaterial).clone();
    m.clippingPlanes = [cutPlane]; // clone() copies planes, keep the shared one
    m.color.set(PALETTE.trunkAmber); // amber thermal skin, as in the official exploded view
    m.metalness = 0.55;
    m.roughness = 0.4;
    m.bumpMap = skin.bumpMap;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, len, 96, 1, true), m);
    c.position.y = CAM.zBodyTop + len / 2;
    trunk.add(c);
    trunk.add(tube(0.57, 0.595, CAM.zBodyTop, CAM.zTrunkTop - 0.28, MAT.aluDark, 72));
  }
  trunk.add(annulusMesh(0, 0.6, CAM.zTrunkTop - 0.28, MAT.aluDark, 0.04, 72));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    trunk.add(box(0.38 * Math.cos(a), 0.38 * Math.sin(a), 6.1, 0.24, 0.16, 0.9, k % 2 ? MAT.fee : MAT.aluDark)); // electronics crates
  }
  trunk.add(cylinderBetween(ocs(0, 0, 5.5), ocs(0, 0, 6.6), 0.16, MAT.steel, 32)); // vacuum / refrigeration manifold
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    trunk.add(cylinderBetween(ocs(0.22 * Math.cos(a), 0.22 * Math.sin(a), 5.55), ocs(0.22 * Math.cos(a), 0.22 * Math.sin(a), 5.95), 0.06, MAT.copper, 20)); // heat exchangers
  }
  L('trunk', 'Utility trunk', 'Refrigeration heat exchangers, vacuum pumps and readout electronics. Fits through the 1.8 m hole in the secondary mirror.', ocs(0.6, 0, 6.3), trunk);
  const hex = mk('hexapod');
  // camera rotator + hexapod: Rubin teal (photos)
  hex.add(tube(0.62, 0.95, CAM.zTrunkTop - 0.25, CAM.zTrunkTop - 0.17, MAT.paintCut, 96));
  hex.add(tube(0.62, 0.95, CAM.zTrunkTop - 0.06, CAM.zTrunkTop, MAT.paintCut, 96));
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2 + (k % 2 ? 0.2 : -0.2);
    const a1 = (k / 6) * Math.PI * 2 + (k % 2 ? -0.35 : 0.35);
    hex.add(cylinderBetween(ocs(0.85 * Math.cos(a0), 0.85 * Math.sin(a0), CAM.zTrunkTop - 0.17), ocs(0.85 * Math.cos(a1), 0.85 * Math.sin(a1), CAM.zTrunkTop - 0.06), 0.025, MAT.steel));
  }
  L('hexapod', 'Hexapod & rotator', 'Moves the whole 3 t camera by micrometres to keep it in focus, and rotates it to follow the sky.', ocs(0.95, 0, CAM.zTrunkTop - 0.12), hex);

  // ---------------------------------------------------------------- filters
  const BANDS: Band[] = ['u', 'g', 'r', 'i', 'z', 'y'];
  const filters = {} as Record<Band, THREE.Group>;
  const filterRoot = mk('filters');
  for (const b of BANDS) {
    filters[b] = buildFilter(b);
    filterRoot.add(filters[b]);
  }
  L('filter', 'Filter in the beam', 'Only one colour band (u, g, r, i, z or y) reaches the sensors at a time. Interference coatings on a curved fused-silica disc.', ocs(0.0, 0.42, CAM.zFilterBeam), filterRoot);

  // ---------------------------------------------------------------- state & update
  const state: CamState = {
    sockets: ['u', 'g', 'r', 'i', 'z'],
    home: { u: 0, g: 1, r: 2, i: 3, z: 4 },
    beam: null,
    transit: null,
    carouselAngle: 0,
    shutterA: 1,
    shutterB: 0,
    explode: 0,
  };

  const qTmp = new THREE.Quaternion();
  const qY = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);

  function placeFilterAt(f: THREE.Group, socketK: number | null, s: number) {
    // s = 0 → standing in socket at standby, 1 → in beam. socketK given → stored at that socket.
    const zBeam = f.userData.zBeam as number;
    const th = f.userData.thickness as number;
    if (socketK !== null) {
      const a = SOCKET_ANGLE(socketK, state.carouselAngle);
      qY.setFromAxisAngle(AY, a - Math.PI / 2);
      qTmp.setFromAxisAngle(AX, -Math.PI / 2);
      f.quaternion.copy(qY).multiply(qTmp);
      // centre the disc thickness on the socket radius
      f.position.copy(ocs((CAM.rSocket - th / 2) * Math.cos(a), (CAM.rSocket - th / 2) * Math.sin(a), zC));
      return;
    }
    const p = autochangerPose(s, zBeam);
    qTmp.setFromAxisAngle(AX, -Math.PI / 2 * p.w);
    f.quaternion.copy(qTmp);
    f.position.copy(ocs(0, p.y - (th / 2) * p.w, p.z));
  }

  function update() {
    const ex = state.explode;
    // exploded offsets along the optical axis
    const dz: Record<string, number> = { l1l2: -1.25, shutter: -0.55, filters: -0.85, cryostat: 0.25, carousel: 0.95, autochanger: 0, trunk: 1.7, hexapod: 2.1, body: 0 };
    for (const [k, v] of Object.entries(dz)) parts[k].position.copy(ocs(0, 0, v * ex));
    // carousel filters need to follow the carousel, the in-beam/transit filter follows "filters"
    (parts.body as THREE.Group).visible = ex < 0.02;
    parts.autochanger.visible = ex < 0.6;
    carousel.rotation.y = state.carouselAngle;
    for (const b of BANDS) {
      const f = filters[b];
      const k = state.home[b];
      f.visible = k !== undefined;
      if (k === undefined) continue;
      if (state.transit && state.transit.band === b) placeFilterAt(f, null, state.transit.s);
      else if (state.beam === b) placeFilterAt(f, null, 1);
      else {
        placeFilterAt(f, k, 0);
        f.position.add(ocs(0, 0, (dz.carousel - dz.filters) * ex)); // stored filters travel with the carousel
      }
    }
    // trucks follow the moving filter
    const moving = state.transit ? { b: state.transit.band, s: state.transit.s } : state.beam ? { b: state.beam, s: 1 } : null;
    for (const t of trucks) {
      if (!moving) {
        const p = autochangerPose(0, zBeamRef);
        t.position.copy(ocs(t.userData.sg * 0.43, p.y, p.z));
        continue;
      }
      const p = autochangerPose(moving.s, filters[moving.b].userData.zBeam);
      t.position.copy(ocs(t.userData.sg * 0.43, p.y, p.z + 0.01));
      t.quaternion.setFromAxisAngle(AX, -Math.PI / 2 * p.w);
    }
    // shutter blades: stack A on +x, stack B on −x, three telescoping panels each
    const H = CAM.shutterHalf;
    const w = 0.275;
    for (const { m, side, k } of blades) {
      const f = side > 0 ? state.shutterA : state.shutterB;
      const back = side * (H - w / 2 + (1 - f) * w);
      const lead = side * (H + w / 2 - 2 * H * f);
      const x = THREE.MathUtils.lerp(back, lead, k / 2);
      m.position.copy(ocs(x, 0, zSh + 0.004 + 0.005 * k + (side > 0 ? 0 : 0.016)));
    }
  }

  function setExplode(t: number) {
    state.explode = t;
    update();
  }

  function instantBeam(b: Band) {
    if (state.home[b] === undefined) {
      // swap with the loader: the 6th filter replaces the one in socket of u↔y (typical lunar-cycle swap)
      const out: Band = b === 'y' ? 'u' : b === 'u' ? 'y' : 'u';
      const k = state.home[out] ?? 0;
      delete state.home[out];
      state.home[b] = k;
      state.sockets[k] = b;
    }
    state.beam = b;
    state.transit = null;
    state.carouselAngle = -((state.home[b]! * 2 * Math.PI) / 5);
    update();
  }

  instantBeam('r');
  state.shutterA = 1;
  update();

  return { group, labels, parts, filters, state, update, setExplode, instantBeam, focalPlaneImage: { canvas: fpCanvas, texture: fpTex, mesh: fpImg } };
}

export { LAYOUT };
