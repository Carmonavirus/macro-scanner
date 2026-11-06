// Guess a restaurant dish: type its name (“Döner Kebab”, “Vietnamese rice with chicken and sauce”)
// and Gemini estimates a typical portion's calories and macros. Then log it.

import * as db from '../db.js';
import { fmt, tintAttrs } from '../nutrition.js';
import { $, $$, esc, toast, backTo, nav, actionSheet } from '../ui.js';
import { icon } from '../icons.js';
import { today, isValidKey } from '../dates.js';
import { geminiKey } from '../voice.js';
import { generateJson } from '../gemini.js';
import { shrinkImage, toBase64 } from '../social.js';

const PROMPT = `Estimate the nutrition of a dish ordered at a restaurant, takeaway or food stand, as typically served in Germany (unless the text says otherwise).
Assume an average portion for that kind of place. If the text names a size, extras or sides, include them. Cooking oil, sauces and dressings that usually come with it count too: restaurants use more fat than home cooking.
Return:
- "name": a short clear name for the dish, in the language the user wrote
- "grams": the typical weight of the whole portion as served
- "kcal", "protein", "carbs" (without fibre), "fat": for the whole portion
- "low", "high": a realistic kcal range for this dish across places
- "parts": the main components with rough grams, e.g. "Fladenbrot 120 g, Dönerfleisch 130 g, Soße 40 g, Salat 60 g"
- "note": one short sentence on what makes it vary most (e.g. "The sauce and the amount of meat change it most.")
- "menu": only when you get a picture of a menu: the dish's line as the menu writes it (number, name, description). Otherwise "".
Dish:
`;

const MENU_HINT = `

The picture is the restaurant's menu (a photo or screenshot). Find the dish the user means: by its number (e.g. "23", "Nr. 23", "B4") or by its name. Use what the menu says about it: its name, description, ingredients, size and sides. If the menu shows nutrition or a weight, use that. If you can't find the dish, say so in "note" and estimate from what the user wrote.
The user wrote: `;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' }, grams: { type: 'NUMBER' },
    kcal: { type: 'NUMBER' }, protein: { type: 'NUMBER' }, carbs: { type: 'NUMBER' }, fat: { type: 'NUMBER' },
    low: { type: 'NUMBER' }, high: { type: 'NUMBER' }, parts: { type: 'STRING' }, note: { type: 'STRING' }, menu: { type: 'STRING' },
  },
  required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'low', 'high', 'parts', 'note', 'menu'],
};

const SIZES = [[0.5, '½'], [0.75, '¾'], [1, 'Normal'], [1.25, '1¼'], [1.5, '1½']];

