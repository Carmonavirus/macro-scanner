// Small shared UI helpers.

import { MACROS, MAIN_KEYS, fmt, energySplit } from './nutrition.js';
import { icon } from './icons.js';

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

export function macroTiles(values, { goals = null, keys = MAIN_KEYS } = {}) {
  return `<div class="tiles tiles-${keys.length}">${keys.map((k) => {
    const m = MACROS.find((x) => x.key === k);
    const goal = goals?.[k];
    if (!(goal > 0)) {
      return `<div class="tile tile-${k}"><span class="val">${fmt(values[k], k)}</span><span class="unit">${m.unit}</span><span class="lbl">${m.label}</span></div>`;
    }
    const v = values[k] || 0;
    const reached = v >= goal;
    const pct = Math.min(100, (v / goal) * 100);
    return `<div class="tile tile-${k}${reached ? ' reached' : ''}" title="${m.label}: ${fmt(v, k)} of ${fmt(goal, k)} ${m.unit}${reached ? ', goal reached' : ''}">
      <span class="val">${fmt(v, k)}</span>
      <span class="unit">/ ${fmt(goal, k)}${k === 'kcal' ? '' : ' g'}</span>
      <span class="meter" aria-hidden="true"><i style="width:${pct}%"></i></span>
      <span class="lbl">${reached ? `${icon('check', { label: 'Goal reached', cls: 'check' })} ` : ''}${m.label}</span>
    </div>`;
  }).join('')}</div>`;
}

/** Calories as a header line: eaten / goal, progress bar and what's left. */
export function kcalHeader(kcal, goal, { extra = '' } = {}) {
  const has = goal > 0;
  const reached = has && kcal >= goal;
  const pct = has ? Math.min(100, (kcal / goal) * 100) : 0;
  const status = !has ? '' : reached
    ? `${icon('check', { cls: 'check' })} Goal reached${kcal > goal ? ` · ${fmt(kcal - goal, 'kcal')} over` : ''}`
    : `${fmt(goal - kcal, 'kcal')} left`;
  return `<div class="kcal-head${reached ? ' reached' : ''}">
    <div class="kcal-line">
      <span class="kcal-num"><strong>${fmt(kcal, 'kcal')}</strong>${has ? ` <span class="muted">/ ${fmt(goal, 'kcal')}</span>` : ''} <span class="muted">kcal</span></span>
      <span class="kcal-status">${status}${extra}</span>
    </div>
    ${has ? `<span class="meter" aria-hidden="true"><i style="width:${pct}%"></i></span>` : ''}
  </div>`;
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
  return `P ${fmt(t.protein)} g · C ${fmt(t.carbs)} g · F ${fmt(t.fat)} g`;
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
