// What fits: your recipes and saved meals ranked by how well they fit what's left today.
// Each can be scaled (½ to 2 portions) to fit better. One tap adds it to the diary.

import * as db from '../db.js';
import { fmt, totals, tintAttrs } from '../nutrition.js';
import { $$, esc, toast, actionSheet, backTo, nav } from '../ui.js';
import { icon } from '../icons.js';
import { today } from '../dates.js';
import { fitScore, fitPercent } from '../chains.js';
import { ALL_RECIPES, recipeItems } from '../recipes.js';
import { getMyRecipes, myRecipeItems } from '../social.js';

const MEAL_MAX = 1200;   // one meal; with a whole day left, aim for a proper meal, not all of it
const SIZES = [0.5, 0.75, 1, 1.25, 1.5];

const portionLabel = (f) => (f === 1 ? '1 portion' : f === 0.5 ? '½ portion' : f === 0.75 ? '¾ portion' : f === 1.25 ? '1¼ portions' : f === 1.5 ? '1½ portions' : `${f} portions`);
const scale = (items, f) => items.map((i) => ({ ...i, per100: { ...i.per100 }, grams: Math.round(i.grams * f * 10) / 10 }));

/** Everything you could cook or eat: [{ name, kind, href, items (1 portion) }]. */
async function candidates() {
  const [mine, saved] = await Promise.all([getMyRecipes(), db.getSavedMeals()]);
  return [
    ...mine.map((r) => ({ name: r.name, kind: 'My recipe', href: `#/myrecipe/${encodeURIComponent(r.id)}`, items: myRecipeItems(r, 1) })),
    ...saved.map((s) => ({ name: s.name, kind: s.portions ? `Saved meal · cooked as ${s.portions} portions` : 'Saved meal', href: '', items: s.items })),
    ...ALL_RECIPES.map((r) => ({ name: r.name, kind: 'Recipe', href: `#/recipe/${encodeURIComponent(r.id)}`, items: recipeItems(r, 1) })),
  ].filter((c) => c.items.length);
}

/** The best size of each, ranked by fit. */
export function rank(list, left, target) {
  return list.map((c) => {
    const one = totals(c.items);
    let best = null;
    for (const f of SIZES) {
      const t = { kcal: one.kcal * f, protein: one.protein * f, carbs: one.carbs * f, fat: one.fat * f };
      if (t.kcal > left.kcal * 1.05) continue;
      const score = fitScore(t, target) + Math.abs(f - 1) * 0.2;   // a normal portion is nicer
      if (!best || score < best.score) best = { f, t, score };
    }
    return best && { ...c, ...best };
  }).filter(Boolean).sort((a, b) => a.score - b.score);
}

export async function renderFits(el, date = today(), mealId = '') {
  const [goals, entries, list] = await Promise.all([db.getGoals(), db.entriesForDate(date), candidates()]);
  const eaten = totals(entries);
  const hasGoal = goals.kcal > 0;
  const left = {
    kcal: hasGoal ? goals.kcal - eaten.kcal : 800,
    protein: goals.protein > 0 ? goals.protein - eaten.protein : 0,
    carbs: goals.carbs > 0 ? goals.carbs - eaten.carbs : 999,
    fat: goals.fat > 0 ? goals.fat - eaten.fat : 999,
  };
  const k = left.kcal > MEAL_MAX ? MEAL_MAX / left.kcal : 1;
  const target = k < 1 ? { kcal: MEAL_MAX, protein: left.protein * k, carbs: left.carbs * k, fat: left.fat * k } : left;
  const shown = left.kcal >= 100 ? rank(list, left, target).slice(0, 12) : [];
  const meals = await db.mealsForDate(date);
  const meal = meals.find((m) => m.id === mealId);

  el.innerHTML = `
    <section class="card eat-left">
      <h3 class="card-title with-ic">${icon('target')} Left for today</h3>
      ${hasGoal
        ? `<p class="eat-left-line"><strong>${fmt(Math.max(0, left.kcal), 'kcal')} kcal</strong>${goals.protein > 0 ? ` · P ${fmt(Math.max(0, left.protein))} g` : ''}${goals.carbs > 0 ? ` · C ${fmt(Math.max(0, left.carbs))} g` : ''}${goals.fat > 0 ? ` · F ${fmt(Math.max(0, left.fat))} g` : ''}</p>
        ${k < 1 ? `<p class="hint small">That’s more than one meal, so this aims for about ${MEAL_MAX} kcal.</p>` : ''}`
        : '<p class="hint">Set a calorie goal to see what fits. Until then, meals up to 800 kcal are shown. <a href="#/goals">Set goals</a></p>'}
    </section>
    <p class="hint small">Your recipes, saved meals and the app’s recipes, best fit first. Portions are made bigger or smaller when that fits better.</p>
    <ul class="history eat-list">${shown.map((o, i) => {
      const after = left.kcal - o.t.kcal;
      return `<li><div ${tintAttrs(o.t, 'eat-row')}>
        <span class="info">${o.href ? `<a class="fit-name" href="${esc(o.href)}"><strong>${esc(o.name)}</strong></a>` : `<strong>${esc(o.name)}</strong>`}
          <span class="small muted">${esc(o.kind)}</span>
          <span class="small muted"><b>${esc(portionLabel(o.f))}</b> · ${fmt(o.t.kcal, 'kcal')} kcal · P ${fmt(o.t.protein)} · C ${fmt(o.t.carbs)} · F ${fmt(o.t.fat)}</span>
          <span class="small eat-after">${i === 0 ? '<b>Best fit</b> · ' : ''}${fitPercent(o.score)}% fit · ${after >= 0 ? `${fmt(after, 'kcal')} kcal left after` : `${fmt(-after, 'kcal')} kcal over`}</span></span>
        <button class="btn icon" data-log="${i}" aria-label="Add ${esc(o.name)}">${icon('plus')}</button>
      </div></li>`;
    }).join('') || `<li class="empty">${left.kcal < 100 ? 'Less than 100 kcal left today, so nothing fits.' : 'Nothing fits what’s left today. Save a recipe or a meal first.'}</li>`}</ul>`;

  $$('[data-log]', el).forEach((b) => b.addEventListener('click', async () => {
    const o = shown[Number(b.dataset.log)];
    const pick = meal ? meal.id : await actionSheet('Add to which meal?', meals.map((m) => ({ value: m.id, label: m.name, icon: 'utensils' })), icon);
    if (!pick) return;
    const name = o.f === 1 ? o.name : `${o.name} (${portionLabel(o.f)})`;
    await db.logSavedMeal({ items: scale(o.items, o.f) }, date, pick, name);
    const to = meals.find((m) => m.id === pick).name;
    if (meal) { toast(`Added ${name} to ${to}`); backTo(nav.diaryDepth, `#/day/${date}`); return; }
    toast(`Added ${name} to ${to}`, { action: 'Open diary', onAction: () => { location.hash = '#/'; } });
    renderFits(el, date, mealId);
  }));
}
