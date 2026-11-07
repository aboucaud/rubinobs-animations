// Load-time optimisation: bake the many small static meshes of a model into one mesh per
// material. A procedurally built telescope has thousands of tiny parts (actuators, bolts, CCDs,
// ribs, lightening holes...). Rendering each as its own Mesh costs one draw call and one set of GPU
// buffers per part; merging them keeps the image identical and cuts draw calls by an order of
// magnitude.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge the static meshes below `root` into one mesh per (material, render order, geometry layout).
 *
 * A mesh is merged when every object between it and `root` (itself included) is not in `keep`.
 * Merged meshes are re-parented to `root` with their transform relative to `root` baked in, so
 * `root` must be rigid with respect to them: put anything that moves, changes material or is
 * toggled on its own in `keep`. Transparent and instanced meshes are always left alone (draw order
 * of transparent surfaces, per-instance data).
 */
export function mergeStatic(root: THREE.Object3D, keep: Iterable<THREE.Object3D | undefined> = []) {
  const skip = new Set<THREE.Object3D>();
  for (const k of keep) if (k) skip.add(k);
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const buckets = new Map<string, { material: THREE.Material; renderOrder: number; meshes: THREE.Mesh[] }>();
  const visit = (o: THREE.Object3D) => {
    if (skip.has(o) || !o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && !m.material.transparent) {
      const g = m.geometry;
      const layout = Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : '|n');
      const key = `${m.material.uuid}|${m.renderOrder}|${layout}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material: m.material, renderOrder: m.renderOrder, meshes: [] }));
      b.meshes.push(m);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);

  let removed = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const geos = b.meshes.map((m) => {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
      g.clearGroups();
      // a mirroring transform flips the triangle winding: restore it so front faces stay front
      if (m.matrixWorld.determinant() < 0) flipWinding(g);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.renderOrder = b.renderOrder;
    mesh.name = 'merged';
    for (const m of b.meshes) m.removeFromParent();
    root.add(mesh);
    removed += b.meshes.length - 1;
  }
  return removed;
}

function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    g.index.needsUpdate = true;
    return;
  }
  for (const attr of Object.values(g.attributes)) {
    const s = attr.itemSize;
    const a = attr.array;
    for (let v = 0; v < attr.count; v += 3)
      for (let k = 0; k < s; k++) {
        const t = a[(v + 1) * s + k];
        a[(v + 1) * s + k] = a[(v + 2) * s + k];
        a[(v + 2) * s + k] = t;
      }
  }
}
