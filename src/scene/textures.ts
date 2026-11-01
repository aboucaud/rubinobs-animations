// Procedural textures approximating the real finishes seen in on-site photos
// (no photo pixels are used: colours were sampled, patterns are drawn in code).
import * as THREE from 'three';

/** Palette sampled from photos of the summit, the TMA and LSSTCam (albedo-corrected by eye). */
export const PALETTE = {
  rubinTeal: '#2e7f82', // TMA, top-end piers, camera rotator ring, dome steel, walkways
  bareMetal: '#c9c6bb', // top-end ring (unpainted)
  spiderGrey: '#2a2b2d', // spider vanes: non-reflective dark grey
  cameraBlack: '#232220', // LSSTCam body, black anodised
  coverGrey: '#5f5b57', // L1 protective cover, brushed dark metal
  cartYellow: '#c99a17', // camera handling cart
  domeCladding: '#b8b2aa', // dome upper enclosure panels
  buildingWhite: '#eeeae7', // service building / dome drum
  baffleBlack: '#121314',
};

const cache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/** Fine speckle used as a bump map for painted steel (orange-peel). */
export function paintBump() {
  return canvasTex('paintBump', 256, 256, (g, w, h) => {
    const r = rng(11);
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = 120 + r() * 20;
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
  }, false);
}

/** Brushed-metal roughness streaks (top-end ring). */
export function brushedRoughness() {
  return canvasTex('brushed', 512, 64, (g, w, h) => {
    g.fillStyle = '#6a6a6a';
    g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 900; i++) {
      const y = r() * h;
      const v = 80 + r() * 70;
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.globalAlpha = 0.35;
      g.beginPath();
      g.moveTo(r() * w, y);
      g.lineTo(r() * w + 200, y);
      g.stroke();
    }
  }, false);
}

/**
 * Black anodised camera skin: circumferential joints with bolt rows and vertical panel seams.
 * u wraps around the body, v runs along the optical axis. `rings` are v positions (0..1) of joints.
 */
export function cameraSkin(rings: number[], seams = 8) {
  const key = 'camSkin' + rings.join(',') + seams;
  const W = 2048;
  const H = 512;
  const color = canvasTex(key, W, H, (g) => {
    g.fillStyle = PALETTE.cameraBlack;
    g.fillRect(0, 0, W, H);
    const r = rng(3);
    // subtle anodising mottling
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(255,255,255,${0.008 + r() * 0.01})`;
      g.fillRect(r() * W, r() * H, 2 + r() * 30, 1 + r() * 3);
    }
    drawJoints(g, W, H, rings, seams, false);
  });
  const bump = canvasTex(key + 'b', W, H, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, H);
    drawJoints(g, W, H, rings, seams, true);
  }, false);
  return { map: color, bumpMap: bump };
}

function drawJoints(g: CanvasRenderingContext2D, W: number, H: number, rings: number[], seams: number, bump: boolean) {
  for (const v of rings) {
    const y = (1 - v) * H;
    g.fillStyle = bump ? '#303030' : 'rgba(0,0,0,0.85)';
    g.fillRect(0, y - 1.5, W, 3);
    g.fillStyle = bump ? '#b0b0b0' : 'rgba(255,255,255,0.10)';
    g.fillRect(0, y + 1.5, W, 1);
    // bolt rows just either side of the joint
    for (const dy of [-7, 7]) {
      for (let x = 6; x < W; x += 16) {
        g.fillStyle = bump ? '#d0d0d0' : 'rgba(170,170,165,0.55)';
        g.beginPath();
        g.arc(x, y + dy, 2.1, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  for (let k = 0; k < seams; k++) {
    const x = ((k + 0.5) / seams) * W;
    g.fillStyle = bump ? '#404040' : 'rgba(0,0,0,0.7)';
    g.fillRect(x - 1, 0, 2, H);
    for (let y = 8; y < H; y += 18) {
      g.fillStyle = bump ? '#c8c8c8' : 'rgba(170,170,165,0.45)';
      g.beginPath();
      g.arc(x + 6, y, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Alpha map with a row of round lightening holes (box-section webs of the top-end ring). */
export function perforatedAlpha(holes: number, holeFrac = 0.62) {
  return canvasTex('perf' + holes + holeFrac, 2048, 128, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    const pitch = w / holes;
    for (let i = 0; i < holes; i++) {
      g.beginPath();
      g.arc((i + 0.5) * pitch, h / 2, (h * holeFrac) / 2, 0, Math.PI * 2);
      g.fill();
    }
  }, false);
}
