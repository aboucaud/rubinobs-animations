// "From the filter to the stars": one continuous shot chaining the animations of the other pages,
// for a video. Everything lives in one scene (the telescope, with LSSTCam at its true place in the
// OTA frame) and is driven by a single film time, so any frame can be rendered on demand:
//   film/            plays the film in a loop (preview)
//   film/?capture    renders nothing by itself; tools/film.cjs calls __film.render(t) frame by frame
import * as THREE from 'three';
import { Rubin } from '../optics/trace';
import { BAND_HEX } from '../scene/bands';
import { buildTelescope, ELEV_AXIS_ABOVE_M1 } from '../scene/telescope';
import { buildAzimuth, AXIS_HEIGHT } from '../scene/mount';
import { cutPlane, MAT } from '../scene/materials';
import { RayBuilder, RayBundle } from '../scene/rays';
import { ocs, ocsv } from '../scene/util';
import { buildHuman } from '../scene/human';
import { FESStep } from '../scene/fes';
import { createViewer, easeInOutCubic as ease, faceCutPlane, glowTexture } from './common';

const QUERY = new URLSearchParams(location.search);
const CAPTURE = QUERY.has('capture');
// ?notext: the film without its titles (the final video gets them composited afterwards, so a
// title change never needs a new 3D render); ?title=i: only title i, on a transparent page
const NOTEXT = QUERY.has('notext');
const TITLE = QUERY.get('title');
// ?endcard: the closing card alone (opaque), appended after the film by tools/film.cjs compose
const ENDCARD = QUERY.has('endcard');
/** closing card (storyboard D5): no official Rubin logo until the film is approved */
const END_CARD = {
  seconds: 3,
  title: 'Vera C. Rubin Observatory',
  subtitle: 'Interactive animations of the Simonyi Survey Telescope and the LSST Camera',
  url: 'aboucaud.github.io/rubinobs-animations',
};

// ---------------------------------------------------------------- scene (as on the telescope page)
const { renderer, scene, camera, controls, composer } = createViewer({
  fov: 40,
  near: 0.02,
  far: 2000,
  exposure: 0.9,
  background: 0x05070d,
  roomEnvironment: 0.55,
});
controls.enabled = false; // the film drives the camera
scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x1a1410, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(20, 30, 12);
scene.add(key);
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.5);
fill.position.set(-18, 8, -14);
scene.add(fill);
let stars: THREE.Points;
{
  // starfield (seeded: identical in every render of the film)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 4000;
  const p = new Float32Array(n * 3);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    p.set([800 * s * Math.cos(t), 800 * Math.abs(u) - 60, 800 * s * Math.sin(t)], i * 3);
    const w = 0.5 + rnd() * 0.5;
    c.set([w, w, w * (0.9 + rnd() * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }));
  scene.add(stars);
}

