// Boilerplate shared by every animation page: renderer, scene, camera, orbit controls,
// output pass (tone mapping, sRGB), clickable 3D labels, camera fly-to tweens and the viewer-facing cutaway plane.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import '../style.css';

// ---------------------------------------------------------------- phone layout
/**
 * Phones, in portrait (narrow) or landscape (short). The single source of truth: it toggles
 * `body.phone`, which every phone rule in style.css keys on, so CSS and JS always agree.
 */
const PHONE = window.matchMedia('(max-width: 720px), (max-height: 500px)');
export const isPhone = () => PHONE.matches;

/**
 * Phone layout for any page (3D or 2D). On a phone the #info panel shows only its key line
 * (`.band` and any `.key` child); tapping it shows the rest. `--bar-h` tracks the height of the
 * bottom #bar so panels can sit just above it.
 */
export function initPhoneLayout() {
  const apply = () => document.body.classList.toggle('phone', PHONE.matches);
  apply();
  PHONE.addEventListener('change', apply);
  document.getElementById('info')?.addEventListener('click', (e) => (e.currentTarget as HTMLElement).classList.toggle('open'));
  const bar = document.getElementById('bar');
  if (bar) new ResizeObserver(() => document.body.style.setProperty('--bar-h', `${bar.offsetHeight}px`)).observe(bar);
}

/** The settings panel, closed by default on phones. */
export function createGui(title: string) {
  const gui = new GUI({ title });
  if (isPhone()) gui.close();
  return gui;
}

export interface ViewerOptions {
  fov: number;
  near: number;
  far: number;
  exposure?: number;
  background?: THREE.ColorRepresentation;
  /** studio-like reflections for metal and glass (RoomEnvironment), with this intensity */
  roomEnvironment?: number;
  logarithmicDepthBuffer?: boolean;
}

export function createViewer(o: ViewerOptions) {
  initPhoneLayout();
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: !!o.logarithmicDepthBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  if (o.background !== undefined) scene.background = new THREE.Color(o.background);
  if (o.roomEnvironment !== undefined) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    scene.environmentIntensity = o.roomEnvironment;
    // the generator and the throw-away room scene are only needed once
    pmrem.dispose();
    room.dispose();
  }

  const camera = new THREE.PerspectiveCamera(o.fov, window.innerWidth / window.innerHeight, o.near, o.far);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  const onResize: (() => void)[] = [];
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    for (const f of onResize) f();
  });

  return { canvas, renderer, scene, camera, controls, composer, onResize };
}

// ---------------------------------------------------------------- labels
export interface LabelItem {
  id?: string;
  title: string;
  text: string;
  pos: THREE.Vector3;
  parent?: THREE.Object3D;
}

/** At most this many labels on a phone: the highest-ranked ones that fit. */
const PHONE_MAX_LABELS = 6;

/**
 * Clickable 3D labels. Every frame they are placed in rank order (`rank`: ids or titles, most
 * important first; unlisted labels follow in their own order) and a label is skipped when its box
 * would overlap one already placed, so labels never pile up. Phones show the first few only.
 */
