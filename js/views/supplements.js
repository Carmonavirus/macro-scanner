// Supplements: the daily checklist card for the diary, and the screen to edit the list.

import * as db from '../db.js';
import { $, $$, esc, go, toast } from '../ui.js';
import { icon } from '../icons.js';

/** Card for one day in the diary. */
export async function supplementsCard(date) {
  const [list, taken] = await Promise.all([db.getSupplements(), db.takenOn(date)]);
  if (!list.length) {
    return `<section class="card supps" id="supps">
      <div class="meal-head"><h2 class="with-ic">${icon('pill')} Supplements</h2></div>
      <p class="muted small">Make a list of the supplements you take, then tick them off each day.</p>
      <a class="btn add" href="#/supplements">${icon('plus')} Create my supplement list</a>
    </section>`;
  }
  const done = list.filter((s) => taken[s.id]).length;
  return `<section class="card supps" id="supps">
    <div class="meal-head">
      <div class="meal-title">
        <h2 class="with-ic">${icon('pill')} Supplements</h2>
        <p class="muted small">${done === list.length ? 'All taken today' : `${done} of ${list.length} taken`}</p>
      </div>
      <a class="btn icon ghost" href="#/supplements" aria-label="Edit supplement list">${icon('pencil')}</a>
    </div>
    <ul class="supp-list">${list.map((s) => `
      <li><label class="supp${taken[s.id] ? ' taken' : ''}">
        <input type="checkbox" data-supp="${esc(s.id)}" ${taken[s.id] ? 'checked' : ''}>
        <span class="supp-name">${esc(s.name)}</span>
        ${s.dose ? `<span class="muted small">${esc(s.dose)}</span>` : ''}
      </label></li>`).join('')}
    </ul>
  </section>`;
}

/** Wire up the checkboxes after the card is in the page. */
export function bindSupplements(root, date) {
  $$('[data-supp]', root).forEach((cb) => cb.addEventListener('change', async () => {
    await db.setTaken(date, cb.dataset.supp, cb.checked);
    cb.closest('.supp').classList.toggle('taken', cb.checked);
    const card = $('#supps', root);
    const boxes = $$('[data-supp]', card);
    const done = boxes.filter((b) => b.checked).length;
    $('.meal-title p', card).textContent = done === boxes.length ? 'All taken today' : `${done} of ${boxes.length} taken`;
  }));
}

/** Screen to add, rename, reorder and remove supplements. */
export async function renderSupplements(el) {
  let list = await db.getSupplements();
  const save = async () => { await db.setSupplements(list); };

  const render = () => {
    el.innerHTML = `
      <p class="hint">These show up as checkboxes in every day of your diary. Changes here don’t affect what you ticked on past days.</p>
      <ul class="supp-edit">${list.map((s, i) => `
        <li data-i="${i}">
          <div class="supp-edit-text"><strong>${esc(s.name)}</strong>${s.dose ? `<span class="muted small">${esc(s.dose)}</span>` : ''}</div>
          <button class="btn icon ghost" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('arrow-up')}</button>
          <button class="btn icon ghost" data-down="${i}" aria-label="Move down" ${i === list.length - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
          <button class="btn icon ghost danger" data-del="${i}" aria-label="Remove ${esc(s.name)}">${icon('trash-2')}</button>
        </li>`).join('')}
      </ul>
      ${list.length ? '' : '<p class="empty">No supplements yet. Add your first one below.</p>'}
      <form id="form-supp" class="edit-form card" autocomplete="off">
        <h2 class="card-title">Add a supplement</h2>
        <label>Name<input id="supp-name" name="name" required maxlength="40" placeholder="e.g. Creatine, Vitamin D3, Omega-3"></label>
        <label>Amount (optional)<input id="supp-dose" name="dose" maxlength="30" placeholder="e.g. 5 g, 2 capsules, 1000 IU"></label>
        <button class="btn primary with-ic" type="submit">${icon('plus')} Add</button>
      </form>
      <button class="btn wide" id="btn-supp-done">Done</button>
    `;
    $('#form-supp', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#supp-name', el).value.trim();
      if (!name) return;
      list = [...list, { id: `s${Date.now().toString(36)}`, name, dose: $('#supp-dose', el).value.trim() }];
      await save();
      render();
      $('#supp-name', el).focus();
    });
    const move = async (i, d) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      list = next; await save(); render();
    };
    $$('[data-up]', el).forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.up), -1)));
    $$('[data-down]', el).forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.down), 1)));
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
      const i = Number(b.dataset.del);
      const removed = list[i];
      list = list.filter((_, j) => j !== i);
      await save(); render();
      toast(`Removed ${removed.name}`);
    }));
    $('#btn-supp-done', el).addEventListener('click', () => (history.length > 1 ? history.back() : go('#/', { replace: true })));
  };
  render();
}
