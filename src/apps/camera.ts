import * as THREE from 'three';
import { Rubin, TraceResult } from '../optics/trace';
import { BANDS, BAND_HEX, BAND_INFO, Band } from '../scene/bands';
import { buildLSSTCam, CAM } from '../scene/lsstcam';
import { cutPlane, MAT } from '../scene/materials';
import { bakeRays, RayBundle, RayData } from '../scene/rays';
import { ocs } from '../scene/util';
import { FocalPlaneImage } from '../scene/exposure';
import { buildHuman } from '../scene/human';
import { CameraTween, createLabels, createViewer, easeInOutCubic as ease, faceCutPlane, createGui } from './common';

const bandText = (b: Band) => `${b} · ${BAND_INFO[b].range} · ${BAND_INFO[b].note}`;

// ---------------------------------------------------------------- renderer & scene
const { renderer, scene, camera, controls, composer } = createViewer({
  fov: 38,
  near: 0.01,
  far: 200,
  exposure: 0.95,
  background: 0x0a0d14,
  roomEnvironment: 0.4,
  bloom: [0.8, 0.35, 1.4],
});
controls.minDistance = 0.2;
controls.maxDistance = 25;
scene.add(new THREE.HemisphereLight(0xc8d6f0, 0x20180f, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(4, 7, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xa8c0ff, 0.8);
rim.position.set(-5, 3, -4);
scene.add(rim);

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

const cam = buildLSSTCam(Rubin.forBand('r'));
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
// a technician for scale, behind the cart's back end on the near side (left of the default views,
// beyond the exploded parts)
scene.add(buildHuman(new THREE.Vector3(-4.4, 0, 1.0), new THREE.Vector3(0, 0, 0), 1.75));

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
// One baked bundle per band (4 stars each), traced the first time the band is shown.
const traced = new Map<Band, { rays: RayData; landings: { x: number; y: number }[] }>();
function traceBand(band: Band) {
  const rubin = Rubin.forBand(band);
  const all: TraceResult[] = [];
  const landings: { x: number; y: number }[] = [];
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
  return { rays: bakeRays(all, CAM.zShutter + 0.008), landings };
}
function retrace() {
  let t = traced.get(state.band);
  if (!t) traced.set(state.band, (t = traceBand(state.band)));
  rays.setData(t.rays);
  rays.material.uniforms.uColor.value.set(BAND_HEX[state.band]);
  fpImage.makeSky(BAND_HEX[state.band], t.landings);
}
rays.material.uniforms.uPeriod.value = 2.2;
rays.material.uniforms.uTail.value = 0.18;

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

function filterSteps(target: Band | null): Step[] {
  // the real FES sequence (shared with the filter-exchange page), shown ~8× faster than real time
  const steps = cam.fes.stepsTo(target);
  const out: Step[] = steps.map((st) => ({ label: st.label, real: st.real, anim: Math.max(0.6, st.real / 8), run: st.run, done: st.done }));
  const last = out[out.length - 1];
  const prev = last.done;
  last.done = () => {
    prev?.();
    if (target) {
      state.band = target;
      retrace();
    }
  };
  return out;
}

// ---------------------------------------------------------------- labels
const updateLabels = createLabels(cam.labels, camera, controls, {
  defaultParent: cam.group,
  visible: (l, dist, camD) => (l.parent ?? cam.group).visible && dist < 1.6 * camD + 0.4,
});

// ---------------------------------------------------------------- HUD & action bar
const info = document.getElementById('info')!;
function updateHud() {
  const cs = cam.state;
  const busy = queue.length > 0;
  const step = queue[0];
  const loaded = BANDS.filter((b) => cs.home[b] !== undefined);
  const loader = BANDS.find((b) => cs.home[b] === undefined);
  info.innerHTML = `
    <div class="band" style="--c:${cs.beam ? BAND_HEX[cs.beam] : '#ccc'}">${cs.beam ?? '∅'}<span>${cs.beam ? bandText(cs.beam) : cs.transit ? 'filter in transit' : 'no filter in the beam'}</span></div>
    <div>Shutter: <b>${state.shutter}</b> · Carousel: <b>${loaded.join(' ')}</b> <span class="k">(${loader} waits in the loader)</span></div>
    ${busy ? `<div class="seq key"><b>${seqName}</b><br>${step.label}<div class="clock">real time ${realClock.toFixed(1)} s</div></div>` : `<div class="k">Pick an action below. Times are shown as they happen on the real camera.</div>`}`;
  document.querySelectorAll<HTMLButtonElement>('#bar button').forEach((b) => {
    const f = b.dataset.band as Band | undefined;
    b.disabled = busy || (!!f && (cs.home[f] === undefined || f === cs.beam));
    b.classList.toggle('active', !!f && f === cs.beam);
  });
  const bn = document.getElementById('bNone') as HTMLButtonElement | null;
  if (bn) {
    bn.disabled = busy || cs.beam === null;
    bn.classList.toggle('active', cs.beam === null && !cs.transit);
  }
  const be = document.getElementById('bExpose') as HTMLButtonElement | null;
  if (be) be.disabled = busy || cs.beam === null;
}

const bar = document.getElementById('bar')!;
bar.innerHTML = `
  <button id="bExpose" class="primary">◉ Take a 30 s exposure</button>
  <span class="sep">Change filter</span>
  ${BANDS.map((b) => `<button data-band="${b}" style="--c:${BAND_HEX[b]}">${b}</button>`).join('')}
  <button id="bNone" style="--c:#ccc" title="Store all five filters in the carousel">none</button>
  <label class="slider">Explode <input id="explode" type="range" min="0" max="1" step="0.01" value="0"></label>`;
document.getElementById('bExpose')!.onclick = () => {
  if (state.explode > 0.01) setExplode(0);
  runSequence('One 30-second exposure', visitSteps());
};
document.getElementById('bNone')!.onclick = () => {
  if (state.explode > 0.01) setExplode(0);
  runSequence('Store the filter: none in the beam', filterSteps(null));
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
const tween = new CameraTween(camera, controls, 1400);
function goView(name: string) {
  const v = VIEWS[name];
  tween.start(v.pos, v.tgt);
  if (v.cut !== undefined) state.cutaway = v.cut;
  state.cutOffset = v.cutOffset ?? 0;
  state.glass = v.glass ?? true;
  state.beamFilter = v.beamFilter ?? true;
  hidden = v.hide ?? [];
  cam.update();
  setExplode(v.explode ?? 0);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

const gui = createGui('LSSTCam');
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
  cam.parts.L1.visible = cam.parts.L2.visible = state.glass;
  cam.parts.L3.visible = state.glass;
  cam.parts.body.visible = state.explode < 0.02;
  for (const h of hidden) cam.parts[h].visible = false;
  cam.parts.blades.visible = state.glass;
  if (cam.state.beam) cam.filters[cam.state.beam].visible = state.beamFilter;

  // cutaway plane through the optical axis, facing the viewer
  faceCutPlane(cutPlane, root, camera, state.cutaway, state.cutOffset);

  tween.update();
  controls.update();
  composer.render();
  updateLabels(state.labels);
  requestAnimationFrame(frame);
}

retrace();
cam.update();
updateHud();
camera.position.copy(VIEWS.Overview.pos);
controls.target.copy(VIEWS.Overview.tgt);
frame();
(window as any).__rubin = { renderer, advance: (sec: number) => { for (let t = 0; t < sec; t += 0.05) tick(0.05); }, state, goView, runSequence, visitSteps, filterSteps, cam, camera, controls };
