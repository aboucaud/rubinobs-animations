// GPU sky views of the survey page: an all-sky Mollweide map (equatorial, RA increasing to the left)
// and the local sky above Cerro Pachón (zenithal equal-area, north up, east left). Both are drawn per
// pixel by one fragment shader that samples the coverage textures and draws the Milky Way, grids,
// ecliptic, galactic plane, horizon, Sun, Moon and the current LSSTCam field; the stars are points.
import * as THREE from 'three';
import { BANDS, BAND_HEX } from '../scene/bands';
import { ARRAY_HALF, CORNER_HALF, DEG_PER_MM, type Coverage } from './coverage';
import { GAL_MATRIX, SITE } from './astro';
import starData from '../data/stars.json';
import mwUrl from '../data/milkyway.png';

const MAP_RA0 = Math.PI; // RA at the centre of the map

const COMMON = /* glsl */ `
const float PI = 3.14159265359;
uniform sampler2D tA, tB, tLast, tMW, tPlan;
uniform int uMode;
uniform float uNow, uNorm, uLst, uLat, uMoonIllum, uRa0;
uniform vec3 uSun, uMoon;
uniform vec4 uField; // ra, dec, rotSkyPos, opacity
uniform float uFieldFill;
uniform vec3 uFieldCol;
uniform vec3 uBandCol[6];
uniform mat3 uGal;
uniform vec2 uView0, uViewSize; // viewport origin and size, device px
uniform float uZoom;
uniform vec2 uPan;

vec3 dirOf(float ra, float dec) { return vec3(cos(dec) * cos(ra), cos(dec) * sin(ra), sin(dec)); }
float line(float d, float px, float w) { return 1.0 - smoothstep(w * px * 0.5, w * px * 0.5 + px, abs(d)); }

// polynomial fit of viridis
vec3 viridis(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = vec3(0.2777, 0.0054, 0.3341), c1 = vec3(0.1051, 1.4046, 1.3846), c2 = vec3(-0.3309, 0.2148, 0.0951),
    c3 = vec3(-4.6342, -5.7991, -19.3324), c4 = vec3(6.2283, 14.1799, 56.6906), c5 = vec3(4.7764, -13.7451, -65.353), c6 = vec3(-5.4355, 4.6459, 26.3124);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

vec4 sky(float ra, float dec, float px) {
  vec3 v = dirOf(ra, dec);
  vec2 uv = vec2(ra / (2.0 * PI), (0.5 * PI - dec) / PI);
  vec3 col = vec3(0.035, 0.05, 0.09);
  col += texture(tMW, uv).r * vec3(0.10, 0.11, 0.14);
  vec4 A = texture(tA, uv) * 255.0;
  vec4 B = texture(tB, uv);
  float zy0 = B.r * 255.0, zy1 = B.g * 255.0;
  float total = A.r + A.g + A.b + A.a + zy0 + zy1;
  // survey footprint: slightly lighter, with an outline
  float fp = texture(tPlan, uv).r;
  col += smoothstep(0.4, 0.6, fp) * vec3(0.022, 0.03, 0.045);
  col = mix(col, vec3(0.35, 0.45, 0.6), 0.45 * (1.0 - smoothstep(0.5, 1.5, abs(fp - 0.5) / max(fwidth(fp), 1e-4))));
  if (total > 0.0) {
    if (uMode == 0) {
      vec3 c = (A.r * uBandCol[0] + A.g * uBandCol[1] + A.b * uBandCol[2] + A.a * uBandCol[3] + zy0 * uBandCol[4] + zy1 * uBandCol[5]) / total;
      col = mix(col, c, 0.85 * (1.0 - exp(-total / (0.35 * uNorm))));
    } else if (uMode == 1) {
      col = mix(col, viridis(total / (1.6 * uNorm)), 0.92);
    } else {
      float age = uNow - texture(tLast, uv).r;
      int lb = int(B.b * 255.0 + 0.5) - 1;
      vec3 c = uBandCol[clamp(lb, 0, 5)];
      col = mix(col, vec3(0.16, 0.19, 0.25), 0.8);
      col = mix(col, c, 0.9 * exp(-max(age, 0.0) / 1.2));
    }
  }
  // grid every 30°, ecliptic, galactic plane
  float gRa = mod(ra + PI / 12.0, PI / 6.0) - PI / 12.0;
  float gDec = mod(dec + PI / 12.0, PI / 6.0) - PI / 12.0;
  float grid = max(line(gRa * cos(dec), px, 0.6), line(gDec, px, 0.6));
  col = mix(col, vec3(0.6, 0.7, 0.85), 0.1 * grid);
  float eclB = asin(dot(v, vec3(0.0, -0.3977772, 0.9174821)));
  col = mix(col, vec3(0.85, 0.72, 0.4), 0.45 * line(eclB, px, 1.0));
  float galB = asin(dot(uGal[2], v));
  col = mix(col, vec3(0.6, 0.72, 1.0), 0.35 * line(galB, px, 1.0));
  // local horizon: below it the sky is dimmed; dashed line at the 20° altitude limit
  vec3 zen = vec3(cos(uLat) * cos(uLst), cos(uLat) * sin(uLst), sin(uLat));
  float alt = asin(dot(v, zen));
  col *= mix(1.0, 0.45, smoothstep(0.0, -px * 2.0, alt));
  col = mix(col, vec3(0.95, 0.9, 0.8), 0.55 * line(alt, px, 1.2));
  float dash = step(0.5, fract(atan(v.y, v.x) * 18.0 / PI));
  col = mix(col, vec3(0.95, 0.9, 0.8), 0.3 * dash * line(alt - 20.0 * PI / 180.0, px, 1.0));
  // Moon (with its 30° avoidance circle) and Sun, discs enlarged for visibility
  float dm = acos(clamp(dot(v, uMoon), -1.0, 1.0));
  col = mix(col, vec3(0.85, 0.85, 0.8) * (0.35 + 0.65 * uMoonIllum), 1.0 - smoothstep(1.4 * PI / 180.0, 1.4 * PI / 180.0 + px, dm));
  vec3 e1 = normalize(cross(uMoon, vec3(0.0, 0.0, 1.0)));
  float dashM = step(0.5, fract(atan(dot(v, cross(uMoon, e1)), dot(v, e1)) * 12.0 / PI));
  col = mix(col, vec3(0.8, 0.8, 0.75), 0.25 * dashM * line(dm - 30.0 * PI / 180.0, px, 1.0));
  float ds = acos(clamp(dot(v, uSun), -1.0, 1.0));
  col = mix(col, vec3(1.0, 0.78, 0.35), 1.0 - smoothstep(1.4 * PI / 180.0, 1.4 * PI / 180.0 + px, ds));
  // current field: the 21 science rafts of LSSTCam
  if (uField.w > 0.0) {
    vec3 f = dirOf(uField.x, uField.y);
    float cosc = dot(v, f);
    if (cosc > 0.99) {
      float sd = sin(dec), cd = cos(dec), s0 = sin(uField.y), c0 = cos(uField.y), dra = ra - uField.x;
      float xi = cd * sin(dra) / cosc, eta = (c0 * sd - s0 * cd * cos(dra)) / cosc;
      float cr = cos(uField.z), sr = sin(uField.z);
      float k = 180.0 / PI / ${DEG_PER_MM.toFixed(8)};
      vec2 p = abs(vec2(xi * cr - eta * sr, xi * sr + eta * cr) * k);
      float pxmm = px * k;
      // signed distance to the outline: the square minus its four corner rafts
      float C = ${CORNER_HALF.toFixed(1)};
      float dOut = max(p.x, p.y) - ${ARRAY_HALF.toFixed(1)};
      float dN = (p.x > C && p.y > C) ? min(p.x - C, p.y - C) : -length(max(vec2(C) - p, vec2(0.0)));
      float d = max(dOut, dN);
      float inside = step(d, 0.0);
      col = mix(col, uFieldCol, uField.w * uFieldFill * 0.55 * inside);
      col = mix(col, vec3(1.0), uField.w * line(d, pxmm, 1.3));
    }
  }
  return vec4(col, 1.0);
}
`;