// Studio backdrop for the opening: a soft grey gradient sphere around the viewer (inside the
// starfield, outside the telescope), faded out during the descent to reveal the night sky.
const backdropMat = new THREE.ShaderMaterial({
  uniforms: { uTop: { value: new THREE.Color('#7b8088') }, uBottom: { value: new THREE.Color('#2c2f34') }, uOpacity: { value: 1 } },
  vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform vec3 uTop; uniform vec3 uBottom; uniform float uOpacity; varying vec3 vDir;
    void main(){ float h = smoothstep(-0.6, 0.8, vDir.y); gl_FragColor = vec4(mix(uBottom, uTop, h), uOpacity); }`,
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
});
const backdrop = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), backdropMat);
backdrop.renderOrder = -10;
scene.add(backdrop);

const tel = buildTelescope(Rubin.forBand('r'));
const cam = tel.cam;
const camGroup = tel.groups.camera;
const azGroup = new THREE.Group();
const elGroup = new THREE.Group();
elGroup.position.y = AXIS_HEIGHT;
tel.ota.position.y = -ELEV_AXIS_ABOVE_M1;
elGroup.add(tel.ota);
azGroup.add(elGroup);
scene.add(azGroup);
const azimuth = buildAzimuth();
const people = [buildHuman(new THREE.Vector3(3.3, 0, 5.4), new THREE.Vector3(0, 0, 0), 1.78), buildHuman(new THREE.Vector3(2.4, 0, 5.9), new THREE.Vector3(3.3, 0, 5.4), 1.65)];
azGroup.add(azimuth, ...people);
const pier = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 15.65, 96, 1, true), MAT.concrete);
pier.position.y = -0.6 - 15.65 / 2;
scene.add(pier);
const floor = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.3, 96), MAT.floor);
floor.position.y = -0.75;
scene.add(floor);

// ---------------------------------------------------------------- light: one star in the r band (the filter put in)
const START_BAND = 'g' as const; // in the beam at the start; the exchange puts BAND in
const BAND = 'r' as const;
const rays = new RayBundle();
tel.ota.add(rays.object);
let landing = { x: 0, y: 0 };
/** mean optical path length (m) from the start of the rays to each surface they hit (rays reaching the CCDs) */
const PATH_TO: Record<string, number> = {};
{
  const b = new RayBuilder();
  let x = 0;
  let y = 0;
  let n = 0;
  const sum: Record<string, number> = {};
  Rubin.forBand(BAND).forEachStarRay(0, 0, { rings: 7, perRing: 21, startZ: 12.5, rInner: 2.2, rOuter: 4.25, pattern: 'bundle' }, (r) => {
    b.add(r);
    if (!r.ok) return;
    let d = 0;
    r.hits.forEach((h, i) => {
      const a = r.points[i];
      const c = r.points[i + 1];
      d += Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      sum[h] = (sum[h] ?? 0) + d;
    });
    const p = r.points[r.points.length - 1];
    x += p[0];
    y += p[1];
    n++;
  });
  for (const k in sum) PATH_TO[k] = sum[k] / n;
  rays.setData(b.finish());
  landing = { x: x / n, y: y / n };
  rays.material.uniforms.uColor.value.set(BAND_HEX[BAND]);
}
const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(BAND_HEX[BAND]).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
spot.scale.setScalar(0.06);
spot.renderOrder = 11;
spot.position.copy(ocs(landing.x, landing.y, Rubin.forBand(BAND).surfaces.Detector.z0 - 0.002));
tel.ota.add(spot);
const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
star.scale.setScalar(2.2);
star.position.copy(ocsv([0, 0, 60]));
tel.ota.add(star);

// ---------------------------------------------------------------- storyboard
// Times in seconds of film. Scene 1: filter exchange (×10) · 2: the camera closes ·
// 3: exploded view and back · 4: the camera descends into the telescope · 5: starlight.
export const DURATION = 44;
const LIFT = 18; // the camera is shown 18 m above its place in the telescope (out of sight) until scene 4
const FES_START = 0.8;
const FES_SPEED = 10;
const CAM_CENTRE = 5.25; // OCS z of the middle of the camera: pivot when it turns upright

// titles, shown alone at the top of the frame (storyboard v2)
const CAPTIONS: [number, number, string][] = [
  [0, 9.2, 'The LSSTCam filter changer swaps the g filter for r (10× faster than reality)'],
  [9.2, 20, 'It is well integrated into the biggest CCD camera in the world'],
  [20, 28, 'LSSTCam is installed on the Simonyi telescope with its 8.4m main mirror'],
  [28, 34.5, 'Let’s follow light coming from a star, bouncing off the three mirrors'],
  [34.5, 44, '…then through the lenses and filter, down to the 3.2-gigapixel focal plane'],
];

// Plan 2: each part slides in from `dz` metres away along the optical axis (OCS z: + = towards the
// back of the camera) or, for the shutter, from `dx` metres away across it (OCS +x: the left of the
// image in the front view), in this order, from the inside out (storyboard v2).
const ASSEMBLY: { part: string; dz: number; dx?: number; t0: number; t1: number }[] = [
  { part: 'cryostat', dz: 1.3, t0: 9.4, t1: 11.0 },
  { part: 'shutter', dz: 0, dx: 1.7, t0: 10.4, t1: 12.0 },
  { part: 'l1l2', dz: -1.4, t0: 11.4, t1: 13.2 },
  { part: 'body', dz: 2.2, t0: 13.6, t1: 15.4 },
  { part: 'trunk', dz: 1.8, t0: 15.0, t1: 16.6 },
  { part: 'hexapod', dz: 1.8, t0: 16.0, t1: 17.6 },
];

// camera path: keyframes in the camera model's frame ('cam', it moves and turns with it), in a frame
// that follows the middle of the camera without turning ('mid'), or in the telescope frame ('ota')
type Key = { t: number; f: 'cam' | 'mid' | 'ota'; pos: [number, number, number]; tgt: [number, number, number] };
// opening: the camera lies horizontally, its axis along the width of the frame (L1 on the right,
// the standby socket on top), then turns upright about its middle before the descent
const OPENING: Key[] = [
  // plan 1: front view of the filter, as the default view of the filter-exchange page
  // (in the camera's own frame: ocs(1.55, 1.15, 2.05) looking at ocs(0, 0.08, 4.7)), slowly closer
  { t: 0, f: 'cam', pos: [1.78, 1.65, -1.31], tgt: [0, 4.7, -0.08] },
  { t: 9.4, f: 'cam', pos: [1.55, 2.05, -1.15], tgt: [0, 4.7, -0.08] },
  // plan 2a: same angle, dolly back along the same line of sight (×1.6) while the cryostat,
  // the shutter and the lenses come in
  { t: 13.2, f: 'cam', pos: [2.48, 0.46, -1.70], tgt: [0, 4.7, -0.08] },
  // plan 2b: turn round to the profile (the camera's axis along the width of the frame) for the
  // body, the utility trunk and the hexapod
  { t: 15.2, f: 'mid', pos: [6.2, 1.3, 0.3], tgt: [0, 0, 0.6] },
  { t: 17.6, f: 'mid', pos: [5.4, 1.2, -0.4], tgt: [0, 0, 0] },
  { t: 20.3, f: 'mid', pos: [4.8, 1.6, -3.4], tgt: [0, 0.2, 0] }, // upright again
];
const PATH: Key[] = [
  ...OPENING,
  // follow the descent from the front of the telescope, where the elevation rings are seen edge-on
  { t: 22.5, f: 'cam', pos: [3.0, 7.0, -9.0], tgt: [0, 5.0, 0] },
  { t: 27.5, f: 'ota', pos: [4.0, 12.0, -24.0], tgt: [0, 5.0, 0] },
  // plan 5: wide front view of the whole telescope while the structure fades out
  { t: 29.5, f: 'ota', pos: [1.8, 6.6, -25.0], tgt: [0, 4.5, 0] },
  { t: 31.0, f: 'ota', pos: [1.8, 6.6, -25.0], tgt: [0, 4.5, 0] },
  // once the structure has faded: gentle zoom on the mirrors, M1 and M2 kept whole in the frame
  { t: 34.3, f: 'ota', pos: [1.1, 5.6, -15.5], tgt: [0, 3.9, 0] },
  // plan 6: into the open tube, onto the axis just above M3, then up the beam with the rays
  { t: 36.5, f: 'ota', pos: [1.0, 1.0, -2.2], tgt: [0, 3.2, 0] },
  { t: 38.5, f: 'ota', pos: [0.6, 2.6, -1.1], tgt: [0, 4.0, 0] },
  // plan 7: up to the focal plane, then hold while the light lands
  { t: 42, f: 'ota', pos: [0.7, 3.95, -0.35], tgt: [0, 4.43, 0] },
  { t: 44, f: 'ota', pos: [0.62, 3.96, -0.31], tgt: [0, 4.43, 0] },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)));

// Light (storyboard v2): constant speed through the telescope, so the three mirror reflections read
// clearly in the wide view (M3 reached at LIGHT.m3), then braked hard just after M3 and slowed
// again before the lenses, so the light can be followed into the camera: it enters L1 at LIGHT.l1
// and lands on the CCDs at LIGHT.ccd. The speeds after M3 are solved for those two times.
const LIGHT = { start: 29.5, m3: 33.9, brake: [34.0, 34.6], l1: 38.5, ease: [38.0, 39.0], ccd: 42.0 };
const V_FAST = PATH_TO.M3 / (LIGHT.m3 - LIGHT.start);
const sstep = (t: number, a: number, b: number) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};
function headWith(t: number, vMid: number, vSlow: number) {
  let h = 0;
  const dt = 0.004;
  for (let x = LIGHT.start; x < t; x += dt) {
    const v = V_FAST + (vMid - V_FAST) * sstep(x, LIGHT.brake[0], LIGHT.brake[1]) + (vSlow - vMid) * sstep(x, LIGHT.ease[0], LIGHT.ease[1]);
    h += v * Math.min(dt, t - x);
  }
  return h;
}
const solve = (f: (v: number) => number, target: number) => {
  let lo = 0.01;
  let hi = 5;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (f(m) < target) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};
let V_MID = 0.6;
let V_SLOW = 0.3;
for (let i = 0; i < 6; i++) {
  V_MID = solve((v) => headWith(LIGHT.l1, v, V_SLOW), PATH_TO.L1_entrance);
  V_SLOW = solve((v) => headWith(LIGHT.ccd, V_MID, v), PATH_TO.Detector);
}
function lightHead(t: number) {
  return headWith(t, V_MID, V_SLOW);
}

// ---------------------------------------------------------------- the filter exchange, replayed deterministically
let steps: FESStep[] = [];
let stepStart: number[] = [];
let stepsDone = 0;
let fesClock = -1;
function resetFES() {
  cam.state.shutterA = 1;
  cam.state.shutterB = 0;
  cam.instantBeam(START_BAND);
  steps = cam.fes.stepsTo(BAND);
  stepStart = [];
  let s = 0;
  for (const st of steps) {
    stepStart.push(s);
    s += st.real;
  }
  stepsDone = 0;
  fesClock = 0;
}
/** advance the exchange to `real` seconds of the real sequence (forward only; rewinding resets it) */
function playFES(real: number) {
  if (real < fesClock) resetFES();
  fesClock = real;
  for (let i = stepsDone; i < steps.length; i++) {
    const st = steps[i];
    const t = (real - stepStart[i]) / st.real;
    if (t <= 0) break;
    st.run(Math.min(1, t));
    if (t < 1) break;
    st.done?.();
    stepsDone = i + 1;
  }
}

// ---------------------------------------------------------------- film-only material states
// Fades and the cut during the descent need per-mesh control of opacity and clipping. The film
// gives the meshes concerned their own copies of their materials, so the shared materials (and the
// other pages) are untouched. Only merged/whole meshes are re-materialed, never baked originals.
type Look = { mesh: THREE.Mesh; mat: THREE.Material & { color?: THREE.Color; opacity: number }; opacity: number; color?: THREE.Color; clip: THREE.Plane[] | null; transparent: boolean; depthWrite: boolean };
function ownLooks(root: THREE.Object3D): Look[] {
  const out: Look[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const mat = m.material.clone() as Look['mat'];
    // Material.clone() gives the copy its own copies of the clipping planes, which would never
    // follow the live cut plane (L1–L2 stayed whole in draft 4): keep the shared planes
    mat.clippingPlanes = m.material.clippingPlanes;
    m.material = mat;
    out.push({ mesh: m, mat, opacity: mat.opacity, color: mat.color?.clone(), clip: mat.clippingPlanes, transparent: mat.transparent, depthWrite: mat.depthWrite });
  });
  return out;
}
const WHITE = new THREE.Color(1, 1, 1);
/** alpha 1 = as built, 0 = gone. Multiply-blended glass fades by turning white. */
function fade(looks: Look[], alpha: number) {
  for (const l of looks) {
    const on = alpha < 0.999;
    const transparent = on || l.transparent;
    if (l.mat.transparent !== transparent) {
      l.mat.transparent = transparent;
      l.mat.needsUpdate = true;
    }
    l.mat.depthWrite = on ? false : l.depthWrite;
    l.mat.opacity = l.opacity * (on ? alpha : 1);
    if (l.color && l.mat.color && l.mat.blending === THREE.MultiplyBlending) l.mat.color.lerpColors(l.color, WHITE, on ? 1 - alpha : 0);
  }
}
/** make every mesh of `looks` cut by the cut plane (on), or restore its own clipping (off) */
function cuttable(looks: Look[], on: boolean) {
  for (const l of looks) {
    const want = on ? [cutPlane] : l.clip;
    if (l.mat.clippingPlanes !== want) {
      l.mat.clippingPlanes = want;
      l.mat.needsUpdate = true;
    }
  }
}
// everything but the mirrors and the camera: what fades out when the light leaves the star
const STRUCTURE: THREE.Object3D[] = [tel.groups.structure, azimuth, ...people, pier, floor];
const structureLooks = STRUCTURE.flatMap(ownLooks);
const glassLooks = [...ownLooks(cam.parts.l1l2), ...ownLooks(cam.parts.filters)];

/** monotone cubic through (x_i, y_i) (Fritsch–Carlson): smooth, never overshoots */
function monotone(xs: number[], ys: number[]) {
  const n = xs.length;
  const d = xs.slice(0, -1).map((_, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const u = (x - xs[i]) / h;
    return (2 * u ** 3 - 3 * u ** 2 + 1) * ys[i] + (u ** 3 - 2 * u ** 2 + u) * h * m[i] + (-2 * u ** 3 + 3 * u ** 2) * ys[i + 1] + (u ** 3 - u ** 2) * h * m[i + 1];
  };
}
// film time → position along the camera path: smooth through the keyframes (no jolts), and still
// where two consecutive keyframes are the same (holds)
const pathParam = monotone(
  PATH.map((k) => k.t),
  PATH.map((_, i) => i),
);

// ---------------------------------------------------------------- one frame of the film
const pW: THREE.Vector3[] = PATH.map(() => new THREE.Vector3());
const qW: THREE.Vector3[] = PATH.map(() => new THREE.Vector3());
const pCurve = new THREE.CatmullRomCurve3(pW, false, 'centripetal');
const qCurve = new THREE.CatmullRomCurve3(qW, false, 'centripetal');
const tmp = new THREE.Vector3();
const caption = document.getElementById('caption')!;
const pivot = new THREE.Vector3();
const mid = new THREE.Object3D(); // follows the middle of the camera, without turning
tel.ota.add(mid);
const clockEl = document.getElementById('clock')!;
let captionKey = '';

function render(t: number) {
  // --- mechanisms
  playFES(Math.max(0, (t - FES_START) * FES_SPEED));
  cam.state.explode = 0;
  cam.state.shutterA = 1 - ramp(t, 28.5, 29.3); // the shutter opens for the starlight
  cam.update();
  // scene 1 shows the filter changer alone; in scene 2 the other parts slide in one by one
  // (after cam.update(), which would show the body again: see CLAUDE.md)
  const p = cam.parts;
  for (const a of ASSEMBLY) {
    p[a.part].visible = t >= a.t0;
    const away = 1 - ramp(t, a.t0, a.t1);
    p[a.part].position.copy(ocs((a.dx ?? 0) * away, 0, a.dz * away));
  }
  // lenses and filter stay while the light crosses them, then go just before it lands (D2, proposal)
  const glass = 1 - ramp(t, 41.5, 42.0);
  fade(glassLooks, glass);
  p.l1l2.visible &&= glass > 0.01;
  p.filters.visible = glass > 0.01;
  // the camera lies horizontally (standby socket on top) until it turns upright before the descent
  const lift = LIFT * (1 - ramp(t, 20.6, 27));
  camGroup.rotation.x = (Math.PI / 2) * (1 - ramp(t, 18.2, 20.3));
  pivot.set(0, CAM_CENTRE, 0);
  camGroup.position.set(0, lift, 0).add(pivot).sub(pivot.applyEuler(camGroup.rotation));
  mid.position.set(0, lift + CAM_CENTRE, 0);

  // --- backdrop: studio grey for the camera, night sky for the telescope
  const sky = ramp(t, 21, 24.5);
  backdropMat.uniforms.uOpacity.value = 1 - sky;
  backdrop.visible = sky < 1;
  stars.visible = sky > 0;

  // --- cutaway: through the telescope for the starlight
  // plan 4: the half of the telescope facing us is wiped away while the camera goes in (the cut
  // plane sweeps in from 12 m in front of the axis), then wiped back: the installed telescope is
  // whole. Plan 6: once the light has left M3, the camera is cut open the same way (from 1.2 m).
  const descentCut = t >= 22.8 && t < 27.3;
  cuttable(structureLooks, descentCut);
  const wipe = descentCut ? 12 * (1 - ramp(t, 22.8, 24.0)) + 12 * ramp(t, 26.0, 27.3) : 1.2 * (1 - ramp(t, 35, 36));
  faceCutPlane(cutPlane, tel.ota, camera, descentCut || t >= 35, wipe);
  // plan 5: as soon as the light leaves the star, the structure fades out: only the mirrors (and
  // the camera) remain — the key effect of the shot
  const structure = 1 - ramp(t, 29.5, 31.0);
  fade(structureLooks, structure);
  for (const o of STRUCTURE) o.visible = structure > 0.01;

  // --- light
  const light = t >= LIGHT.start;
  rays.object.visible = star.visible = light;
  const head = lightHead(t);
  const arrived = head > rays.meanOkLength + 0.3;
  const u = rays.material.uniforms;
  u.uContinuous.value = arrived ? 1 : 0;
  u.uHead.value = head;
  u.uBase.value = arrived ? 0.07 * ramp(t, 36, 37) : 0;
  spot.material.opacity = light ? clamp01((head - rays.meanOkLength) / 0.3) : 0;
  star.material.opacity = ramp(t, LIGHT.start - 1, LIGHT.start);

  // --- camera path
  tel.ota.updateMatrixWorld(true);
  PATH.forEach((k, i) => {
    const frame = k.f === 'cam' ? camGroup : k.f === 'mid' ? mid : tel.ota;
    frame.localToWorld(pW[i].set(...k.pos));
    frame.localToWorld(qW[i].set(...k.tgt));
  });
  const s = pathParam(t) / (PATH.length - 1);
  camera.position.copy(pCurve.getPoint(s, tmp));
  camera.lookAt(qCurve.getPoint(s, tmp));
  backdrop.position.copy(camera.position);
  // close-ups of a 1.6 m camera need a near plane well under a metre
  camera.near = 0.02;
  camera.updateProjectionMatrix();

  // --- caption
  const c = CAPTIONS.find(([a, b]) => t >= a && t < b);
  const k = c ? c[2] : '';
  if (k !== captionKey) {
    captionKey = k;
    caption.textContent = c ? c[2] : '';
  }
  caption.style.opacity = c && !NOTEXT ? String(Math.min(clamp01((t - c[0]) / 0.5), clamp01((c[1] - t) / 0.5))) : '0';
  clockEl.textContent = CAPTURE ? '' : `${t.toFixed(1)} s`;

  composer.render();
}

resetFES();
if (ENDCARD) {
  (document.getElementById('c') as HTMLCanvasElement).style.display = 'none';
  const card = document.getElementById('endcard')!;
  card.querySelector('h1')!.textContent = END_CARD.title;
  card.querySelector('p')!.textContent = END_CARD.subtitle;
  card.querySelector('b')!.textContent = END_CARD.url;
  card.style.display = 'flex';
} else if (TITLE !== null) {
  // one title alone on a transparent page, for tools/film.cjs to composite over the clean video
  for (const el of [document.documentElement, document.body]) el.style.background = 'transparent';
  (document.getElementById('c') as HTMLCanvasElement).style.display = 'none';
  caption.textContent = CAPTIONS[+TITLE]?.[2] ?? '';
  caption.style.transition = 'none';
  caption.style.opacity = '1';
} else if (CAPTURE) {
  render(0);
} else {
  const t0 = performance.now();
  const loop = () => {
    render(((performance.now() - t0) / 1000) % DURATION);
    requestAnimationFrame(loop);
  };
  loop();
}
(window as any).__film = { render, duration: DURATION, captions: CAPTIONS, endCard: END_CARD, renderer, composer, scene, camera, tel, PATH_TO, lightHead, ready: true };
