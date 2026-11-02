// Diary: one day, its meals, the food in each meal, and totals.

import * as db from '../db.js';
import { today, addDays, dayLabel, isValidKey } from '../dates.js';
import { totals, entryMacros, fmt } from '../nutrition.js';
import { $, $$, esc, go, macroTiles, kcalHeader, splitBar, pmf, toast, actionSheet } from '../ui.js';
import { enableSwipe, collapse } from '../swipe.js';
import { installBanner, backupBanner } from './more.js';
import { supplementsCard, bindSupplements } from './supplements.js';
import { workoutsCard } from './hevy.js';
import { icon } from '../icons.js';

export async function renderDiary(el, dateParam) {
  const date = isValidKey(dateParam) ? dateParam : today();
  const [meals, entries, goals, supps, workouts] = await Promise.all([db.mealsForDate(date), db.entriesForDate(date), db.getGoals(), supplementsCard(date), workoutsCard(date)]);
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
      ${kcalHeader(day.kcal, goals.kcal)}
      ${macroTiles(day, { goals, keys: ['protein', 'carbs', 'fat'] })}
      <div class="daybar-foot">
        ${splitBar(day) || '<span class="muted">Nothing logged yet</span>'}
        <a href="#/goals">${hasGoals ? 'Edit goals' : 'Set goals'}</a>
      </div>
    </section>

    ${allMeals.map((meal) => {
      const items = meal.id === '_other' ? orphans : entries.filter((e) => e.meal === meal.id);
      const t = totals(items);
      return `
      <section class="card meal" data-meal="${esc(meal.id)}">
        <div class="meal-head">
          <div class="meal-title">
            <h2>${esc(meal.name)}</h2>
            <p class="muted small">${items.length ? pmf(t) : 'Nothing yet'}</p>
          </div>
          ${items.length ? `<span class="meal-kcal">${fmt(t.kcal, 'kcal')}<small> kcal</small></span>` : ''}
          ${meal.id === '_other' ? '' : `<button class="btn icon ghost" data-meal-menu="${esc(meal.id)}" aria-label="Meal options">${icon('ellipsis')}</button>`}
        </div>
        ${items.length ? `<ul class="entries">${items.map((e) => {
          const v = entryMacros(e);
          return `<li class="swipe" data-entry="${e.id}"><button type="button" class="swipe-del" tabindex="-1" aria-hidden="true">${icon('trash-2')}<span>Delete</span></button><a class="swipe-row" draggable="false" href="#/entry/${e.id}">
            <span class="info"><strong>${esc(e.name)}</strong><span class="muted small">${fmt(e.grams)} ${esc(e.unit || 'g')}${e.brand ? ' · ' + esc(e.brand) : ''}</span></span>
            <span class="kcal">${fmt(v.kcal, 'kcal')}<small> kcal</small></span></a></li>`;
        }).join('')}</ul>` : ''}
        ${meal.id === '_other' ? '' : `<button class="btn add" data-add="${esc(meal.id)}">${icon('plus')} Add food</button>`}
      </section>`;
    }).join('')}

    <button class="btn wide with-ic" id="btn-add-meal">${icon('plus')} Add another meal</button>

    ${workouts}

    ${supps}
  `;
  bindSupplements(el, date);

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

  enableSwipe(el, async (li) => {
    const entry = entries.find((e) => String(e.id) === li.dataset.entry);
    if (!entry) return;
    await collapse(li);
    await db.deleteEntry(entry.id);
    renderDiary(el, date);
    toast(`Deleted ${entry.name}`, {
      action: 'Undo',
      onAction: async () => { await db.putEntry(entry); if (location.hash === '' || location.hash.startsWith('#/day') || location.hash === '#/') renderDiary(el, date); },
    });
  });

  $$('[data-meal-menu]', el).forEach((b) => b.addEventListener('click', async () => {
    const meal = meals.find((m) => m.id === b.dataset.mealMenu);
    const items = entries.filter((e) => e.meal === meal.id);
    const choice = await actionSheet(meal.name, [
      { value: 'rename', label: 'Rename', icon: 'pencil' },
      { value: 'delete', label: 'Delete meal', icon: 'trash-2', danger: true },
    ], icon);
    if (choice === 'rename') {
      const v = prompt('New name for this meal', meal.name)?.trim();
      if (!v) return;
      await db.setMealsForDate(date, meals.map((m) => (m.id === meal.id ? { ...m, name: v.slice(0, 40) } : m)));
      renderDiary(el, date);
    } else if (choice === 'delete') {
      const n = items.length;
      if (n && !confirm(`Delete ${meal.name} and the ${n} item${n === 1 ? '' : 's'} in it?`)) return;
      for (const it of items) await db.deleteEntry(it.id);
      await db.setMealsForDate(date, meals.filter((m) => m.id !== meal.id));
      renderDiary(el, date);
      toast(`Deleted ${meal.name}`, {
        action: 'Undo',
        onAction: async () => {
          for (const it of items) await db.putEntry(it);
          await db.setMealsForDate(date, meals);
          renderDiary(el, date);
        },
      });
    }
  }));
}
