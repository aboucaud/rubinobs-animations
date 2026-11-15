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

const CAPTURE = new URLSearchParams(location.search).has('capture');

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
azGroup.add(buildAzimuth());
azGroup.add(buildHuman(new THREE.Vector3(3.3, 0, 5.4), new THREE.Vector3(0, 0, 0), 1.78));
azGroup.add(buildHuman(new THREE.Vector3(2.4, 0, 5.9), new THREE.Vector3(3.3, 0, 5.4), 1.65));
const pier = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 15.65, 96, 1, true), MAT.concrete);
pier.position.y = -0.6 - 15.65 / 2;
scene.add(pier);
const floor = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.3, 96), MAT.floor);
floor.position.y = -0.75;
scene.add(floor);

// ---------------------------------------------------------------- light: one star in the g band (the filter put in)
const BAND = 'g' as const;
const rays = new RayBundle();
tel.ota.add(rays.object);
let landing = { x: 0, y: 0 };
{
  const b = new RayBuilder();
  let x = 0;
  let y = 0;
  let n = 0;
  Rubin.forBand(BAND).forEachStarRay(0, 0, { rings: 7, perRing: 21, startZ: 12.5, rInner: 2.2, rOuter: 4.25, pattern: 'bundle' }, (r) => {
    b.add(r);
    if (!r.ok) return;
    const p = r.points[r.points.length - 1];
    x += p[0];
    y += p[1];
    n++;
  });
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
export const DURATION = 42;
const LIFT = 18; // the camera is shown 18 m above its place in the telescope (out of sight) until scene 4
const FES_START = 0.8;
const FES_SPEED = 10;
const W = { wavefront: 29.5 };
const CAM_CENTRE = 5.25; // OCS z of the middle of the camera: pivot when it turns upright

const CAPTIONS: [number, number, string, string][] = [
  [0, 9.2, 'The filter changer of LSSTCam swaps the r filter for g', 'built by IN2P3/CNRS · 82 s in reality, shown 10× faster'],
  [9.2, 20, 'The camera is built around it', 'cryostat and focal plane · shutter · lenses L1 and L2 · body · electronics and hexapod'],
  [20, 28, 'LSSTCam takes its place at the heart of the Simonyi telescope', '3.2 gigapixels · 1.65 m wide · 3 tonnes · schematic installation'],
  [28, 42, 'Starlight: three mirrors, three lenses, one filter', 'M1 → M2 → M3 → L1 · L2 · filter g · L3 → focal plane'],
];

// Scene 2: each part slides in along the optical axis from `dz` metres away (OCS z: + = towards
// the back of the camera, up here), in this order, from the inside out.
const ASSEMBLY: { part: string; dz: number; t0: number; t1: number }[] = [
  { part: 'cryostat', dz: 1.3, t0: 9.4, t1: 11.0 },
  { part: 'shutter', dz: -0.9, t0: 10.4, t1: 12.0 },
  { part: 'l1l2', dz: -1.4, t0: 11.4, t1: 13.2 },
  { part: 'body', dz: 2.2, t0: 12.8, t1: 14.8 },
  { part: 'trunk', dz: 1.8, t0: 14.4, t1: 16.2 },
  { part: 'hexapod', dz: 1.8, t0: 15.6, t1: 17.4 },
];

// camera path: keyframes in the camera model's frame ('cam', it moves and turns with it), in a frame
// that follows the middle of the camera without turning ('mid'), or in the telescope frame ('ota')
type Key = { t: number; f: 'cam' | 'mid' | 'ota'; pos: [number, number, number]; tgt: [number, number, number] };
// opening: the camera lies horizontally, its axis along the width of the frame (L1 on the right,
// the standby socket on top), then turns upright about its middle before the descent
const OPENING: Key[] = [
  { t: 0, f: 'mid', pos: [3.3, 0.7, -0.6], tgt: [0, 0.05, -0.45] },
  { t: 8.8, f: 'mid', pos: [3.1, 0.8, 0.4], tgt: [0, 0.05, -0.45] },
  { t: 11.8, f: 'mid', pos: [5.6, 1.0, -1.4], tgt: [0, 0, -0.9] },
  { t: 14.6, f: 'mid', pos: [6.4, 1.3, 0.5], tgt: [0, 0, 0.8] },
  { t: 17.6, f: 'mid', pos: [5.4, 1.2, -0.4], tgt: [0, 0, 0] },
  { t: 20.3, f: 'mid', pos: [4.8, 1.6, -3.4], tgt: [0, 0.2, 0] }, // upright again
];
const PATH: Key[] = [
  ...OPENING,
  // follow the descent from the front of the telescope, where the elevation rings are seen edge-on
  { t: 22.5, f: 'cam', pos: [3.0, 7.0, -9.0], tgt: [0, 5.0, 0] },
  { t: 27.5, f: 'ota', pos: [4.0, 12.0, -24.0], tgt: [0, 5.0, 0] },
  { t: 31.5, f: 'ota', pos: [1.5, 6.0, -21.0], tgt: [0, 4.2, 0] },
  // into the camera, down to the focal plane, then hold while the light lands
  { t: 35.5, f: 'ota', pos: [1.9, 4.0, -2.6], tgt: [0, 4.35, 0] },
  { t: 40, f: 'ota', pos: [0.7, 3.95, -0.35], tgt: [0, 4.43, 0] },
  { t: 42, f: 'ota', pos: [0.62, 3.96, -0.31], tgt: [0, 4.43, 0] },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)));

