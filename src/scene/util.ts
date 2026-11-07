import * as THREE from 'three';
import type { V3 } from '../optics/surfaces';
import type { Surface } from '../optics/surfaces';

/**
 * Local "OTA" frame used for all 3D geometry: three.js Y = OCS +z (optical axis),
 * X = OCS +x (elevation axis), Z = −OCS y. This keeps a right-handed frame and lets
 * LatheGeometry (which revolves around Y) build axisymmetric optics directly.
 */
export function ocs(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y);
}
export function ocsv(p: V3): THREE.Vector3 {
  return ocs(p[0], p[1], p[2]);
}

/** Closed lathe solid from an [r, z] profile (OCS z). */
export function lathe(profile: [number, number][], segments = 128, mat?: THREE.Material): THREE.Mesh {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 1e-5), z));
  const g = new THREE.LatheGeometry(pts, segments);
  return new THREE.Mesh(g, mat);
}

/** Lens/filter solid of revolution between two surface profiles (front at lower z). */
export function lensSolid(front: (r: number) => number, back: (r: number) => number, rClear: number, rEdge: number, mat: THREE.Material, n = 48, segments = 128) {
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const r = (rEdge * i) / n;
    prof.push([r, front(Math.min(r, rClear))]);
  }
  for (let i = n; i >= 0; i--) {
    const r = (rEdge * i) / n;
    prof.push([r, back(Math.min(r, rClear))]);
  }
  return lathe(prof, segments, mat);
}

/** Sample a surface sag profile between r0 and r1, as [r, zGlobal]. */
export function sagProfile(s: Surface, r0: number, r1: number, n = 64, dz = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const r = r0 + ((r1 - r0) * i) / n;
    out.push([r, s.zAt(r, 0) + dz]);
  }
  return out;
}

/** Flat annulus lying in an OCS z-plane. */
export function annulusMesh(rIn: number, rOut: number, z: number, mat: THREE.Material, thickness = 0.01, seg = 128) {
  return lathe(
    [
      [rIn, z - thickness / 2],
      [rOut, z - thickness / 2],
      [rOut, z + thickness / 2],
      [rIn, z + thickness / 2],
      [rIn, z - thickness / 2],
    ],
    seg,
    mat,
  );
}

/** Tube (open cylinder with wall) between z0 and z1. */
export function tube(rIn: number, rOut: number, z0: number, z1: number, mat: THREE.Material, seg = 96) {
  return lathe(
    [
      [rIn, z0],
      [rOut, z0],
      [rOut, z1],
      [rIn, z1],
      [rIn, z0],
    ],
    seg,
    mat,
  );
}

/** Box from OCS centre + sizes along OCS x, y, z. */
export function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sz, sy), mat);
  m.position.copy(ocs(cx, cy, cz));
  return m;
}

/** Square/rect beam between two OCS points. */
export function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, h);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 12) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
