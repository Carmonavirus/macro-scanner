// Recipe from a social media post: paste the link and caption (or share the post to this app),
// optionally add the video or screenshots, Gemini writes down the recipe, you check it and save it.
// Also the screen for one of your saved recipes.

import * as db from '../db.js';
import { fmt, tintAttrs } from '../nutrition.js';
import { $, $$, esc, toast, actionSheet } from '../ui.js';
import { icon } from '../icons.js';
import { today } from '../dates.js';
import { geminiKey } from '../voice.js';
import { renderAiCard } from './voice.js';
import { addToShoppingList } from './shopping.js';
import {
  readRecipe, toDraft, saveDraft, cleanLink, textWithoutLink, MAX_MEDIA_BYTES,
  myRecipeById, myRecipeTotals, myRecipeItems, deleteMyRecipe, sourceName,
} from '../social.js';

const SHARE_KEY = 'sharedPost';   // sessionStorage: { link, text } from Android's share menu
const macroLine = (t) => `${fmt(t.kcal, 'kcal')} kcal · P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}`;
const mb = (n) => `${(n / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

/** Called at start-up: a post shared to the app arrives as ?url=…&text=…; open the import screen with it. */
export function takeShare() {
  const q = new URLSearchParams(location.search);
  if (!q.has('share')) return false;
  const all = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n');
  try { sessionStorage.setItem(SHARE_KEY, JSON.stringify({ link: cleanLink(all), text: textWithoutLink(all) })); } catch { /* ignore */ }
  history.replaceState(null, '', `${location.pathname}#/import`);
  return true;
}

// ---------- Import ----------
export async function renderImport(el) {
  if (!geminiKey()) {
    el.innerHTML = `<p class="hint">Reading recipes from posts uses Google Gemini with your own free key, the same as voice logging.</p>
      <section class="card" id="ai-card"></section>`;
    renderAiCard($('#ai-card', el), { onChange: () => renderImport(el) });
    return;
  }
  let shared = null;
  try { shared = JSON.parse(sessionStorage.getItem(SHARE_KEY)); sessionStorage.removeItem(SHARE_KEY); } catch { /* ignore */ }

  el.innerHTML = `
    <section class="card import-card">
      <p class="hint">Get the ingredients and steps from an Instagram reel or post (TikTok and YouTube work too).</p>
      <ol class="steps small">
        <li>In Instagram, tap <strong>Share</strong> on the post and pick <strong>Macro Scanner</strong>, or copy the link and paste it here.</li>
        <li>Instagram doesn’t let apps read posts, so copy the caption too: tap the caption, then <strong>⋯ › Copy</strong> or long-press it.</li>
        <li>For a reel where the recipe is only in the video, add the video (save it or screen-record it) or a few screenshots.</li>
      </ol>
      <label>Link to the post
        <input id="imp-link" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/…" value="${esc(shared?.link || '')}">
      </label>
      <label>Caption
        <textarea id="imp-caption" rows="6" placeholder="Paste the caption with the recipe here">${esc(shared?.text || '')}</textarea>
      </label>
      <button class="btn small with-ic" id="imp-paste" type="button">${icon('notebook-pen')} Paste</button>
      <label>Video or screenshots <span class="muted small">(optional, up to ${mb(MAX_MEDIA_BYTES)})</span>
        <input id="imp-files" type="file" accept="video/*,image/*" multiple>
      </label>
      <p class="small muted" id="imp-files-info"></p>
      <button class="btn primary with-ic" id="imp-go">${icon('chef-hat')} Get the recipe</button>
      <p class="status" id="imp-status" role="status"></p>
      <p class="muted small">The caption and any video or pictures you add go to Google Gemini to read the recipe. With a free key, Google may use them to improve its products.</p>
    </section>
    <div id="imp-out"></div>`;

  const link = $('#imp-link', el);
  const caption = $('#imp-caption', el);
  const files = $('#imp-files', el);
  const status = $('#imp-status', el);
  const out = $('#imp-out', el);
  const go = $('#imp-go', el);

  // A link pasted into the caption box moves to the link box.
  const tidy = () => {
    const found = cleanLink(caption.value);
    if (found && !link.value.trim()) { link.value = found; caption.value = textWithoutLink(caption.value); }
  };
  caption.addEventListener('change', tidy);
  $('#imp-paste', el).addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) { toast('Nothing copied yet'); return; }
      if (cleanLink(t) && !textWithoutLink(t)) link.value = cleanLink(t);
      else { caption.value = caption.value ? `${caption.value}\n${t}` : t; tidy(); }
    } catch {
      toast('Long-press the box and tap Paste instead');
    }
  });
  files.addEventListener('change', () => {
    const fs = [...files.files];
    const size = fs.reduce((n, f) => n + f.size, 0);
    $('#imp-files-info', el).textContent = fs.length
      ? `${fs.length} file${fs.length === 1 ? '' : 's'}, ${mb(size)}${size > MAX_MEDIA_BYTES ? ': too big, use a shorter clip or screenshots' : ''}`
      : '';
  });

  go.addEventListener('click', async () => {
    tidy();
    const l = cleanLink(link.value) || link.value.trim();
    const c = caption.value.trim();
    const fs = [...files.files];
    if (!c && !fs.length) {
      status.className = 'status error';
      status.textContent = 'Paste the caption or add the video or screenshots. The app can’t open Instagram posts by itself.';
      return;
    }
    go.disabled = true;
    status.className = 'status';
    status.textContent = fs.some((f) => f.type.startsWith('video')) ? 'Watching the video and reading the recipe… this can take a minute.' : 'Reading the recipe…';
    try {
      const raw = await readRecipe({ link: l, caption: c, files: fs });
      if (!raw.ingredients?.length) throw new Error('No recipe found in that. Add the caption or the video with the recipe.');
      const draft = toDraft(raw, await db.allProducts(), { link: l, caption: c });
      status.textContent = '';
      drawDraft(out, draft);
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      status.className = 'status error';
      status.textContent = err.message;
    }
    go.disabled = false;
  });
}

