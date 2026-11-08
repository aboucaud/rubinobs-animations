// A night of the survey: the scheduler picks fields, the telescope slews, the camera exposes, and the
// coverage of the sky builds up night after night on an all-sky map, next to the local sky above
// Cerro Pachón. This page is a 2D sky view: it uses its own renderer setup rather than createViewer
// (no 3D camera, controls or post-processing).
import * as THREE from 'three';
import '../style.css';
import { BANDS, BAND_HEX, BAND_INFO, type Band } from '../scene/bands';
import { Scheduler, type Night, type Visit } from '../survey/scheduler';
import { Coverage, COV_W, COV_H } from '../survey/coverage';
import { SkyViews, type MapMode } from '../survey/skymap';
import { REGIONS, region } from '../survey/footprint';
import { D2R, altAz, jdFromMs, lst, moon, moonIllumination, msFromJd, sun } from '../survey/astro';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// every pixel of the sky views runs a full shader: cap the pixel ratio a little lower than the 3D pages
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05070d);

// ---------------------------------------------------------------- simulation state
const TZ = 'America/Santiago';
const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** JD of local noon (≈ 16:43 UTC at Rubin's longitude) of a YYYY-MM-DD date. */
const noonJd = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return jdFromMs(Date.UTC(y, m - 1, d, 16, 43));
};

const params = new URLSearchParams(location.search);
let startDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : fmtDay.format(new Date(Date.now() - 12 * 3600e3));

let sched: Scheduler;
let cov: Coverage;
let night: Night;
let idx = 0; // next visit of `night` not yet added to the coverage
let jd = 0;
let imagesTotal = 0;
let imagesTonight = 0;
let dayPause = 0; // real seconds spent showing "daytime" before jumping to the next night
let recentArea = 0;
let ffNights = 0; // nights left to fast-forward

const views = (() => {
  cov = new Coverage(0);
  return new SkyViews(cov);
})();
const U = views.uniforms;

function reset(date: string) {
  startDate = date;
  const seed = Number(date.replace(/-/g, ''));
  sched = new Scheduler(seed);
  const n0 = noonJd(date);
  cov.reset(n0);
  imagesTotal = 0;
  night = sched.planNight(n0);
  startNight();
  // centre the map on the meridian at the middle of the first night
  U.uRa0.value = Math.round(lst((night.start + night.end) / 2) / (Math.PI / 12)) * (Math.PI / 12);
  resetZoom();
}

function startNight() {
  idx = 0;
  imagesTonight = 0;
  dayPause = 0;
  jd = night.start - 3 / 1440;
  recentArea = cov.areaSince(night.start - cov.epoch - 4);
}

const visitEnd = (v: Visit) => v.t0 + v.dur / 86400;

/** Add every visit finished by `t` to the coverage. */
function advanceTo(t: number) {
  jd = t;
  while (idx < night.visits.length && visitEnd(night.visits[idx]) <= t) {
    cov.add(night.visits[idx++]);
    imagesTonight++;
    imagesTotal++;
  }
}

function nextNight() {
  advanceTo(Math.max(jd, night.end));
  night = sched.planNight(noonJd(startDate) + night.index + 1);
  startNight();
}

// ---------------------------------------------------------------- layout
let mapRect = [0, 0, 1, 1];
let skyRect = [0, 0, 1, 1];
const skyEl = document.getElementById('sky')!;
const bar = document.getElementById('bar')!;
function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const wide = w > 980;
  const S = wide ? Math.round(Math.min(260, Math.max(150, Math.min(w, h) * 0.28))) : 110;
  const top = 14;
  skyRect = [w - S - 14, h - S - top, S, S];
  Object.assign(skyEl.style, { width: `${S}px`, height: `${S}px`, top: `${top}px`, right: '14px' });
  const x0 = wide ? 350 : 0;
  const bottom = wide ? 64 : bar.offsetHeight + 24;
  const topM = wide ? 40 : 250;
  mapRect = [x0, bottom, w - x0 - (wide ? 10 : 0), h - bottom - topM];
}
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  layout();
});