const MAP_FRAG = /* glsl */ `
${COMMON}
out vec4 fragColor;
void main() {
  vec2 q = (gl_FragCoord.xy - uView0 - 0.5 * uViewSize);
  float s = 2.0 * sqrt(2.0) * 2.08 / min(uViewSize.x, 2.0 * uViewSize.y) / uZoom; // map units per px
  vec2 m = q * s + uPan;
  float e = m.x * m.x / 8.0 + m.y * m.y / 2.0;
  if (e > 1.0 + 4.0 * s) discard;
  float th = asin(clamp(m.y / sqrt(2.0), -1.0, 1.0));
  float dec = asin(clamp((2.0 * th + sin(2.0 * th)) / PI, -1.0, 1.0));
  float ra = mod(uRa0 - PI * m.x / (2.0 * sqrt(2.0) * max(cos(th), 1e-4)), 2.0 * PI);
  vec4 c = sky(ra, dec, s * 1.2);
  c.a = 1.0 - smoothstep(1.0 - 2.0 * s, 1.0 + 2.0 * s, e);
  fragColor = c;
}`;

const LOCAL_FRAG = /* glsl */ `
${COMMON}
out vec4 fragColor;
void main() {
  vec2 q = (gl_FragCoord.xy - uView0 - 0.5 * uViewSize) / (0.5 * uViewSize.y);
  float r = length(q);
  float px = 2.0 / uViewSize.y;
  if (r > 1.0 + px) discard;
  float z = 2.0 * asin(min(r, 1.0) / sqrt(2.0));
  float alt = 0.5 * PI - z;
  float az = atan(-q.x, q.y); // north up, east left (looking up)
  float dec = asin(sin(alt) * sin(uLat) + cos(alt) * cos(uLat) * cos(az));
  float h = atan(-sin(az) * cos(alt), sin(alt) * cos(uLat) - cos(alt) * sin(uLat) * cos(az));
  vec4 c = sky(mod(uLst - h, 2.0 * PI), dec, px * 1.6);
  c.a = 1.0 - smoothstep(1.0 - px, 1.0 + px, r);
  fragColor = c;
}`;

