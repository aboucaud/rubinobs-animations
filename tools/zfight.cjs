// Find z-fighting in the film scene: overlapping coplanar faces of different materials (they
// flicker between the two colours as the view moves), and parts poking through the camera body.
// Needs `npm run dev` (port 5173).
//
//   node tools/zfight.cjs [t ...]        film times to inspect (default: 6 18 30)
//
// Output: one line per pair of materials that share a plane, with the overlap area, the plane and
// a world point. Overlaps under 1 cm² are ignored. Then lists the camera parts that poke out of the
// camera body (only meaningful once the camera is assembled, t ≥ 18 s).
const { chromium } = require('playwright');

const times = process.argv.slice(2).map(Number);
if (!times.length) times.push(6, 18, 30);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto('http://localhost:5173/film/?capture&notext');
  await p.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 300000 });
  for (const t of times) {
    const res = await p.evaluate((t) => {
      const f = window.__film;
      f.render(t);
      f.scene.updateMatrixWorld(true);
      // ---- collect triangles of visible, opaque meshes in world space
      const tris = []; // [ax,ay,az,bx,by,bz,cx,cy,cz, matId]
      const mats = [];
      const matIndex = new Map();
      const visible = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      f.tel.cam.group.traverse((m) => {
        if (!m.isMesh || !m.geometry || !visible(m)) return;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        if (!mat || mat.transparent || mat.opacity < 1 || !mat.depthWrite) return;
        if (!matIndex.has(mat)) { matIndex.set(mat, mats.length); mats.push(`${mat.type.replace('Material', '')}#${mat.color ? mat.color.getHexString() : '?'}`); }
        const mi = matIndex.get(mat);
        const pos = m.geometry.attributes.position;
        const idx = m.geometry.index;
        const n = idx ? idx.count : pos.count;
        const insts = m.isInstancedMesh ? m.count : 1;
        const M = new m.matrixWorld.constructor();
        const I = new m.matrixWorld.constructor();
        const v = [0, 0, 0].map(() => new m.position.constructor());
        for (let k = 0; k < insts; k++) {
          M.copy(m.matrixWorld);
          if (m.isInstancedMesh) { m.getMatrixAt(k, I); M.multiply(I); }
          for (let i = 0; i + 2 < n; i += 3) {
            const row = [];
            for (let j = 0; j < 3; j++) {
              const a = idx ? idx.getX(i + j) : i + j;
              v[j].fromBufferAttribute(pos, a).applyMatrix4(M);
              row.push(v[j].x, v[j].y, v[j].z);
            }
            row.push(mi);
            tris.push(row);
          }
        }
      });
      // ---- bucket by plane (normal up to sign, offset at 0.5 mm)
      const buckets = new Map();
      for (const tr of tris) {
        const ux = tr[3] - tr[0], uy = tr[4] - tr[1], uz = tr[5] - tr[2];
        const vx = tr[6] - tr[0], vy = tr[7] - tr[1], vz = tr[8] - tr[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-9) continue;
        nx /= l; ny /= l; nz /= l;
        // canonical sign, so back-to-back faces share a bucket too (DoubleSide materials)
        if (nx < -1e-6 || (Math.abs(nx) <= 1e-6 && (ny < -1e-6 || (Math.abs(ny) <= 1e-6 && nz < 0)))) { nx = -nx; ny = -ny; nz = -nz; }
        const d = nx * tr[0] + ny * tr[1] + nz * tr[2];
        const key = `${Math.round(nx * 500)},${Math.round(ny * 500)},${Math.round(nz * 500)},${Math.round(d * 2000)}`;
        let bk = buckets.get(key);
        if (!bk) buckets.set(key, (bk = { n: [nx, ny, nz], d, tris: [] }));
        bk.tris.push(tr);
      }
      // ---- overlap area of triangle pairs of different materials in each plane
      const clip = (poly, a, b) => { // keep the left side of edge a→b (2D)
        const out = [];
        const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length];
          const sp = side(p), sq = side(q);
          if (sp >= 0) out.push(p);
          if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
        }
        return out;
      };
      const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
      const ccw = (t) => (area(t) < 0 ? [t[0], t[2], t[1]] : t);
      const pairs = new Map();
      f.tel.cam.group.updateMatrixWorld(true);
      const loc = f.tel.cam.group.matrixWorld.clone().invert();
      for (const bk of buckets.values()) {
        const ms = new Set(bk.tris.map((t) => t[9]));
        if (ms.size < 2) continue;
        const [nx, ny, nz] = bk.n;
        // 2D basis of the plane
        const ax = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        let ex = [ny * ax[2] - nz * ax[1], nz * ax[0] - nx * ax[2], nx * ax[1] - ny * ax[0]];
        const el = Math.hypot(...ex); ex = ex.map((c) => c / el);
        const ey = [ny * ex[2] - nz * ex[1], nz * ex[0] - nx * ex[2], nx * ex[1] - ny * ex[0]];
        const t2 = bk.tris.map((t) => ({ m: t[9], p3: t, p: ccw([0, 3, 6].map((o) => [t[o] * ex[0] + t[o + 1] * ex[1] + t[o + 2] * ex[2], t[o] * ey[0] + t[o + 1] * ey[1] + t[o + 2] * ey[2]])) }));
        for (const t of t2) { t.x0 = Math.min(...t.p.map((q) => q[0])); t.x1 = Math.max(...t.p.map((q) => q[0])); t.y0 = Math.min(...t.p.map((q) => q[1])); t.y1 = Math.max(...t.p.map((q) => q[1])); }
        if (t2.length > 4000) continue; // huge flat buckets (floors): skip, too slow and never the issue here
        for (let i = 0; i < t2.length; i++) for (let j = i + 1; j < t2.length; j++) {
          const A = t2[i], B = t2[j];
          if (A.m === B.m || A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
          let poly = A.p;
          for (let k = 0; k < 3 && poly.length; k++) poly = clip(poly, B.p[k], B.p[(k + 1) % 3]);
          if (poly.length < 3) continue;
          const s = Math.abs(area(poly));
          if (s < 1e-7) continue;
          const key = A.m < B.m ? `${mats[A.m]} / ${mats[B.m]}` : `${mats[B.m]} / ${mats[A.m]}`;
          const e = pairs.get(key) ?? { s: 0, at: null, n: bk.n };
          e.s += s;
          e.box = e.box ?? [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
          for (const T of [A.p3, B.p3]) for (let o = 0; o < 9; o += 3) {
            // in the camera model's local frame (local Y = optical axis), easier to map to the builders
            const q = f.camera.position.clone().set(T[o], T[o + 1], T[o + 2]).applyMatrix4(loc);
            for (let c = 0; c < 3; c++) { e.box[c] = Math.min(e.box[c], q.getComponent(c)); e.box[c + 3] = Math.max(e.box[c + 3], q.getComponent(c)); }
          }
          e.count = (e.count ?? 0) + 1;
          pairs.set(key, e);
        }
      }
      return [...pairs.entries()].filter(([, e]) => e.s > 1e-4).sort((a, b) => b[1].s - a[1].s)
        .map(([k, e]) => `${(e.s * 1e4).toFixed(1).padStart(8)} cm²  ${k}  n=(${e.n.map((c) => c.toFixed(2))}) pairs=${e.count} cam-local box x[${e.box[0].toFixed(3)},${e.box[3].toFixed(3)}] y[${e.box[1].toFixed(3)},${e.box[4].toFixed(3)}] z[${e.box[2].toFixed(3)},${e.box[5].toFixed(3)}]`);
    }, t);
    console.log(`\n=== t = ${t} s: ${res.length} coplanar overlaps`);
    console.log(res.join('\n'));
    // ---- parts poking out of the camera body: outside r = 0.80 m along the body, or outside the
    //      trunk (r = 0.6 m) just behind the back flange
    const out = await p.evaluate(() => {
      const f = window.__film;
      const cam = f.tel.cam;
      cam.group.updateMatrixWorld(true);
      const loc = cam.group.matrixWorld.clone().invert();
      const v = f.camera.position.clone();
      const res = [];
      for (const [name, part] of Object.entries(cam.parts)) {
        if (['body', 'l1l2', 'trunk', 'hexapod', 'L1', 'L2', 'L3', 'focalPlane', 'blades'].includes(name)) continue;
        part.traverse((m) => {
          if (!m.isMesh || !m.geometry) return;
          const pos = m.geometry.attributes.position;
          let worst = 0, at = null;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(loc);
            const r = Math.hypot(v.x, v.z);
            const lim = v.y > 3.62 && v.y < 5.6 ? 0.8047 : v.y >= 5.6 && v.y < 5.8 ? 0.6 : Infinity; // skin radius, then the trunk
            if (r - lim > worst) { worst = r - lim; at = [v.x, v.y, v.z]; }
          }
          if (worst > 0.002) res.push(`${name}: ${(worst * 1000).toFixed(0)} mm outside, at x=${at[0].toFixed(3)} axis=${at[1].toFixed(3)} z=${at[2].toFixed(3)} (${m.material.color ? '#' + m.material.color.getHexString() : ''})`);
        });
      }
      return res;
    });
    console.log(`--- ${out.length} parts outside the camera body`);
    if (out.length) console.log(out.join('\n'));
  }
  await b.close();
})();
