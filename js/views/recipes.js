// Recipes: built-in high-protein recipes (with macros, can be logged, saved or shopped),
// browsing TheMealDB (free open recipe database, no macros) and links to creator sites.

import * as db from '../db.js';
import { fmt, tintAttrs } from '../nutrition.js';
import { $, $$, esc, toast, actionSheet } from '../ui.js';
import { icon } from '../icons.js';
import { today } from '../dates.js';
import { emojiFor } from '../generic.js';
import {
  ALL_RECIPES, recipeById, recipeItems, CREATOR_SITES,
  MEALDB_CATEGORIES, mealdbCategory, mealdbSearch, mealdbMeal,
} from '../recipes.js';
import { addToShoppingList } from './shopping.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'Breakfast', label: 'Breakfast' },
  { id: 'Lunch & dinner', label: 'Lunch & dinner' },
  { id: 'Snack', label: 'Snacks' },
  { id: 'veg', label: 'Vegetarian' },
];

// Remembered while the app is open, so going back keeps your place.
const state = { filter: 'all', cat: null, query: '' };

const macroLine = (t) => `${fmt(t.kcal, 'kcal')} kcal · P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}`;

// ---------- List ----------
export function renderRecipes(el) {
  el.innerHTML = `
    <a class="card eat-cta" href="#/eatout"><span class="thumb" aria-hidden="true">🍔</span>
      <span class="info"><strong>No time to cook? Eat out</strong><span class="small muted">Dishes from McDonald’s, Burger King, KFC, Subway and dean&amp;david that fit what’s left today</span></span>${icon('chevron-right')}</a>
    <p class="hint">High-protein recipes with macros worked out per portion. Log them, save them as a meal or put the ingredients on your shopping list.</p>
    <div class="chips recipe-filters">${FILTERS.map((f) => `<button class="chip${state.filter === f.id ? ' active' : ''}" data-filter="${esc(f.id)}">${esc(f.label)}</button>`).join('')}</div>
    <ul class="history recipe-list" id="recipe-list"></ul>

    <h2 class="section-title with-ic recipe-sec">${icon('search')} More recipes from TheMealDB</h2>
    <p class="hint">A free, open recipe database. It has no calories or macros, so log the ingredients yourself.</p>
    <form id="mealdb-form" class="searchbox" role="search" autocomplete="off">${icon('search')}
      <input id="mealdb-q" type="search" placeholder="Search, e.g. chicken, salmon, beef" aria-label="Search TheMealDB" value="${esc(state.query)}">
    </form>
    <div class="chips">${MEALDB_CATEGORIES.map((c) => `<button class="chip${state.cat === c ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div id="mealdb-out"></div>

    <h2 class="section-title with-ic recipe-sec">${icon('chef-hat')} High-protein creators</h2>
    <p class="hint">Popular recipe sites with lots of high-protein dishes. They open on their own website.</p>
    <ul class="history creator-list">${CREATOR_SITES.map((s) => `
      <li><a href="${esc(s.url)}" target="_blank" rel="noopener">
        <span class="thumb">${icon('external-link')}</span>
        <span class="info"><strong>${esc(s.name)}</strong><span class="small muted">${esc(s.who)} · ${esc(s.note)}</span></span>
      </a></li>`).join('')}
    </ul>`;

  const list = $('#recipe-list', el);
  const draw = () => {
    const rs = ALL_RECIPES.filter((r) => state.filter === 'all' || (state.filter === 'veg' ? r.veg : r.kind === state.filter));
    list.innerHTML = rs.map((r) => `
      <li><a href="#/recipe/${esc(r.id)}">
        <span class="thumb">${r.emoji}</span>
        <span class="info"><strong>${esc(r.name)}</strong>
          <span class="small muted">${fmt(r.totals.kcal, 'kcal')} kcal · ${r.minutes} min${r.veg ? ' · vegetarian' : ''}</span></span>
        <span class="recipe-protein"><b>${fmt(r.totals.protein)} g</b><small>protein</small></span>
      </a></li>`).join('') || '<li class="empty">No recipes here.</li>';
  };
  draw();
  $$('[data-filter]', el).forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    $$('[data-filter]', el).forEach((x) => x.classList.toggle('active', x === b));
    draw();
  }));

  const out = $('#mealdb-out', el);
  const showMeals = async (load, label) => {
    out.innerHTML = '<p class="status">Loading…</p>';
    try {
      const meals = await load();
      if (!el.isConnected) return;
      out.innerHTML = meals.length ? `<ul class="mealdb-grid">${meals.slice(0, 40).map((m) => `
        <li><a href="#/mealdb/${esc(m.id)}">
          <img src="${esc(m.thumb)}/preview" alt="" loading="lazy" width="250" height="250">
          <span>${esc(m.name)}</span></a></li>`).join('')}</ul>`
        : `<p class="status">Nothing found for “${esc(label)}”.</p>`;
    } catch {
      out.innerHTML = '<p class="status">Couldn’t reach TheMealDB. Check your internet connection.</p>';
    }
  };
  $$('[data-cat]', el).forEach((b) => b.addEventListener('click', () => {
    state.cat = b.dataset.cat; state.query = '';
    $('#mealdb-q', el).value = '';
    $$('[data-cat]', el).forEach((x) => x.classList.toggle('active', x === b));
    showMeals(() => mealdbCategory(state.cat), state.cat);
  }));
  $('#mealdb-form', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#mealdb-q', el).value.trim();
    if (!q) return;
    state.query = q; state.cat = null;
    $$('[data-cat]', el).forEach((x) => x.classList.remove('active'));
    $('#mealdb-q', el).blur();
    showMeals(() => mealdbSearch(q), q);
  });
  if (state.query) showMeals(() => mealdbSearch(state.query), state.query);
  else if (state.cat) showMeals(() => mealdbCategory(state.cat), state.cat);
}

// ---------- One built-in recipe ----------
export function renderRecipe(el, id) {
  const r = recipeById(id);
  if (!r) { el.innerHTML = '<p class="empty">Recipe not found.</p>'; return; }
  let portions = 1;

  const draw = () => {
    const items = recipeItems(r, portions);
    const t = { kcal: r.totals.kcal * portions, protein: r.totals.protein * portions, carbs: r.totals.carbs * portions, fat: r.totals.fat * portions };
    el.innerHTML = `
      <div class="product-head">
        <div class="product-img placeholder">${r.emoji}</div>
        <div><h2>${esc(r.name)}</h2>
          <p class="muted small with-ic">${icon('clock')} ${r.minutes} min · ${esc(r.kind)}${r.veg ? ` · ${icon('leaf')} vegetarian` : ''}</p></div>
      </div>
      <div class="row-between recipe-portions">
        <span>${portions === 1 ? '1 portion' : `${portions} portions`}</span>
        <div class="stepper">
          <button type="button" class="btn icon ghost" data-dec aria-label="Fewer portions" ${portions <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
          <span class="count">${portions}</span>
          <button type="button" class="btn icon ghost" data-inc aria-label="More portions" ${portions >= 8 ? 'disabled' : ''}>${icon('plus')}</button>
        </div>
      </div>
      <div class="tiles">
        <div class="tile tile-kcal"><span class="val">${fmt(t.kcal, 'kcal')}</span><span class="unit">kcal</span></div>
        <div class="tile tile-protein"><span class="val">${fmt(t.protein)}</span><span class="unit">g</span><span class="lbl">Protein</span></div>
        <div class="tile tile-carbs"><span class="val">${fmt(t.carbs)}</span><span class="unit">g</span><span class="lbl">Carbs</span></div>
        <div class="tile tile-fat"><span class="val">${fmt(t.fat)}</span><span class="unit">g</span><span class="lbl">Fat</span></div>
      </div>
      <div class="actions">
        <button class="btn primary with-ic" id="btn-log">${icon('plus')} Add to today</button>
        <button class="btn with-ic" id="btn-save">${icon('bookmark-plus')} Save as meal</button>
        <button class="btn with-ic" id="btn-shop">${icon('shopping-cart')} Shopping list</button>
      </div>
      <section class="card">
        <h3 class="card-title">Ingredients</h3>
        <ul class="recipe-ingredients">${items.map((i) => `
          <li ${tintAttrs(i.per100)}><span class="shop-emoji" aria-hidden="true">${emojiFor(i.code) || ''}</span>
            <span class="info"><span>${esc(i.name)}</span><span class="small muted">${macroLine({ kcal: i.per100.kcal * i.grams / 100, protein: i.per100.protein * i.grams / 100, carbs: i.per100.carbs * i.grams / 100, fat: i.per100.fat * i.grams / 100 })}</span></span>
            <strong>${fmt(i.grams)} ${esc(i.unit)}</strong></li>`).join('')}
        </ul>
        <p class="muted small">Salt, pepper, herbs and spices aren’t counted.</p>
      </section>
      <section class="card">
        <h3 class="card-title">Method</h3>
        <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </section>`;

    $('[data-dec]', el).addEventListener('click', () => { portions = Math.max(1, portions - 1); draw(); });
    $('[data-inc]', el).addEventListener('click', () => { portions = Math.min(8, portions + 1); draw(); });
    const label = portions > 1 ? `${r.name} ×${portions}` : r.name;

    $('#btn-log', el).addEventListener('click', async () => {
      const date = today();
      const meals = await db.mealsForDate(date);
      const pick = await actionSheet('Add to which meal today?', meals.map((m) => ({ value: m.id, label: m.name, icon: 'utensils' })), icon);
      if (!pick) return;
      const meal = meals.find((m) => m.id === pick);
      // One portion goes in the diary even when cooking for more.
      await db.logSavedMeal({ items: recipeItems(r, 1) }, date, pick);
      toast(`Added 1 portion of ${r.name} to ${meal.name}`, { action: 'Open diary', onAction: () => { location.hash = '#/'; } });
    });
    $('#btn-save', el).addEventListener('click', async () => {
      const saved = await db.getSavedMeals();
      if (saved.some((s) => s.name === r.name)) { toast('Already in your saved meals'); return; }
      await db.saveMeal(r.name, recipeItems(r, 1));
      toast('Saved. Find it under Saved meals when you add food.');
    });
    $('#btn-shop', el).addEventListener('click', async () => {
      const n = await addToShoppingList(items, label);
      toast(`Added to your shopping list (${n} items)`, { action: 'Open list', onAction: () => { location.hash = '#/shopping'; } });
    });
  };
  draw();
}

// ---------- One TheMealDB recipe ----------
export async function renderMealdbRecipe(el, id) {
  el.innerHTML = '<p class="status">Loading…</p>';
  let m;
  try { m = await mealdbMeal(id); } catch { m = undefined; }
  if (!el.isConnected) return;
  if (m === undefined) { el.innerHTML = '<p class="status">Couldn’t reach TheMealDB. Check your internet connection.</p>'; return; }
  if (!m) { el.innerHTML = '<p class="empty">Recipe not found.</p>'; return; }
  el.innerHTML = `
    <img class="mealdb-hero" src="${esc(m.thumb)}" alt="">
    <h2>${esc(m.name)}</h2>
    <p class="muted small">${esc([m.category, m.area].filter(Boolean).join(' · '))} · from TheMealDB</p>
    <p class="notice small">This source has no calories or macros. To log it, add the main ingredients as foods in the diary.</p>
    <div class="actions">
      <button class="btn with-ic" id="btn-shop">${icon('shopping-cart')} Ingredients to shopping list</button>
      ${m.source ? `<a class="btn with-ic" href="${esc(m.source)}" target="_blank" rel="noopener">${icon('external-link')} Original recipe</a>` : ''}
    </div>
    <section class="card">
      <h3 class="card-title">Ingredients</h3>
      <ul class="recipe-ingredients">${m.ingredients.map((i) => `
        <li><span class="info"><span>${esc(i.name)}</span></span><strong>${esc(i.measure)}</strong></li>`).join('')}
      </ul>
    </section>
    <section class="card">
      <h3 class="card-title">Method</h3>
      <ol class="steps">${m.instructions.map((s) => `<li>${esc(s.replace(/^(step\s*)?\d+[.):]?\s*/i, ''))}</li>`).join('')}</ol>
    </section>
    <p class="muted small">Recipe and photo from <a href="https://www.themealdb.com/" target="_blank" rel="noopener">TheMealDB</a>.</p>`;
  $('#btn-shop', el).addEventListener('click', async () => {
    const n = await addToShoppingList(m.ingredients.map((i) => ({ name: i.name, note: i.measure })), m.name);
    toast(`Added to your shopping list (${n} items)`, { action: 'Open list', onAction: () => { location.hash = '#/shopping'; } });
  });
}
