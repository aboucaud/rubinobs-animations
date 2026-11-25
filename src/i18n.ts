// Translations of the site (English is the source language).
//
// The page code only writes English. This module translates the text as it reaches the page —
// static HTML, innerHTML updates, labels, the settings menu, title attributes — from one
// dictionary per language (`src/i18n/<lang>.json`), keyed by the English text with its white
// space collapsed. A key may hold {0}, {1}… for variable parts ("Visits tonight: {0}"); numbers
// in them are re-formatted for the language (decimal comma), other values are translated if they
// are keys themselves, else kept. Text with no entry stays in English; `npm run dev` lists it in
// the console ("i18n: no fr text for …").
//
// Language: ?lang=xx (remembered), else the last choice, else the browser's language, else English.
// A page whose <html> has `data-no-translate` stays in English (film/3d: the page the film is
// rendered from).

const LANGS = ['en', 'fr', 'es'] as const;
type Lang = (typeof LANGS)[number];
const NAMES: Record<Lang, string> = { en: 'English', fr: 'Français', es: 'Español' };

function store(get: string | null): string | null {
  try {
    if (get) localStorage.setItem('lang', get);
    return localStorage.getItem('lang');
  } catch {
    return get; // storage unavailable (private mode, some embeds)
  }
}

const isLang = (s: string | null | undefined): s is Lang => (LANGS as readonly string[]).includes(s ?? '');
const fixed = document.documentElement.hasAttribute('data-no-translate');
const query = new URLSearchParams(location.search).get('lang');
const wanted = fixed ? 'en' : (store(isLang(query) ? query : null) ?? navigator.language.slice(0, 2));
export const LANG: Lang = isLang(wanted) ? wanted : 'en';

const DICT: Record<string, string> = LANG === 'en' ? {} : (await import(`./i18n/${LANG}.json`)).default;

const exact = new Map<string, string>();
const patterns: { re: RegExp; out: string }[] = [];
for (const [k, v] of Object.entries(DICT)) {
  if (!/\{\d\}/.test(k)) exact.set(k, v);
  else patterns.push({ re: new RegExp(`^${k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d)\}/g, '(?<p$1>.+?)')}$`), out: v });
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const numberFormat = (s: string) =>
  new Intl.NumberFormat(LANG, { minimumFractionDigits: s.split('.')[1]?.length ?? 0, useGrouping: Math.abs(+s) >= 10000 }).format(+s);

/** The translation of an English text (white space collapsed), or null if there is none. */
function translate(text: string): string | null {
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  for (const { re, out } of patterns) {
    const m = re.exec(text);
    if (m) return out.replace(/\{(\d)\}/g, (_, i) => {
      const v = m.groups![`p${i}`];
      return NUMBER.test(v) ? numberFormat(v) : (exact.get(v) ?? v);
    });
  }
  return null;
}

// dev only: texts already reported, and our own translations (the observer sees them come back)
const seen = new Set<string>();
function translateText(node: Text) {
  const raw = node.data;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return;
  const out = translate(text);
  if (out === null) {
    if (import.meta.env.DEV && /[a-z]{3}/i.test(text) && !seen.has(text)) {
      seen.add(text);
      console.warn(`i18n: no ${LANG} text for ${JSON.stringify(text)}`);
    }
    return;
  }
  if (import.meta.env.DEV) seen.add(out);
  const next = raw.match(/^\s*/)![0] + out + raw.match(/\s*$/)![0];
  if (next !== raw) node.data = next;
}

function translateTitle(el: Element) {
  const t = el.getAttribute('title');
  const out = t && translate(t.replace(/\s+/g, ' ').trim());
  if (out && out !== t) el.setAttribute('title', out);
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root as Text);
  if (!(root instanceof Element) || root.closest('script, style')) return;
  if (root.hasAttribute('title')) translateTitle(root);
  root.querySelectorAll('[title]').forEach(translateTitle);
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) translateText(n as Text);
}

/** EN · FR · ES links, after the "← All animations" link of a page or at the top of the landing page. */
function addSwitch() {
  const nav = document.createElement('nav');
  nav.className = 'lang';
  nav.setAttribute('aria-label', 'Language');
  for (const l of LANGS) {
    const url = new URL(location.href);
    url.searchParams.set('lang', l);
    const a = document.createElement('a');
    a.href = url.search + url.hash;
    a.textContent = l.toUpperCase();
    a.title = NAMES[l];
    a.lang = l;
    if (l === LANG) a.setAttribute('aria-current', 'true');
    nav.append(a);
  }
  const home = document.querySelector('header a.home, .back');
  if (home) home.after(nav);
  else document.querySelector('header')?.prepend(nav);
}

if (!fixed) {
  addSwitch();
  if (LANG !== 'en') {
    document.documentElement.lang = LANG;
    document.title = translate(document.title.replace(/\s+/g, ' ').trim()) ?? document.title;
    // texts drawn by CSS (style.css: the phone info panel's "more" / "less")
    for (const [k, en] of [['more', '▸ more'], ['less', '▾ less']]) document.documentElement.style.setProperty(`--i18n-${k}`, JSON.stringify(translate(en) ?? en));
    translateTree(document.body);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') translateText(r.target as Text);
        else if (r.type === 'attributes') translateTitle(r.target as Element);
        else r.addedNodes.forEach(translateTree);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title'] });
  }
}