// ---------------------------------------------------------------- map projection (CSS px)
const SQ2 = Math.SQRT2;
let zoom = 1;
const pan = new THREE.Vector2();
function resetZoom() {
  zoom = 1;
  pan.set(0, 0);
}
/** map units per CSS pixel */
const unitsPerPx = () => (2 * SQ2 * 2.08) / Math.min(mapRect[2], 2 * mapRect[3]) / zoom;

/** Mollweide map coordinates of a direction. */
function mapXY(ra: number, dec: number) {
  let th = dec;
  for (let i = 0; i < 10; i++) th -= (2 * th + Math.sin(2 * th) - Math.PI * Math.sin(dec)) / (2 + 2 * Math.cos(2 * th) + 1e-9);
  const dra = ((((ra - U.uRa0.value + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return { x: ((-2 * SQ2) / Math.PI) * dra * Math.cos(th), y: SQ2 * Math.sin(th) };
}

/** CSS pixel of a direction on the map. */
function project(ra: number, dec: number) {
  const m = mapXY(ra, dec);
  const s = unitsPerPx();
  return {
    x: mapRect[0] + mapRect[2] / 2 + (m.x - pan.x) / s,
    y: window.innerHeight - mapRect[1] - mapRect[3] / 2 - (m.y - pan.y) / s,
  };
}

/** Sky direction under a CSS pixel of the map, or null outside the ellipse. */
function unproject(px: number, py: number) {
  const s = unitsPerPx();
  const mx = (px - mapRect[0] - mapRect[2] / 2) * s + pan.x;
  const my = (window.innerHeight - py - mapRect[1] - mapRect[3] / 2) * s + pan.y;
  if ((mx * mx) / 8 + (my * my) / 2 > 1) return null;
  const th = Math.asin(my / SQ2);
  const dec = Math.asin((2 * th + Math.sin(2 * th)) / Math.PI);
  const ra = (((U.uRa0.value - (Math.PI * mx) / (2 * SQ2 * Math.cos(th))) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { ra, dec };
}

// pan & zoom: wheel, drag, pinch; a click shows the visits at that point
const pointers = new Map<number, { x: number; y: number }>();
let moved = 0;
function zoomAt(px: number, py: number, f: number) {
  const s0 = unitsPerPx();
  const qx = px - mapRect[0] - mapRect[2] / 2;
  const qy = window.innerHeight - py - mapRect[1] - mapRect[3] / 2;
  const mx = qx * s0 + pan.x;
  const my = qy * s0 + pan.y;
  zoom = Math.min(16, Math.max(1, zoom * f));
  const s1 = unitsPerPx();
  pan.set(mx - qx * s1, my - qy * s1);
  if (zoom === 1) pan.set(0, 0);
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  follow = false;
  followBtn.classList.remove('active');
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0;
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d0 = Math.hypot(a.x - b.x, a.y - b.y);
    p.x = e.clientX;
    p.y = e.clientY;
    const d1 = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d1 / Math.max(1, d0));
    moved += 10;
    return;
  }
  if (follow && Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 2) setFollow(false);
  const s = unitsPerPx();
  pan.x -= (e.clientX - p.x) * s;
  pan.y += (e.clientY - p.y) * s;
  moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
  p.x = e.clientX;
  p.y = e.clientY;
  if (zoom === 1) pan.set(0, 0);
});
canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (moved < 4) showPoint(e.clientX, e.clientY);
});
canvas.addEventListener('dblclick', resetZoom);

const tip = document.getElementById('tip')!;
document.body.addEventListener('pointerdown', (e) => {
  if (!(e.target as HTMLElement).closest('#tip, .label, #c')) tip.classList.remove('show');
});
function showTip(html: string) {
  tip.innerHTML = html;
  tip.classList.add('show');
}

const hms = (ra: number) => {
  const h = ((ra / D2R / 15) % 24 + 24) % 24;
  return `${Math.floor(h)}h${String(Math.floor((h % 1) * 60)).padStart(2, '0')}m`;
};
const deg = (a: number, d = 1) => `${a >= 0 ? '+' : '−'}${Math.abs(a / D2R).toFixed(d)}°`;

function showPoint(px: number, py: number) {
  const p = unproject(px, py);
  if (!p) return tip.classList.remove('show');
  const col = Math.floor((p.ra / (2 * Math.PI)) * COV_W) % COV_W;
  const row = Math.min(COV_H - 1, Math.floor(((Math.PI / 2 - p.dec) / Math.PI) * COV_H));
  const k = row * COV_W + col;
  const n = [cov.a[4 * k], cov.a[4 * k + 1], cov.a[4 * k + 2], cov.a[4 * k + 3], cov.b[4 * k], cov.b[4 * k + 1]];
  const total = n.reduce((a, b) => a + b, 0);
  const reg = region(p.ra, p.dec);
  const last = cov.last[k];
  const ago = total ? (jd - cov.epoch - last) : 0;
  showTip(
    `<b>RA ${hms(p.ra)}, Dec ${deg(p.dec)}</b><p>${reg ? REGIONS[reg].name : 'Outside the survey footprint'}</p>` +
      `<p>${total} visit${total === 1 ? '' : 's'}${total ? ': ' + BANDS.map((b, i) => `<span style="color:${BAND_HEX[b]}">${b} ${n[i]}</span>`).join(' · ') : ''}</p>` +
      (total ? `<p>Last visit ${ago < 1 ? `${Math.round(ago * 24 * 60)} min` : `${ago.toFixed(1)} days`} ago</p>` : ''),
  );
}

// ---------------------------------------------------------------- labels on the map
interface MapLabel {
  title: string;
  text: string;
  pos: () => { ra: number; dec: number };
}
const fixed = (ra: number, dec: number) => () => ({ ra: ra * D2R, dec: dec * D2R });
const LABELS: MapLabel[] = [
  { title: 'Moon', text: 'Fields closer than 30° to the Moon are avoided (dashed circle). When the Moon is bright, the scheduler favours the red and infrared bands, where moonlight hurts less, and the u filter is swapped out of the carousel.', pos: () => moon(jd) },
  { title: 'Sun', text: 'Observing starts and stops when the Sun is 12° below the horizon (nautical twilight).', pos: () => sun(jd) },
  { title: 'LMC', text: 'The Large Magellanic Cloud, a satellite galaxy of the Milky Way, covered with its own band ratios (more u and g).', pos: fixed(80.89, -69.76) },
  { title: 'SMC', text: 'The Small Magellanic Cloud, about 200,000 light-years away.', pos: fixed(13.19, -72.83) },
  { title: 'Galactic centre', text: 'Toward the centre of the Milky Way the dust hides what lies behind, so the plane gets fewer visits, except the bulge, which gets almost as many as the wide survey.', pos: fixed(266.4, -28.94) },
  { title: 'Virgo cluster', text: 'The nearest large cluster of galaxies, added to the survey footprint although it lies just north of the main area.', pos: fixed(186.75, 12.72) },
  { title: 'South celestial pole', text: 'Always above the horizon from Cerro Pachón, but at high airmass: a few visits per band.', pos: fixed(0, -89.9) },
];
const labelLayer = document.getElementById('labels')!;
const labelEls = LABELS.map((l) => {
  const el = document.createElement('button');
  el.className = 'label';
  el.textContent = l.title;
  el.onclick = (e) => {
    e.stopPropagation();
    showTip(`<b>${l.title}</b><p>${l.text}</p>`);
  };
  labelLayer.appendChild(el);
  return el;
});
const labelShown = LABELS.map(() => true);
function updateLabels() {
  const narrow = window.innerWidth <= 720; // phones: Sun and Moon only
  LABELS.forEach((l, i) => {
    const p = l.pos();
    const s = project(p.ra, p.dec);
    const inside = (!narrow || i < 2) && unproject(s.x, s.y) && s.x > mapRect[0] && s.x < mapRect[0] + mapRect[2] - 20 && !(s.x > skyRect[0] - 10 && s.y < skyRect[3] + 24);
    if (inside !== labelShown[i]) {
      labelEls[i].style.display = inside ? 'block' : 'none';
      labelShown[i] = !!inside;
    }
    if (inside) labelEls[i].style.transform = `translate(${s.x}px, ${s.y}px)`;
  });
}

// ---------------------------------------------------------------- HUD
const info = document.getElementById('info')!;
const SPEEDS = [1, 30, 300, 3000];
let speed = 300;
let playing = true;
let mode: MapMode = 0;
let follow = false;
const MODES = ['Bands', 'Visits', 'Last visit'];

bar.innerHTML = `
  <button id="play" class="primary">Pause</button>
  <span class="sep">Speed</span>${SPEEDS.map((s) => `<button data-speed="${s}">×${s}</button>`).join('')}
  <span class="sep">Map</span>${MODES.map((m, i) => `<button data-mode="${i}">${m}</button>`).join('')}
  <button id="follow">Follow the telescope</button>
  <span class="sep">Skip</span><button data-ff="1">+1 night</button><button data-ff="30">+1 month</button><button data-ff="365">+1 year</button>
  <label class="slider">From <input id="date" type="date" value="${startDate}"></label>`;
const playBtn = bar.querySelector<HTMLButtonElement>('#play')!;
playBtn.onclick = () => {
  playing = !playing;
  playBtn.textContent = playing ? 'Pause' : 'Play';
};
const setActive = (attr: string, v: string) => bar.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => b.classList.toggle('active', b.dataset[attr] === v));
const setSpeed = (s: number) => {
  speed = s;
  setActive('speed', String(s));
};
const setMode = (m: MapMode) => {
  mode = m;
  U.uMode.value = m;
  setActive('mode', String(m));
};
bar.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => (b.onclick = () => setSpeed(Number(b.dataset.speed))));
bar.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => (b.onclick = () => setMode(Number(b.dataset.mode) as MapMode)));
bar.querySelectorAll<HTMLButtonElement>('[data-ff]').forEach((b) => (b.onclick = () => (ffNights = Number(b.dataset.ff))));
const followBtn = bar.querySelector<HTMLButtonElement>('#follow')!;
const setFollow = (on: boolean) => {
  follow = on;
  followBtn.classList.toggle('active', on);
  if (!on) resetZoom();
};
followBtn.onclick = () => setFollow(!follow);
const dateInput = bar.querySelector<HTMLInputElement>('#date')!;
dateInput.onchange = () => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) reset(dateInput.value);
};
bar.querySelectorAll('button').forEach((b) => b.style.setProperty('--c', '#5aa8ff'));
setSpeed(speed);
setMode(0);
layout();

