// Animated light rays: each traced path becomes a line strip whose vertices carry the
// optical path length travelled so far, so a shader can draw moving "photon pulses".
import * as THREE from 'three';
import type { TraceResult } from '../optics/trace';
import { ocsv } from './util';

const vert = /* glsl */ `
  attribute float aDist;
  attribute float aOk;
  attribute float aGate;
  attribute float aShX;
  varying float vDist;
  varying float vOk;
  varying float vGate;
  varying float vShX;
  #include <clipping_planes_pars_vertex>
  void main() {
    vDist = aDist;
    vOk = aOk;
    vGate = aGate;
    vShX = aShX;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHead;     // metres travelled by the leading pulse
  uniform float uPeriod;   // spacing between pulses (m)
  uniform float uTail;     // pulse tail length (m)
  uniform float uBase;     // brightness of the static path
  uniform float uIntensity;
  uniform float uContinuous;
  uniform float uEdgeA;   // shutter stack A covers x > uEdgeA
  uniform float uEdgeB;   // shutter stack B covers x < uEdgeB
  varying float vDist;
  varying float vOk;
  varying float vGate;
  varying float vShX;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    if (vGate > 0.5 && (vShX > uEdgeA || vShX < uEdgeB)) discard;
    float behind = uHead - vDist;            // how far behind the head this point is
    if (behind < 0.0 && uContinuous < 0.5) discard;
    float ph = uContinuous > 0.5 ? mod(behind, uPeriod) : behind;
    float pulse = exp(-ph / uTail);
    if (uContinuous < 0.5 && behind > uTail * 8.0) pulse = 0.0;
    float a = uBase + pulse * uIntensity;
    vec3 c = uColor * a;
    // blocked rays (hit a baffle or spider) fade toward red-grey
    c = mix(c * vec3(1.0, 0.45, 0.4), c, vOk);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class RayBundle {
  readonly object: THREE.LineSegments;
  readonly material: THREE.ShaderMaterial;
  maxDist = 0;
  meanOkLength = 0;

  constructor(clip: THREE.Plane[] = []) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uColor: { value: new THREE.Color(1, 0.3, 0.2) },
        uHead: { value: 0 },
        uPeriod: { value: 9 },
        uTail: { value: 0.7 },
        uBase: { value: 0.1 },
        uIntensity: { value: 3.0 },
        uContinuous: { value: 1 },
        uEdgeA: { value: 100 },
        uEdgeB: { value: -100 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      clipping: false,
      clippingPlanes: clip,
    });
    this.object = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
  }

  /** gateZ: OCS z of the shutter plane; vertices beyond it are gated by the shutter edges. */
  set(results: TraceResult[], gateZ?: number) {
    const pos: number[] = [];
    const dist: number[] = [];
    const ok: number[] = [];
    const gate: number[] = [];
    const shx: number[] = [];
    let maxD = 0;
    let sumOk = 0;
    let nOk = 0;
    for (const r of results) {
      let d = 0;
      // split the path at the shutter plane
      let pts = r.points;
      let xg = 0;
      let gIdx = Infinity;
      if (gateZ !== undefined) {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
          if (i > 0 && gIdx === Infinity && pts[i - 1][2] < gateZ && pts[i][2] >= gateZ) {
            const t = (gateZ - pts[i - 1][2]) / (pts[i][2] - pts[i - 1][2]);
            const q: [number, number, number] = [
              pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
              pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]),
              gateZ,
            ];
            xg = q[0];
            out.push(q);
            gIdx = out.length - 1;
          }
          out.push(pts[i]);
        }
        pts = out;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = ocsv(pts[i]);
        const b = ocsv(pts[i + 1]);
        const seg = a.distanceTo(b);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        dist.push(d, d + seg);
        ok.push(r.ok ? 1 : 0, r.ok ? 1 : 0);
        const gg = i >= gIdx ? 1 : 0;
        gate.push(gg, gg);
        shx.push(xg, xg);
        d += seg;
      }
      maxD = Math.max(maxD, d);
      if (r.ok) {
        sumOk += d;
        nOk++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute('aOk', new THREE.Float32BufferAttribute(ok, 1));
    g.setAttribute('aGate', new THREE.Float32BufferAttribute(gate, 1));
    g.setAttribute('aShX', new THREE.Float32BufferAttribute(shx, 1));
    this.object.geometry.dispose();
    this.object.geometry = g;
    this.maxDist = maxD;
    this.meanOkLength = nOk ? sumOk / nOk : 0;
  }
}

/** Approximate display colour for each band (i, z, y are infrared: false colour). */
export const BAND_COLOR: Record<string, THREE.Color> = {
  u: new THREE.Color('#9a6bff'),
  g: new THREE.Color('#2fd6a0'),
  r: new THREE.Color('#ff5a3a'),
  i: new THREE.Color('#ff2a6a'),
  z: new THREE.Color('#ff9a2a'),
  y: new THREE.Color('#ffd83a'),
};
