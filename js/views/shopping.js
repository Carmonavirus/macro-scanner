// Shopping list: pick saved meals (and how many times), get one merged checklist.
// Stored in settings 'shoppingList': { items: [{ key, name, grams, unit, checked }], from: [{ name, times }], createdAt }

import * as db from '../db.js';
import { fmt } from '../nutrition.js';
import { $, $$, esc, toast } from '../ui.js';
import { icon } from '../icons.js';
import { emojiFor } from '../generic.js';

const KEY = 'shoppingList';
const getList = () => db.getSetting(KEY, null);
const setList = (list) => db.setSetting(KEY, list);

const amount = (g, unit) => (g >= 1000 ? `${fmt(g / 1000)} ${unit === 'ml' ? 'l' : 'kg'}` : `${fmt(g)} ${unit || 'g'}`);

/** Merge the items of the chosen saved meals; the same food is added up. */
function buildItems(saved, counts, existing = []) {
  const map = new Map(existing.map((i) => [i.key, { ...i }]));
  for (const s of saved) {
    const times = counts[s.id] || 0;
    if (!times) continue;
    for (const it of s.items) {
      const key = it.code || it.name.toLowerCase();
      const cur = map.get(key);
      if (cur) { cur.grams += it.grams * times; cur.checked = false; }
      else map.set(key, { key, code: it.code, name: it.name, grams: it.grams * times, unit: it.unit || 'g', checked: false });
    }
  }
  return [...map.values()];
}

/**
 * Add foods to the shopping list from somewhere else (e.g. a recipe).
 * items: [{ code, name, grams, unit }] or [{ name, note }] for things without an amount.
 * Returns how many lines the list has afterwards.
 */