export function createLabels<L extends LabelItem>(
  items: L[],
  camera: THREE.Camera,
  controls: OrbitControls,
  opts: {
    defaultParent: THREE.Object3D;
    short?: boolean;
    margin?: number;
    visible?: (l: L, dist: number, camDist: number) => boolean;
    rank?: string[];
  },
) {
  const layer = document.getElementById('labels')!;
  const tip = document.getElementById('tip')!;
  const rankOf = (l: L, i: number) => {
    const r = opts.rank?.indexOf(l.id ?? l.title) ?? -1;
    return r >= 0 ? r : 1000 + i;
  };
  const els = items.map((l, i) => {
    const el = document.createElement('button');
    el.className = 'label';
    el.textContent = opts.short === false ? l.title : l.title.split(' — ')[0];
    el.onclick = (e) => {
      e.stopPropagation();
      tip.innerHTML = `<b>${l.title}</b><p>${l.text}</p>`;
      tip.classList.add('show');
    };
    // start hidden: the update below only touches the DOM when its state changes, so the
    // element and the cached flags must agree from the start
    el.style.display = 'none';
    layer.appendChild(el);
    return { l, el, rank: rankOf(l, i), shown: false, flip: false, w: 0, h: 0, x: 0, y: 0, d: 0, ok: false };
  });
  type E = (typeof els)[number];
  document.body.addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('#tip')) tip.classList.remove('show');
  });
  // label sizes change with the phone layout: measure again after a resize
  window.addEventListener('resize', () => els.forEach((e) => (e.w = 0)));

  const v = new THREE.Vector3();
  const margin = opts.margin ?? 1.02;
  const placed: number[] = []; // boxes already placed this frame, 4 numbers each
  const order: E[] = [];
  const PAD = 3;

  return function update(enabled: boolean) {
    layer.style.display = enabled ? 'block' : 'none';
    if (!enabled) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const camD = camera.position.distanceTo(controls.target);

    // 1. project every anchor
    for (const e of els) {
      v.copy(e.l.pos);
      (e.l.parent ?? opts.defaultParent).localToWorld(v);
      e.d = v.distanceTo(camera.position);
      v.project(camera);
      e.ok = v.z < 1 && Math.abs(v.x) < margin && Math.abs(v.y) < margin && (opts.visible ? opts.visible(e.l, e.d, camD) : true);
      e.x = ((v.x + 1) / 2) * w;
      e.y = ((1 - v.y) / 2) * h;
    }

    // 2. place in rank order, skipping any label that would overlap one already placed
    order.length = 0;
    for (const e of els) if (e.ok) order.push(e);
    order.sort((a, b) => a.rank - b.rank);
    placed.length = 0;
    const max = isPhone() ? PHONE_MAX_LABELS : Infinity;
    let n = 0;
    for (const e of order) {
      // labels in the right part of the screen open to the left of their dot, so they stay on screen
      const flip = e.x > 0.6 * w;
      if (!e.w) {
        // measure once, while shown (the text never changes)
        e.el.style.display = 'block';
        e.w = e.el.offsetWidth + 10; // + the dot
        e.h = e.el.offsetHeight;
        e.shown = true;
      }
      // the box drawn by the CSS (.label margins and dot), plus a small gap
      const x0 = (flip ? e.x + 2 - e.w : e.x - 2) - PAD;
      const x1 = x0 + e.w + 2 * PAD;
      const y0 = e.y - 10 - PAD;
      const y1 = y0 + e.h + 2 * PAD;
      let free = n < max;
      for (let i = 0; free && i < placed.length; i += 4) {
        if (x0 < placed[i + 2] && x1 > placed[i] && y0 < placed[i + 3] && y1 > placed[i + 1]) free = false;
      }
      e.ok = free;
      if (!free) continue;
      placed.push(x0, y0, x1, y1);
      n++;
      if (flip !== e.flip) {
        e.el.classList.toggle('flip', flip);
        e.flip = flip;
      }
      e.el.style.transform = `translate(${e.x}px, ${e.y}px)`;
    }

    // 3. show the placed labels, hide the others (DOM touched only on change)
    for (const e of els) {
      if (e.ok !== e.shown) {
        e.el.style.display = e.ok ? 'block' : 'none';
        e.shown = e.ok;
      }
    }
  };
}

// ---------------------------------------------------------------- camera fly-to
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraTween {
  private t0 = 0;
  private active = false;
  private p0 = new THREE.Vector3();
  private p1 = new THREE.Vector3();
  private q0 = new THREE.Vector3();
  private q1 = new THREE.Vector3();

  constructor(private camera: THREE.Camera, private controls: OrbitControls, private duration = 1400) {}

  /** Fly to camera position `pos` looking at `target` (world coordinates). */
  start(pos: THREE.Vector3, target: THREE.Vector3) {
    this.t0 = performance.now();
    this.p0.copy(this.camera.position);
    this.q0.copy(this.controls.target);
    this.p1.copy(pos);
    this.q1.copy(target);
    this.active = true;
  }

  get running() {
    return this.active;
  }

  update() {
    if (!this.active) return;
    const t = Math.min(1, (performance.now() - this.t0) / this.duration);
    const e = easeInOutCubic(t);
    this.camera.position.lerpVectors(this.p0, this.p1, e);
    this.controls.target.lerpVectors(this.q0, this.q1, e);
    if (t >= 1) this.active = false;
  }
}

// ---------------------------------------------------------------- cutaway
const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _v = new THREE.Vector3();
/**
 * Orient `plane` through the local Y axis of `root` (the optical axis), facing the viewer, so
 * the half of the model nearest to the camera is clipped away. `offset` moves the cut away from
 * the axis, toward the viewer. Disabled: the plane is moved out of the way.
 */
export function faceCutPlane(plane: THREE.Plane, root: THREE.Object3D, camera: THREE.Camera, on: boolean, offset = 0) {
  if (!on) {
    plane.normal.set(0, 1, 0);
    plane.constant = 1e6;
    return;
  }
  root.updateMatrixWorld();
  _o.setFromMatrixPosition(root.matrixWorld);
  _a.set(0, 1, 0).transformDirection(root.matrixWorld);
  _v.copy(camera.position).sub(_o);
  _v.addScaledVector(_a, -_v.dot(_a)).normalize();
  plane.normal.copy(_v).negate();
  plane.constant = offset - plane.normal.dot(_o);
}

/** Flat, sharp-edged disc sprite texture (shared): stars and light spots, with no glow halo. */
let dot: THREE.Texture | null = null;
export function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  dot = new THREE.CanvasTexture(c);
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}