const SOCKETS: Band[][] = [['u', 'y'], ['g'], ['r'], ['i'], ['z']];
const chip = (b: Band, on: boolean, active = false) =>
  `<span class="chip${on ? '' : ' off'}${active ? ' on' : ''}" style="--c:${BAND_HEX[b]}">${b}</span>`;

function legend() {
  if (mode === 0) return `<div class="k">Colour: mix of the bands observed at each point, brighter with more visits</div>`;
  if (mode === 1) return `<div class="k">Visits per point, all bands (0 → ${Math.round(1.6 * norm())})</div><div class="ramp"></div>`;
  return `<div class="k">Band of the last visit; bright = observed in the last day or two</div>`;
}

const norm = () => Math.max(0.5, (imagesTotal * 9.6) / cov.footprintArea);

interface Phase {
  state: string;
  detail: string;
  visit: Visit | null;
  /** field opacity and fill */
  show: number;
  fill: number;
  ra: number;
  dec: number;
  rot: number;
  cycle: [number, number, number] | null; // gap, exposure, elapsed (s)
}

function phase(): Phase {
  const v = night.visits[idx];
  const prev = night.visits[idx - 1];
  const none = { visit: null, show: 0, fill: 0, ra: 0, dec: 0, rot: 0, cycle: null };
  if (jd < night.start) {
    const s = sun(jd);
    return { ...none, state: 'Evening twilight', detail: `The Sun is ${(-altAz(s.ra, s.dec, lst(jd)).alt / D2R).toFixed(1)}° below the horizon; the survey starts at 12°.` };
  }
  if (!v) return { ...none, state: 'Dawn', detail: 'Morning twilight: the dome closes until the next night.' };
  if (jd < v.t0) {
    const el = (jd - (v.t0 - v.gap / 86400)) * 86400;
    const slewDur = Math.min(v.gap, 10);
    const k = Math.min(1, el / slewDur);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    let ra = v.ra;
    let dec = v.dec;
    let rot = v.rot;
    if (prev) {
      ra = prev.ra + Math.atan2(Math.sin(v.ra - prev.ra), Math.cos(v.ra - prev.ra)) * e;
      dec = prev.dec + (v.dec - prev.dec) * e;
      rot = prev.rot + Math.atan2(Math.sin(v.rot - prev.rot), Math.cos(v.rot - prev.rot)) * e;
    }
    let state = 'Slew and settle';
    let detail = `Mount and dome move to the next field, then the telescope settles (${v.gap.toFixed(1)} s in all).`;
    if (v.filterChange && prev) {
      state = `Filter change ${prev.band} → ${v.band}`;
      detail = `The autochanger puts ${prev.band} back in the carousel and brings ${v.band} into the beam, while the telescope slews.`;
    } else if (v.closedLoop && el > slewDur) {
      state = 'Active optics';
      detail = 'After a large change of elevation, the mirrors and camera are re-aligned from the wavefront sensors before exposing.';
    } else if (prev && el < 2) {
      state = 'Readout + slew';
      detail = 'The 3.2-gigapixel image is read out in 2 s while the telescope is already moving.';
    }
    return { state, detail, visit: v, show: 1, fill: 0, ra, dec, rot, cycle: [v.gap, v.dur, el] };
  }
  const el = (jd - v.t0) * 86400;
  return {
    state: el < 0.9 ? 'Shutter opening' : el > v.dur - 0.9 ? 'Shutter closing' : 'Exposing',
    detail: `${v.dur - 0.9} s exposure in the ${v.band} band.`,
    visit: v,
    show: 1,
    fill: Math.min(1, el / v.dur),
    ra: v.ra,
    dec: v.dec,
    rot: v.rot,
    cycle: [v.gap, v.dur, v.gap + el],
  };
}

