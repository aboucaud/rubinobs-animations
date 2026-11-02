// The Filter Exchange System of the LSST Camera (IN2P3/CNRS): dedicated, step-by-step animation.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import { Rubin, Band } from '../optics/trace';
import { buildLSSTCam } from '../scene/lsstcam';
import { BAND_HEX, BANDS, FESStep } from '../scene/fes';
import { cutPlane } from '../scene/materials';
import { ocs } from '../scene/util';
import '../style.css';

const BAND_TXT: Record<Band, string> = {
  u: 'u · near-ultraviolet',
  g: 'g · blue-green',
  r: 'r · red',
  i: 'i · near-infrared',
  z: 'z · infrared',
  y: 'y · infrared',
};

// ---------------------------------------------------------------- renderer & scene
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090d);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xdbe6f5, 0x1a1612, 0.8));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xa8c4ff, 0.9);
rim.position.set(-4, 2, -5);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = 12;

// camera lying with its axis horizontal and the standby socket on top (rails aligned with gravity)
const root = new THREE.Group();
root.matrixAutoUpdate = false;
const HEIGHT = 1.4;
root.matrix.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
root.matrix.setPosition(4.75, HEIGHT, 0);
scene.add(root);
const toWorld = (v: THREE.Vector3) => v.clone().applyMatrix4(root.matrix);

const cam = buildLSSTCam(new Rubin('r'));
root.add(cam.group);
const fes = cam.fes;

// a soft floor disc for depth
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 96), new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.7, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
}

// ---------------------------------------------------------------- display state
const state = {
  speed: 4,
  paused: false,
  body: false,
  lenses: false,
  cryostat: true,
  shutter: false,
  labels: true,
  cutaway: false,
};

function applyVisibility() {
  const p = cam.parts;
  p.body.visible = state.body;
  p.trunk.visible = state.body;
  p.hexapod.visible = state.body;
  p.l1l2.visible = state.lenses;
  p.cryostat.visible = state.cryostat;
  p.shutter.visible = state.shutter;
}

// ---------------------------------------------------------------- sequence runner
let queue: FESStep[] = [];
let all: FESStep[] = [];
let idx = 0;
let stepT = 0;
let realClock = 0;
let realTotal = 0;
let target: Band | null | undefined = undefined;

function start(b: Band | null) {
  if (queue.length || b === fes.state.beam || (b && fes.state.home[b] === undefined)) return;
  all = fes.stepsTo(b);
  queue = [...all];
  idx = 0;
  stepT = 0;
  realClock = 0;
  realTotal = all.reduce((s, x) => s + x.real, 0);
  target = b;
  renderSteps();
}

function tick(dt: number) {
  if (!queue.length || state.paused) return;
  const st = queue[0];
  const animDur = Math.max(0.6, st.real / state.speed);
  stepT += dt / animDur;
  const t = Math.min(1, stepT);
  st.run(t);
  const before = all.slice(0, idx).reduce((s, x) => s + x.real, 0);
  realClock = before + st.real * t;
  if (stepT >= 1) {
    st.done?.();
    queue.shift();
    idx++;
    stepT = 0;
    if (!queue.length) target = undefined;
    renderSteps();
  }
}

