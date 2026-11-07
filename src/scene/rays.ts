// Animated light rays: each traced path becomes a line strip whose vertices carry the
// optical path length travelled so far, so a shader can draw moving "photon pulses".
//
// Memory: traced paths are streamed into compact typed arrays (RayData: shared vertices + index
// pairs) as they are traced, so the raw TraceResult objects never pile up. Baked bundles are kept in a byte-bounded LRU cache
// (TraceCache), so moving a slider back and forth re-uses earlier traces, and the GPU buffers of a
// RayBundle are re-used across updates instead of being re-allocated on every change.
import * as THREE from 'three';
import type { TraceResult } from '../optics/trace';

const vert = /* glsl */ `
  attribute vec3 aData;    // x: path length so far, y: flags (1: reached the detector, 2: gated by the shutter), z: x at the shutter plane
  varying vec3 vData;
  #include <clipping_planes_pars_vertex>
  void main() {
    vData = aData;
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
  varying vec3 vData;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    float ok = mod(vData.y + 0.5, 2.0) > 1.0 ? 1.0 : 0.0;
    bool gated = vData.y > 1.5;
    if (gated && (vData.z > uEdgeA || vData.z < uEdgeB)) discard;
    float behind = uHead - vData.x;          // how far behind the head this point is
    if (behind < 0.0 && uContinuous < 0.5) discard;
    float ph = uContinuous > 0.5 ? mod(behind, uPeriod) : behind;
    float pulse = exp(-ph / uTail);
    if (uContinuous < 0.5 && behind > uTail * 8.0) pulse = 0.0;
    float a = uBase + pulse * uIntensity;
    vec3 c = uColor * a;
    // blocked rays (hit a baffle or spider) fade toward red-grey
    c = mix(c * vec3(1.0, 0.45, 0.4), c, ok);
    gl_FragColor = vec4(c, 1.0);
  }
`;

/**
 * A traced bundle baked for display, in the local (three.js) frame. Each ray is a polyline:
 * its vertices are stored once and segments are index pairs, so a bundle costs 24 bytes per
 * vertex + 4–8 bytes per segment.
 */
export interface RayData {
  position: Float32Array; // xyz per vertex
  data: Float32Array; // aData per vertex
  index: Uint16Array | Uint32Array; // two vertices per segment
  vertices: number;
  indices: number;
  maxDist: number;
  meanOkLength: number;
}

/** Streams traced rays into growable typed arrays (no per-ray objects are kept). */
export class RayBuilder {
  private pos = new Float32Array(3 * 1024);
  private dat = new Float32Array(3 * 1024);
  private idx = new Uint32Array(2 * 1024);
  private nv = 0;
  private ni = 0;
  private maxD = 0;
  private sumOk = 0;
  private nOk = 0;

  /** gateZ: OCS z of the shutter plane; the path beyond it is gated by the shutter edges. */
  constructor(private readonly gateZ?: number) {}

  private vertex(x: number, y: number, z: number, d: number, flags: number, xg: number) {
    if ((this.nv + 1) * 3 > this.pos.length) {
      this.pos = grow(this.pos);
      this.dat = grow(this.dat);
    }
    let o = this.nv * 3;
    // OCS (x, y, z) → local (x, z, −y), see util.ts
    this.pos[o] = x;
    this.pos[o + 1] = z;
    this.pos[o + 2] = -y;
    this.dat[o++] = d;
    this.dat[o++] = flags;
    this.dat[o] = xg;
    return this.nv++;
  }

  private segment(a: number, b: number) {
    if (this.ni + 2 > this.idx.length) this.idx = grow(this.idx);
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
  }

