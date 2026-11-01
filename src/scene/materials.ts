import * as THREE from 'three';

/** Shared cutaway plane (world space). Updated every frame to face the viewer. */
export const cutPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6);
const cut = [cutPlane];

function std(params: THREE.MeshStandardMaterialParameters, cuttable = false) {
  const m = new THREE.MeshStandardMaterial(params);
  if (cuttable) {
    m.clippingPlanes = cut;
    m.side = THREE.DoubleSide;
  }
  return m;
}

export const MAT = {
  // Protected-silver coated mirror faces (M1, M2, M3)
  silver: new THREE.MeshPhysicalMaterial({
    color: 0xf4f4f2,
    metalness: 1,
    roughness: 0.035,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  }),
  // Ohara E6 borosilicate blank (sides/back of the M1M3 monolith)
  borosilicate: new THREE.MeshPhysicalMaterial({
    color: 0xb9b4a6,
    metalness: 0,
    roughness: 0.25,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    clippingPlanes: cut,
    side: THREE.DoubleSide,
  }),
  // Corning ULE (M2 back)
  ule: new THREE.MeshPhysicalMaterial({ color: 0xd8d8d0, roughness: 0.3, metalness: 0, side: THREE.DoubleSide }),
  // Fused-silica lenses & filter
  silica: new THREE.MeshPhysicalMaterial({
    color: 0xf2f8ff,
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    ior: 1.458,
    thickness: 0.06,
    transparent: true,
    opacity: 1,
    envMapIntensity: 0.25,
    specularIntensity: 0.25,
    side: THREE.DoubleSide,
    clippingPlanes: cut,
  }),
  filterCoat: new THREE.MeshPhysicalMaterial({
    color: 0xff7a5c,
    metalness: 0.2,
    roughness: 0.05,
    transmission: 0.75,
    ior: 1.458,
    thickness: 0.02,
    iridescence: 1,
    iridescenceIOR: 1.8,
    transparent: true,
    side: THREE.DoubleSide,
  }),
  // Painted TMA steel
  paint: std({ color: 0xbfc3c7, metalness: 0.15, roughness: 0.55 }),
  paintCut: std({ color: 0xbfc3c7, metalness: 0.15, roughness: 0.55 }, true),
  paintBlue: std({ color: 0x2f5d8a, metalness: 0.2, roughness: 0.5 }),
  blueCut: std({ color: 0x2f5d8a, metalness: 0.2, roughness: 0.5 }, true),
  // Black anodised baffles
  black: std({ color: 0x0d0e10, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide }),
  blackCut: std({ color: 0x0d0e10, metalness: 0.3, roughness: 0.7 }, true),
  // Camera aluminium skin
  alu: std({ color: 0xc9ccd0, metalness: 0.6, roughness: 0.42 }, true),
  aluDark: std({ color: 0x4a4e55, metalness: 0.7, roughness: 0.4 }, true),
  steel: std({ color: 0x8a9096, metalness: 0.8, roughness: 0.45 }, true),
  steelSolid: std({ color: 0x8a9096, metalness: 0.8, roughness: 0.45 }),
  copper: std({ color: 0xb87333, metalness: 1, roughness: 0.35 }, true),
  sic: std({ color: 0x2b2b2e, metalness: 0.2, roughness: 0.6 }, true),
  // CCD silicon: e2v (deep violet AR coat) vs ITL (bronze/olive AR coat)
  e2v: new THREE.MeshPhysicalMaterial({ color: 0x3a2a6b, metalness: 0.6, roughness: 0.15, iridescence: 0.6, clearcoat: 0.4, envMapIntensity: 0.4 }),
  itl: new THREE.MeshPhysicalMaterial({ color: 0x5b4a2a, metalness: 0.6, roughness: 0.15, iridescence: 0.5, clearcoat: 0.4, envMapIntensity: 0.4 }),
  wfs: new THREE.MeshPhysicalMaterial({ color: 0x2a5b4f, metalness: 0.6, roughness: 0.15, clearcoat: 0.4, envMapIntensity: 0.4 }),
  fee: std({ color: 0x1f5a3a, metalness: 0.3, roughness: 0.5 }, true),
  raftBase: std({ color: 0x6d6f73, metalness: 0.7, roughness: 0.4 }, true),
  concrete: std({ color: 0x8d8f91, metalness: 0, roughness: 0.95 }),
  floor: std({ color: 0x3b3e43, metalness: 0.2, roughness: 0.8 }),
};
