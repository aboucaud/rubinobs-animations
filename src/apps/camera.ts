import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import { Rubin, Band, TraceResult } from '../optics/trace';
import { buildLSSTCam, CAM, BAND_HEX } from '../scene/lsstcam';
import { cutPlane, MAT } from '../scene/materials';
import { RayBundle } from '../scene/rays';
import { ocs } from '../scene/util';
import { FocalPlaneImage } from '../scene/exposure';
import '../style.css';

const BAND_TXT: Record<Band, string> = {
  u: 'u · 320–390 nm · near-ultraviolet',
  g: 'g · 400–550 nm · blue-green',
  r: 'r · 550–690 nm · red',
  i: 'i · 690–820 nm · near-infrared',
  z: 'z · 820–925 nm · infrared',
  y: 'y · 930–1010 nm · infrared',
};

// ---------------------------------------------------------------- renderer & scene
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d14);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
scene.add(new THREE.HemisphereLight(0xc8d6f0, 0x20180f, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(4, 7, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xa8c0ff, 0.8);
rim.position.set(-5, 3, -4);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.2;
controls.maxDistance = 25;

// clean-room floor
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.55, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(24, 48, 0x2f3540, 0x2a2f38);
  (grid.material as THREE.Material).opacity = 0.5;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.002;
  scene.add(grid);
}

// ---------------------------------------------------------------- camera model, lying horizontally on its cart
// OCS z (optical axis) → world −X (L1 faces +X), OCS +y → world up (gravity-aligned autochanger rails,
// as during a filter change at the horizon), OCS +x → world +Z.
const root = new THREE.Group();
root.matrixAutoUpdate = false;
const AXIS_Z_CENTER = 5.25;
const HEIGHT = 1.45;
root.matrix.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
root.matrix.setPosition(AXIS_Z_CENTER, HEIGHT, 0);
scene.add(root);

let rubin = new Rubin('r');
const cam = buildLSSTCam(rubin);
root.add(cam.group);

// cart (schematic)
{
  const m = MAT.cartYellow;
  for (const x of [-1.3, 0.2, 1.4]) {
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.18, HEIGHT - 0.78, 1.3), m);
    saddle.position.set(x, (HEIGHT - 0.78) / 2, 0);
    scene.add(saddle);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.5), MAT.steelSolid);
  base.position.y = 0.06;
  scene.add(base);
}

const fpImage = new FocalPlaneImage(cam.focalPlaneImage.canvas);

// ---------------------------------------------------------------- rays: four stars traced through the whole telescope
const rays = new RayBundle();
cam.group.add(rays.object);
const STARS: [number, number][] = [
  [0, 0],
  [1.15, 0.35],
  [-0.55, -1.3],
  [-1.2, 0.95],
];
let landings: { x: number; y: number }[] = [];
function retrace() {
  rubin = new Rubin(state.band);
  const all: TraceResult[] = [];
  landings = [];
  const zStart = CAM.zL1 - 0.7;
  for (const [ax, ay] of STARS) {
    const res = rubin.traceStar((ax * Math.PI) / 180, (ay * Math.PI) / 180, { rings: 3, perRing: 14, rInner: 2.6, rOuter: 4.1 });
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const r of res) {
      if (!r.ok) continue;
      const i = r.hits.indexOf('M3') + 1; // index of the M3 vertex in points
      const a = r.points[i];
      const b = r.points[i + 1];
      const t = (zStart - a[2]) / (b[2] - a[2]);
      const start: [number, number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), zStart];
      const pts = [start, ...r.points.slice(i + 1)];
      all.push({ ...r, points: pts });
      const e = pts[pts.length - 1];
      sx += e[0];
      sy += e[1];
      n++;
    }
    landings.push({ x: sx / n, y: sy / n });
  }
  rays.set(all, CAM.zShutter + 0.008);
  rays.material.uniforms.uColor.value.set(BAND_HEX[state.band]);
  rays.material.uniforms.uPeriod.value = 2.2;
  rays.material.uniforms.uTail.value = 0.18;
  fpImage.makeSky(BAND_HEX[state.band], landings);
}

