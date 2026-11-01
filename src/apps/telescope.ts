import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import { Rubin, Band, BANDS, TraceResult } from '../optics/trace';
import { buildTelescope } from '../scene/telescope';
import { cutPlane, MAT } from '../scene/materials';
import { RayBundle } from '../scene/rays';
import { ocs, ocsv, tube } from '../scene/util';
import { LAYOUT, ccdAt } from '../scene/focalplane';
import '../style.css';

const BAND_INFO: Record<Band, { name: string; color: string; range: string; note: string }> = {
  u: { name: 'u', color: '#9b6bff', range: '320–390 nm', note: 'near-ultraviolet' },
  g: { name: 'g', color: '#34b8ff', range: '400–550 nm', note: 'blue-green' },
  r: { name: 'r', color: '#ff6a2e', range: '550–690 nm', note: 'red' },
  i: { name: 'i', color: '#ff2f5e', range: '690–820 nm', note: 'near-infrared (false colour)' },
  z: { name: 'z', color: '#e04bff', range: '820–925 nm', note: 'infrared (false colour)' },
  y: { name: 'y', color: '#ffd43a', range: '930–1010 nm', note: 'infrared (false colour)' },
};

const ELEV_AXIS_ABOVE_M1 = 1.69; // inferred from the M1M3 actuator table (to be checked vs CAD)
const AXIS_HEIGHT = 7.0; // APPROX: elevation axis above the azimuth floor

// ---------------------------------------------------------------- renderer & scene
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.02, 2000);
camera.position.set(17, 12, 19);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
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
const state = {
  band: 'r' as Band,
  fieldAngle: 1.0,
  fieldAz: 0,
  pattern: 'fan' as 'fan' | 'bundle',
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

let rubin = new Rubin(state.band);
const tel = buildTelescope(rubin);
const azGroup = new THREE.Group();
const elGroup = new THREE.Group();
elGroup.position.y = AXIS_HEIGHT;
tel.ota.position.y = -ELEV_AXIS_ABOVE_M1;
elGroup.add(tel.ota);
azGroup.add(elGroup);
scene.add(azGroup);

// Mount & pier placeholder (APPROX: TMA envelope to be replaced by the NOIRLab CAD)
const mount = new THREE.Group();
{
  const pier = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 15.65, 96, 1, true), MAT.concrete);
  pier.position.y = -0.6 - 15.65 / 2;
  mount.add(pier);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.3, 96), MAT.floor);
  floor.position.y = -0.75;
  scene.add(floor);
  const azPlat = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.4, 0.6, 96), MAT.paintBlue);
  azPlat.position.y = -0.3;
  azGroup.add(azPlat);
  for (const sg of [-1, 1]) {
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.2, AXIS_HEIGHT + 0.6, 3.2), MAT.paint);
    yoke.position.set(sg * 6.6, (AXIS_HEIGHT - 0.6) / 2 + 0.3, 0);
    azGroup.add(yoke);
    const trunnion = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.9, 64), MAT.steelSolid);
    trunnion.rotation.z = Math.PI / 2;
    trunnion.position.set(sg * 5.95, AXIS_HEIGHT, 0);
    azGroup.add(trunnion);
  }
}
scene.add(mount);

// ---------------------------------------------------------------- rays
const rays = new RayBundle();
tel.ota.add(rays.object);
const spot = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
);
spot.scale.setScalar(0.06);
spot.renderOrder = 11;
tel.ota.add(spot);
const star = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
);
star.scale.setScalar(2.2);
tel.ota.add(star);

let lastResults: TraceResult[] = [];
let landing = { x: 0, y: 0, ok: 0, total: 0, blocked: {} as Record<string, number> };
let head = 0;