const STAR_VERT = /* glsl */ `
const float PI = 3.14159265359;
uniform int uProj; // 0 map, 1 local sky
uniform float uLst, uLat, uRa0, uZoom, uDpr;
uniform vec2 uViewSize, uPan;
attribute vec3 color;
attribute float mag;
varying vec3 vCol;
varying float vA;
void main() {
  float ra = position.x, dec = position.y;
  vec2 ndc;
  float size = clamp((6.3 - mag) * 0.6, 0.6, 4.5);
  float h = uLst - ra;
  float alt = asin(sin(dec) * sin(uLat) + cos(dec) * cos(uLat) * cos(h));
  vA = clamp(0.35 + (5.5 - mag) * 0.2, 0.25, 1.0) * (alt < 0.0 ? 0.45 : 1.0);
  if (uProj == 0) {
    float th = dec;
    for (int i = 0; i < 8; i++) th -= (2.0 * th + sin(2.0 * th) - PI * sin(dec)) / (2.0 + 2.0 * cos(2.0 * th) + 1e-6);
    float dra = mod(ra - uRa0 + PI, 2.0 * PI) - PI;
    vec2 m = vec2(-2.0 * sqrt(2.0) / PI * dra * cos(th), sqrt(2.0) * sin(th));
    float s = 2.0 * sqrt(2.0) * 2.08 / min(uViewSize.x, 2.0 * uViewSize.y) / uZoom;
    ndc = (m - uPan) / s / (0.5 * uViewSize);
    size *= pow(uZoom, 0.35);
  } else {
    float az = atan(-cos(dec) * sin(h), sin(dec) * cos(uLat) - cos(dec) * sin(uLat) * cos(h));
    float r = sqrt(2.0) * sin(0.5 * (0.5 * PI - alt));
    ndc = vec2(-sin(az), cos(az)) * r * vec2(uViewSize.y / uViewSize.x, 1.0);
    if (alt < 0.0) size = 0.0;
  }
  vCol = color;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = size * uDpr;
}`;

