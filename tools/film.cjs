// Render the film page (film/) and build the videos. Needs `npm run build && npm run preview`
// running (port 4173) and ffmpeg on the PATH. Frames are rendered deterministically (film time,
// not wall clock), so a slow software GPU only makes rendering slower, never the video jerkier.
//
//   node tools/film.cjs draft [WxH] [fps] [out.mp4] [from-to]   quick preview, titles included
//        e.g. node tools/film.cjs draft 640x360 15 shots/film-draft.mp4
//   node tools/film.cjs master [WxH] [fps]                      the long render: clean video, no text
//        → shots/film-master.mp4 (near-lossless). Rendered in 4 s segments into shots/film-master/,
//          so an interrupted render resumes where it stopped (just run it again).
//   node tools/film.cjs titles [WxH]                            each title alone, transparent
//        → shots/film-titles/title-<i>.png + titles.json (timings)
//   node tools/film.cjs compose [master.mp4] [out base]         master + titles → final videos
//        → shots/film.webm (AV1, for the web) and shots/film.mp4 (H.264, plays everywhere)
//   node tools/film.cjs loop [from-to] [out base]               short text-free loop for the home page
//        → shots/film-loop.webm / .mp4 / .jpg (default 31.5-42 s, 1280×720)
// A title change only needs `titles` + `compose` (minutes), never a new `master` (hours).
// Step-by-step guide, dependencies included: film/RENDERING.md
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const URL = 'http://localhost:4173/film/';
// Software WebGL (SwiftShader) by default: identical everywhere, slow. FILM_GL=gpu tries the
// machine's GPU instead (much faster where headless Chromium can use it). CHROME=/path/to/chrome
// uses that browser instead of Playwright's own Chromium.
const GL = process.env.FILM_GL === 'gpu'
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function openFilm(size, query) {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ args: GL, executablePath: process.env.CHROME });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${URL}?${query}`);
  await p.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 300000 });
  return { b, p, w, h };
}

/** render frames [t0, t1) at fps and pipe them into ffmpeg (no PNGs on disk) */
async function renderTo(p, t0, t1, fps, ffArgs, out) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...ffArgs, out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`)))));
  const n = Math.round((t1 - t0) * fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.__film.render(t), t0 + i / fps);
    const png = await p.screenshot({ type: 'png', timeout: 300000 });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  return n;
}

const H264_MASTER = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p'];
const H264_WEB = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

async function draft([size = '640x360', fps = '15', out = 'shots/film-draft.mp4', range]) {
  const { b, p } = await openFilm(size, 'capture');
  const duration = await p.evaluate(() => window.__film.duration);
  const [t0, t1] = range ? range.split('-').map(Number) : [0, duration];
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const start = Date.now();
  const n = await renderTo(p, t0, t1, +fps, H264_WEB, out);
  await b.close();
  console.log(`wrote ${out} (${n} frames, ${((Date.now() - start) / 1000).toFixed(0)} s)`);
}

async function master([size = '1920x1080', fps = '30']) {
  const dir = 'shots/film-master';
  fs.mkdirSync(dir, { recursive: true });
  const { b, p } = await openFilm(size, 'capture&notext');
  const duration = await p.evaluate(() => window.__film.duration);
  const SEG = 4;
  const segs = [];
  const start = Date.now();
  for (let k = 0; k * SEG < duration; k++) {
    const file = path.join(dir, `seg-${String(k).padStart(3, '0')}-${size}-${fps}.mp4`);
    segs.push(file);
    if (fs.existsSync(file)) continue; // done in an earlier run
    const t0 = k * SEG;
    const t1 = Math.min(duration, t0 + SEG);
    const tmp = file.replace(/\.mp4$/, '.part.mp4');
    await renderTo(p, t0, t1, +fps, H264_MASTER, tmp);
    fs.renameSync(tmp, file);
    console.log(`segment ${k} (${t0}-${t1} s) done, ${((Date.now() - start) / 60000).toFixed(1)} min`);
  }
  await b.close();
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, segs.map((f) => `file '${path.resolve(f)}'`).join('\n') + '\n');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', 'shots/film-master.mp4'], { stdio: 'inherit' });
  console.log('wrote shots/film-master.mp4');
}