function retrace() {
  rubin = new Rubin(state.band);
  const th = (state.fieldAngle * Math.PI) / 180;
  const az = (state.fieldAz * Math.PI) / 180;
  const thx = th * Math.cos(az);
  const thy = th * Math.sin(az);
  lastResults = rubin.traceStar(thx, thy, { rings: state.rings, perRing: state.rings * 3, startZ: 12.5, rInner: 2.2, rOuter: 4.25, pattern: state.pattern, fanAngle: 0 });
  rays.set(lastResults);
  const col = new THREE.Color(BAND_INFO[state.band].color);
  rays.material.uniforms.uColor.value.copy(col);
  (spot.material as THREE.SpriteMaterial).color.copy(col).multiplyScalar(2);
  const okR = lastResults.filter((r) => r.ok);
  const blocked: Record<string, number> = {};
  for (const r of lastResults) if (!r.ok) blocked[r.stoppedBy ?? '?'] = (blocked[r.stoppedBy ?? '?'] ?? 0) + 1;
  let x = 0;
  let y = 0;
  for (const r of okR) {
    const p = r.points[r.points.length - 1];
    x += p[0];
    y += p[1];
  }
  x /= okR.length || 1;
  y /= okR.length || 1;
  landing = { x, y, ok: okR.length, total: lastResults.length, blocked };
  spot.position.copy(ocs(x, y, rubin.surfaces.Detector.z0 - 0.002));
  const d = Rubin.fieldDirection(thx, thy);
  star.position.copy(ocsv([-d[0] * 60, -d[1] * 60, -d[2] * 60]));
  tel.setBand(rubin);
  updateInfo();
  drawInset();
}

// ---------------------------------------------------------------- post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), state.bloom, 0.3, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- labels
const labelLayer = document.getElementById('labels')!;
const tip = document.getElementById('tip')!;
const labelEls = tel.labels.map((l) => {
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
    tel.ota.localToWorld(tmpV);
    const dist = tmpV.distanceTo(camera.position);
    tmpV.project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05 && dist < 45;
    el.style.display = vis ? 'block' : 'none';
    if (vis) el.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px)`;
  }
}

// ---------------------------------------------------------------- info panel & focal-plane inset
const info = document.getElementById('info')!;
function updateInfo() {
  const b = BAND_INFO[state.band];
  const ccd = ccdAt(landing.x, landing.y);
  const r = Math.hypot(landing.x, landing.y);
  const blockedTxt = Object.entries(landing.blocked)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${prettyObsc(k)} ${v}`)
    .join(', ');
  const travelNs = ((rays.meanOkLength - (12.5 - 9.818)) / 0.299792458).toFixed(0);
  info.innerHTML = `
    <div class="band" style="--c:${b.color}">${b.name}<span>${b.range} · ${b.note}</span></div>
    <div>Star at <b>${state.fieldAngle.toFixed(2)}°</b> from the centre of the field</div>
    <div>Lands at <b>${(landing.x * 1e3).toFixed(1)}, ${(landing.y * 1e3).toFixed(1)} mm</b> (r = ${(r * 1e3).toFixed(1)} mm)</div>
    <div>Sensor: <b>${ccd ? `${ccd.raft} ${ccd.ccd}` : 'gap between CCDs'}</b>${ccd ? ` <span class="k">${kindName(ccd.kind)}</span>` : ''}</div>
    <div>Rays reaching detector: <b>${landing.ok}/${landing.total}</b>${blockedTxt ? ` <span class="k">blocked: ${blockedTxt}</span>` : ''}</div>
    <div class="k">Light needs ≈ ${travelNs} ns from the top of the telescope to the CCDs. Here it is slowed ≈ ${(299792458 / state.speed / 1e6).toFixed(0)} million ×.</div>`;
}
function prettyObsc(k: string) {
  if (k.startsWith('M2Baffle')) return 'M2 baffle';
  return ({ Spider: 'spider', CameraBody: 'camera', M1: 'M1 inner edge', M2: 'M2 edge', CenterCap: 'spindle', M1CaBaffle: 'M1 baffle', Center: 'centre baffle' } as Record<string, string>)[k] ?? k;
}
function kindName(k: string) {
  return ({ e2v: 'Teledyne e2v CCD250', itl: 'ITL STA3800', guider: 'guide sensor', wfs: 'wavefront sensor' } as Record<string, string>)[k];
}

