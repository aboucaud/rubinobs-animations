import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import { Rubin } from '../optics/trace';
import { buildTelescope } from '../scene/telescope';
import { MAT } from '../scene/materials';
import { RayBundle } from '../scene/rays';
import { buildObservatory, SITE, domeCut } from '../scene/observatory';
import '../style.css';

const ELEV_AXIS_ABOVE_M1 = 1.69;
const AXIS_ABOVE_FLOOR = 7.0; // APPROX (same as the telescope page)
const TIME_SCALE = 6; // animation runs 6× faster than reality during the survey

// ---------------------------------------------------------------- renderer & scene
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 20000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxDistance = 1500;
controls.minDistance = 2;
controls.maxPolarAngle = Math.PI * 0.495;

// sky + sun
const sky = new Sky();
sky.scale.setScalar(15000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 2.2;
skyU.rayleigh.value = 1.3;
skyU.mieCoefficient.value = 0.004;
skyU.mieDirectionalG.value = 0.82;
// environment map rendered from the sky, so metal cladding reflects the right colours
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(1000);
envScene.add(envSky);
let envRT: THREE.WebGLRenderTarget | null = null;
let envDirty = true;
function updateEnv() {
  const u = envSky.material.uniforms;
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[k].value = skyU[k].value;
  u.sunPosition.value.copy(skyU.sunPosition.value);
  envRT?.dispose();
  envRT = pmrem.fromScene(envScene, 0, 1, 2000);
  scene.environment = envRT.texture;
  envDirty = false;
}
const sun = new THREE.DirectionalLight(0xffffff, 3);
scene.add(sun);
scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xb8cbe8, 0x5a4636, 0.8);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x8fa6d8, 0.0);
moon.position.set(-200, 300, 150);
scene.add(moon);
// dim work light inside the dome (for visibility at night)
const domeLight = new THREE.PointLight(0xc8d8ff, 0, 60, 1.5);
domeLight.position.set(0, 34, -6);
scene.add(domeLight);
scene.fog = new THREE.Fog(0xb9c6d6, 1200, 9000);

// night sky: stars + a Milky Way band
const stars = (() => {
  const n = 9000;
  const p = new Float32Array(n * 3);
  const c = new Float32Array(n * 3);
  const band = new THREE.Vector3(0.3, 0.55, 0.78).normalize();
  for (let i = 0; i < n; i++) {
    let v: THREE.Vector3;
    if (i < n * 0.45) {
      // concentrate along a great circle (galactic plane)
      const a = Math.random() * Math.PI * 2;
      const t1 = new THREE.Vector3(1, 0, 0).cross(band).normalize();
      const t2 = band.clone().cross(t1);
      v = t1.multiplyScalar(Math.cos(a)).add(t2.multiplyScalar(Math.sin(a))).addScaledVector(band, (Math.random() - 0.5) * 0.25).normalize();
    } else {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      v = new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t));
    }
    if (v.y < -0.05) v.y = -v.y;
    p.set([v.x * 12000, v.y * 12000, v.z * 12000], i * 3);
    const w = 0.35 + Math.random() ** 3 * 0.9;
    const tint = Math.random();
    c.set([w * (0.85 + 0.15 * tint), w * 0.92, w * (1.05 - 0.15 * tint)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = -1;
  scene.add(pts);
  return pts;
})();

// ---------------------------------------------------------------- observatory + telescope
const obs = buildObservatory();
scene.add(obs.root);

const rubin = new Rubin('r');
const tel = buildTelescope(rubin);
const azGroup = new THREE.Group();
azGroup.position.y = SITE.azFloor;
const elGroup = new THREE.Group();
elGroup.position.y = AXIS_ABOVE_FLOOR;
tel.ota.position.y = -ELEV_AXIS_ABOVE_M1;
elGroup.add(tel.ota);
azGroup.add(elGroup);
scene.add(azGroup);
// mount placeholder (same as the telescope page)
{
  const azPlat = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.4, 0.6, 96), MAT.paintBlue);
  azPlat.position.y = -0.3;
  azGroup.add(azPlat);
  for (const sg of [-1, 1]) {
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.2, AXIS_ABOVE_FLOOR + 0.6, 3.2), MAT.paint);
    yoke.position.set(sg * 6.6, (AXIS_ABOVE_FLOOR - 0.6) / 2 + 0.3, 0);
    azGroup.add(yoke);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.9, 64), MAT.steelSolid);
    tr.rotation.z = Math.PI / 2;
    tr.position.set(sg * 5.95, AXIS_ABOVE_FLOOR, 0);
    azGroup.add(tr);
  }
}