// ---------------------------------------------------------------- UI
const info = document.getElementById('info')!;
const stepsEl = document.getElementById('steps')!;
function renderSteps() {
  if (!all.length) {
    stepsEl.innerHTML = `<div class="k">Choose a filter below to watch a complete exchange, or “none” to store all five filters in the carousel. Durations are those of the real system (≈ 82–86 s for a full exchange).</div>`;
    return;
  }
  stepsEl.innerHTML = all
    .map((s, i) => {
      const cls = i < idx ? 'done' : i === idx && queue.length ? 'now' : '';
      return `<div class="step ${cls}"><span class="t">${s.real.toFixed(0)} s</span><b>${s.label}</b>${i === idx && queue.length ? `<p>${s.detail}</p>` : ''}</div>`;
    })
    .join('');
}
function updateHud() {
  const s = fes.state;
  const loaded = BANDS.filter((b) => s.home[b] !== undefined);
  const prog = realTotal ? Math.min(1, realClock / realTotal) : 0;
  info.innerHTML = `
    <div class="band" style="--c:${s.beam ? BAND_HEX[s.beam] : '#ccc'}">${s.beam ?? (s.transit ? s.transit.band : '∅')}<span>${s.beam ? 'in the beam · ' + BAND_TXT[s.beam] : s.transit ? 'filter moving' : 'no filter in the beam'}</span></div>
    <div>Carousel: <b>${loaded.join(' ')}</b> <span class="k">· ${s.loaderOut ?? '—'} waits in the loader</span></div>
    ${target !== undefined ? `<div class="seq"><b>${target ? 'Exchange → ' + target : 'Store the filter: none in the beam'}</b><div class="bar"><i style="width:${(prog * 100).toFixed(1)}%"></i></div><div class="clock">real time ${realClock.toFixed(1)} / ${realTotal.toFixed(1)} s · shown ×${state.speed}${state.paused ? ' · paused' : ''}</div></div>` : ''}`;
  const bn = document.getElementById('bNone') as HTMLButtonElement;
  bn.disabled = !!queue.length || s.beam === null;
  bn.classList.toggle('active', s.beam === null && !s.transit);
  document.querySelectorAll<HTMLButtonElement>('#bar button[data-band]').forEach((b) => {
    const f = b.dataset.band as Band;
    b.disabled = !!queue.length || s.home[f] === undefined || f === s.beam;
    b.classList.toggle('active', f === s.beam);
    b.title = s.home[f] === undefined ? 'In the loader: swap it in during the day first' : '';
  });
  (document.getElementById('bPause') as HTMLButtonElement).textContent = state.paused ? '▶ Resume' : '❚❚ Pause';
  (document.getElementById('bSwap') as HTMLButtonElement).disabled = !!queue.length;
}
const bar = document.getElementById('bar')!;
bar.innerHTML = `
  <span class="sep">Put in the beam</span>
  ${BANDS.map((b) => `<button data-band="${b}" style="--c:${BAND_HEX[b]}">${b}</button>`).join('')}
  <button id="bNone" style="--c:#ccc" title="Store all five filters in the carousel">none</button>
  <button id="bPause">❚❚ Pause</button>
  <label class="slider">Speed <select id="speed"><option value="1">real time</option><option value="2">×2</option><option value="4" selected>×4</option><option value="10">×10</option></select></label>
  <button id="bSwap" title="Daytime operation">Loader: swap u ↔ y</button>`;
bar.querySelectorAll<HTMLButtonElement>('button[data-band]').forEach((b) => (b.onclick = () => start(b.dataset.band as Band)));
document.getElementById('bNone')!.onclick = () => start(null);
document.getElementById('bPause')!.onclick = () => (state.paused = !state.paused);
(document.getElementById('speed') as HTMLSelectElement).onchange = (e) => (state.speed = parseFloat((e.target as HTMLSelectElement).value));
document.getElementById('bSwap')!.onclick = () => {
  if (queue.length) return;
  fes.swapLoader(fes.state.home.y !== undefined ? 'u' : 'y');
  cam.update();
};

