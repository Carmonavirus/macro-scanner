// Eat out: dishes from restaurant chains that fit the calories and macros left today.
// You order yourself (app, delivery or in the restaurant); one tap logs the dish.

import * as db from '../db.js';
import { totals, fmt, tintAttrs } from '../nutrition.js';
import { $, $$, esc, toast, actionSheet } from '../ui.js';
import { icon } from '../icons.js';
import { today } from '../dates.js';
import { locate, nearby, pickNearest, fmtDist, directionsUrl } from '../nearby.js';
import { CHAINS, CHAINS_CHECKED, chainById, suggest, dishItem, partsLabel, SORTS, dishLinks } from '../chains.js';

const CUSTOM_KEY = 'eatOutCustom';
const MEAL_MAX = 1200;
const state = { chain: 'all', sort: 'fit', near: null };   // near: { list } from the last location search
const euro = (v) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const line = (t) => `${fmt(t.kcal, 'kcal')} kcal · P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}`;
const badge = (c) => `<span class="chain-badge" style="--chain:${c.color}" aria-hidden="true">${esc(c.badge)}</span>`;
const checked = new Date(CHAINS_CHECKED).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export async function renderEatOut(el) {
  const date = today();
  const [goals, entries, custom] = await Promise.all([db.getGoals(), db.entriesForDate(date), db.getSetting(CUSTOM_KEY, [])]);
  const eaten = totals(entries);
  const hasGoal = goals.kcal > 0;
  const left = {
    kcal: hasGoal ? goals.kcal - eaten.kcal : 800,
    protein: goals.protein > 0 ? goals.protein - eaten.protein : 0,
    carbs: goals.carbs > 0 ? goals.carbs - eaten.carbs : 999,
    fat: goals.fat > 0 ? goals.fat - eaten.fat : 999,
  };
  // One meal is at most ~1200 kcal: with a whole day left, aim for a proper dinner, not all of it.
  const scale = left.kcal > MEAL_MAX ? MEAL_MAX / left.kcal : 1;
  const target = scale < 1 ? { kcal: MEAL_MAX, protein: left.protein * scale, carbs: left.carbs * scale, fat: left.fat * scale } : left;
  const extra = custom.map((d) => ({ ...d, kind: 'm' }));
  const chainIds = [...CHAINS.map((c) => c.id), ...(extra.some((d) => d.chain === 'own') ? ['own'] : [])];

  el.innerHTML = `
    <section class="card eat-left">
      <h3 class="card-title with-ic">${icon('target')} Left for today</h3>
      ${hasGoal
        ? `<p class="eat-left-line"><strong>${fmt(Math.max(0, left.kcal), 'kcal')} kcal</strong>${goals.protein > 0 ? ` · P ${fmt(Math.max(0, left.protein))} g` : ''}${goals.carbs > 0 ? ` · C ${fmt(Math.max(0, left.carbs))} g` : ''}${goals.fat > 0 ? ` · F ${fmt(Math.max(0, left.fat))} g` : ''}</p>
        ${scale < 1 ? `<p class="hint small">That’s more than one meal, so dishes aim for about ${MEAL_MAX} kcal.</p>` : ''}`
        : '<p class="hint">Set a calorie goal to see what fits. Until then, dishes up to 800 kcal are shown. <a href="#/goals">Set goals</a></p>'}
    </section>
    <section class="card eat-near">
      <button class="btn with-ic" id="btn-near">${icon('map-pin')} ${state.near ? 'Search again' : 'Find the nearest restaurants'}</button>
      <p class="status" id="near-status" role="status"></p>
      <ul class="near-list" id="near-list"></ul>
      <p class="hint small">Uses your location once, only to ask OpenStreetMap’s free map server which of these chains are nearby. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>.</p>
    </section>
    <div class="chips" id="eat-chains">
      <button class="chip${state.chain === 'all' ? ' active' : ''}" data-chain="all">All</button>
      ${chainIds.map((id) => { const c = chainById(id); return `<button class="chip${state.chain === id ? ' active' : ''}" data-chain="${id}">${esc(id === 'own' ? 'My dishes' : c.name)}</button>`; }).join('')}
    </div>
    <label class="eat-sort">Order by
      <select id="eat-sort">${SORTS.map((o) => `<option value="${o.id}"${state.sort === o.id ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
    </label>
    <ul class="history eat-list" id="eat-list"></ul>
    <p class="hint small">Values per portion as sold in Germany, checked ${esc(checked)}. Prices are typical single-item prices in Germany; they vary by restaurant and are usually higher on delivery apps. Macros are close but not exact, and limited-time specials aren’t in the list. For a special, check its numbers in the chain’s app and add it below.</p>
    <p class="hint small">Price sources: ${CHAINS.map((c) => `<a href="${esc(c.priceSrc)}" target="_blank" rel="noopener">${esc(c.name)}</a>`).join(', ')}.</p>

    <details class="card eat-own">
      <summary class="with-ic">${icon('plus')} Add a dish yourself <span class="muted small">(${custom.length})</span></summary>
      <form id="own-form" class="edit-form" autocomplete="off">
        <label>Name <input name="name" required placeholder="e.g. Big Mac special of the week"></label>
        <label>Chain
          <select name="chain">${CHAINS.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="own">Other</option></select>
        </label>
        <div class="own-grid">
          <label>kcal <input name="kcal" type="number" inputmode="decimal" min="0" step="any" required></label>
          <label>Protein g <input name="protein" type="number" inputmode="decimal" min="0" step="any" required></label>
          <label>Carbs g <input name="carbs" type="number" inputmode="decimal" min="0" step="any" required></label>
          <label>Fat g <input name="fat" type="number" inputmode="decimal" min="0" step="any" required></label>
          <label>Price € <input name="price" type="number" inputmode="decimal" min="0" step="any" placeholder="optional"></label>
        </div>
        <button class="btn primary" type="submit">Save dish</button>
      </form>
      ${custom.length ? `<ul class="own-list">${custom.map((d) => `
        <li><span class="info"><strong>${esc(d.name)}</strong><span class="small muted">${esc(d.chain === 'own' ? 'Other' : chainById(d.chain).name)} · ${line(d)}</span></span>
          <button class="btn icon ghost" data-del="${esc(d.id)}" aria-label="Delete ${esc(d.name)}">${icon('trash-2')}</button></li>`).join('')}</ul>` : ''}
    </details>`;

  const list = $('#eat-list', el);
  let shown = [];
  const draw = () => {
    const chains = state.chain === 'all' ? null : [state.chain];
    if (left.kcal < 100) {
      list.innerHTML = '<li class="empty">Less than 100 kcal left today, so nothing fits.</li>';
      return;
    }
    shown = suggest(target, { chains, extra, sort: state.sort });
    list.innerHTML = shown.map((o, i) => {
      const c = chainById(o.chain);
      const after = left.kcal - o.kcal;
      return `<li><div ${tintAttrs(o, 'eat-row')}>
        ${badge(c)}
        <span class="info"><strong>${esc(partsLabel(o.parts))}</strong>
          <span class="small muted">${esc(c.name)} · ${line(o)}</span>
          <span class="small eat-after">${o.price != null ? `<b class="eat-price">≈ ${euro(o.price)}</b> · ` : ''}${i === 0 && state.sort === 'fit' ? '<b>Best fit</b> · ' : ''}${after >= 0 ? `${fmt(after, 'kcal')} kcal left after` : `${fmt(-after, 'kcal')} kcal over`}</span>
          ${o.parts.map((p) => { const l = dishLinks(p); return l ? `<span class="small eat-links"><span class="eat-part">${esc(p.name)}${p.price != null ? ` ${euro(p.price)}` : ''}:</span> <a href="${esc(l.menu)}" target="_blank" rel="noopener">${esc(l.menuLabel)} ↗</a> · <a href="${esc(l.nutrition)}" target="_blank" rel="noopener">nutrition ↗</a></span>` : ''; }).join('')}</span>
        <button class="btn icon" data-log="${i}" aria-label="Add to today">${icon('plus')}</button>
      </div></li>`;
    }).join('') || '<li class="empty">Nothing here fits what’s left today.</li>';
  };
  draw();

  // ---------- Nearest restaurants ----------
  const nearList = $('#near-list', el);
  const nearStatus = $('#near-status', el);
  const setChain = (id) => {
    state.chain = id;
    $$('[data-chain]', el).forEach((x) => x.classList.toggle('active', x.dataset.chain === id));
    draw();
  };
  const drawNear = () => {
    if (!state.near) { nearList.innerHTML = ''; return; }
    const near = pickNearest(state.near.list);
    if (!near.length) {
      nearList.innerHTML = '<li class="muted small">None of these chains within 15 km.</li>';
      return;
    }
    nearList.innerHTML = near.map((r) => {
      const c = chainById(r.chain);
      return `<li class="near-row">
        ${badge(c)}
        <span class="info"><strong>${esc(r.name)}</strong>
          <span class="small muted">${esc(fmtDist(r.dist))}${r.address ? ` · ${esc(r.address)}` : ''}</span></span>
        <button class="btn small${state.chain === r.chain ? ' primary' : ''}" data-near-chain="${esc(r.chain)}">Dishes</button>
        <a class="btn icon" href="${esc(directionsUrl(r))}" target="_blank" rel="noopener" aria-label="Directions to ${esc(r.name)}">${icon('navigation')}</a>
      </li>`;
    }).join('');
    $$('[data-near-chain]', nearList).forEach((b) => b.addEventListener('click', () => {
      setChain(b.dataset.nearChain);
      drawNear();
      $('#eat-chains', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  };
  drawNear();
  $('#btn-near', el).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    nearStatus.className = 'status';
    nearStatus.textContent = 'Finding your location…';
    try {
      const here = await locate();
      nearStatus.textContent = 'Looking for restaurants nearby…';
      const list = await nearby(here);
      state.near = { list };
      nearStatus.textContent = '';
      btn.innerHTML = `${icon('map-pin')} Search again`;
      // Show the closest restaurant's dishes straight away
      if (list.length) setChain(pickNearest(list)[0].chain);
      drawNear();
    } catch (err) {
      nearStatus.className = 'status error';
      nearStatus.textContent = err.message;
    }
    btn.disabled = false;
  });

  $('#eat-sort', el).addEventListener('change', (e) => { state.sort = e.target.value; draw(); });
  $$('[data-chain]', el).forEach((b) => b.addEventListener('click', () => { setChain(b.dataset.chain); drawNear(); }));

  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-log]');
    if (!b) return;
    const o = shown[Number(b.dataset.log)];
    const meals = await db.mealsForDate(date);
    const pick = await actionSheet('Add to which meal today?', meals.map((m) => ({ value: m.id, label: m.name, icon: 'utensils' })), icon);
    if (!pick) return;
    for (const p of o.parts) await db.addEntry({ ...dishItem(p), date, meal: pick });
    toast(`Added ${partsLabel(o.parts)}`, { action: 'Open diary', onAction: () => { location.hash = '#/'; } });
    renderEatOut(el);
  });

  $('#own-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num = (k) => Math.max(0, Number(f.get(k)) || 0);
    const d = {
      id: `own-${Date.now().toString(36)}`, chain: f.get('chain'), name: String(f.get('name')).trim(),
      grams: 100, kcal: num('kcal'), protein: num('protein'), carbs: num('carbs'), fat: num('fat'),
      price: f.get('price') ? num('price') : null,
    };
    if (!d.name) return;
    await db.setSetting(CUSTOM_KEY, [...custom, d]);
    toast('Dish saved');
    renderEatOut(el);
  });
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
    await db.setSetting(CUSTOM_KEY, custom.filter((d) => d.id !== b.dataset.del));
    renderEatOut(el);
  }));
}