const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vCol, vA * (1.0 - smoothstep(0.3, 0.5, d)));
}`;

/** Approximate star colour from B−V. */
function bvColour(bv: number) {
  const t = Math.min(1, Math.max(0, (bv + 0.3) / 2.0));
  return new THREE.Color().setRGB(0.75 + 0.25 * t, 0.82 + 0.05 * t - 0.15 * t * t, 1.0 - 0.45 * t);
}

export type MapMode = 0 | 1 | 2;

export class SkyViews {
  readonly scene = new THREE.Scene();
  private camera = new THREE.Camera();
  readonly uniforms: Record<string, THREE.IUniform>;
  private mapMesh: THREE.Mesh;
  private localMesh: THREE.Mesh;
  private stars: THREE.Points;
  private starMat: THREE.ShaderMaterial;

  constructor(cov: Coverage) {
    const mw = new THREE.TextureLoader().load(mwUrl);
    mw.wrapS = THREE.RepeatWrapping;
    const g = GAL_MATRIX;
    this.uniforms = {
      tA: { value: cov.texA },
      tB: { value: cov.texB },
      tLast: { value: cov.texLast },
      tPlan: { value: cov.texPlan },
      tMW: { value: mw },
      uMode: { value: 0 },
      uNow: { value: 0 },
      uNorm: { value: 1 },
      uLst: { value: 0 },
      uLat: { value: SITE.lat },
      uMoonIllum: { value: 0 },
      uRa0: { value: MAP_RA0 },
      uSun: { value: new THREE.Vector3() },
      uMoon: { value: new THREE.Vector3() },
      uField: { value: new THREE.Vector4() },
      uFieldFill: { value: 0 },
      uFieldCol: { value: new THREE.Color() },
      uBandCol: { value: BANDS.map((b) => new THREE.Color(BAND_HEX[b])) },
      // mat3 is column-major: transpose so that uGal[2] is the third row (galactic z axis)
      uGal: { value: new THREE.Matrix3().set(g[0][0], g[1][0], g[2][0], g[0][1], g[1][1], g[2][1], g[0][2], g[1][2], g[2][2]) },
      uView0: { value: new THREE.Vector2() },
      uViewSize: { value: new THREE.Vector2(1, 1) },
      uZoom: { value: 1 },
      uPan: { value: new THREE.Vector2() },
    };
    const quad = new THREE.PlaneGeometry(2, 2);
    const mk = (frag: string) =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: this.uniforms,
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: frag,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
    this.mapMesh = new THREE.Mesh(quad, mk(MAP_FRAG));
    this.localMesh = new THREE.Mesh(quad, mk(LOCAL_FRAG));
    this.mapMesh.frustumCulled = this.localMesh.frustumCulled = false;

    const n = starData.length / 4;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const mag = new Float32Array(n);
    const D = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      pos[3 * i] = starData[4 * i] * D;
      pos[3 * i + 1] = starData[4 * i + 1] * D;
      mag[i] = starData[4 * i + 2];
      const c = bvColour(starData[4 * i + 3]);
      col.set([c.r, c.g, c.b], 3 * i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: {
        uProj: { value: 0 },
        uLst: this.uniforms.uLst,
        uLat: this.uniforms.uLat,
        uRa0: this.uniforms.uRa0,
        uZoom: this.uniforms.uZoom,
        uPan: this.uniforms.uPan,
        uViewSize: this.uniforms.uViewSize,
        uDpr: { value: 1 },
      },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 1;
  }

  /** Draw the map in `map` and the local sky in `local` (CSS px rectangles [x, y from bottom, w, h]). */
  render(renderer: THREE.WebGLRenderer, map: number[], local: number[]) {
    const dpr = renderer.getPixelRatio();
    this.starMat.uniforms.uDpr.value = dpr;
    renderer.autoClear = false;
    renderer.clear();
    renderer.setScissorTest(true);
    for (const [rect, mesh, proj] of [
      [map, this.mapMesh, 0],
      [local, this.localMesh, 1],
    ] as const) {
      renderer.setViewport(rect[0], rect[1], rect[2], rect[3]);
      renderer.setScissor(rect[0], rect[1], rect[2], rect[3]);
      this.uniforms.uView0.value.set(rect[0] * dpr, rect[1] * dpr);
      this.uniforms.uViewSize.value.set(rect[2] * dpr, rect[3] * dpr);
      this.starMat.uniforms.uProj.value = proj;
      this.scene.children.length = 0;
      this.scene.add(mesh, this.stars);
      renderer.render(this.scene, this.camera);
    }
    renderer.setScissorTest(false);
  }
}