// labels: only the FES ones (+ cryostat / L3 for context)
const LABEL_IDS = new Set(['carrier', 'carousel', 'drive', 'autochanger', 'rails', 'online', 'filter', 'shutter', 'L3', 'cryostat', 'fp']);
const labelLayer = document.getElementById('labels')!;
const tip = document.getElementById('tip')!;
const labelEls = cam.labels
  .filter((l) => LABEL_IDS.has(l.id))
  .map((l) => {
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
    const parent = l.parent ?? cam.group;
    tmpV.copy(l.pos);
    parent.localToWorld(tmpV);
    tmpV.project(camera);
    const vis = parent.visible && tmpV.z < 1 && Math.abs(tmpV.x) < 1.02 && Math.abs(tmpV.y) < 1.02;
    el.style.display = vis ? 'block' : 'none';
    if (vis) el.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px)`;
  }
}

// ---------------------------------------------------------------- views
type View = { pos: THREE.Vector3; tgt: THREE.Vector3; body?: boolean; lenses?: boolean; cut?: boolean; cutOffset?: number };
const VIEWS: Record<string, View> = {
  'Front (from L2)': { pos: ocs(1.55, 1.15, 2.05), tgt: ocs(0, 0.08, 4.7) },
  'Side (path of the filter)': { pos: ocs(2.5, 1.0, 3.25), tgt: ocs(0, 0.15, 4.65), cut: true, cutOffset: 0.48 },
  'Standby socket': { pos: ocs(1.1, 1.85, 4.25), tgt: ocs(0, 0.5, 4.85) },
  'Carousel (from behind)': { pos: ocs(-1.4, -1.0, 6.4), tgt: ocs(0, 0, 5.0) },
  'Inside the camera': { pos: ocs(1.9, 1.1, 3.4), tgt: ocs(0, 0.1, 4.6), body: true, cut: true, cutOffset: 0.55 },
};
let cutOffset = 0.55;
let tween: { start: number; p0: THREE.Vector3; p1: THREE.Vector3; q0: THREE.Vector3; q1: THREE.Vector3 } | null = null;
function goView(name: string) {
  const v = VIEWS[name];
  tween = { start: performance.now(), p0: camera.position.clone(), p1: toWorld(v.pos), q0: controls.target.clone(), q1: toWorld(v.tgt) };
  state.body = v.body ?? false;
  state.lenses = v.lenses ?? false;
  state.cutaway = v.cut ?? false;
  cutOffset = v.cutOffset ?? 0.55;
  applyVisibility();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
const gui = new GUI({ title: 'Filter exchange' });
if (window.innerWidth < 720) gui.close();
const fv = gui.addFolder('Views');
for (const k of Object.keys(VIEWS)) fv.add({ [k]: () => goView(k) }, k);
const fd = gui.addFolder('Display');
fd.add(state, 'body').name('camera body').onChange(applyVisibility);
fd.add(state, 'lenses').name('L1–L2 lenses').onChange(applyVisibility);
fd.add(state, 'cryostat').name('cryostat & L3').onChange(applyVisibility);
fd.add(state, 'shutter').name('shutter').onChange(applyVisibility);
fd.add(state, 'cutaway').name('cutaway');
fd.add(state, 'labels').name('labels');

// ---------------------------------------------------------------- loop
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
const clock = new THREE.Clock();
const axisW = new THREE.Vector3();
const originW = new THREE.Vector3();
let hudT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  tick(dt);
  cam.update();
  applyVisibility();
  hudT += dt;
  if (hudT > 0.1) {
    hudT = 0;
    updateHud();
  }
  root.updateMatrixWorld();
  originW.setFromMatrixPosition(root.matrixWorld);
  axisW.set(0, 1, 0).transformDirection(root.matrixWorld);
  if (state.cutaway) {
    const v = camera.position.clone().sub(originW);
    v.addScaledVector(axisW, -v.dot(axisW)).normalize();
    cutPlane.normal.copy(v).negate();
    cutPlane.constant = cutOffset - cutPlane.normal.dot(originW); // keep the inner FES intact
  } else {
    cutPlane.normal.set(0, 1, 0);
    cutPlane.constant = 1e6;
  }
  if (tween) {
    const t = Math.min(1, (performance.now() - tween.start) / 1400);
    const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
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

cam.state.shutterA = 1;
applyVisibility();
renderSteps();
updateHud();
camera.position.copy(toWorld(VIEWS['Front (from L2)'].pos));
controls.target.copy(toWorld(VIEWS['Front (from L2)'].tgt));
frame();
(window as any).__rubin = {
  state,
  goView,
  start,
  fes,
  advance: (sec: number) => {
    for (let t = 0; t < sec; t += 0.05) tick(0.05);
    cam.update();
    applyVisibility();
  },
};
