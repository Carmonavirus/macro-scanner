// Diary: one day, its meals, the food in each meal, and totals.

import * as db from '../db.js';
import { today, addDays, dayLabel, isValidKey } from '../dates.js';
import { totals, entryMacros, fmt, tintAttrs } from '../nutrition.js';
import { $, $$, esc, go, macroTiles, kcalHeader, splitBar, pmf, toast, actionSheet, dayMiniHtml } from '../ui.js';
import { enableSwipe, collapse } from '../swipe.js';
import { installBanner, backupBanner } from './more.js';
import { supplementsCard, bindSupplements } from './supplements.js';
import { workoutsCard } from './hevy.js';
import { icon } from '../icons.js';
import { stepsOn, stepsUpdatedAt, refreshSteps, stepKcal } from '../steps.js';

// Meals folded shut by the user (by meal id, e.g. "breakfast"), remembered on this phone.
const COLLAPSED_KEY = 'collapsedMeals';
const getCollapsed = () => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || []); } catch { return new Set(); } };
const setCollapsed = (set) => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set])); } catch { /* ignore */ } };

// Swipe left/right anywhere on the diary to go to the next/previous day.
// Swipes that start on a food row are left alone (those open the Delete button).
let slideIn = null;
function bindDaySwipe(el) {
  if (el.dataset.daySwipe) return;
  el.dataset.daySwipe = '1';
  let x0 = 0, y0 = 0, t0 = 0, skip = true, dragging = false;
  const reset = () => { el.style.transition = ''; el.style.transform = ''; };
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    skip = e.touches.length > 1 || !el.dataset.diaryDate
      || !!e.target.closest('.swipe, input, select, textarea, dialog, .amount-slider');
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); dragging = false;
  }, { passive: true });
  // The page follows the finger, so the day change feels like turning a page.
  el.addEventListener('touchmove', (e) => {
    if (skip) return;
    const t = e.touches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (!dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { skip = true; return; }
      if (Math.abs(dx) < 10) return;
      dragging = true;
      el.style.transition = 'none';
    }
    el.style.transform = `translateX(${dx * 0.6}px)`;
  }, { passive: true });
  const end = (e) => {
    if (skip || !el.dataset.diaryDate) { if (dragging) reset(); dragging = false; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    const wasDragging = dragging;
    dragging = false;
    const fast = Date.now() - t0 < 700;
    const commit = e.type === 'touchend' && Math.abs(dy) < Math.abs(dx) * 0.6
      && (Math.abs(dx) > window.innerWidth * 0.35 || (fast && Math.abs(dx) >= 70));
    if (!commit) {
      if (wasDragging) {
        el.style.transition = 'transform .18s ease-out';
        el.style.transform = '';
        setTimeout(reset, 200);
      }
      return;
    }
    const dir = dx < 0 ? 1 : -1;
    const date = el.dataset.diaryDate;
    // Slide the old day out, then draw the new one in from the other side.
    el.style.transition = 'transform .12s ease-in';
    el.style.transform = `translateX(${-dir * window.innerWidth}px)`;
    setTimeout(() => {
      slideIn = dir > 0 ? 'next' : 'prev';
      go(`#/day/${addDays(date, dir)}`, { replace: true });
    }, 110);
  };
  el.addEventListener('touchend', end, { passive: true });
  el.addEventListener('touchcancel', end, { passive: true });
  // Leaving the diary: stop reacting to swipes until it's shown again.
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (!(h === '' || h === '#/' || h.startsWith('#/day'))) { delete el.dataset.diaryDate; reset(); }
  });
}

// ---------- Compact day total: a slim bar under the title once the big one scrolls away ----------
let mini = null;
function checkMini() {
  if (!mini) return;
  // As soon as the numbers in the macro tiles have scrolled under the title.
  const tiles = document.querySelector('#view .daybar .tiles');
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 56;
  mini.hidden = !tiles || tiles.getBoundingClientRect().top + 40 > top;
}
function updateMini(day, goals) {
  if (!mini) {
    mini = document.createElement('div');
    mini.className = 'daymini';
    mini.hidden = true;
    mini.setAttribute('role', 'button');
    mini.setAttribute('aria-label', 'Day total, tap to scroll up');
    mini.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(mini);
    window.addEventListener('scroll', checkMini, { passive: true });
    window.addEventListener('hashchange', () => setTimeout(checkMini, 0));
  }
  mini.innerHTML = dayMiniHtml(day, goals);
  checkMini();
}

/** "12:31" in the phone's own format. */
const timeOf = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };

/**
 * Entries logged together: the same group, or (logged before groups existed) next to each
 * other within a few seconds. Returns { first, size, name } for entry i.
 */
function groupOf(items, i) {
  const same = (a, b) => (a.group || b.group ? a.group === b.group : !!a.at && !!b.at && Math.abs(new Date(a.at) - new Date(b.at)) < 3000);
  let start = i; while (start > 0 && same(items[start - 1], items[start])) start--;
  let end = i; while (end < items.length - 1 && same(items[end], items[end + 1])) end++;
  return { first: start === i, size: end - start + 1, name: items[start].groupName || '' };
}