export async function renderGuess(el, dateParam, mealId) {
  const date = isValidKey(dateParam) ? dateParam : today();
  const meals = await db.mealsForDate(date);
  const meal = meals.find((m) => m.id === mealId);
  if (!geminiKey()) {
    el.innerHTML = `<section class="card"><p>This uses Google Gemini with your own free key. Add it under <a href="#/more">More › Voice logging</a> first.</p></section>`;
    return;
  }
  el.innerHTML = `
    <section class="card">
      <p class="hint">Type a dish from a restaurant or takeaway, or add a photo of the menu and type the dish’s number. Gemini estimates a typical portion.</p>
      <form id="guess-form" autocomplete="off">
        <input id="guess-q" placeholder="e.g. Döner Kebab, or 23 with a menu photo" aria-label="Dish name or number">
        <label class="btn with-ic guess-photo">${icon('camera')} <span id="guess-photo-label">Add a menu photo or screenshot</span>
          <input id="guess-img" type="file" accept="image/*" multiple hidden>
        </label>
        <button class="btn primary wide" id="guess-go" type="submit" disabled>${icon('sparkles')} Estimate</button>
      </form>
      <p class="status" id="guess-status" role="status"></p>
    </section>
    <div id="guess-out"></div>`;
  const q = $('#guess-q', el);
  const go = $('#guess-go', el);
  const status = $('#guess-status', el);
  const out = $('#guess-out', el);
  const img = $('#guess-img', el);
  const ready = () => { go.disabled = !q.value.trim() && !img.files.length; };
  q.addEventListener('input', ready);
  img.addEventListener('change', () => {
    const n = img.files.length;
    $('#guess-photo-label', el).textContent = n ? `${n} menu picture${n === 1 ? '' : 's'} added · change` : 'Add a menu photo or screenshot';
    q.placeholder = n ? 'Dish number or name, e.g. 23' : 'e.g. Döner Kebab, or 23 with a menu photo';
    ready();
  });
  q.focus();

  $('#guess-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = q.value.trim();
    if (!text && !img.files.length) return;
    go.disabled = true;
    status.className = 'status';
    status.textContent = 'Estimating…';
    out.innerHTML = '';
    let g;
    try {
      const pics = await Promise.all([...img.files].slice(0, 4).map(shrinkImage));
      const parts = [{ text: PROMPT + (pics.length ? MENU_HINT : '') + (text || '(no text: pick the dish that stands out, or the first main dish)') }];
      for (const f of pics) parts.push({ inlineData: { mimeType: f.type || 'image/jpeg', data: await toBase64(f) } });
      g = await generateJson(geminiKey(), parts, SCHEMA, { temperature: 0.2, thinking: 512, onRetry: () => { status.textContent = 'Gemini didn’t answer properly, trying again…'; } });
    } catch (err) {
      status.className = 'status error';
      status.textContent = err.message;
      go.disabled = false;
      return;
    }
    status.textContent = '';
    go.disabled = false;
    if (!(g?.kcal > 0)) { status.className = 'status error'; status.textContent = 'Gemini couldn’t estimate that. Try describing the dish a bit more.'; return; }
    show(g);
  });

  const show = (g) => {
    let size = 1;
    const draw = () => {
      const v = { kcal: g.kcal * size, protein: g.protein * size, carbs: g.carbs * size, fat: g.fat * size };
      out.innerHTML = `
        <section ${tintAttrs(v, 'card guess-card')}>
          <h2 class="card-title">${esc(g.name)}</h2>
          <p class="guess-kcal"><strong>${fmt(v.kcal, 'kcal')} kcal</strong> · P ${fmt(v.protein)} · C ${fmt(v.carbs)} · F ${fmt(v.fat)}</p>
          <p class="small muted">About ${fmt(g.grams * size)} g · usually ${fmt(g.low * size, 'kcal')}–${fmt(g.high * size, 'kcal')} kcal</p>
          ${g.menu ? `<p class="small from-post">${icon('quote')} ${esc(g.menu)}</p>` : ''}
          ${g.parts ? `<p class="small muted">${esc(g.parts)}</p>` : ''}
          ${g.note ? `<p class="small muted">${esc(g.note)}</p>` : ''}
          <div class="chips guess-size" role="radiogroup" aria-label="Portion">${SIZES.map(([f, l]) => `<button type="button" class="chip${f === size ? ' active' : ''}" role="radio" aria-checked="${f === size}" data-size="${f}">${l}</button>`).join('')}</div>
          <button class="btn primary wide" id="guess-add">${icon('plus')} Add${meal ? ` to ${esc(meal.name)}` : ''}</button>
          <p class="hint small">✨ Gemini’s estimate. Restaurant portions vary a lot, so take it as a rough number.</p>
        </section>`;
      $$('[data-size]', out).forEach((b) => b.addEventListener('click', () => { size = Number(b.dataset.size); draw(); }));
      $('#guess-add', out).addEventListener('click', () => add(g, size));
    };
    draw();
  };

  const add = async (g, size) => {
    const pick = meal ? meal.id : await actionSheet('Add to which meal?', meals.map((m) => ({ value: m.id, label: m.name, icon: 'utensils' })), icon);
    if (!pick) return;
    const grams = Math.max(1, Math.round(g.grams * size));
    const per = (x) => Math.round(((x * size) / grams) * 1000) / 10;   // per 100 g
    const p = {
      code: `custom-ai-${Date.now().toString(36)}`, name: g.name, brand: 'Restaurant (estimate)', imageUrl: null, quantity: null,
      per100: { kcal: per(g.kcal), protein: per(g.protein), carbs: per(g.carbs), fat: per(g.fat), sugars: null, fiber: null, saturatedFat: null, salt: null },
      unit: 'g', source: 'ai', fetchedAt: new Date().toISOString(),
    };
    await db.putProduct(p);
    await db.addEntry({ date, meal: pick, code: p.code, name: p.name, brand: p.brand, unit: 'g', grams, per100: { ...p.per100 } });
    toast(`Added ${g.name} to ${meals.find((m) => m.id === pick).name}`);
    backTo(nav.diaryDepth, `#/day/${date}`);
  };
}
