// Screenshot helper (software WebGL), against `npm run preview` (port 4173).
// usage: node tools/shot.cjs <page> <name> [js to eval] [wait ms] [WxH]
//   e.g. node tools/shot.cjs telescope/ overview "__rubin.goView('Focal plane')" 4000
// Writes shots/<name>.png and prints console errors/warnings of the page.
const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const [page = '', name = 'shot', js, wait, size] = process.argv.slice(2);
  const [w, h] = (size || '900x560').split('x').map(Number);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('ERR ' + e.message));
  await p.goto('http://localhost:4173/' + page);
  await p.waitForTimeout(3000);
  if (js) await p.evaluate(js);
  await p.waitForTimeout(+(wait || 3000));
  fs.mkdirSync('shots', { recursive: true });
  await p.screenshot({ timeout: 180000, path: `shots/${name}.png` });
  console.log(logs.slice(0, 10).join('\n'));
  await b.close();
})();