// ---------------------------------------------------------------- state & sequences
const state = {
  band: 'r' as Band,
  explode: 0,
  cutaway: true,
  labels: true,
  rays: true,
  glass: true,
  speed: 0.6,
  shutter: 'closed' as 'closed' | 'open' | 'moving',
  coverStack: 'A' as 'A' | 'B', // which stack currently covers the aperture
  exposure: 0, // 0..1 accumulated
  readout: -1, // −1 idle, else progress
  cutOffset: 0,
  beamFilter: true,
};

type Step = { label: string; anim: number; real: number; run: (t: number) => void; done?: () => void };
let queue: Step[] = [];
let stepT = 0;
let realClock = 0;
let seqName = '';
let seqStart = 0;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function runSequence(name: string, steps: Step[]) {
  if (queue.length) return;
  seqName = name;
  queue = steps;
  stepT = 0;
  realClock = 0;
  seqStart = 0;
  updateHud();
}

function visitSteps(): Step[] {
  const open = state.coverStack;
  const close: 'A' | 'B' = open === 'A' ? 'B' : 'A';
  const set = (s: 'A' | 'B', f: number) => (s === 'A' ? (cam.state.shutterA = f) : (cam.state.shutterB = f));
  return [
    { label: 'Opening the shutter (0.9 s)', anim: 1.4, real: 0.9, run: (t) => { state.shutter = 'moving'; set(open, 1 - ease(t)); state.exposure = 0; fpImage.clear(); } },
    { label: 'Exposing — light piles up in the pixels', anim: 7, real: 30, run: (t) => { state.shutter = 'open'; state.exposure = t; fpImage.drawExposure(Math.sqrt(t)); } },
    { label: 'Closing the shutter with the other blade stack (0.9 s)', anim: 1.4, real: 0.9, run: (t) => { state.shutter = 'moving'; set(close, ease(t)); }, done: () => { state.shutter = 'closed'; state.coverStack = close; } },
    { label: 'Reading out 3.2 gigapixels through 3,216 amplifiers', anim: 4.5, real: 2, run: (t) => { state.readout = t; fpImage.drawReadout(t); }, done: () => { state.readout = -1; fpImage.clear(); } },
  ];
}

function filterSteps(target: Band): Step[] {
  // the real FES sequence (shared with the filter-exchange page), shown ~8× faster than real time
  const steps = cam.fes.stepsTo(target);
  const out: Step[] = steps.map((st) => ({ label: st.label, real: st.real, anim: Math.max(0.6, st.real / 8), run: st.run, done: st.done }));
  const last = out[out.length - 1];
  const prev = last.done;
  last.done = () => {
    prev?.();
    state.band = target;
    retrace();
  };
  return out;
}

