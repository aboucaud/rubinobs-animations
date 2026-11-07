// The Filter Exchange System of the LSST Camera (IN2P3/CNRS): dedicated, step-by-step animation.
import * as THREE from 'three';
import GUI from 'lil-gui';
import { Rubin } from '../optics/trace';
import { BANDS, BAND_HEX, BAND_INFO, Band } from '../scene/bands';
import { buildLSSTCam } from '../scene/lsstcam';
import { FESStep } from '../scene/fes';
import { cutPlane } from '../scene/materials';
import { ocs } from '../scene/util';
import { CameraTween, createLabels, createViewer, faceCutPlane } from './common';

const bandText = (b: Band) => `${b} · ${BAND_INFO[b].note}`;

// ---------------------------------------------------------------- renderer & scene
const { renderer, scene, camera, controls, composer } = createViewer({
  fov: 36,
  near: 0.01,
  far: 100,
  exposure: 1.0,
  background: 0x07090d,
  roomEnvironment: 0.55,
});
controls.minDistance = 0.3;
controls.maxDistance = 12;
scene.add(new THREE.HemisphereLight(0xdbe6f5, 0x1a1612, 0.8));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xa8c4ff, 0.9);
rim.position.set(-4, 2, -5);
scene.add(rim);

// camera lying with its axis horizontal and the standby socket on top (rails aligned with gravity)
const root = new THREE.Group();
root.matrixAutoUpdate = false;
const HEIGHT = 1.4;
root.matrix.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
root.matrix.setPosition(4.75, HEIGHT, 0);
scene.add(root);
const toWorld = (v: THREE.Vector3) => v.clone().applyMatrix4(root.matrix);

const cam = buildLSSTCam(Rubin.forBand('r'));
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

/** Pose the model, then re-apply this page's display choices: cam.update() resets some visibilities
 *  (it shows the camera body whenever the camera is not exploded), so always use this pair. */
function refreshModel() {
  cam.update();
  applyVisibility();
}

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
    <div class="band" style="--c:${s.beam ? BAND_HEX[s.beam] : '#ccc'}">${s.beam ?? (s.transit ? s.transit.band : '∅')}<span>${s.beam ? 'in the beam · ' + bandText(s.beam) : s.transit ? 'filter moving' : 'no filter in the beam'}</span></div>
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
  refreshModel();
};

// labels: only the FES ones (+ cryostat / L3 for context)
const LABEL_IDS = new Set(['carrier', 'carousel', 'drive', 'autochanger', 'rails', 'online', 'filter', 'shutter', 'L3', 'cryostat', 'fp']);
const updateLabels = createLabels(
  cam.labels.filter((l) => LABEL_IDS.has(l.id)),
  camera,
  controls,
  { defaultParent: cam.group, visible: (l) => (l.parent ?? cam.group).visible },
);

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
const tween = new CameraTween(camera, controls, 1400);
function goView(name: string) {
  const v = VIEWS[name];
  tween.start(toWorld(v.pos), toWorld(v.tgt));
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
const clock = new THREE.Clock();
let hudT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  // the model only changes while a sequence runs (other changes call refreshModel themselves)
  const busy = queue.length > 0 && !state.paused;
  tick(dt);
  if (busy) refreshModel();
  hudT += dt;
  if (hudT > 0.1) {
    hudT = 0;
    updateHud();
  }
  faceCutPlane(cutPlane, root, camera, state.cutaway, cutOffset); // the offset keeps the inner FES intact
  tween.update();
  controls.update();
  composer.render();
  updateLabels(state.labels);
  requestAnimationFrame(frame);
}

cam.state.shutterA = 1;
applyVisibility();
renderSteps();
updateHud();
camera.position.copy(toWorld(VIEWS['Front (from L2)'].pos));
controls.target.copy(toWorld(VIEWS['Front (from L2)'].tgt));
frame();
(window as any).__rubin = {
  renderer,
  state,
  goView,
  start,
  fes,
  cam,
  advance: (sec: number) => {
    for (let t = 0; t < sec; t += 0.05) tick(0.05);
    refreshModel();
  },
};
