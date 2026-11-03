// "Shop at" for recipe ingredients: pick a supermarket (EDEKA by default), see which products
// it sells for each ingredient (from Open Food Facts) and open them or the shop's own search.

import { fmt } from '../nutrition.js';
import { $, $$, esc, toast } from '../ui.js';
import { icon } from '../icons.js';
import { STORES, getStore, setStore, storeSearchUrl, findAtStore, productUrl, shopTerm } from '../stores.js';

/** The "Shop at" picker. */
export function storePicker(store) {
  return `<label class="store-pick">${icon('shopping-cart')} Shop at
    <select data-store>${STORES.map((s) => `<option value="${s.id}"${s.id === store.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
  </label>`;
}

/** Buttons under one ingredient: find it at the shop, and the shop's own search where known. */
export function storeRow(store, name, i) {
  const search = storeSearchUrl(store, name);
  return `<span class="store-row">
      <button type="button" class="btn small with-ic" data-find="${i}">${icon('search')} At ${esc(store.name)}</button>
      ${search ? `<a class="store-link small" href="${esc(search)}" target="_blank" rel="noopener">Search “${esc(shopTerm(name))}” on ${esc(store.name.toLowerCase())}.de ↗</a>` : ''}
    </span>
    <div class="store-out" data-out="${i}" hidden></div>`;
}

const line = (p) => `${fmt(p.per100.kcal, 'kcal')} kcal · P ${fmt(p.per100.protein)} · C ${fmt(p.per100.carbs)} · F ${fmt(p.per100.fat)} per 100 ${esc(p.unit || 'g')}`;

/**
 * Wire up a picker and rows inside `root`. `wants[i]` is { name, per100 } of the ingredient for row i.
 * `onUse(i, product)`, when given, adds a "Use this" button that swaps the ingredient.
 * `onStore()` is called after the shop changes (re-render there).
 */
export async function bindStores(root, wants, { onUse, onStore } = {}) {
  const store = await getStore();
  $$('[data-store]', root).forEach((s) => s.addEventListener('change', async () => {
    await setStore(s.value);
    onStore?.();
  }));
  $$('[data-find]', root).forEach((b) => b.addEventListener('click', async () => {
    const i = +b.dataset.find;
    const out = $(`[data-out="${i}"]`, root);
    if (!out.hidden && out.dataset.loaded) { out.hidden = true; return; }
    out.hidden = false;
    out.innerHTML = '<p class="small muted">Looking…</p>';
    let list;
    try { list = await findAtStore(store, wants[i], { onWait: (sec) => { out.innerHTML = `<p class="small muted">Open Food Facts allows only a few searches a minute. Searching in ${sec} s…</p>`; } }); } catch (err) { out.innerHTML = `<p class="small status error">${esc(err.message)}</p>`; return; }
    out.dataset.loaded = '1';
    if (!list.length) {
      const search = storeSearchUrl(store, wants[i].name);
      out.innerHTML = `<p class="small muted">Open Food Facts doesn’t list this at ${esc(store.name)} yet.${search ? ` Try <a href="${esc(search)}" target="_blank" rel="noopener">${esc(store.name)}’s own search ↗</a>.` : ''}</p>`;
      return;
    }
    out.innerHTML = `<p class="small muted">Closest macros to the recipe first.</p><ul class="store-list">${list.map((p, j) => `
      <li>
        ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" width="44" height="44">` : `<span class="store-noimg">${icon('package')}</span>`}
        <a class="info" href="${esc(productUrl(store, p))}" target="_blank" rel="noopener">
          <strong>${esc(p.name)}</strong>
          <span class="small muted">${esc([p.brand, p.quantity].filter(Boolean).join(' · '))}${p.house ? ` · <b class="store-own">${esc(store.name)} brand</b>` : ''}</span>
          ${p.match != null ? `<span class="small store-match${p.match >= 80 ? ' good' : ''}">${p.match}% macro match</span>` : ''}
          <span class="small muted">${line(p)}</span>
        </a>
        ${onUse ? `<button type="button" class="btn small" data-use="${i}:${j}">Use</button>` : ''}
      </li>`).join('')}</ul>`;
    $$('[data-use]', out).forEach((u) => u.addEventListener('click', async () => {
      const [, j] = u.dataset.use.split(':').map(Number);
      await onUse(i, list[j]);
      toast(`Using ${list[j].name}`);
    }));
  }));
}