// ---------------------------------------------------------------- post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.35, 1.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- labels
const labelLayer = document.getElementById('labels')!;
const tip = document.getElementById('tip')!;
const labelEls = cam.labels.map((l) => {
  const el = document.createElement('button');
  el.className = 'label';
  el.textContent = l.title.split(' — ')[0];
  el.onclick = (e) => {
    e.stopPropagation();
    tip.innerHTML = `<b>${l.title}</b><p>${l.text}</p>`;
    tip.classList.add('show');
  };
  labelLayer.appendChild(el);
  return { l, el };
});
document.body.addEventListener('pointerdown', (e) => {
  if (!(e.target as HTMLElement).closest('#tip')) tip.classList.remove('show');
});
const tmpV = new THREE.Vector3();
function updateLabels() {
  labelLayer.style.display = state.labels ? 'block' : 'none';
  if (!state.labels) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const { l, el } of labelEls) {
    tmpV.copy(l.pos);
    (l.parent ?? cam.group).localToWorld(tmpV);
    const vis0 = (l.parent ?? cam.group).visible && tmpV.distanceTo(camera.position) < 1.6 * camera.position.distanceTo(controls.target) + 0.4;
    tmpV.project(camera);
    const vis = vis0 && tmpV.z < 1 && Math.abs(tmpV.x) < 1.02 && Math.abs(tmpV.y) < 1.02;
    el.style.display = vis ? 'block' : 'none';
    if (vis) el.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px)`;
  }
}

// ---------------------------------------------------------------- HUD & action bar
const info = document.getElementById('info')!;
function updateHud() {
  const cs = cam.state;
  const busy = queue.length > 0;
  const step = queue[0];
  const loaded = (['u', 'g', 'r', 'i', 'z', 'y'] as Band[]).filter((b) => cs.home[b] !== undefined);
  const loader = (['u', 'g', 'r', 'i', 'z', 'y'] as Band[]).find((b) => cs.home[b] === undefined);
  info.innerHTML = `
    <div class="band" style="--c:${BAND_HEX[state.band]}">${cs.beam ?? '—'}<span>${cs.beam ? BAND_TXT[cs.beam] : 'filter in transit'}</span></div>
    <div>Shutter: <b>${state.shutter}</b> · Carousel: <b>${loaded.join(' ')}</b> <span class="k">(${loader} waits in the loader)</span></div>
    ${busy ? `<div class="seq"><b>${seqName}</b><br>${step.label}<div class="clock">real time ${realClock.toFixed(1)} s</div></div>` : `<div class="k">Pick an action below. Times are shown as they happen on the real camera.</div>`}`;
  document.querySelectorAll<HTMLButtonElement>('#bar button').forEach((b) => {
    const f = b.dataset.band as Band | undefined;
    b.disabled = busy || (!!f && (cs.home[f] === undefined || f === cs.beam));
    b.classList.toggle('active', !!f && f === cs.beam);
  });
}

const bar = document.getElementById('bar')!;
bar.innerHTML = `
  <button id="bExpose" class="primary">◉ Take a 30 s exposure</button>
  <span class="sep">Change filter</span>
  ${(['u', 'g', 'r', 'i', 'z', 'y'] as Band[]).map((b) => `<button data-band="${b}" style="--c:${BAND_HEX[b]}">${b}</button>`).join('')}
  <label class="slider">Explode <input id="explode" type="range" min="0" max="1" step="0.01" value="0"></label>`;
document.getElementById('bExpose')!.onclick = () => {
  if (state.explode > 0.01) setExplode(0);
  runSequence('One 30-second exposure', visitSteps());
};
bar.querySelectorAll<HTMLButtonElement>('button[data-band]').forEach((b) => {
  b.onclick = () => {
    if (state.explode > 0.01) setExplode(0);
    runSequence(`Filter change → ${b.dataset.band}`, filterSteps(b.dataset.band as Band));
  };
});
const explodeInput = document.getElementById('explode') as HTMLInputElement;
explodeInput.oninput = () => setExplode(parseFloat(explodeInput.value));
function setExplode(v: number) {
  state.explode = v;
  explodeInput.value = String(v);
  cam.setExplode(v);
}

// ---------------------------------------------------------------- views (positions in the camera's OCS frame)
type View = { pos: THREE.Vector3; tgt: THREE.Vector3; cut?: boolean; glass?: boolean; beamFilter?: boolean; explode?: number; cutOffset?: number; hide?: string[] };
const toWorld = (v: THREE.Vector3) => v.clone().applyMatrix4(root.matrix);
const VIEWS: Record<string, View> = {
  Overview: { pos: new THREE.Vector3(3.9, 2.5, 4.3), tgt: new THREE.Vector3(-0.2, 1.3, 0), cut: true },
  'Front (L1)': { pos: toWorld(ocs(1.1, 0.7, 2.0)), tgt: toWorld(ocs(0, 0, 3.8)), cut: false },
  'Light path': { pos: toWorld(ocs(3.3, 0.35, 4.0)), tgt: toWorld(ocs(0, 0, 3.95)), cut: true },
  'Filter exchanger': { pos: toWorld(ocs(1.9, 1.5, 3.0)), tgt: toWorld(ocs(0, 0.25, 4.45)), cut: true, cutOffset: 0.3, glass: false, hide: ['body'] },
  'Focal plane': { pos: toWorld(ocs(0.36, -0.14, 3.05)), tgt: toWorld(ocs(0, 0, 4.43)), cut: true, glass: false, beamFilter: false },
  Exploded: { pos: new THREE.Vector3(-1.5, 3.4, 7.2), tgt: new THREE.Vector3(0.2, 1.4, 0), cut: false, explode: 1 },
};
let hidden: string[] = [];
let tween: { start: number; p0: THREE.Vector3; p1: THREE.Vector3; q0: THREE.Vector3; q1: THREE.Vector3 } | null = null;
function goView(name: string) {
  const v = VIEWS[name];
  tween = { start: performance.now(), p0: camera.position.clone(), p1: v.pos.clone(), q0: controls.target.clone(), q1: v.tgt.clone() };
  if (v.cut !== undefined) state.cutaway = v.cut;
  state.cutOffset = v.cutOffset ?? 0;
  state.glass = v.glass ?? true;
  state.beamFilter = v.beamFilter ?? true;
  hidden = v.hide ?? [];
  cam.update();
  setExplode(v.explode ?? 0);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

const gui = new GUI({ title: 'LSSTCam' });
if (window.innerWidth < 720) gui.close();
const fv = gui.addFolder('Views');
for (const k of Object.keys(VIEWS)) fv.add({ [k]: () => goView(k) }, k);
const fo = gui.addFolder('Display');
fo.add(state, 'cutaway').name('cutaway');
fo.add(state, 'rays').name('light rays');
fo.add(state, 'labels').name('labels');
fo.add(state, 'glass').name('lenses');
fo.add(state, 'speed', 0.1, 3, 0.05).name('light speed (m/s)');
fo.add({ swap: () => { if (queue.length) return; swapLoader(cam.state.home.y !== undefined ? 'u' : 'y'); } }, 'swap').name('daytime: swap u ↔ y (loader)');

function swapLoader(incoming: Band) {
  cam.fes.swapLoader(incoming);
  cam.update();
  updateHud();
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let head = 0;
const axisW = new THREE.Vector3();
const originW = new THREE.Vector3();
let hudTimer = 0;
function tick(dt: number) {
  head += dt * state.speed;

  // sequences
  if (queue.length) {
    const st = queue[0];
    stepT += dt / st.anim;
    const t = Math.min(1, stepT);
    st.run(t);
    realClock = seqStart + st.real * t;
    if (stepT >= 1) {
      st.done?.();
      seqStart += st.real;
      queue.shift();
      stepT = 0;
      if (!queue.length) updateHud();
    }
    cam.update();
    cam.focalPlaneImage.texture.needsUpdate = true;
  }
  hudTimer += dt;
  if (hudTimer > 0.1 && queue.length) {
    hudTimer = 0;
    updateHud();
  }
}

function frame() {
  tick(Math.min(clock.getDelta(), 0.1));

  // ray uniforms: shutter edges in OCS x
  const H = CAM.shutterHalf;
  const u = rays.material.uniforms;
  u.uHead.value = head;
  u.uIntensity.value = 2.2;
  u.uEdgeA.value = cam.state.shutterA > 0.001 ? H - 2 * H * cam.state.shutterA : 100;
  u.uEdgeB.value = cam.state.shutterB > 0.001 ? -H + 2 * H * cam.state.shutterB : -100;
  rays.object.visible = state.rays && state.explode < 0.02 && cam.state.beam !== null;
  cam.parts.l1l2.children.slice(0, 2).forEach((m) => (m.visible = state.glass));
  cam.parts.L3.visible = state.glass;
  cam.parts.body.visible = state.explode < 0.02;
  for (const h of hidden) cam.parts[h].visible = false;
  cam.parts.blades.visible = state.glass;
  if (cam.state.beam) cam.filters[cam.state.beam].visible = state.beamFilter;

  // cutaway plane through the optical axis, facing the viewer
  root.updateMatrixWorld();
  originW.setFromMatrixPosition(root.matrixWorld);
  axisW.set(0, 1, 0).transformDirection(root.matrixWorld);
  if (state.cutaway) {
    const v = camera.position.clone().sub(originW);
    v.addScaledVector(axisW, -v.dot(axisW)).normalize();
    cutPlane.normal.copy(v).negate();
    cutPlane.constant = state.cutOffset - cutPlane.normal.dot(originW);
  } else {
    cutPlane.normal.set(0, 1, 0);
    cutPlane.constant = 1e6;
  }

  if (tween) {
    const t = Math.min(1, (performance.now() - tween.start) / 1400);
    const e = ease(t);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.q0, tween.q1, e);
    if (t >= 1) tween = null;
  }
  controls.update();
  composer.render();
  updateLabels();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

retrace();
cam.update();
updateHud();
camera.position.copy(VIEWS.Overview.pos);
controls.target.copy(VIEWS.Overview.tgt);
frame();
(window as any).__rubin = { advance: (sec: number) => { for (let t = 0; t < sec; t += 0.05) tick(0.05); }, state, goView, runSequence, visitSteps, filterSteps, cam, camera, controls };
