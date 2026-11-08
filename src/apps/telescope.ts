import * as THREE from 'three';
import GUI from 'lil-gui';
import { Rubin } from '../optics/trace';
import { BAND_HEX, BAND_INFO, Band } from '../scene/bands';
import { buildTelescope, ELEV_AXIS_ABOVE_M1 } from '../scene/telescope';
import { buildAzimuth, AXIS_HEIGHT } from '../scene/mount';
import { cutPlane, MAT } from '../scene/materials';
import { RayBuilder, RayBundle, RayData, rayBytes, TraceCache } from '../scene/rays';
import { ocs, ocsv } from '../scene/util';
import { LAYOUT, ccdAt } from '../scene/focalplane';
import { CameraTween, createLabels, createViewer, faceCutPlane, glowTexture } from './common';

// ---------------------------------------------------------------- renderer & scene
const { renderer, scene, camera, controls, composer, bloom, onResize } = createViewer({
  fov: 40,
  near: 0.02,
  far: 2000,
  exposure: 0.9,
  background: 0x05070d,
  roomEnvironment: 0.55,
  bloom: [0.9, 0.3, 1.3],
});
camera.position.set(17, 12, 19);
controls.target.set(0, AXIS_HEIGHT + 1.5, 0);
controls.maxDistance = 120;
controls.minDistance = 0.3;

scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x1a1410, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(20, 30, 12);
scene.add(key);
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.5);
fill.position.set(-18, 8, -14);
scene.add(fill);

