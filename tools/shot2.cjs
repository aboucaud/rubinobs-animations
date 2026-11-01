// Screenshot helper (software WebGL). usage: node shot2.cjs <page> <name> [js to eval] [wait ms] [WxH]
const { chromium } = require('playwright');
(async () => {
  const [page, name, js, wait, size] = process.argv.slice(2);
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
  await p.screenshot({ timeout: 180000, path: `/tmp/${name}.png` });
  console.log(logs.slice(0, 10).join('\n'));
  await b.close();
})();
