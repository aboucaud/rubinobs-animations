// Boilerplate shared by every animation page: renderer, scene, camera, orbit controls,
// post-processing, clickable 3D labels, camera fly-to tweens and the viewer-facing cutaway plane.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import '../style.css';

export interface ViewerOptions {
  fov: number;
  near: number;
  far: number;
  exposure?: number;
  background?: THREE.ColorRepresentation;
  /** studio-like reflections for metal and glass (RoomEnvironment), with this intensity */
  roomEnvironment?: number;
  /** bloom: [strength, radius, threshold] */
  bloom?: [number, number, number];
  logarithmicDepthBuffer?: boolean;
}

export function createViewer(o: ViewerOptions) {
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
  const bloom = o.bloom ? new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), ...o.bloom) : null;
  if (bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const onResize: (() => void)[] = [];
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    for (const f of onResize) f();
  });

  return { canvas, renderer, scene, camera, controls, composer, bloom, onResize };
}

// ---------------------------------------------------------------- labels
export interface LabelItem {
  title: string;
  text: string;
  pos: THREE.Vector3;
  parent?: THREE.Object3D;
}

/**
 * HTML labels pinned to 3D positions; clicking one shows its description in #tip.
 * `visible` refines visibility (distance limits, hidden parents) given the label, its distance to
 * the camera and the camera–target distance.
 */
export function createLabels<L extends LabelItem>(
  items: L[],
  camera: THREE.Camera,
  controls: OrbitControls,
  opts: { defaultParent: THREE.Object3D; short?: boolean; margin?: number; visible?: (l: L, dist: number, camDist: number) => boolean },
) {
  const layer = document.getElementById('labels')!;
  const tip = document.getElementById('tip')!;
  const els = items.map((l) => {
    const el = document.createElement('button');
    el.className = 'label';
    el.textContent = opts.short === false ? l.title : l.title.split(' — ')[0];
    el.onclick = (e) => {
      e.stopPropagation();
      tip.innerHTML = `<b>${l.title}</b><p>${l.text}</p>`;
      tip.classList.add('show');
    };
    layer.appendChild(el);
    return { l, el, shown: false };
  });
  document.body.addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('#tip')) tip.classList.remove('show');
  });
  const v = new THREE.Vector3();
  const margin = opts.margin ?? 1.02;
  return function update(enabled: boolean) {
    layer.style.display = enabled ? 'block' : 'none';
    if (!enabled) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const camD = camera.position.distanceTo(controls.target);
    for (const e of els) {
      v.copy(e.l.pos);
      (e.l.parent ?? opts.defaultParent).localToWorld(v);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < margin && Math.abs(v.y) < margin && (opts.visible ? opts.visible(e.l, dist, camD) : true);
      if (vis !== e.shown) {
        e.el.style.display = vis ? 'block' : 'none';
        e.shown = vis;
      }
      if (vis) e.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
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

/** Radial glow sprite texture (shared). */
let glow: THREE.Texture | null = null;
export function glowTexture() {
  if (glow) return glow;
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
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}