const inset = document.getElementById('inset') as HTMLCanvasElement;
const ictx = inset.getContext('2d')!;
const FP_HALF = 0.33;
function drawInset() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const S = inset.clientWidth;
  inset.width = S * dpr;
  inset.height = S * dpr;
  ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ictx.clearRect(0, 0, S, S);
  const k = S / (2 * FP_HALF);
  const X = (x: number) => S / 2 + x * k;
  const Y = (y: number) => S / 2 - y * k;
  ictx.strokeStyle = 'rgba(255,255,255,0.25)';
  ictx.beginPath();
  ictx.arc(S / 2, S / 2, 0.317 * k, 0, Math.PI * 2);
  ictx.stroke();
  for (const c of LAYOUT) {
    ictx.fillStyle = c.kind === 'e2v' ? '#4b3a8c' : c.kind === 'itl' ? '#7a6436' : c.kind === 'wfs' ? '#2f7a69' : '#8a7444';
    ictx.fillRect(X(c.cx - c.w / 2), Y(c.cy + c.h / 2), c.w * k, c.h * k);
  }
  // spot
  const col = BAND_INFO[state.band].color;
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
  state.fieldAngle = Math.min(1.75, ang);
  state.fieldAz = (Math.atan2(y, x) * 180) / Math.PI;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  retrace();
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
let tween: { start: number; t: number; p0: THREE.Vector3; p1: THREE.Vector3; q0: THREE.Vector3; q1: THREE.Vector3 } | null = null;
function goView(name: string) {
  const v = VIEWS[name];
  const p1 = tel.ota.localToWorld(new THREE.Vector3(...v.pos));
  const q1 = tel.ota.localToWorld(new THREE.Vector3(...v.tgt));
  tween = { start: performance.now(), t: 0, p0: camera.position.clone(), p1, q0: controls.target.clone(), q1 };
  state.glass = v.glass ?? true;
  if (v.cut !== undefined) state.cutaway = v.cut;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// ---------------------------------------------------------------- GUI
const gui = new GUI({ title: 'Simonyi Telescope' });
if (window.innerWidth < 720) gui.close();
const fLight = gui.addFolder('Light');
fLight.add(state, 'band', BANDS).name('filter').onChange(retrace);
fLight.add(state, 'fieldAngle', 0, 1.75, 0.01).name('star offset (°)').onChange(retrace);
fLight.add(state, 'fieldAz', -180, 180, 1).name('star direction (°)').onChange(retrace);
fLight.add(state, 'pattern', { 'fan (one slice)': 'fan', '3D bundle': 'bundle' }).name('rays').onChange(retrace);
fLight.add(state, 'rings', 3, 14, 1).name('ray density').onChange(retrace);
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
fView.add(state, 'bloom', 0, 2, 0.05).name('glow').onChange((v: number) => (bloom.strength = v));
const fPoint = gui.addFolder('Pointing');
fPoint.add(state, 'elevation', 15, 90, 0.5).name('elevation (°)');
fPoint.add(state, 'azimuth', -270, 270, 1).name('azimuth (°)');

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const axisW = new THREE.Vector3();
const originW = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  head += dt * state.speed;
  const u = rays.material.uniforms;
  u.uContinuous.value = state.continuous ? 1 : 0;
  u.uHead.value = head;
  u.uBase.value = state.showPaths ? 0.07 : 0.0;
  if (!state.continuous && head > rays.maxDist + 6) head = rays.maxDist + 6;
  // spot brightness follows arrivals
  const arrival = state.continuous ? 1 : Math.max(0, Math.min(1, (head - rays.meanOkLength) / 0.3)) * Math.exp(-Math.max(0, head - rays.meanOkLength - 0.3) / 2);
  (spot.material as THREE.SpriteMaterial).opacity = arrival;

  // pointing (eased)
  elGroup.rotation.x += (THREE.MathUtils.degToRad(90 - state.elevation) - elGroup.rotation.x) * 0.08;
  azGroup.rotation.y += (THREE.MathUtils.degToRad(-state.azimuth) - azGroup.rotation.y) * 0.08;
  mount.visible = state.mount;
  tel.groups.lenses.visible = tel.groups.filter.visible = state.glass;
  azGroup.children.forEach((c) => c !== elGroup && (c.visible = state.mount));

  // cutaway plane always faces the viewer, through the optical axis
  tel.ota.updateMatrixWorld();
  originW.setFromMatrixPosition(tel.ota.matrixWorld);
  axisW.set(0, 1, 0).transformDirection(tel.ota.matrixWorld);
  if (state.cutaway) {
    const v = camera.position.clone().sub(originW);
    v.addScaledVector(axisW, -v.dot(axisW)).normalize();
    cutPlane.normal.copy(v).negate();
    cutPlane.constant = -cutPlane.normal.dot(originW);
  } else {
    cutPlane.normal.set(0, 1, 0);
    cutPlane.constant = 1e6;
  }

  if (tween) {
    tween.t = Math.min(1, (performance.now() - tween.start) / 1400);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.q0, tween.q1, e);
    if (tween.t >= 1) tween = null;
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
  drawInset();
});

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// unused helper kept for future dome work
void tube;

retrace();
goView('Overview');
frame();
(window as any).__rubin = { state, retrace, goView, camera, controls };
