// Diary: one day, its meals, the food in each meal, and totals.

import * as db from '../db.js';
import { today, addDays, dayLabel, isValidKey } from '../dates.js';
import { totals, entryMacros, fmt } from '../nutrition.js';
import { $, $$, esc, go, macroTiles, splitBar, pmf, toast } from '../ui.js';
import { installBanner, backupBanner } from './more.js';
import { icon } from '../icons.js';

export async function renderDiary(el, dateParam) {
  const date = isValidKey(dateParam) ? dateParam : today();
  const [meals, entries, goals] = await Promise.all([db.mealsForDate(date), db.entriesForDate(date), db.getGoals()]);
  const hasGoals = Object.values(goals).some((g) => g > 0);
  const day = totals(entries);

  // Entries whose meal no longer exists (shouldn't happen, but never hide food)
  const known = new Set(meals.map((m) => m.id));
  const orphans = entries.filter((e) => !known.has(e.meal));
  const allMeals = orphans.length ? [...meals, { id: '_other', name: 'Other' }] : meals;

  el.innerHTML = `
    ${installBanner()}
    ${entries.length ? backupBanner() : ''}
    <div class="datenav">
      <button class="btn icon" data-day="${addDays(date, -1)}" aria-label="Previous day">${icon('chevron-left')}</button>
      <label class="datelabel">
        <span class="with-ic">${icon('calendar')} ${esc(dayLabel(date))}</span>
        <input type="date" id="pick-date" value="${date}" aria-label="Pick a date">
      </label>
      <button class="btn icon" data-day="${addDays(date, 1)}" aria-label="Next day">${icon('chevron-right')}</button>
    </div>

    <section class="card summary daybar" aria-label="Day total">
      ${macroTiles(day, { goals })}
      <div class="daybar-foot">
        ${goals.kcal > 0
          ? `<span>${day.kcal >= goals.kcal ? `Goal reached${day.kcal > goals.kcal ? ` · ${fmt(day.kcal - goals.kcal, 'kcal')} kcal over` : ''}` : `${fmt(goals.kcal - day.kcal, 'kcal')} kcal left`}</span>`
          : '<span class="muted">Day total</span>'}
        <a href="#/goals">${hasGoals ? 'Edit goals' : 'Set daily goals'}</a>
      </div>
      ${splitBar(day)}
    </section>

    ${allMeals.map((meal) => {
      const items = meal.id === '_other' ? orphans : entries.filter((e) => e.meal === meal.id);
      const t = totals(items);
      return `
      <section class="card meal" data-meal="${esc(meal.id)}">
        <div class="meal-head">
          <div>
            <h2>${esc(meal.name)}</h2>
            <p class="muted small">${items.length ? `${fmt(t.kcal, 'kcal')} kcal · ${pmf(t)}` : 'Nothing yet'}</p>
          </div>
          ${meal.id === '_other' ? '' : `<button class="btn icon ghost" data-meal-menu="${esc(meal.id)}" aria-label="Meal options">${icon('ellipsis')}</button>`}
        </div>
        ${items.length ? `<ul class="entries">${items.map((e) => {
          const v = entryMacros(e);
          return `<li><a href="#/entry/${e.id}">
            <span class="info"><strong>${esc(e.name)}</strong><span class="muted small">${fmt(e.grams)} ${esc(e.unit || 'g')}${e.brand ? ' · ' + esc(e.brand) : ''}</span></span>
            <span class="kcal">${fmt(v.kcal, 'kcal')}<small> kcal</small></span></a></li>`;
        }).join('')}</ul>` : ''}
        ${meal.id === '_other' ? '' : `<button class="btn add" data-add="${esc(meal.id)}">${icon('plus')} Add food</button>`}
      </section>`;
    }).join('')}

    <button class="btn wide with-ic" id="btn-add-meal">${icon('plus')} Add another meal</button>
  `;

  $$('[data-day]', el).forEach((b) => b.addEventListener('click', () => go(`#/day/${b.dataset.day}`, { replace: true })));
  $('#pick-date', el).addEventListener('change', (e) => {
    if (isValidKey(e.target.value)) go(`#/day/${e.target.value}`, { replace: true });
  });
  $$('[data-add]', el).forEach((b) => b.addEventListener('click', () => go(`#/add/${date}/${b.dataset.add}`)));

  $('#btn-add-meal', el).addEventListener('click', async () => {
    const name = prompt('Name of the meal (e.g. Pre-workout, Second breakfast)');
    if (!name?.trim()) return;
    const id = `m${Date.now().toString(36)}`;
    await db.setMealsForDate(date, [...meals, { id, name: name.trim().slice(0, 40) }]);
    renderDiary(el, date);
  });

  $$('[data-meal-menu]', el).forEach((b) => b.addEventListener('click', async () => {
    const meal = meals.find((m) => m.id === b.dataset.mealMenu);
    const count = entries.filter((e) => e.meal === meal.id).length;
    const choice = prompt(
      `${meal.name}\n\nType a new name to rename it${count ? '' : ', or type "delete" to remove this meal'}.`,
      meal.name,
    );
    if (choice == null) return;
    const v = choice.trim();
    if (!v) return;
    if (v.toLowerCase() === 'delete') {
      if (count) return toast('Remove the food in this meal first.');
      await db.setMealsForDate(date, meals.filter((m) => m.id !== meal.id));
    } else {
      await db.setMealsForDate(date, meals.map((m) => (m.id === meal.id ? { ...m, name: v.slice(0, 40) } : m)));
    }
    renderDiary(el, date);
  }));
}
