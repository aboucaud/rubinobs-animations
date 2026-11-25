// Translation check, against `npm run dev` (port 5173): drives every page in a language (labels,
// menus, a survey night, an exposure, filter exchanges…) and prints each English text that has no
// entry in src/i18n/<lang>.json (the dev-only "i18n: no … text" warnings of src/i18n.ts).
// usage: node tools/i18n.cjs fr   (or es). Lower-case property names (rays, glass…) and proper
// names (batoid, obs_lsst) may be listed: lil-gui shows them for an instant before `.name()`.
const { chromium } = require('playwright');
const lang = process.argv[2] || 'fr';
const B = 'http://localhost:5173/';
const clickAll = `(async()=>{ for (const b of document.querySelectorAll('#labels .label')) { b.click(); await new Promise(r=>setTimeout(r,30)); } })()`;
const clickBtns = (sel) => `(async()=>{ for (const b of document.querySelectorAll('${sel}')) { b.click(); await new Promise(r=>setTimeout(r,250)); } })()`;
const PAGES = [
  ['', []],
  ['film/', []],
  ['telescope/', [clickAll, clickBtns('#bar button'), clickBtns('.lil-gui button'), "__rubin.state.fieldAngle=1.6"]],
  ['observatory/', [clickAll, "document.getElementById('bOpen').click()", "__rubin.advance(6)", "document.getElementById('bObs').click()", "__rubin.advance(3)", "__rubin.advance(10)", "__rubin.advance(30)", clickBtns('.lil-gui button'), "document.querySelector('[data-t=\"0.15\"]').click()"]],
  ['camera/', [clickAll, clickBtns('.lil-gui button'), "document.querySelector('#bar .primary').click()", ...Array(12).fill("__rubin.advance(1.2)"), "document.querySelector('[data-band=g]').click()", ...Array(40).fill("__rubin.advance(1)"), "document.getElementById('bNone').click()", ...Array(30).fill("__rubin.advance(1)")]],
  ['filters/', [clickAll, clickBtns('.lil-gui button'), "document.querySelector('[data-band=g]').click()", ...Array(60).fill("__rubin.advance(0.5)"), "document.getElementById('bNone').click()", ...Array(40).fill("__rubin.advance(0.5)"), "document.querySelector('[data-band=i]').click()", ...Array(60).fill("__rubin.advance(0.5)"), "document.getElementById('bSwap').click()", "__rubin.advance(3)"]],
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const all = new Set();
  for (const [page, acts] of PAGES) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    p.on('console', (m) => { const t = m.text(); const i = t.indexOf(' text for '); if (t.startsWith('i18n:')) all.add(page + '\t' + JSON.parse(t.slice(i + 10))); });
    p.on('pageerror', (e) => console.error('ERR', page, e.message));
    await p.goto(B + page + '?lang=' + lang, { timeout: 180000 });
    await p.waitForTimeout(4000);
    for (const a of acts) { try { await p.evaluate(a); } catch (e) { console.error('act', page, a.slice(0,60), e.message.slice(0,100)); } await p.waitForTimeout(400); }
    await p.close();
  }
  await b.close();
  console.log([...all].join('\n'));
})();
