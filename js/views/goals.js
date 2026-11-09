// Daily goals: calories and grams of protein, carbs and fat. Also weight and height,
// used for calories burned by steps.

import * as db from '../db.js';
import { fmt } from '../nutrition.js';
import { $, parseNum, toast } from '../ui.js';

const FIELDS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', hint: 'e.g. 2200' },
  { key: 'protein', label: 'Protein', unit: 'g', hint: 'e.g. 150' },
  { key: 'carbs', label: 'Carbs', unit: 'g', hint: 'e.g. 220' },
  { key: 'fat', label: 'Fat', unit: 'g', hint: 'e.g. 70' },
];

export async function renderGoals(el) {
  const [goals, body] = await Promise.all([db.getGoals(), db.getBody()]);
  el.innerHTML = `
    <p class="hint">Set what you aim for each day. In the diary, a value gets highlighted once you reach it. Leave a field empty to skip that goal.</p>
    <form id="form-goals" class="edit-form" autocomplete="off">
      <div class="grid2">
        ${FIELDS.map((f) => `<label>${f.label} (${f.unit})
          <input id="goal-${f.key}" name="${f.key}" type="text" inputmode="decimal" placeholder="${f.hint}" value="${goals[f.key] > 0 ? fmt(goals[f.key], f.key) : ''}">
        </label>`).join('')}
      </div>
      <p class="muted small" id="macro-kcal"></p>
      <h3 class="card-title">About you</h3>
      <p class="hint small">Used to estimate the calories you burn with your steps and Hevy workouts. Without it, 75 kg and 175 cm are assumed.</p>
      <div class="grid2">
        <label>Weight (kg)<input name="weight" type="text" inputmode="decimal" placeholder="e.g. 80" value="${body.weight > 0 ? fmt(body.weight) : ''}"></label>
        <label>Height (cm)<input name="height" type="text" inputmode="decimal" placeholder="e.g. 180" value="${body.height > 0 ? fmt(body.height) : ''}"></label>
      </div>
      <p class="status error" id="goals-error"></p>
      <button class="btn primary" type="submit">Save goals</button>
    </form>
  `;
  const form = $('#form-goals', el);
  const sumHint = () => {
    const p = parseNum(form.protein.value) || 0, c = parseNum(form.carbs.value) || 0, f = parseNum(form.fat.value) || 0;
    const kcal = p * 4 + c * 4 + f * 9;
    $('#macro-kcal', el).textContent = kcal ? `Your macro goals add up to about ${Math.round(kcal)} kcal (protein and carbs 4 kcal/g, fat 9 kcal/g).` : '';
  };
  form.addEventListener('input', sumHint);
  sumHint();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = {};
    for (const f of FIELDS) {
      const raw = form[f.key].value.trim();
      const v = parseNum(raw);
      if (raw && (v == null || v <= 0)) {
        $('#goals-error', el).textContent = `${f.label}: use a number above 0, like 150.`;
        return;
      }
      next[f.key] = raw ? v : null;
    }
    const bodyNext = {};
    for (const [k, label, min, max] of [['weight', 'Weight', 25, 350], ['height', 'Height', 100, 250]]) {
      const raw = form[k].value.trim();
      const v = parseNum(raw);
      if (raw && (v == null || v < min || v > max)) {
        $('#goals-error', el).textContent = `${label}: use a number between ${min} and ${max}.`;
        return;
      }
      bodyNext[k] = raw ? v : null;
    }
    await db.setGoals(next);
    await db.setBody(bodyNext);
    toast('Goals saved');
    history.length > 1 ? history.back() : (location.hash = '#/');
  });
}