function drawDraft(out, d) {
  const pickOf = (it) => (it.pick >= 0 ? it.choices[it.pick] : null);
  const amount = (it) => { const p = pickOf(it); if (!p) return null; const f = it.grams / 100; return { kcal: p.per100.kcal * f, protein: p.per100.protein * f, carbs: p.per100.carbs * f, fat: p.per100.fat * f }; };
  const label = (p) => `${p.estimate ? '✨ ' : ''}${p.name}${p.brand && !p.estimate ? ` · ${p.brand}` : ''} (${fmt(p.per100.kcal, 'kcal')} kcal/100 g)`;
  const draw = () => {
    const ok = d.ingredients.filter(pickOf);
    const t = ok.map(amount).reduce((a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const per = { kcal: t.kcal / d.servings, protein: t.protein / d.servings, carbs: t.carbs / d.servings, fat: t.fat / d.servings };
    out.innerHTML = `
      <h2 class="section-title">Check the recipe</h2>
      <section class="card import-review">
        <label>Name <input id="d-title" value="${esc(d.title)}"></label>
        <label class="import-serv">Makes <input id="d-serv" type="number" inputmode="numeric" min="1" max="20" value="${d.servings}"> portions</label>
        <p class="voice-total"><strong>Per portion: ${fmt(per.kcal, 'kcal')} kcal</strong> · P ${fmt(per.protein)} · C ${fmt(per.carbs)} · F ${fmt(per.fat)}</p>
        ${d.notes ? `<p class="notice small">${esc(d.notes)}</p>` : ''}
      </section>
      <h3 class="section-title">Ingredients for the whole recipe</h3>
      <ul class="voice-list">${d.ingredients.map((it, i) => {
        const p = pickOf(it);
        const a = amount(it);
        return `<li ${p ? tintAttrs(p.per100, 'voice-item') : 'class="voice-item"'}>
          <div class="voice-said muted small">“${esc(it.said)}”</div>
          <div class="voice-row">
            <select data-pick="${i}" aria-label="Food for ${esc(it.said)}">
              ${it.choices.map((c, j) => `<option value="${j}"${j === it.pick ? ' selected' : ''}>${esc(label(c))}</option>`).join('')}
              <option value="-1"${it.pick < 0 ? ' selected' : ''}>Leave out</option>
            </select>
            <label class="voice-g"><input type="number" inputmode="decimal" min="0" step="any" value="${fmt(it.grams)}" data-g="${i}" aria-label="Grams"> g</label>
          </div>
          <div class="small ${a ? '' : 'muted'}">${a ? `${macroLine(a)}${p.estimate ? ' · estimated' : ''}` : 'Left out'}</div>
        </li>`;
      }).join('')}</ul>
      <section class="card">
        <h3 class="card-title">Method</h3>
        <ol class="steps">${d.steps.map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">No steps in the post.</li>'}</ol>
      </section>
      <button class="btn primary big with-ic" id="d-save">${icon('bookmark-plus')} Save recipe</button>
      <p class="muted small">✨ = Gemini’s estimate, because nothing in your foods or the basic foods matched. Amounts from a video are estimates, so check them.</p>`;

    $('#d-title', out).addEventListener('change', (e) => { d.title = e.target.value.trim() || d.title; });
    $('#d-serv', out).addEventListener('change', (e) => { d.servings = Math.max(1, Math.min(20, Math.round(+e.target.value) || 1)); draw(); });
    $$('[data-pick]', out).forEach((s) => s.addEventListener('change', () => { d.ingredients[+s.dataset.pick].pick = +s.value; draw(); }));
    $$('[data-g]', out).forEach((inp) => inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.replace(',', '.'));
      if (v > 0) d.ingredients[+inp.dataset.g].grams = v;
      draw();
    }));
    $('#d-save', out).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      d.title = $('#d-title', out).value.trim() || d.title;
      const r = await saveDraft(d);
      toast('Recipe saved under My recipes');
      location.hash = `#/myrecipe/${r.id}`;
    });
  };
  draw();
}

