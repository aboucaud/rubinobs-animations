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
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));
}

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
export const DURATION = 40;
const LIFT = 12; // the camera is shown 12 m above its place in the telescope until scene 4
const FES_START = 0.5;
const FES_SPEED = 10;
const W = { lightSpeed: 4, wavefront: 29.5 };

const CAPTIONS: [number, number, string, string][] = [
  [0, 9, 'Inside LSSTCam, the filter changer swaps the r filter for g', 'a 75 cm filter travels about 1 m · 82 s in reality, shown 10× faster'],
  [9, 13, 'LSSTCam closes around its filters', '3.2 gigapixels · 1.65 m wide · 3 tonnes'],
  [13, 20, 'Lenses, shutter, filters, cryostat, electronics', 'exploded view'],
  [20, 28, 'The camera takes its place at the heart of the Simonyi telescope', 'schematic: the real installation uses dedicated handling equipment'],
  [28, 40, 'Starlight: three mirrors, three lenses, one filter', 'M1 → M2 → M3 → L1 · L2 · filter g · L3 → focal plane'],
];

// camera path: keyframes in the camera model's frame ('cam', it moves with it) or in the telescope frame
type Key = { t: number; f: 'cam' | 'ota'; pos: [number, number, number]; tgt: [number, number, number] };
const PATH: Key[] = [
  // filter changer, close and in cutaway, from the side of the standby socket (OCS +y = local −z)
  { t: 0, f: 'cam', pos: [2.1, 4.4, -1.3], tgt: [0, 5.15, -0.1] },
  { t: 8, f: 'cam', pos: [1.8, 4.7, -1.8], tgt: [0, 5.2, -0.1] },
  // whole camera (3.7 m long), then far enough for the exploded view (≈ 7 m)
  { t: 12, f: 'cam', pos: [4.0, 5.6, -3.4], tgt: [0, 5.25, 0] },
  { t: 16, f: 'cam', pos: [6.6, 6.6, -5.8], tgt: [0, 5.7, 0] },
  { t: 19.5, f: 'cam', pos: [5.0, 6.2, -4.6], tgt: [0, 5.3, 0] },
  // follow the descent from the front of the telescope, where the elevation rings are seen edge-on
  { t: 22.5, f: 'cam', pos: [3.0, 7.0, -9.0], tgt: [0, 5.0, 0] },
  { t: 27.5, f: 'ota', pos: [4.0, 12.0, -24.0], tgt: [0, 5.0, 0] },
  { t: 31.5, f: 'ota', pos: [1.5, 6.0, -21.0], tgt: [0, 4.2, 0] },
  // into the camera, down to the focal plane
  { t: 35.5, f: 'ota', pos: [1.9, 4.0, -2.6], tgt: [0, 4.35, 0] },
  { t: 40, f: 'ota', pos: [0.7, 3.95, -0.35], tgt: [0, 4.43, 0] },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)));

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
const clockEl = document.getElementById('clock')!;
let captionKey = '';

function render(t: number) {
  // --- mechanisms
  playFES(Math.max(0, (t - FES_START) * FES_SPEED));
  const ex = ramp(t, 13.3, 15.8) * (1 - ramp(t, 17.2, 19.7));
  cam.state.explode = ex;
  cam.state.shutterA = 1 - ramp(t, 28.5, 29.3); // the shutter opens for the starlight
  cam.update();
  // what the camera model shows: the parts around the filter changer come back one by one in scene 2
  const p = cam.parts;
  const back = (at: number) => t >= at;
  p.shutter.visible = back(9.6);
  p.l1l2.visible = back(10.2) && t < 37.2;
  p.trunk.visible = p.hexapod.visible = back(10.8);
  if (!back(11.6)) p.body.visible = false; // otherwise cam.update() decides (hidden when exploded)
  p.filters.visible = t < 37.2; // lenses and filter hidden for the final look at the focal plane
  camGroup.position.y = LIFT * (1 - ramp(t, 20.6, 26.6));

  // --- cutaway: through the filter changer in scene 1, through the telescope in scene 5
  const cutOn = t < 12 || t >= 28.5;
  faceCutPlane(cutPlane, tel.ota, camera, cutOn, t < 12 ? 0.48 : 0);

  // --- light
  const light = t >= W.wavefront;
  rays.object.visible = star.visible = light;
  const head = Math.max(0, (t - W.wavefront) * W.lightSpeed);
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
    const frame = k.f === 'cam' ? camGroup : tel.ota;
    frame.localToWorld(pW[i].set(...k.pos));
    frame.localToWorld(qW[i].set(...k.tgt));
  });
  let i = 0;
  while (i < PATH.length - 2 && t >= PATH[i + 1].t) i++;
  const f = clamp01((t - PATH[i].t) / (PATH[i + 1].t - PATH[i].t));
  const s = (i + f) / (PATH.length - 1);
  camera.position.copy(pCurve.getPoint(s, tmp));
  camera.lookAt(qCurve.getPoint(s, tmp));
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