// Light: fast through the telescope, then slowed right down inside the camera, so the last metre
// (L1 → L2 → filter → L3 → CCDs) is seen in the close-up. Speed in m of path per s of film.
const SLOW = { from: 35, to: 36.5, v: 0.28 };
const IN_CAMERA = 1.0; // metres of path left when the light has slowed down (≈ from L1 on)
const FAST = (rays.meanOkLength - IN_CAMERA - SLOW.v * (SLOW.to - SLOW.from) / 2) / (SLOW.from - W.wavefront + (SLOW.to - SLOW.from) / 2);
function lightHead(t: number) {
  let h = 0;
  const dt = 0.005;
  for (let x = W.wavefront; x < t; x += dt) {
    const k = clamp01((x - SLOW.from) / (SLOW.to - SLOW.from));
    h += (FAST + (SLOW.v - FAST) * k * k * (3 - 2 * k)) * Math.min(dt, t - x);
  }
  return h;
}

// ---------------------------------------------------------------- the filter exchange, replayed deterministically
let steps: FESStep[] = [];
let stepStart: number[] = [];
let stepsDone = 0;
let fesClock = -1;
function resetFES() {
  cam.state.shutterA = 1;
  cam.state.shutterB = 0;
  cam.instantBeam('r');
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
    p[a.part].position.copy(ocs(0, 0, a.dz * (1 - ramp(t, a.t0, a.t1))));
  }
  p.l1l2.visible &&= t < 37.2; // lenses and filter hidden for the final look at the focal plane
  p.filters.visible = t < 37.2;
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
  faceCutPlane(cutPlane, tel.ota, camera, t >= 28.5);

  // --- light
  const light = t >= W.wavefront;
  rays.object.visible = star.visible = light;
  const head = lightHead(t);
  const arrived = head > rays.meanOkLength + 0.3;
  const u = rays.material.uniforms;
  u.uContinuous.value = arrived ? 1 : 0;
  u.uHead.value = head;
  u.uBase.value = arrived ? 0.07 * ramp(t, 36, 37) : 0;
  spot.material.opacity = light ? clamp01((head - rays.meanOkLength) / 0.3) : 0;
  star.material.opacity = ramp(t, W.wavefront - 1, W.wavefront);

  // --- camera path
  tel.ota.updateMatrixWorld(true);
  PATH.forEach((k, i) => {
    const frame = k.f === 'cam' ? camGroup : k.f === 'mid' ? mid : tel.ota;
    frame.localToWorld(pW[i].set(...k.pos));
    frame.localToWorld(qW[i].set(...k.tgt));
  });
  let i = 0;
  while (i < PATH.length - 2 && t >= PATH[i + 1].t) i++;
  const f = clamp01((t - PATH[i].t) / (PATH[i + 1].t - PATH[i].t));
  const s = (i + f) / (PATH.length - 1);
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
    caption.innerHTML = c ? `${c[2]}<small>${c[3]}</small>` : '';
  }
  caption.style.opacity = c ? String(Math.min(clamp01((t - c[0]) / 0.5), clamp01((c[1] - t) / 0.5))) : '0';
  clockEl.textContent = CAPTURE ? '' : `${t.toFixed(1)} s`;

  composer.render();
}

resetFES();
if (CAPTURE) {
  render(0);
} else {
  const t0 = performance.now();
  const loop = () => {
    render(((performance.now() - t0) / 1000) % DURATION);
    requestAnimationFrame(loop);
  };
  loop();
}
(window as any).__film = { render, duration: DURATION, renderer, camera, ready: true };