// ---------- One of my recipes ----------
export async function renderMyRecipe(el, id) {
  const r = await myRecipeById(id);
  if (!r) { el.innerHTML = '<p class="empty">Recipe not found.</p>'; return; }
  let portions = 1;
  const per = myRecipeTotals(r);
  const draw = () => {
    const items = myRecipeItems(r, portions);
    const t = { kcal: per.kcal * portions, protein: per.protein * portions, carbs: per.carbs * portions, fat: per.fat * portions };
    el.innerHTML = `
      <div class="product-head">
        <div class="product-img placeholder">${icon('chef-hat')}</div>
        <div><h2>${esc(r.name)}</h2>
          <p class="muted small with-ic">${r.minutes ? `${icon('clock')} ${r.minutes} min · ` : ''}makes ${r.servings} portion${r.servings === 1 ? '' : 's'}</p></div>
      </div>
      ${r.link ? `<a class="btn with-ic import-source" href="${esc(r.link)}" target="_blank" rel="noopener">${icon('external-link')} Original post on ${esc(sourceName(r.link))}</a>` : ''}
      <div class="row-between recipe-portions">
        <span>${portions === 1 ? '1 portion' : `${portions} portions`}</span>
        <div class="stepper">
          <button type="button" class="btn icon ghost" data-dec aria-label="Fewer portions" ${portions <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
          <span class="count">${portions}</span>
          <button type="button" class="btn icon ghost" data-inc aria-label="More portions" ${portions >= 20 ? 'disabled' : ''}>${icon('plus')}</button>
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
        <ul class="recipe-ingredients">${items.map((i, n) => `
          <li ${tintAttrs(i.per100)}>
            <span class="info"><span>${esc(i.name)}</span><span class="small muted">${r.items[n].said ? `“${esc(r.items[n].said)}” · ` : ''}${macroLine({ kcal: i.per100.kcal * i.grams / 100, protein: i.per100.protein * i.grams / 100, carbs: i.per100.carbs * i.grams / 100, fat: i.per100.fat * i.grams / 100 })}</span></span>
            <strong>${fmt(i.grams)} ${esc(i.unit)}</strong></li>`).join('')}
        </ul>
        <p class="muted small">Amounts are for ${portions === 1 ? 'one portion' : `${portions} portions`}. “Quoted” text is what the post said for the whole recipe.</p>
      </section>
      <section class="card">
        <h3 class="card-title">Method</h3>
        <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">No steps.</li>'}</ol>
      </section>
      <button class="btn ghost with-ic" id="btn-del">${icon('trash-2')} Delete recipe</button>`;

    $('[data-dec]', el).addEventListener('click', () => { portions = Math.max(1, portions - 1); draw(); });
    $('[data-inc]', el).addEventListener('click', () => { portions = Math.min(20, portions + 1); draw(); });
    $('#btn-log', el).addEventListener('click', async () => {
      const date = today();
      const meals = await db.mealsForDate(date);
      const pick = await actionSheet('Add to which meal today?', meals.map((m) => ({ value: m.id, label: m.name, icon: 'utensils' })), icon);
      if (!pick) return;
      const meal = meals.find((m) => m.id === pick);
      await db.logSavedMeal({ items: myRecipeItems(r, 1) }, date, pick);
      toast(`Added 1 portion of ${r.name} to ${meal.name}`, { action: 'Open diary', onAction: () => { location.hash = '#/'; } });
    });
    $('#btn-save', el).addEventListener('click', async () => {
      const saved = await db.getSavedMeals();
      if (saved.some((s) => s.name === r.name)) { toast('Already in your saved meals'); return; }
      await db.saveMeal(r.name, myRecipeItems(r, 1));
      toast('Saved. Find it under Saved meals when you add food.');
    });
    $('#btn-shop', el).addEventListener('click', async () => {
      const n = await addToShoppingList(items, portions > 1 ? `${r.name} ×${portions}` : r.name);
      toast(`Added to your shopping list (${n} items)`, { action: 'Open list', onAction: () => { location.hash = '#/shopping'; } });
    });
    $('#btn-del', el).addEventListener('click', async () => {
      if (!confirm(`Delete “${r.name}”?`)) return;
      await deleteMyRecipe(r.id);
      toast('Recipe deleted');
      location.hash = '#/recipes';
    });
  };
  draw();
}