  add(r: TraceResult) {
    const pts = r.points;
    if (pts.length < 2) return;
    const ok = r.ok ? 1 : 0;
    const gz = this.gateZ;
    let d = 0;
    let xg = 0;
    let gated = false;
    let prev = this.vertex(pts[0][0], pts[0][1], pts[0][2], 0, ok, 0);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (gz !== undefined && !gated && a[2] < gz && b[2] >= gz) {
        // split at the shutter plane: the crossing point gets an ungated and a gated copy
        const t = (gz - a[2]) / (b[2] - a[2]);
        const qx = a[0] + t * (b[0] - a[0]);
        const qy = a[1] + t * (b[1] - a[1]);
        d += Math.hypot(qx - a[0], qy - a[1], gz - a[2]);
        this.segment(prev, this.vertex(qx, qy, gz, d, ok, 0));
        gated = true;
        xg = qx;
        prev = this.vertex(qx, qy, gz, d, ok + 2, xg);
        d += Math.hypot(b[0] - qx, b[1] - qy, b[2] - gz);
      } else d += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const v = this.vertex(b[0], b[1], b[2], d, ok + (gated ? 2 : 0), xg);
      this.segment(prev, v);
      prev = v;
    }
    this.maxD = Math.max(this.maxD, d);
    if (r.ok) {
      this.sumOk += d;
      this.nOk++;
    }
  }

  /** Exact-size copies of the data (cached bundles hold no slack). */
  finish(): RayData {
    const index = this.nv <= 65535 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    return {
      position: this.pos.slice(0, this.nv * 3),
      data: this.dat.slice(0, this.nv * 3),
      index,
      vertices: this.nv,
      indices: this.ni,
      maxDist: this.maxD,
      meanOkLength: this.nOk ? this.sumOk / this.nOk : 0,
    };
  }
}

function grow<T extends Float32Array | Uint32Array>(a: T): T {
  const b = new (a.constructor as { new (n: number): T })(a.length * 2);
  b.set(a);
  return b;
}

/** Bake traced rays into a RayData. */
export function bakeRays(results: TraceResult[], gateZ?: number): RayData {
  const b = new RayBuilder(gateZ);
  for (const r of results) b.add(r);
  return b.finish();
}

export class RayBundle {
  readonly object: THREE.LineSegments;
  readonly material: THREE.ShaderMaterial;
  maxDist = 0;
  meanOkLength = 0;
  private vCap = 0;
  private iCap = 0;
  private wide = false;

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

  /** Trace results → display (convenience for one-off bundles). */
  set(results: TraceResult[], gateZ?: number) {
    this.setData(bakeRays(results, gateZ));
  }

  /** Show a baked bundle. GPU buffers are re-used while they are large enough. */
  setData(d: RayData) {
    let g = this.object.geometry;
    const wide = d.index instanceof Uint32Array;
    if (d.vertices > this.vCap || d.indices > this.iCap || (wide && !this.wide)) {
      // grow with some headroom so that small increases (ray density +1) do not re-allocate
      this.vCap = Math.max(this.vCap, Math.ceil(d.vertices * 1.25));
      this.iCap = Math.max(this.iCap, Math.ceil(d.indices * 1.25));
      this.wide = wide || this.vCap > 65535;
      g.dispose();
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.vCap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aData', new THREE.BufferAttribute(new Float32Array(this.vCap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(new THREE.BufferAttribute(this.wide ? new Uint32Array(this.iCap) : new Uint16Array(this.iCap), 1).setUsage(THREE.DynamicDrawUsage));
      this.object.geometry = g;
    }
    const upload = (attr: THREE.BufferAttribute, src: ArrayLike<number>, n: number) => {
      (attr.array as Float32Array | Uint16Array | Uint32Array).set(src);
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n);
      attr.needsUpdate = true;
    };
    upload(g.getAttribute('position') as THREE.BufferAttribute, d.position, d.vertices * 3);
    upload(g.getAttribute('aData') as THREE.BufferAttribute, d.data, d.vertices * 3);
    upload(g.index!, d.index, d.indices);
    g.setDrawRange(0, d.indices);
    this.maxDist = d.maxDist;
    this.meanOkLength = d.meanOkLength;
  }
}

/**
 * Least-recently-used cache of baked ray bundles (or anything holding them), bounded by an
 * approximate byte budget so that exploring many configurations cannot grow memory without limit.
 */
export class TraceCache<T> {
  private map = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;

  constructor(private readonly budget = 8 * 1024 * 1024, private readonly sizeOf: (v: T) => number = () => 1024) {}

  get(key: string, make: () => T): T {
    const hit = this.map.get(key);
    if (hit) {
      // refresh: Map keeps insertion order, the first entry is the least recently used
      this.map.delete(key);
      this.map.set(key, hit);
      return hit.value;
    }
    const value = make();
    const bytes = this.sizeOf(value);
    this.map.set(key, { value, bytes });
    this.bytes += bytes;
    for (const [k, e] of this.map) {
      if (this.bytes <= this.budget || this.map.size <= 1) break;
      this.map.delete(k);
      this.bytes -= e.bytes;
    }
    return value;
  }

  get size() {
    return this.map.size;
  }
  get byteSize() {
    return this.bytes;
  }
}

/** Bytes held by a baked bundle. */
export const rayBytes = (d: RayData) => d.position.byteLength + d.data.byteLength + d.index.byteLength;
