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
/** Short message at the bottom. Optional action button, e.g. { action: 'Undo', onAction }. */
export function toast(msg, { action, onAction, ms } = {}) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('has-action', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action;
    b.addEventListener('click', () => { el.classList.remove('show'); clearTimeout(toastTimer); onAction?.(); }, { once: true });
    el.appendChild(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms || (action ? 5000 : 2200));
}

/**
 * Small menu that slides up from the bottom. items: [{ value, label, icon?, danger? }].
 * Resolves with the chosen value, or null when dismissed.
 */
export function actionSheet(title, items, iconFn) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `
      <p class="sheet-title">${esc(title)}</p>
      ${items.map((it) => `<button type="button" class="sheet-item${it.danger ? ' danger' : ''}" data-v="${esc(it.value)}">${it.icon && iconFn ? iconFn(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}
      <button type="button" class="sheet-item cancel" data-v="">Cancel</button>`;
    let result = null;
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) { result = b.dataset.v || null; dlg.close(); } else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

/** Shared navigation state: history depth of the diary we came from. */
export const nav = { diaryDepth: null };

// ---------- Amount slider (works together with the typed amount) ----------

const sliderMax = (v) => Math.min(3000, Math.max(300, Math.ceil((v * 2) / 50) * 50));

/** A range input for the amount; `biggest` is the largest portion we know of. */
export function amountSlider(value, biggest = 0, unit = 'g') {
  const max = sliderMax(Math.max(value, biggest));
  return `<div class="amount-slider">
    <input type="range" id="grams-range" min="0" max="${max}" step="1" value="${Math.min(value, max)}" aria-label="Amount in ${esc(unit)}">
    <div class="range-scale muted small"><span>0</span><span>${max} ${esc(unit)}</span></div>
  </div>`;
}

/** Keep slider and text box in sync. onChange runs after either one moves. */
export function bindAmountSlider(root, onChange) {
  const range = $('#grams-range', root);
  const input = $('#grams', root);
  if (!range || !input) return;
  const scale = $('.range-scale span:last-child', root);
  const unit = scale.textContent.split(' ').slice(1).join(' ');
  const setMax = (v) => {
    if (v > Number(range.max)) { range.max = sliderMax(v); scale.textContent = `${range.max} ${unit}`; }
  };
  range.addEventListener('input', () => {
    const v = Number(range.value);
    // Coarser steps for big amounts so the thumb doesn't jitter
    const snapped = v >= 100 ? Math.round(v / 5) * 5 : v;
    input.value = String(snapped);
    onChange();
  });
  input.addEventListener('input', () => {
    const v = parseNum(input.value);
    if (Number.isFinite(v) && v >= 0) { setMax(v); range.value = String(v); }
  });
  return { sync: () => { const v = parseNum(input.value) || 0; setMax(v); range.value = String(v); } };
}