export async function renderDiary(el, dateParam) {
  const date = isValidKey(dateParam) ? dateParam : today();
  const [meals, entries, goals, supps, workouts] = await Promise.all([db.mealsForDate(date), db.entriesForDate(date), db.getGoals(), supplementsCard(date), workoutsCard(date)]);
  const body = await db.getBody();
  const hasGoals = Object.values(goals).some((g) => g > 0);
  const day = totals(entries);
  const steps = stepsOn(date);
  const stepsAt = stepsUpdatedAt();
  const stepsTime = date === today() && stepsAt ? new Date(stepsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  if (date === today()) refreshSteps();

  // Entries whose meal no longer exists (shouldn't happen, but never hide food)
  const collapsed = getCollapsed();
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
      ${date === today() && goals.kcal > 0 && goals.kcal - day.kcal >= 250 ? `<a class="eat-link" href="#/eatout">${icon('hamburger')} Eat out: what fits ${fmt(goals.kcal - day.kcal, 'kcal')} kcal</a>` : ''}
      ${steps !== null ? `<div class="steps-line"${stepsTime ? ` title="Updated ${stepsTime}"` : ''}>
        <span class="steps-part" aria-label="${steps.toLocaleString()} steps">${icon('footprints')}<strong>${steps.toLocaleString()}</strong></span>
        <span class="steps-part burn" aria-label="about ${stepKcal(steps, body)} kcal burned">${icon('flame')}<strong>${stepKcal(steps, body)}</strong><span class="muted">kcal</span></span>
      </div>` : ''}
    </section>

    ${allMeals.map((meal) => {
      const items = meal.id === '_other' ? orphans : entries.filter((e) => e.meal === meal.id);
      const t = totals(items);
      return `
      <section ${tintAttrs(items.length ? t : null, `card meal${collapsed.has(meal.id) ? ' collapsed' : ''}`)} data-meal="${esc(meal.id)}">
        <div class="meal-head">
          <button type="button" class="meal-title meal-toggle" data-toggle="${esc(meal.id)}" aria-expanded="${!collapsed.has(meal.id)}">
            ${icon('chevron-down', { cls: 'meal-chev' })}
            <span class="meal-name"><h2>${esc(meal.name)}</h2>
            <p class="muted small">${items.length ? `${pmf(t)}<span class="meal-count"> · ${items.length} item${items.length === 1 ? '' : 's'}</span>` : 'Nothing yet'}</p></span>
          </button>
          ${items.length ? `<span class="meal-kcal">${fmt(t.kcal, 'kcal')}<small> kcal</small></span>` : ''}
          ${meal.id === '_other' ? '' : `<button class="btn icon ghost" data-meal-menu="${esc(meal.id)}" aria-label="Meal options">${icon('ellipsis')}</button>`}
        </div>
        ${items.length ? `<ul class="entries">${items.map((e, i) => {
          const v = entryMacros(e);
          // A dish logged in one go (recipe, saved meal) shows its time once above its ingredients.
          const g = groupOf(items, i);
          const head = g.first && g.size > 1 ? `<li class="entry-time">${icon('clock')}${esc(timeOf(e.at))}${g.name ? ` · ${esc(g.name)}` : ''}</li>` : '';
          const when = g.size > 1 || !e.at ? '' : ` · ${esc(timeOf(e.at))}`;
          return `${head}<li class="swipe" data-entry="${e.id}"><button type="button" class="swipe-del" tabindex="-1" aria-hidden="true">${icon('trash-2')}<span>Delete</span></button><a ${tintAttrs(e.per100, 'swipe-row')} draggable="false" href="#/entry/${e.id}">
            <span class="info"><strong>${esc(e.name)}</strong><span class="muted small item-macros">${fmt(e.grams)} ${esc(e.unit || 'g')} · ${pmf(v)}${when}</span></span>
            <span class="kcal">${fmt(v.kcal, 'kcal')}<small> kcal</small></span></a></li>`;
        }).join('')}</ul>` : ''}
        ${meal.id === '_other' ? '' : `<button class="btn add" data-add="${esc(meal.id)}">${icon('plus')} Add food</button>`}
      </section>`;
    }).join('')}

    <button class="btn wide with-ic" id="btn-add-meal">${icon('plus')} Add another meal</button>

    ${workouts}

    ${supps}
  `;
  updateMini(day, goals);
  bindSupplements(el, date);
  bindDaySwipe(el);
  el.dataset.diaryDate = date;
  if (slideIn) {
    // New day enters from the side the finger came from, with no fade (a fade looked like a blink).
    el.style.transition = 'none';
    el.style.transform = `translateX(${slideIn === 'next' ? '' : '-'}${Math.round(window.innerWidth * 0.5)}px)`;
    void el.offsetWidth;
    el.style.transition = 'transform .2s ease-out';
    el.style.transform = '';
    setTimeout(() => { el.style.transition = ''; }, 220);
    slideIn = null;
  } else {
    el.style.transform = '';
  }

  $$('[data-day]', el).forEach((b) => b.addEventListener('click', () => go(`#/day/${b.dataset.day}`, { replace: true })));
  $('#pick-date', el).addEventListener('change', (e) => {
    if (isValidKey(e.target.value)) go(`#/day/${e.target.value}`, { replace: true });
  });
  $$('[data-toggle]', el).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.toggle;
    const set = getCollapsed();
    const shut = !set.has(id);
    if (shut) set.add(id); else set.delete(id);
    setCollapsed(set);
    b.closest('.meal').classList.toggle('collapsed', shut);
    b.setAttribute('aria-expanded', String(!shut));
  }));
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
      ...(items.length ? [{ value: 'save', label: 'Save as meal for later', icon: 'bookmark-plus' }] : []),
      { value: 'rename', label: 'Rename', icon: 'pencil' },
      { value: 'delete', label: 'Delete meal', icon: 'trash-2', danger: true },
    ], icon);
    if (choice === 'save') {
      const name = prompt('Name for this saved meal (e.g. Chicken rice bowl)', `My ${meal.name.toLowerCase()}`)?.trim();
      if (!name) return;
      await db.saveMeal(name.slice(0, 50), items);
      toast(`Saved “${name.slice(0, 50)}”. Find it under Add food.`);
      return;
    }
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
