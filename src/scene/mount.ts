// Azimuth part of the Telescope Mount Assembly (schematic, from on-site photos): a low teal
// azimuth platform with two cradles in which the elevation rings ride on hydrostatic pads,
// flanked by light-grey sloped floor covers.
import * as THREE from 'three';
import { MAT } from './materials';

export const AXIS_HEIGHT = 7.0; // elevation axis above the azimuth floor (APPROX)
const R_RING = 6.25;

export function buildAzimuth(): THREE.Group {
  const g = new THREE.Group();
  // own material: the telescope page fades it when seen from below
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.4, 0.6, 96), MAT.paint.clone());
  plat.name = 'platform';
  plat.position.y = -0.3;
  g.add(plat);
  const cover = new THREE.MeshStandardMaterial({ color: 0xb9bcb8, metalness: 0.3, roughness: 0.6 });
  const gap = AXIS_HEIGHT - R_RING; // space between platform and ring bottom
  for (const sg of [-1, 1]) {
    // cradle: block whose top follows the ring curvature over ±25°
    const shape = new THREE.Shape();
    const span = 0.45;
    shape.moveTo(-R_RING * Math.sin(span) - 0.4, 0);
    shape.lineTo(R_RING * Math.sin(span) + 0.4, 0);
    for (let i = 0; i <= 24; i++) {
      const a = span - (2 * span * i) / 24;
      shape.lineTo(R_RING * Math.sin(a), AXIS_HEIGHT - (R_RING + 0.05) * Math.cos(a));
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: false, curveSegments: 24 });
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, MAT.paint);
    m.position.x = sg * 6.1 - 0.55;
    g.add(m);
    // sloped light-grey floor covers outside the rings
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 7), cover);
    w.position.set(sg * 7.4, gap * 0.6, 0);
    w.rotation.z = sg * 0.35;
    g.add(w);
  }
  return g;
}
