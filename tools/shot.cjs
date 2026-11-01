const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const logs = [];
  p.on('console', m => logs.push(m.type() + ': ' + m.text()));
  p.on('pageerror', e => logs.push('ERR ' + e.message));
  await p.goto('http://localhost:4173/');
  await p.waitForTimeout(4000);
  const views = (process.argv[2] || 'Overview').split(',');
  for (const v of views) {
    await p.evaluate(v => window.__rubin.goView(v), v);
    await p.waitForTimeout(3500);
    await p.screenshot({ timeout: 120000, path: `/tmp/shot_${v.replace(/\W+/g,"_")}.png` });
  }
  console.log(logs.slice(0, 20).join('\n'));
  await b.close();
})();