let lastHud = 0;
let lastUpload = 0;
function updateHud(ph: Phase) {
  const v = ph.visit;
  const L = lst(jd);
  const m = moon(jd);
  const mAlt = altAz(m.ra, m.dec, L).alt / D2R;
  const carousel = SOCKETS.map((s) => {
    const b = s.find((x) => night.mounted.includes(x))!;
    return chip(b, true, !!v && v.band === b);
  }).join('');
  const stored = BANDS.find((b) => !night.mounted.includes(b))!;
  let cycle = '';
  if (ph.cycle) {
    const [gap, dur, el] = ph.cycle;
    const tot = gap + dur;
    cycle = `<div class="cycle"><i style="width:${(100 * gap) / tot}%"></i><b style="width:${(100 * dur) / tot}%;--c:${BAND_HEX[v!.band]}"></b><u style="left:${(100 * el) / tot}%"></u></div>
      <div class="k">${gap.toFixed(1)} s ${v!.filterChange ? 'filter change' : 'slew'} · ${(dur - 0.9).toFixed(0)} s exposure</div>`;
  }
  const field = v
    ? `<div>Field RA ${hms(v.ra)}, Dec ${deg(v.dec)} · altitude ${v.alt.toFixed(0)}° · airmass ${v.airmass.toFixed(2)}</div>
       <div class="k">${v.pass === 1 ? '1st' : '2nd'} visit of a pair, ~33 min apart · ${BAND_INFO[v.band].range}</div>`
    : '';
  info.innerHTML = `
    <div class="clock">${fmtTime.format(new Date(msFromJd(jd)))} (Chile) · night ${night.index + 1}</div>
    <div class="band" style="--c:${v ? BAND_HEX[v.band] : '#9fb4d8'}">${v ? v.band : '—'} <span>${ph.state}</span></div>
    <div class="more">
      <div class="k">${ph.detail}</div>
      ${cycle}${field}
      <div class="row"><span class="k">Carousel</span> ${carousel} <span class="k">6th filter stored:</span> ${chip(stored, false)}</div>
      <div class="k">Moon ${Math.round(moonIllumination(jd) * 100)}% lit, ${mAlt > 0 ? `${mAlt.toFixed(0)}° high` : 'below the horizon'}</div>
    </div>
    <div class="stats">
      <div><b>${imagesTonight}</b><span>images tonight</span></div>
      <div><b>${((imagesTonight * 6.4) / 1000).toFixed(1)} TB</b><span>raw pixels tonight</span></div>
      <div><b>${Math.round(recentArea / 100) * 100}</b><span>deg² in the last 4 nights</span></div>
      <div><b>${imagesTotal.toLocaleString('en-US')}</b><span>images since ${startDate}</span></div>
    </div>
    <div class="more">${legend()}</div>
    ${ffNights > 0 ? `<div class="seq">Fast-forward: ${ffNights} night${ffNights > 1 ? 's' : ''} to go…</div>` : ''}`;
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let areaTimer = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, clock.getDelta());
  if (ffNights > 0) {
    // fast-forward whole nights within a frame budget
    const t0 = performance.now();
    while (ffNights > 0 && performance.now() - t0 < 30) {
      nextNight();
      ffNights--;
    }
    recentArea = cov.areaSince(night.start - cov.epoch - 4);
  } else if (playing) {
    if (idx >= night.visits.length && jd >= night.end) {
      dayPause += dt;
      if (speed >= 3000 || dayPause > 1.5) nextNight();
    } else advanceTo(jd + (dt * speed) / 86400);
  }
  areaTimer += dt;
  if (areaTimer > 1) {
    areaTimer = 0;
    recentArea = cov.areaSince(jd - cov.epoch - 4);
  }

  const ph = phase();
  const L = lst(jd);
  const s = sun(jd);
  const m = moon(jd);
  const vec = (p: { ra: number; dec: number }) => new THREE.Vector3(Math.cos(p.dec) * Math.cos(p.ra), Math.cos(p.dec) * Math.sin(p.ra), Math.sin(p.dec));
  U.uLst.value = L;
  U.uSun.value.copy(vec(s));
  U.uMoon.value.copy(vec(m));
  U.uMoonIllum.value = moonIllumination(jd);
  U.uNow.value = jd - cov.epoch;
  U.uNorm.value = norm();
  U.uField.value.set(ph.ra, ph.dec, ph.rot, ph.show);
  U.uFieldFill.value = ph.fill;
  if (ph.visit) U.uFieldCol.value.set(BAND_HEX[ph.visit.band]);
  if (follow && ph.show) {
    // glide toward the field, zoomed on the focal plane
    const m = mapXY(ph.ra, ph.dec);
    zoom += (8 - zoom) * Math.min(1, dt * 3);
    pan.x += (m.x - pan.x) * Math.min(1, dt * 4);
    pan.y += (m.y - pan.y) * Math.min(1, dt * 4);
  }
  U.uZoom.value = zoom;
  U.uPan.value.copy(pan);
  // coverage textures: at most 5 uploads per second once visits come faster than that
  const now = performance.now();
  if (speed <= 30 || now - lastUpload > 200) {
    cov.upload(mode === 2);
    lastUpload = now;
  }
  views.render(renderer, mapRect, skyRect);

  updateLabels();
  if (now - lastHud > 100) {
    lastHud = now;
    updateHud(ph);
  }
}

reset(startDate);
frame();

// hooks for screenshots: __survey.ff(30), __survey.mode(1), __survey.speed(1)
(window as unknown as { __survey: object }).__survey = {
  ff: (n: number) => (ffNights = n),
  mode: (m: MapMode) => setMode(m),
  speed: (s: number) => setSpeed(s),
  follow: () => setFollow(true),
  pause: () => playBtn.click(),
  at: (hours: number) => advanceTo(night.start + hours / 24),
};
