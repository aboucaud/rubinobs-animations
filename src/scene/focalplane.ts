// LSSTCam focal plane, from obs_lsst: rafts on a 127 mm pitch, CCDs on a 42.25 mm pitch.
// Raft naming here is R{row}{col} with row along OCS +y and col along OCS +x (orientation to be checked
// against obs_lsst / camera rotator conventions).
import * as THREE from 'three';
import { MAT } from './materials';
import { ocs } from './util';

const ITL_RAFTS = new Set(['R01', 'R02', 'R03', 'R10', 'R20', 'R41', 'R42', 'R43']);
const CORNERS = new Set(['R00', 'R04', 'R40', 'R44']);
export const RAFT_PITCH = 0.127;
export const CCD_PITCH = 0.04225;

export type CcdKind = 'e2v' | 'itl' | 'guider' | 'wfs';
export interface CcdInfo {
  raft: string;
  ccd: string;
  kind: CcdKind;
  cx: number; // OCS x (m)
  cy: number;
  w: number;
  h: number;
  dz: number; // defocus offset (m)
}

export function focalPlaneLayout(): CcdInfo[] {
  const out: CcdInfo[] = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      const raft = `R${row}${col}`;
      const rx = (col - 2) * RAFT_PITCH;
      const ry = (row - 2) * RAFT_PITCH;
      if (CORNERS.has(raft)) {
        // rotate the corner layout so the WFS sits at the outer corner
        const sx = col === 0 ? 1 : -1;
        const sy = row === 0 ? 1 : -1;
        const rot = (ox: number, oy: number) => [rx - sx * ox, ry - sy * oy] as const;
        // guiders at (−42.25, 0) and (0, −42.25) mm in the raft frame
        for (const [ox, oy, name] of [
          [-CCD_PITCH, 0, 'SG0'],
          [0, -CCD_PITCH, 'SG1'],
        ] as const) {
          const [x, y] = rot(ox, oy);
          out.push({ raft, ccd: name, kind: 'guider', cx: x, cy: y, w: 0.04072, h: 0.04, dz: 0 });
        }
        // split wavefront sensor at (−42.25, −42.25): two half chips, ±1.5 mm focus offset
        const [x, y] = rot(-CCD_PITCH, -CCD_PITCH);
        out.push({ raft, ccd: 'SW0', kind: 'wfs', cx: x, cy: y - 0.0101, w: 0.04072, h: 0.02, dz: -0.0015 });
        out.push({ raft, ccd: 'SW1', kind: 'wfs', cx: x, cy: y + 0.0101, w: 0.04072, h: 0.02, dz: 0.0015 });
        continue;
      }
      const itl = ITL_RAFTS.has(raft);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          out.push({
            raft,
            ccd: `S${i}${j}`,
            kind: itl ? 'itl' : 'e2v',
            cx: rx + (j - 1) * CCD_PITCH,
            cy: ry + (i - 1) * CCD_PITCH,
            w: itl ? 0.04072 : 0.04096,
            h: itl ? 0.04 : 0.04004,
            dz: 0,
          });
        }
    }
  return out;
}

export const LAYOUT = focalPlaneLayout();

export function ccdAt(x: number, y: number): CcdInfo | null {
  for (const c of LAYOUT) if (Math.abs(x - c.cx) <= c.w / 2 && Math.abs(y - c.cy) <= c.h / 2) return c;
  return null;
}

/** 3D focal plane: sensors face −z (down toward M3), silicon surface at the detector plane zDet.
 *  `uniform`: one material for every sensor (overview pages that do not detail the CCD types). */
export function buildFocalPlane(zDet: number, uniform = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'FocalPlane';
  const t = 0.0015;
  const geo = new THREE.BoxGeometry(1, t, 1);
  for (const c of LAYOUT) {
    const mat = uniform ? MAT.sensor : c.kind === 'e2v' ? MAT.e2v : c.kind === 'itl' ? MAT.itl : c.kind === 'wfs' ? MAT.wfs : MAT.itl;
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(c.w, 1, c.h);
    m.position.copy(ocs(c.cx, c.cy, zDet + c.dz + t / 2));
    g.add(m);
  }
  // raft bases (towers, ~0.6 m tall; shown short)
  const rb = new THREE.BoxGeometry(0.1265, 0.08, 0.1265);
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      const m = new THREE.Mesh(rb, MAT.raftBase);
      m.position.copy(ocs((col - 2) * RAFT_PITCH, (row - 2) * RAFT_PITCH, zDet + 0.0035 + 0.04));
      g.add(m);
    }
  return g;
}