async function titles([size = '1920x1080']) {
  const dir = 'shots/film-titles';
  fs.mkdirSync(dir, { recursive: true });
  const { b, p } = await openFilm(size, 'capture');
  const caps = await p.evaluate(() => window.__film.captions);
  await b.close();
  for (let i = 0; i < caps.length; i++) {
    const t = await openFilm(size, `title=${i}`);
    await t.p.screenshot({ path: path.join(dir, `title-${i}.png`), omitBackground: true });
    await t.b.close();
  }
  fs.writeFileSync(path.join(dir, 'titles.json'), JSON.stringify(caps.map(([a, b2, text], i) => ({ from: a, to: b2, text, file: `title-${i}.png` })), null, 1));
  // closing card (storyboard D5), opaque
  const e = await openFilm(size, 'endcard');
  const card = await e.p.evaluate(() => window.__film.endCard);
  await e.p.screenshot({ path: path.join(dir, 'endcard.png') });
  await e.b.close();
  fs.writeFileSync(path.join(dir, 'endcard.json'), JSON.stringify({ ...card, file: 'endcard.png' }, null, 1));
  console.log(`wrote ${caps.length} titles and the end card in ${dir}`);
}

function compose([masterFile = 'shots/film-master.mp4', outBase = 'shots/film']) {
  const dir = 'shots/film-titles';
  const caps = JSON.parse(fs.readFileSync(path.join(dir, 'titles.json'), 'utf8'));
  const inputs = ['-i', masterFile];
  const chain = [];
  let last = '0:v';
  caps.forEach((c, i) => {
    inputs.push('-loop', '1', '-i', path.join(dir, c.file));
    // the same 0.5 s fade in and out as on the page
    const fadeOut = Math.max(c.from, c.to - 0.5);
    chain.push(`[${i + 1}:v]format=rgba,fade=t=in:st=${c.from}:d=0.5:alpha=1,fade=t=out:st=${fadeOut}:d=0.5:alpha=1[t${i}]`);
    chain.push(`[${last}][t${i}]overlay=enable='between(t,${c.from},${c.to})':shortest=1[v${i}]`);
    last = `v${i}`;
  });
  // the closing card cross-fades in (0.5 s) after the last frame of the film
  const endFile = path.join(dir, 'endcard.json');
  if (fs.existsSync(endFile)) {
    const card = JSON.parse(fs.readFileSync(endFile, 'utf8'));
    const film = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', masterFile]).toString();
    const st = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,width,height', '-of', 'json', masterFile]).toString()).streams[0];
    const fps = st.r_frame_rate;
    const size = [st.width, st.height];
    const k = caps.length + 1;
    inputs.push('-loop', '1', '-t', String(card.seconds + 0.5), '-i', path.join(dir, card.file));
    chain.push(`[${last}]format=yuv420p,setsar=1[vf]`);
    chain.push(`[${k}:v]scale=${size[0]}:${size[1]},fps=${fps},format=yuv420p,setsar=1[card]`);
    chain.push(`[vf][card]xfade=transition=fade:duration=0.5:offset=${(film - 0.5).toFixed(3)}[vend]`);
    last = 'vend';
  }
  const filter = chain.join(';');
  const run = (args, out) => {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', `[${last}]`, ...args, out], { stdio: 'inherit' });
    console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
  };
  run(['-c:v', 'libsvtav1', '-preset', '5', '-crf', '35', '-pix_fmt', 'yuv420p'], `${outBase}.webm`);
  run(H264_WEB, `${outBase}.mp4`);
}

/** short loop for the home page (storyboard D7): cut from the text-free master, light fade to black
 *  at both ends, 1280×720, no titles; plus a still (poster) for reduced motion and loading */
function loop([range = '31.5-42', outBase = 'shots/film-loop', masterFile = 'shots/film-master.mp4', posterAt = '41']) {
  const [t0, t1] = range.split('-').map(Number);
  const d = t1 - t0;
  const vf = `scale=1280:720:flags=lanczos,fade=t=in:st=0:d=0.3,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3,format=yuv420p`;
  const run = (args, out) => {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t0), '-t', String(d), '-i', masterFile, '-vf', vf, '-an', ...args, out], { stdio: 'inherit' });
    console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
  };
  run(['-c:v', 'libsvtav1', '-preset', '5', '-crf', '38'], `${outBase}.webm`);
  run(['-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart'], `${outBase}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', posterAt, '-i', masterFile, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '3', `${outBase}.jpg`]);
  console.log(`wrote ${outBase}.jpg (poster, film time ${posterAt} s)`);
}

const [cmd, ...args] = process.argv.slice(2);
const cmds = { draft, master, titles, compose, loop };
if (!cmds[cmd]) {
  console.error('usage: node tools/film.cjs draft|master|titles|compose|loop …  (see the header of this file)');
  process.exit(1);
}
Promise.resolve(cmds[cmd](args)).catch((e) => {
  console.error(e);
  process.exit(1);
});