// starlight: a glowing column along the optical axis, plus live-traced rays inside the telescope
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uOpacity; uniform float uTime; varying vec2 vUv;
    void main(){
      float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
      float flow = 0.75 + 0.25 * sin(vUv.y * 40.0 + uTime * 6.0);
      gl_FragColor = vec4(vec3(1.0, 0.82, 0.62) * uOpacity * fade * flow * 0.22, 1.0);
    }`,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const beam = new THREE.Mesh(new THREE.CylinderGeometry(4.18, 4.18, 70, 64, 1, true), beamMat);
beam.position.y = 9.9 + 35; // from the top of the telescope up into the sky (OTA frame)
beam.renderOrder = 9;
tel.ota.add(beam);
const rays = new RayBundle();
rays.set(rubin.traceStar(0.004, 0.0, { rings: 6, startZ: 14, rInner: 2.3, rOuter: 4.15, pattern: 'fan', fanAngle: Math.PI / 2 }));
rays.material.uniforms.uColor.value.set('#ffb070');
rays.material.uniforms.uPeriod.value = 7;
rays.material.uniforms.uTail.value = 1.2;
tel.ota.add(rays.object);

// ---------------------------------------------------------------- state
const state = {
  time: 0.62, // 0 = midday, ~0.65 = sunset, 1 = night
  open: 0,
  vents: 0,
  wantOpen: false,
  observing: false,
  telAz: 0,
  telEl: 60,
  domeAz: 0,
  targetAz: 0,
  targetEl: 60,
  phase: 'idle' as 'idle' | 'slew' | 'settle' | 'expose',
  phaseT: 0,
  visits: 0,
  realClock: 0, // seconds of simulated night
  labels: true,
  cutaway: false,
  manualEl: 60,
  manualAz: 0,
};

const sunDir = new THREE.Vector3();
function sunElevation() {
  return 55 - state.time * 85;
}
function applyTimeOfDay() {
  const el = sunElevation();
  const e = THREE.MathUtils.degToRad(el);
  const az = THREE.MathUtils.degToRad(50);
  sunDir.set(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az));
  skyU.sunPosition.value.copy(sunDir);
  sun.position.copy(sunDir).multiplyScalar(500);
  const day = THREE.MathUtils.smoothstep(el, -6, 12);
  const low = 1 - THREE.MathUtils.smoothstep(el, 0, 25);
  sun.intensity = 3.2 * THREE.MathUtils.smoothstep(el, -2, 8);
  sun.color.setRGB(1, 0.92 - 0.3 * low, 0.82 - 0.45 * low);
  hemi.intensity = 0.3 + 0.55 * day;
  hemi.color.setRGB(0.55 + 0.17 * day, 0.62 + 0.18 * day, 0.85);
  moon.intensity = 1.1 * (1 - day);
  domeLight.intensity = 60 * (1 - day);
  const night = 1 - THREE.MathUtils.smoothstep(el, -14, -3);
  (stars.material as THREE.PointsMaterial).opacity = night;
  stars.visible = night > 0.01;
  sky.visible = el > -16;
  scene.background = new THREE.Color(0x03050b);
  renderer.toneMappingExposure = 0.3 + 0.45 * (1 - day);
  const fogC = new THREE.Color().setRGB(0.72, 0.77, 0.84).multiplyScalar(0.08 + 0.92 * day);
  if (low > 0.5 && el > -6) fogC.lerp(new THREE.Color(0.9, 0.6, 0.45), 0.35 * day);
  (scene.fog as THREE.Fog).color.copy(fogC);
  scene.environmentIntensity = 0.15 + 0.6 * day;
  if (bloomRef) bloomRef.strength = 0.08 + 0.6 * (1 - day);
  envDirty = true;
}
let bloomRef: UnrealBloomPass | null = null;

// ---------------------------------------------------------------- survey logic
const angDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
function stepToward(cur: number, tgt: number, maxStep: number, wrap = false) {
  const d = wrap ? angDiff(tgt, cur) : tgt - cur;
  if (Math.abs(d) <= maxStep) return tgt;
  return cur + Math.sign(d) * maxStep;
}
function nextField() {
  if (Math.random() < 0.12) state.targetAz = state.telAz + (Math.random() - 0.5) * 220;
  else state.targetAz = state.telAz + (Math.random() < 0.5 ? -1 : 1) * (3.5 + Math.random() * 6);
  state.targetEl = THREE.MathUtils.clamp(state.telEl + (Math.random() - 0.5) * 14, 30, 84);
}

function tick(dt: number) {
  // doors & vents
  const targetOpen = state.wantOpen ? 1 : 0;
  state.open = stepToward(state.open, targetOpen, dt / 4);
  state.vents = stepToward(state.vents, state.wantOpen ? 1 : 0, dt / 2);
  obs.dome.setOpen(THREE.MathUtils.smoothstep(state.open, 0, 1));
  obs.dome.setVents(state.vents);

  if (state.observing && state.open > 0.99) {
    const sdt = dt * TIME_SCALE; // simulated seconds
    state.realClock += sdt;
    state.phaseT += sdt;
    if (state.phase === 'idle') {
      nextField();
      state.phase = 'slew';
      state.phaseT = 0;
    }
    // telescope: az 10.5°/s, el 5.25°/s; dome 1.5°/s
    state.telAz = stepToward(state.telAz, state.targetAz, 10.5 * sdt, true);
    state.telEl = stepToward(state.telEl, state.targetEl, 5.25 * sdt);
    state.domeAz = stepToward(state.domeAz, state.telAz, 1.5 * sdt, true);
    const onTarget = Math.abs(angDiff(state.telAz, state.targetAz)) < 0.01 && Math.abs(state.telEl - state.targetEl) < 0.01;
    const domeOk = Math.abs(angDiff(state.domeAz, state.telAz)) < 2.5;
    if (state.phase === 'slew' && onTarget && domeOk) {
      state.phase = 'settle';
      state.phaseT = 0;
    } else if (state.phase === 'settle' && state.phaseT > 1) {
      state.phase = 'expose';
      state.phaseT = 0;
    } else if (state.phase === 'expose' && state.phaseT > 32) {
      state.visits++;
      state.phase = 'idle';
    }
  } else if (!state.observing) {
    state.telAz = stepToward(state.telAz, state.manualAz, 10.5 * dt, true);
    state.telEl = stepToward(state.telEl, state.manualEl, 5.25 * dt);
    state.domeAz = stepToward(state.domeAz, state.telAz, 1.5 * dt * 4, true);
    state.phase = 'idle';
  }
  // apply pose
  azGroup.rotation.y = THREE.MathUtils.degToRad(-state.telAz);
  elGroup.rotation.x = THREE.MathUtils.degToRad(90 - state.telEl);
  obs.dome.group.rotation.y = THREE.MathUtils.degToRad(-state.domeAz);
  // light/wind screen follows the beam (in dome coordinates the telescope az offset is small)
  obs.dome.setLWS(state.telEl, state.open);
  // starlight
  const exposing = state.phase === 'expose' || (!state.observing && state.open > 0.99 && sunElevation() < -10);
  const target = exposing ? 1 : 0;
  beamMat.uniforms.uOpacity.value += (target - beamMat.uniforms.uOpacity.value) * Math.min(1, dt * 4);
  beamMat.uniforms.uTime.value += dt;
  beam.visible = beamMat.uniforms.uOpacity.value > 0.01;
  rays.object.visible = beam.visible;
  rays.material.uniforms.uHead.value += dt * 6;
  rays.material.uniforms.uIntensity.value = 2.5 * beamMat.uniforms.uOpacity.value;
  rays.material.uniforms.uBase.value = 0.05 * beamMat.uniforms.uOpacity.value;
}

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.4, 1.6);
composer.addPass(bloom);
bloomRef = bloom;
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- labels
type L = { title: string; text: string; pos: THREE.Vector3; parent: THREE.Object3D };
const LABELS: L[] = [
  ...obs.dome.labels.map((l) => ({ ...l, parent: obs.dome.group })),
  { title: 'Lower enclosure', text: 'Fixed concrete drum, 30 m across. The dome rotates on bogies on top of it; the telescope pier rises inside, isolated from the building.', pos: new THREE.Vector3(SITE.drumR, 8, 4), parent: obs.root },
  { title: 'Service & operations building', text: 'About 3,000 m²: control room, mirror coating chamber, clean room for the camera, and an 80-tonne platform lift that carries mirrors and the camera up to the telescope floor.', pos: new THREE.Vector3(60, 22, 0), parent: obs.root },
  { title: 'Auxiliary Telescope', text: 'A 1.2 m telescope on its own hill. It takes spectra of bright stars all night to measure how much the atmosphere dims each colour.', pos: new THREE.Vector3(-95, 18, 70), parent: obs.root },
  { title: 'Simonyi Survey Telescope', text: '8.4 m primary mirror, 350 t moving mass. It slews 3.5° and settles in about 5 s, then takes a 30 s exposure, around 1,000 times a night.', pos: new THREE.Vector3(0, 10, 0), parent: tel.ota },
];
const labelLayer = document.getElementById('labels')!;
const tip = document.getElementById('tip')!;
const labelEls = LABELS.map((l) => {
  const el = document.createElement('button');
  el.className = 'label';
  el.textContent = l.title;
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
  const camD = camera.position.distanceTo(controls.target);
  for (const { l, el } of labelEls) {
    tmpV.copy(l.pos);
    l.parent.localToWorld(tmpV);
    const d = tmpV.distanceTo(camera.position);
    tmpV.project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.02 && Math.abs(tmpV.y) < 1.02 && d < 1.7 * camD + 20;
    el.style.display = vis ? 'block' : 'none';
    if (vis) el.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px)`;
  }
}

