// Human figure for scale: a plain standing adult, built as one merged mesh (one draw call).
// Proportions follow the usual ~7.5-head canon; the figure faces +z, feet at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const HUMAN_MAT = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.85, metalness: 0 });

/** Capsule of radius r between two points (x, y) of the figure's frontal plane. */
function limb(x0: number, y0: number, x1: number, y1: number, r: number) {
  const a = new THREE.Vector3(x0, y0, 0);
  const b = new THREE.Vector3(x1, y1, 0);
  const g = new THREE.CapsuleGeometry(r, a.distanceTo(b), 4, 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  const m = a.add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

function figureGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(0.1, 0.07, 0.26).translate(s * 0.1, 0.035, 0.05)); // foot
    parts.push(limb(s * 0.1, 0.1, s * 0.1, 0.5, 0.06)); // shin
    parts.push(limb(s * 0.1, 0.5, s * 0.1, 0.9, 0.08)); // thigh
    parts.push(limb(s * 0.2, 1.4, s * 0.25, 1.12, 0.048)); // upper arm
    parts.push(limb(s * 0.25, 1.12, s * 0.26, 0.86, 0.04)); // forearm
    parts.push(new THREE.SphereGeometry(0.045, 10, 8).scale(0.8, 1.2, 0.6).translate(s * 0.265, 0.8, 0)); // hand
  }
  parts.push(new THREE.SphereGeometry(0.17, 16, 10).scale(1, 0.55, 0.65).translate(0, 0.95, 0)); // pelvis
  parts.push(new THREE.CylinderGeometry(0.2, 0.155, 0.5, 18).scale(1, 1, 0.6).translate(0, 1.2, 0)); // torso
  parts.push(new THREE.SphereGeometry(0.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.6).translate(0, 1.45, 0)); // shoulders
  parts.push(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 10).translate(0, 1.52, 0)); // neck
  parts.push(new THREE.SphereGeometry(0.1, 18, 14).scale(0.85, 1.12, 0.95).translate(0, 1.638, 0)); // head, top at 1.75 m
  for (const g of parts) g.deleteAttribute('uv');
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

let shared: THREE.BufferGeometry | undefined;

/**
 * A standing person `height` metres tall (1.75 m reference figure) at `pos`, turned to face `lookAt`.
 * `material` lets a page clip the figure with its cutaway planes.
 */
export function buildHuman(pos: THREE.Vector3, lookAt: THREE.Vector3, height = 1.75, material: THREE.Material = HUMAN_MAT) {
  const m = new THREE.Mesh((shared ??= figureGeometry()), material);
  m.scale.setScalar(height / 1.75);
  m.position.copy(pos);
  m.rotation.y = Math.atan2(lookAt.x - pos.x, lookAt.z - pos.z);
  return m;
}