export async function addToShoppingList(items, fromName) {
  const cur = (await getList()) || { items: [], from: [], createdAt: new Date().toISOString() };
  const map = new Map(cur.items.map((i) => [i.key, i]));
  for (const it of items) {
    if (!it.grams) {
      const label = it.note ? `${it.name} (${it.note})` : it.name;
      const key = `x-${label.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, code: null, name: label, grams: 0, unit: '', checked: false, extra: true });
      else map.get(key).checked = false;
      continue;
    }
    const key = it.code || it.name.toLowerCase();
    const old = map.get(key);
    if (old) { old.grams += it.grams; old.checked = false; }
    else map.set(key, { key, code: it.code || null, name: it.name, grams: it.grams, unit: it.unit || 'g', checked: false });
  }
  const from = [...cur.from];
  const same = from.find((f) => f.name === fromName);
  if (same) same.times += 1; else from.push({ name: fromName, times: 1 });
  const next = { ...cur, items: [...map.values()], from };
  await setList(next);
  return next.items.length;
}

export async function renderShopping(el) {
  const [list, saved] = await Promise.all([getList(), db.getSavedMeals()]);
  if (list?.items?.length) return renderList(el, list, saved);
  renderPicker(el, saved, null);
}

// ---------- Choose saved meals ----------
function renderPicker(el, saved, current) {
  if (!saved.length) {
    el.innerHTML = `
      <section class="card empty-state">
        <h2 class="card-title with-ic">${icon('shopping-cart')} Shopping list</h2>
        <p>Your shopping list is made from your saved meals. You don’t have any yet.</p>
        <p class="muted small">In the diary, tap ⋯ on a meal with food in it and choose <strong>Save as meal for later</strong>. Then come back here.</p>
        <a class="btn" href="#/">Go to the diary</a>
      </section>`;
    return;
  }
  const counts = {};
  el.innerHTML = `
    <p class="hint">${current ? 'Pick more meals to add to your list.' : 'Pick the saved meals you want to cook. Use + for meals you’ll make more than once.'} The same foods are added up.</p>
    <ul class="pick-list">${saved.map((s) => `
      <li class="card pick" data-id="${esc(s.id)}">
        <div class="pick-info"><strong>${esc(s.name)}</strong>
          <span class="muted small">${esc(s.items.map((i) => i.name).join(', '))}</span></div>
        <div class="stepper">
          <button type="button" class="btn icon ghost" data-dec aria-label="Fewer">${icon('minus')}</button>
          <span class="count" aria-live="polite">0</span>
          <button type="button" class="btn icon ghost" data-inc aria-label="More">${icon('plus')}</button>
        </div>
      </li>`).join('')}
    </ul>
    <button class="btn primary wide with-ic" id="btn-make" disabled>${icon('shopping-cart')} ${current ? 'Add to list' : 'Make shopping list'}</button>
    ${current ? '<button class="btn wide" id="btn-cancel">Back to my list</button>' : ''}`;

  const update = () => {
    $$('.pick', el).forEach((li) => {
      const n = counts[li.dataset.id] || 0;
      $('.count', li).textContent = n ? `×${n}` : '0';
      li.classList.toggle('on', n > 0);
    });
    $('#btn-make', el).disabled = !Object.values(counts).some(Boolean);
  };
  $$('.pick', el).forEach((li) => {
    const id = li.dataset.id;
    $('[data-inc]', li).addEventListener('click', () => { counts[id] = Math.min(9, (counts[id] || 0) + 1); update(); });
    $('[data-dec]', li).addEventListener('click', () => { counts[id] = Math.max(0, (counts[id] || 0) - 1); update(); });
    $('.pick-info', li).addEventListener('click', () => { counts[id] = counts[id] ? 0 : 1; update(); });
  });
  $('#btn-make', el).addEventListener('click', async () => {
    const from = [...(current?.from || [])];
    for (const s of saved) if (counts[s.id]) from.push({ name: s.name, times: counts[s.id] });
    const next = { items: buildItems(saved, counts, current?.items || []), from, createdAt: current?.createdAt || new Date().toISOString() };
    await setList(next);
    renderList(el, next, saved);
  });
  $('#btn-cancel', el)?.addEventListener('click', () => renderList(el, current, saved));
}

// ---------- The checklist ----------
function renderList(el, list, saved) {
  const done = list.items.filter((i) => i.checked).length;
  const all = done === list.items.length;
  // Unchecked first, so what's left is always at the top
  const items = [...list.items].sort((a, b) => Number(a.checked) - Number(b.checked));
  el.innerHTML = `
    <section class="card shop-head">
      <div class="meal-head">
        <div class="meal-title">
          <h2 class="with-ic">${icon('shopping-cart')} ${all ? 'All done!' : `${done} of ${list.items.length} in the cart`}</h2>
          <p class="muted small">For ${esc(list.from.map((f) => (f.times > 1 ? `${f.name} ×${f.times}` : f.name)).join(', '))}</p>
        </div>
      </div>
      <div class="meter shop-meter"><i style="width:${(done / list.items.length) * 100}%"></i></div>
      ${all ? `<button class="btn primary wide with-ic" id="btn-done">${icon('check')} Finish and delete list</button>` : ''}
    </section>
    <ul class="supp-list shop-list card">${items.map((i) => `
      <li><label class="supp${i.checked ? ' taken' : ''}">
        <input type="checkbox" data-key="${esc(i.key)}" ${i.checked ? 'checked' : ''}>
        ${emojiFor(i.code) ? `<span class="shop-emoji" aria-hidden="true">${emojiFor(i.code)}</span>` : ''}
        <span class="supp-name">${esc(i.name)}</span>
        ${i.extra ? '' : `<span class="muted small">${esc(amount(i.grams, i.unit))}</span>`}
      </label></li>`).join('')}
    </ul>
    <form id="form-extra" class="manual-code" autocomplete="off">
      <input id="extra" placeholder="Add something else (e.g. Spülmittel)" aria-label="Add an item" maxlength="60">
      <button class="btn" type="submit">Add</button>
    </form>
    <div class="actions">
      <button class="btn with-ic" id="btn-more">${icon('plus')} Add meals</button>
      <button class="btn ghost danger with-ic" id="btn-delete">${icon('trash-2')} Delete list</button>
    </div>`;

  $$('[data-key]', el).forEach((cb) => cb.addEventListener('change', async () => {
    const it = list.items.find((i) => i.key === cb.dataset.key);
    it.checked = cb.checked;
    await setList(list);
    renderList(el, list, saved);
  }));
  $('#form-extra', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#extra', el).value.trim();
    if (!name) return;
    list.items.push({ key: `x${Date.now().toString(36)}`, code: null, name, grams: 0, unit: '', checked: false, extra: true });
    await setList(list);
    renderList(el, list, saved);
    $('#extra', el).focus();
  });
  const remove = async (msg) => {
    await db.setSetting(KEY, null);
    toast(msg);
    renderPicker(el, saved, null);
  };
  $('#btn-done', el)?.addEventListener('click', () => remove('Shopping done. List deleted.'));
  $('#btn-delete', el).addEventListener('click', () => {
    if (all || confirm('Delete this shopping list?')) remove('List deleted');
  });
  $('#btn-more', el).addEventListener('click', () => renderPicker(el, saved, list));
}