// ---------------------------------------------------------------- HUD & bar
const info = document.getElementById('info')!;
function fmtClock(sec: number) {
  const t = 21 * 3600 + 30 * 60 + sec; // the night starts at 21:30
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function updateHud() {
  const el = sunElevation();
  const tod = el > 8 ? 'Day' : el > -6 ? 'Sunset' : 'Night';
  const phase = state.observing
    ? state.phase === 'expose'
      ? `Exposing: ${Math.min(30, Math.max(0, state.phaseT - 1)).toFixed(0)} / 30 s`
      : state.phase === 'settle'
        ? 'Settling'
        : 'Slewing to the next field'
    : state.open > 0.99
      ? 'Dome open, telescope parked on a star'
      : state.wantOpen
        ? 'Opening the dome'
        : 'Dome closed';
  info.innerHTML = `
    <div class="band" style="--c:#7fd6d8">${tod}<span>Cerro Pachón, Chile · 2,650 m</span></div>
    <div>${phase}</div>
    <div>Telescope az <b>${(((state.telAz % 360) + 360) % 360).toFixed(1)}°</b> el <b>${state.telEl.toFixed(1)}°</b> · Dome az <b>${(((state.domeAz % 360) + 360) % 360).toFixed(1)}°</b></div>
    ${state.observing ? `<div>Visits tonight: <b>${state.visits}</b> · local time <b>${fmtClock(state.realClock)}</b> <span class="k">(×${TIME_SCALE} speed)</span></div>` : ''}
    <div class="k">The telescope slews at up to 10.5°/s; the dome only manages 1.5°/s, so it is kept moving to stay ahead.</div>`;
  (document.getElementById('bOpen') as HTMLButtonElement).textContent = state.wantOpen ? 'Close the dome' : 'Open the dome';
  (document.getElementById('bObs') as HTMLButtonElement).textContent = state.observing ? '■ Stop the survey' : '▶ Start the survey';
}
const bar = document.getElementById('bar')!;
bar.innerHTML = `
  <button id="bObs" class="primary">▶ Start the survey</button>
  <button id="bOpen">Open the dome</button>
  <span class="sep">Time</span>
  <button data-t="0.15">Day</button><button data-t="0.63">Sunset</button><button data-t="1">Night</button>
  <label class="slider"><input id="tod" type="range" min="0" max="1" step="0.005" value="${state.time}"></label>`;
const tod = document.getElementById('tod') as HTMLInputElement;
tod.oninput = () => {
  state.time = parseFloat(tod.value);
  applyTimeOfDay();
};
bar.querySelectorAll<HTMLButtonElement>('button[data-t]').forEach((b) => {
  b.onclick = () => {
    animTime = parseFloat(b.dataset.t!);
  };
});
let animTime: number | null = null;
document.getElementById('bOpen')!.onclick = () => {
  state.wantOpen = !state.wantOpen;
  if (!state.wantOpen) state.observing = false;
  updateHud();
};
document.getElementById('bObs')!.onclick = () => {
  state.observing = !state.observing;
  if (state.observing) {
    state.wantOpen = true;
    if (state.time < 0.9) animTime = 1;
    state.phase = 'idle';
  } else {
    state.manualAz = state.telAz;
    state.manualEl = state.telEl;
  }
  updateHud();
};

// ---------------------------------------------------------------- views
type View = { pos: THREE.Vector3; tgt: THREE.Vector3; cut?: boolean; domeFrame?: boolean };
const VIEWS: Record<string, View> = {
  Summit: { pos: new THREE.Vector3(150, 85, 200), tgt: new THREE.Vector3(25, 12, 0) },
  'Aerial (south-east)': { pos: new THREE.Vector3(-70, 110, 190), tgt: new THREE.Vector3(25, 8, 10) },
  Dome: { pos: new THREE.Vector3(-48, 46, 62), tgt: new THREE.Vector3(0, 30, 0), domeFrame: true },
  'Into the slit': { pos: new THREE.Vector3(0, 70, 52), tgt: new THREE.Vector3(0, 27, 0), domeFrame: true },
  'Inside (cutaway)': { pos: new THREE.Vector3(-46, 34, 22), tgt: new THREE.Vector3(0, 26, 0), cut: true, domeFrame: true },
  'Telescope at work': { pos: new THREE.Vector3(-20, 33, 16), tgt: new THREE.Vector3(0, 27, 0), cut: true, domeFrame: true },
};
let tween: { start: number; p0: THREE.Vector3; p1: THREE.Vector3; q0: THREE.Vector3; q1: THREE.Vector3 } | null = null;
function goView(name: string) {
  const v = VIEWS[name];
  const rot = v.domeFrame ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-state.domeAz)) : new THREE.Quaternion();
  tween = { start: performance.now(), p0: camera.position.clone(), p1: v.pos.clone().applyQuaternion(rot), q0: controls.target.clone(), q1: v.tgt.clone().applyQuaternion(rot) };
  state.cutaway = !!v.cut;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
