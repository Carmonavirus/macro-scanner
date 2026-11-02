// Small shared UI helpers.

import { MACROS, MAIN_KEYS, fmt, energySplit } from './nutrition.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const parseNum = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
};

// ---------- Navigation ----------
// Every in-app navigation pushes a history entry tagged with a depth counter, so we can
// jump back to the diary after adding food without leaving the add screens in history.

let onNavigate = () => {};
export function setNavigateHandler(fn) { onNavigate = fn; }
export const depth = () => history.state?.depth || 0;

export function go(hash, { replace = false } = {}) {
  if (replace) history.replaceState({ depth: depth() }, '', hash);
  else history.pushState({ depth: depth() + 1 }, '', hash);
  onNavigate();
}

/** Go back to an earlier history depth (e.g. the diary we came from), or replace. */
export function backTo(targetDepth, fallbackHash) {
  const n = depth() - targetDepth;
  if (targetDepth != null && n > 0) history.go(-n);
  else go(fallbackHash, { replace: true });
}

/** Parse '#/a/b?x=1' into { parts: ['a','b'], query: {x:'1'} } */
export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  return {
    parts: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: Object.fromEntries(new URLSearchParams(qs)),
  };
}

// ---------- Rendering helpers ----------

export function macroTiles(values, { unitless = false } = {}) {
  return `<div class="tiles">${MAIN_KEYS.map((k) => {
    const m = MACROS.find((x) => x.key === k);
    return `<div class="tile tile-${k}"><span class="val">${fmt(values[k], k)}</span>${unitless ? '' : `<span class="unit">${m.unit}</span>`}<span class="lbl">${m.label}</span></div>`;
  }).join('')}</div>`;
}

/** Horizontal bar showing the energy split protein / carbs / fat, with a text legend. */
export function splitBar(t) {
  const s = energySplit(t);
  if (!s.protein && !s.carbs && !s.fat) return '';
  const seg = (k) => (s[k] > 0 ? `<span class="seg seg-${k}" style="flex-grow:${s[k]}"></span>` : '');
  const lbl = (k, name) => `<span class="key"><i class="dot dot-${k}"></i>${name} ${Math.round(s[k])}%</span>`;
  return `<div class="split" role="img" aria-label="Energy from protein ${Math.round(s.protein)}%, carbs ${Math.round(s.carbs)}%, fat ${Math.round(s.fat)}%">
    <div class="split-bar">${seg('protein')}${seg('carbs')}${seg('fat')}</div>
    <div class="split-keys">${lbl('protein', 'Protein')}${lbl('carbs', 'Carbs')}${lbl('fat', 'Fat')}</div>
  </div>`;
}

export function pmf(t) {
  return `P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}`;
}

let toastTimer;
export function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** Shared navigation state: history depth of the diary we came from. */
export const nav = { diaryDepth: null };