// starfield
{
  const n = 4000;
  const p = new Float32Array(n * 3);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    p.set([800 * s * Math.cos(t), 800 * Math.abs(u) - 60, 800 * s * Math.sin(t)], i * 3);
    const w = 0.5 + Math.random() * 0.5;
    c.set([w, w, w * (0.9 + Math.random() * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));
}

// ---------------------------------------------------------------- telescope hierarchy
// r band and a 3D ray bundle on this page; other bands are shown on the camera and filters pages
const BAND: Band = 'r';
const state = {
  fieldAngle: 0, // star at the centre of the field; moved by tapping the focal-plane inset
  fieldAz: 0,
  rings: 7,
  speed: 2.0,
  continuous: true,
  showPaths: true,
  cutaway: true,
  labels: true,
  glass: true,
  elevation: 90,
  azimuth: 0,
  mount: true,
  bloom: 0.9,
};

const tel = buildTelescope(Rubin.forBand(BAND));
tel.setBand(Rubin.forBand(BAND));
const azGroup = new THREE.Group();
const elGroup = new THREE.Group();
elGroup.position.y = AXIS_HEIGHT;
tel.ota.position.y = -ELEV_AXIS_ABOVE_M1;
elGroup.add(tel.ota);
azGroup.add(elGroup);
scene.add(azGroup);

// Mount & pier placeholder (APPROX: TMA envelope to be replaced by the NOIRLab CAD)
const azimuth = buildAzimuth();
azGroup.add(azimuth);
const pier = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 15.65, 96, 1, true), MAT.concrete);
pier.position.y = -0.6 - 15.65 / 2;
scene.add(pier);
const floor = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.3, 96), MAT.floor);
floor.position.y = -0.75;
scene.add(floor);
// seen from below, the floor, pier and azimuth platform would hide the whole telescope: fade them
const FLOOR_TOP = -0.6;
const baseMats = [MAT.floor, MAT.concrete, (azimuth.getObjectByName('platform') as THREE.Mesh).material as THREE.Material];
let baseFaded = false;
function fadeBase(fade: boolean) {
  if (fade === baseFaded) return;
  baseFaded = fade;
  for (const m of baseMats) {
    m.transparent = fade;
    m.opacity = fade ? 0.18 : 1;
    m.depthWrite = !fade;
    m.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- rays
const rays = new RayBundle();
tel.ota.add(rays.object);
const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
spot.scale.setScalar(0.06);
spot.renderOrder = 11;
tel.ota.add(spot);
const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
star.scale.setScalar(2.2);
tel.ota.add(star);

type Landing = { x: number; y: number; ok: number; total: number; blocked: Record<string, number> };
type Traced = { rays: RayData; landing: Landing };
// Baked traces, keyed by every input of the trace: going back to a configuration already seen
// costs nothing (moving the star or the density back and forth), and the 2 MB budget
// (≈ 130 default fans, or ≈ 15 of the densest 3D bundles) bounds the memory the cache can hold.
const traces = new TraceCache<Traced>(2 * 1024 * 1024, (t) => rayBytes(t.rays) + 256);
let landing: Landing = { x: 0, y: 0, ok: 0, total: 0, blocked: {} };
let head = 0;

function fieldAngles() {
  const th = (state.fieldAngle * Math.PI) / 180;
  const az = (state.fieldAz * Math.PI) / 180;
  return [th * Math.cos(az), th * Math.sin(az)] as const;
}

function trace(): Traced {
  const rubin = Rubin.forBand(BAND);
  const [thx, thy] = fieldAngles();
  const out = new RayBuilder();
  const blocked: Record<string, number> = {};
  let x = 0;
  let y = 0;
  let ok = 0;
  let total = 0;
  // each ray is baked into typed arrays as soon as it is traced, then dropped
  rubin.forEachStarRay(thx, thy, { rings: state.rings, perRing: state.rings * 3, startZ: 12.5, rInner: 2.2, rOuter: 4.25, pattern: 'bundle', fanAngle: 0 }, (r) => {
    out.add(r);
    total++;
    if (!r.ok) {
      const k = r.stoppedBy ?? '?';
      blocked[k] = (blocked[k] ?? 0) + 1;
      return;
    }
    const p = r.points[r.points.length - 1];
    x += p[0];
    y += p[1];
    ok++;
  });
  return { rays: out.finish(), landing: { x: x / (ok || 1), y: y / (ok || 1), ok, total, blocked } };
}

function retrace() {
  // cache key: EVERY setting that changes the trace must be in it, or stale rays are shown
  const k = [state.fieldAngle.toFixed(3), state.fieldAz.toFixed(2), state.rings].join('|');
  const t = traces.get(k, trace);
  rays.setData(t.rays);
  landing = t.landing;
  const rubin = Rubin.forBand(BAND);
  const col = new THREE.Color(BAND_HEX[BAND]);
  rays.material.uniforms.uColor.value.copy(col);
  spot.material.color.copy(col).multiplyScalar(2);
  spot.position.copy(ocs(landing.x, landing.y, rubin.surfaces.Detector.z0 - 0.002));
  const [thx, thy] = fieldAngles();
  const d = Rubin.fieldDirection(thx, thy);
  star.position.copy(ocsv([-d[0] * 60, -d[1] * 60, -d[2] * 60]));
  updateInfo();
  drawInset();
}

// Slider drags fire many change events per frame: trace at most once per frame.
let retracePending = false;
function requestRetrace() {
  retracePending = true;
}

// ---------------------------------------------------------------- labels
const updateLabels = createLabels(tel.labels, camera, controls, { defaultParent: tel.ota, margin: 1.05, visible: (_l, dist) => dist < 45 });

// ---------------------------------------------------------------- info panel & focal-plane inset
const info = document.getElementById('info')!;
function updateInfo() {
  const b = BAND_INFO[BAND];
  const ccd = ccdAt(landing.x, landing.y);
  const r = Math.hypot(landing.x, landing.y);
  const blockedTxt = Object.entries(landing.blocked)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${prettyObsc(k)} ${v}`)
    .join(', ');
  const travelNs = ((rays.meanOkLength - (12.5 - 9.818)) / 0.299792458).toFixed(0);
  info.innerHTML = `
    <div class="band" style="--c:${BAND_HEX[BAND]}">${BAND}<span>${b.range} · ${b.note}${b.falseColour ? ' (false colour)' : ''}</span></div>
    <div>Star at <b>${state.fieldAngle.toFixed(2)}°</b> from the centre of the field</div>
    <div>Lands at <b>${(landing.x * 1e3).toFixed(1)}, ${(landing.y * 1e3).toFixed(1)} mm</b> (r = ${(r * 1e3).toFixed(1)} mm)</div>
    <div>Sensor: <b>${ccd ? `${ccd.raft} ${ccd.ccd}` : 'gap between CCDs'}</b></div>
    <div>Rays reaching detector: <b>${landing.ok}/${landing.total}</b>${blockedTxt ? ` <span class="k">blocked: ${blockedTxt}</span>` : ''}</div>
    <div class="k">Light needs ≈ ${travelNs} ns from the top of the telescope to the CCDs. Here it is slowed ≈ ${(299792458 / state.speed / 1e6).toFixed(0)} million ×.</div>`;
}
function prettyObsc(k: string) {
  if (k.startsWith('M2Baffle')) return 'M2 baffle';
  return ({ Spider: 'spider', CameraBody: 'camera', M1: 'M1 inner edge', M2: 'M2 edge', CenterCap: 'spindle', M1CaBaffle: 'M1 baffle', Center: 'centre baffle' } as Record<string, string>)[k] ?? k;
}

const inset = document.getElementById('inset') as HTMLCanvasElement;
const ictx = inset.getContext('2d')!;
const FP_HALF = 0.33;
// the CCD layout never changes: draw it once into an offscreen canvas, then only the spot moves
let insetBase: HTMLCanvasElement | null = null;
function drawInset() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const S = inset.clientWidth;
  const k = S / (2 * FP_HALF);
  const X = (x: number) => S / 2 + x * k;
  const Y = (y: number) => S / 2 - y * k;
  if (!insetBase || insetBase.width !== Math.round(S * dpr)) {
    insetBase = document.createElement('canvas');
    insetBase.width = insetBase.height = Math.round(S * dpr);
    const g = insetBase.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.arc(S / 2, S / 2, 0.317 * k, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#4a5070'; // one colour: the CCD types are detailed on the camera page
    for (const c of LAYOUT) {
      g.fillRect(X(c.cx - c.w / 2), Y(c.cy + c.h / 2), c.w * k, c.h * k);
    }
    inset.width = inset.height = insetBase.width;
  }
  ictx.setTransform(1, 0, 0, 1, 0, 0);
  ictx.clearRect(0, 0, inset.width, inset.height);
  ictx.drawImage(insetBase, 0, 0);
  ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // spot
  const col = BAND_HEX[BAND];
  ictx.fillStyle = col;
  ictx.shadowColor = col;
  ictx.shadowBlur = 10;
  ictx.beginPath();
  ictx.arc(X(landing.x), Y(landing.y), 4, 0, Math.PI * 2);
  ictx.fill();
  ictx.shadowBlur = 0;
}
inset.addEventListener('pointerdown', (e) => {
  const rect = inset.getBoundingClientRect();
  const S = rect.width;
  const k = S / (2 * FP_HALF);
  const x = (e.clientX - rect.left - S / 2) / k;
  const y = -(e.clientY - rect.top - S / 2) / k;
  // focal-plane position → field angle (EFL ≈ 10.31 m; images are not inverted along this path)
  const EFL = 10.31;
  const ang = (Math.hypot(x, y) / EFL) * (180 / Math.PI);
  state.fieldAngle = Math.round(Math.min(1.75, ang) * 100) / 100;
  state.fieldAz = Math.round((Math.atan2(y, x) * 180) / Math.PI);
  requestRetrace();
});

// ---------------------------------------------------------------- views
type View = { pos: [number, number, number]; tgt: [number, number, number]; cut?: boolean; glass?: boolean };
const VIEWS: Record<string, View> = {
  Overview: { pos: [19, 10, 22], tgt: [0, 3.5, 0] },
  'Light path (side)': { pos: [1.5, 5, 21], tgt: [0, 4, 0], cut: true },
  'Top end & M2': { pos: [7.5, 13.5, 8.5], tgt: [0, 6.5, 0] },
  'Inside the camera': { pos: [1.7, 4.0, 2.3], tgt: [0, 4.35, 0], cut: true },
  'Focal plane': { pos: [0.7, 3.95, 0.35], tgt: [0, 4.43, 0], cut: true, glass: false },
  'From the sky': { pos: [0.01, 32, 0.01], tgt: [0, 0, 0] },
};
const tween = new CameraTween(camera, controls, 1400);
function goView(name: string) {
  const v = VIEWS[name];
  tween.start(tel.ota.localToWorld(new THREE.Vector3(...v.pos)), tel.ota.localToWorld(new THREE.Vector3(...v.tgt)));
  state.glass = v.glass ?? true;
  if (v.cut !== undefined) state.cutaway = v.cut;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// ---------------------------------------------------------------- GUI
const gui = new GUI({ title: 'Simonyi Telescope' });
if (window.innerWidth < 720) gui.close();
const fLight = gui.addFolder('Light');
fLight.add(state, 'rings', 3, 14, 1).name('ray density').onChange(requestRetrace);
fLight.add(state, 'speed', 0.2, 8, 0.1).name('light speed (m/s)').onChange(updateInfo);
fLight.add(state, 'continuous').name('continuous light');
fLight.add({ fire: () => ((state.continuous = false), (head = 0), gui.controllersRecursive().forEach((c) => c.updateDisplay())) }, 'fire').name('▶ send one wavefront');
fLight.add(state, 'showPaths').name('show full paths');
const fView = gui.addFolder('View');
for (const k of Object.keys(VIEWS)) fView.add({ [k]: () => goView(k) }, k);
fView.add(state, 'cutaway').name('cutaway');
fView.add(state, 'labels').name('labels');
fView.add(state, 'glass').name('lenses & filters');
fView.add(state, 'mount').name('mount (approx.)');
fView.add(state, 'bloom', 0, 2, 0.05).name('glow').onChange((v: number) => (bloom!.strength = v));
const fPoint = gui.addFolder('Pointing');
// preset pointings: the elevation slider glides to the target (ease in-out); dragging it cancels
const POINTINGS: Record<string, number> = { Zenith: 90, '35° elevation': 35, Horizon: 0 };
let slew: { from: number; to: number; t: number; dur: number } | null = null;
fPoint.add(state, 'elevation', 0, 90, 0.5).name('elevation (°)').onChange(() => (slew = null));
fPoint.add(state, 'azimuth', -270, 270, 1).name('azimuth (°)');
for (const [name, el] of Object.entries(POINTINGS))
  fPoint.add({ [name]: () => (slew = { from: state.elevation, to: el, t: 0, dur: 1 + Math.abs(el - state.elevation) / 30 }) }, name);

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  if (retracePending) {
    retracePending = false;
    retrace();
  }
  const dt = Math.min(clock.getDelta(), 0.05);
  head += dt * state.speed;
  const u = rays.material.uniforms;
  u.uContinuous.value = state.continuous ? 1 : 0;
  u.uHead.value = head;
  u.uBase.value = state.showPaths ? 0.07 : 0.0;
  if (!state.continuous && head > rays.maxDist + 6) head = rays.maxDist + 6;
  // spot brightness follows arrivals
  const arrival = state.continuous ? 1 : Math.max(0, Math.min(1, (head - rays.meanOkLength) / 0.3)) * Math.exp(-Math.max(0, head - rays.meanOkLength - 0.3) / 2);
  spot.material.opacity = arrival;

  // pointing: preset slews drive the elevation slider, which the tube follows (eased)
  if (slew) {
    slew.t = Math.min(1, slew.t + dt / slew.dur);
    const e = slew.t * slew.t * (3 - 2 * slew.t);
    state.elevation = Math.round((slew.from + (slew.to - slew.from) * e) * 10) / 10;
    fPoint.controllers[0].updateDisplay();
    if (slew.t === 1) slew = null;
  }
  const ease = 1 - Math.exp(-dt * 5);
  elGroup.rotation.x += (THREE.MathUtils.degToRad(90 - state.elevation) - elGroup.rotation.x) * ease;
  azGroup.rotation.y += (THREE.MathUtils.degToRad(-state.azimuth) - azGroup.rotation.y) * ease;
  pier.visible = azimuth.visible = state.mount;
  fadeBase(camera.position.y < FLOOR_TOP);
  tel.groups.lenses.visible = tel.groups.filter.visible = state.glass;

  // cutaway plane always faces the viewer, through the optical axis
  faceCutPlane(cutPlane, tel.ota, camera, state.cutaway);

  tween.update();
  controls.update();
  composer.render();
  updateLabels(state.labels);
  requestAnimationFrame(frame);
}
onResize.push(drawInset);

retrace();
goView('Overview');
frame();
(window as any).__rubin = { state, retrace, goView, camera, controls, renderer, traces };