const gui = new GUI({ title: 'Observatory' });
if (window.innerWidth < 720) gui.close();
const fv = gui.addFolder('Views');
for (const k of Object.keys(VIEWS)) fv.add({ [k]: () => goView(k) }, k);
const fd = gui.addFolder('Display');
fd.add(state, 'cutaway').name('cut the dome open');
fd.add(state, 'labels').name('labels');
fd.add(bloom, 'strength', 0, 2, 0.05).name('glow');
const fp = gui.addFolder('Pointing (when not surveying)');
fp.add(state, 'manualEl', 15, 90, 0.5).name('elevation (°)');
fp.add(state, 'manualAz', -270, 270, 1).name('azimuth (°)');

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let hudT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (animTime !== null) {
    state.time = stepToward(state.time, animTime, dt * 0.25);
    tod.value = String(state.time);
    applyTimeOfDay();
    if (state.time === animTime) animTime = null;
  }
  tick(dt);
  if (envDirty && !tween) updateEnv();
  hudT += dt;
  if (hudT > 0.15) {
    hudT = 0;
    updateHud();
  }
  // dome cutaway: vertical plane through the dome axis, facing the viewer
  if (state.cutaway) {
    const v = camera.position.clone();
    v.y = 0;
    v.normalize();
    domeCut.normal.copy(v).negate();
    domeCut.constant = 0;
  } else {
    domeCut.normal.set(0, 1, 0);
    domeCut.constant = 1e6;
  }
  if (tween) {
    const t = Math.min(1, (performance.now() - tween.start) / 1600);
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

applyTimeOfDay();
camera.position.copy(VIEWS.Summit.pos);
controls.target.copy(VIEWS.Summit.tgt);
updateHud();
frame();
(window as any).__rubin = {
  state,
  goView,
  applyTimeOfDay,
  advance: (sec: number) => {
    for (let t = 0; t < sec; t += 0.05) tick(0.05);
  },
};
