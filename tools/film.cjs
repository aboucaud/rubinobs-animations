// Render the film page (film/) frame by frame and encode it with ffmpeg.
// Needs `npm run build && npm run preview` running (port 4173) and ffmpeg on the PATH.
// usage: node tools/film.cjs [WxH] [fps] [out.mp4] [from-to seconds | ''] [query, e.g. layout=v]
//   draft: node tools/film.cjs 640x360 15 shots/film-draft.mp4
//   final: node tools/film.cjs 1920x1080 30 shots/film.mp4
// Frames are rendered deterministically (film time, not wall clock), so a slow software GPU only
// makes rendering slower, never the video jerkier.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const [size = '640x360', fpsArg = '15', out = 'shots/film.mp4', range, query = ''] = process.argv.slice(2);
  const [w, h] = size.split('x').map(Number);
  const fps = +fpsArg;
  const dir = path.join(path.dirname(out), path.basename(out, path.extname(out)) + '-frames');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`http://localhost:4173/film/?capture${query ? '&' + query : ''}`);
  await p.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 180000 });
  const duration = await p.evaluate(() => window.__film.duration);
  const [t0, t1] = range ? range.split('-').map(Number) : [0, duration];
  const n = Math.round((t1 - t0) * fps);
  const start = Date.now();
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.__film.render(t), t0 + i / fps);
    await p.screenshot({ path: path.join(dir, `${String(i).padStart(5, '0')}.png`) });
    if (i % 50 === 0) console.log(`frame ${i}/${n} (${((Date.now() - start) / 1000).toFixed(0)} s)`);
  }
  await b.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log(`wrote ${out} (${n} frames, ${((Date.now() - start) / 1000).toFixed(0)} s)`);
})();
