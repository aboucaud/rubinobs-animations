// Show where the film flickers from depth fighting: render frame t twice, with the near plane
// moved by a few per cent. Depth order only changes where two surfaces are (almost) at the same
// depth, so the pixels that change are the z-fighting ones. Needs `npm run dev` (port 5173).
//
//   node tools/zfight-image.cjs [WxH] t ...   → shots/zfight/zf-<t>.png (changed pixels in magenta)
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

let args = process.argv.slice(2);
let size = '1280x720';
if (args[0] && args[0].includes('x')) size = args.shift();
const [w, h] = size.split('x').map(Number);
const dir = 'shots/zfight';
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto('http://localhost:5173/film/?capture&notext');
  await p.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 300000 });
  for (const t of args.map(Number)) {
    await p.evaluate((t) => window.__film.render(t), t);
    await p.screenshot({ path: `${dir}/a.png` });
    await p.evaluate(() => { const f = window.__film; f.camera.near *= 1.08; f.camera.updateProjectionMatrix(); f.composer.render(); });
    await p.screenshot({ path: `${dir}/b.png` });
    const out = `${dir}/zf-${t}.png`;
    // difference → mask → magenta over a dimmed frame
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/a.png`, '-i', `${dir}/b.png`, '-filter_complex',
      '[0:v]format=rgb24,split[a0][a1];[a1][1:v]blend=all_mode=difference,format=gray,lut=y=if(gt(val\\,24)\\,255\\,0),format=rgb24,lutrgb=g=0[m];[a0]lutrgb=r=val*0.6:g=val*0.6:b=val*0.6[d];[d][m]blend=all_mode=lighten',
      out]);
    const px = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', `${dir}/a.png`, '-i', `${dir}/b.png`, '-filter_complex',
      '[0:v][1:v]blend=all_mode=difference,format=gray,lut=y=if(gt(val\\,24)\\,255\\,0),signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']).toString();
    const avg = +(px.match(/YAVG=([\d.]+)/) || [0, 0])[1];
    console.log(`t=${t}: ${(avg / 255 * w * h).toFixed(0)} flickering pixels → ${out}`);
  }
  await b.close();
})();
