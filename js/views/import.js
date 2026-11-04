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
import { storePicker, storeRow, bindStores } from './storepick.js';
import { getStore, findBranded } from '../stores.js';
import {
  readRecipe, toDraft, saveDraft, cleanLink, textWithoutLink, MAX_MEDIA_BYTES, platformOf, youtubeUrl,
  myRecipeById, myRecipeTotals, myRecipeItems, deleteMyRecipe, sourceName, useProduct, removeIngredient, draftFromRecipe, newIngredient, isTranslated, languageName, texts, statedGaps, addBranded, buyName,
} from '../social.js';

// Show the translation (English) or the post's own language; remembered while the app is open.
const view = { original: false };
const langToggle = (r) => (isTranslated(r) ? `<button class="btn small with-ic lang-toggle" id="btn-lang" type="button">${icon('languages')} ${view.original ? 'Show English' : `Show original (${esc(languageName(r.lang))})`}</button>` : '');

const PLATFORMS = [
  {
    id: 'instagram', name: 'Instagram', placeholder: 'https://www.instagram.com/reel/…', caption: 'Caption', captionHint: 'Paste the caption with the recipe here',
    hint: 'Get the ingredients and steps from an Instagram reel or post.',
    how: [
      'In Instagram, tap <strong>Share</strong> on the post and pick <strong>Macro Scanner</strong>, or copy the link and paste it here.',
      'Instagram doesn’t let apps read posts, so add a screenshot of the caption, or copy it: tap the caption, then <strong>⋯ › Copy</strong> or long-press it.',
      'If the recipe is only in the video, add the video (save it or screen-record it) or a few screenshots.',
    ],
  },
  {
    id: 'youtube', name: 'YouTube', placeholder: 'https://www.youtube.com/watch?v=… or a Shorts link', caption: 'Description (optional)', captionHint: 'Paste the description if the recipe is written there',
    hint: 'Gemini watches the YouTube video itself and writes down the ingredients and steps it hears and sees.',
    how: [
      'In YouTube, tap <strong>Share › Copy link</strong> (or share it to <strong>Macro Scanner</strong>) and paste it here.',
      'The video must be public. Long videos take a while; Shorts are quickest.',
      'If the recipe is written in the description, paste it too for exact amounts.',
    ],
  },
  {
    id: 'tiktok', name: 'TikTok', placeholder: 'https://www.tiktok.com/@…/video/…', caption: 'Caption', captionHint: 'Paste the caption with the recipe here',
    hint: 'Get the ingredients and steps from a TikTok video.',
    how: [
      'Copy the link and the caption and paste them here.',
      'TikTok doesn’t let apps read videos, so if the recipe is only in the video, save it and add it here, or add a few screenshots.',
    ],
  },
];

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

  let platform = platformOf(shared?.link || '') || 'instagram';
  el.innerHTML = `
    <section class="card import-card">
      <div class="segmented" role="tablist" aria-label="Where the recipe is from">
        ${PLATFORMS.map((p) => `<button type="button" role="tab" data-platform="${p.id}">${esc(p.name)}</button>`).join('')}
      </div>
      <p class="hint" id="imp-hint"></p>
      <ol class="steps small" id="imp-how"></ol>
      <label>Link to the post
        <input id="imp-link" type="url" inputmode="url" value="${esc(shared?.link || '')}">
      </label>
      <label><span id="imp-caption-label">Caption</span>
        <textarea id="imp-caption" rows="6" placeholder="Paste the caption with the recipe here">${esc(shared?.text || '')}</textarea>
      </label>
      <button class="btn small with-ic" id="imp-paste" type="button">${icon('notebook-pen')} Paste</button>
      <label>Video or screenshots <span class="muted small">(optional, up to ${mb(MAX_MEDIA_BYTES)})</span>
        <input id="imp-files" type="file" accept="video/*,image/*" multiple>
      </label>
      <p class="small muted" id="imp-files-info"></p>
      <button class="btn primary with-ic" id="imp-go">${icon('chef-hat')} Get the recipe</button>
      <p class="status" id="imp-status" role="status"></p>
      <p class="muted small">The link, caption and any video or pictures you add go to Google Gemini to read the recipe. With a free key, Google may use them to improve its products.</p>
    </section>
    <div id="imp-out"></div>`;

  const link = $('#imp-link', el);
  const caption = $('#imp-caption', el);
  const files = $('#imp-files', el);
  const status = $('#imp-status', el);
  const out = $('#imp-out', el);
  const go = $('#imp-go', el);

  // Instagram / YouTube / TikTok: each has its own help, and Gemini gets told where the recipe is from.
  const showPlatform = () => {
    const p = PLATFORMS.find((x) => x.id === platform);
    $$('[data-platform]', el).forEach((b) => { b.classList.toggle('active', b.dataset.platform === platform); b.setAttribute('aria-selected', b.dataset.platform === platform); });
    $('#imp-hint', el).textContent = p.hint;
    $('#imp-how', el).innerHTML = p.how.map((x) => `<li>${x}</li>`).join('');
    link.placeholder = p.placeholder;
    $('#imp-caption-label', el).textContent = p.caption;
    caption.placeholder = p.captionHint;
  };
  $$('[data-platform]', el).forEach((b) => b.addEventListener('click', () => { platform = b.dataset.platform; showPlatform(); }));
  link.addEventListener('input', () => { const p = platformOf(cleanLink(link.value)); if (p && p !== platform) { platform = p; showPlatform(); } });
  showPlatform();

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
    const videos = fs.filter((f) => !f.type.startsWith('image')).reduce((n, f) => n + f.size, 0);   // pictures get made smaller
    $('#imp-files-info', el).textContent = fs.length
      ? `${fs.length} file${fs.length === 1 ? '' : 's'}, ${mb(size)}${videos > MAX_MEDIA_BYTES ? ': too big, use a shorter clip or screenshots' : ''}`
      : '';
  });

  go.addEventListener('click', async () => {
    tidy();
    const l = cleanLink(link.value) || link.value.trim();
    const c = caption.value.trim();
    const fs = [...files.files];
    const yt = platform === 'youtube' ? youtubeUrl(l) : '';
    if (platform === 'youtube' && !yt && !c && !fs.length) {
      status.className = 'status error';
      status.textContent = 'Paste the link to the YouTube video (or Short).';
      return;
    }
    if (!yt && !c && !fs.length) {
      status.className = 'status error';
      status.textContent = 'Paste the caption or add the video or screenshots. The app can’t open Instagram posts by itself.';
      return;
    }
    go.disabled = true;
    // Which step is running, with the seconds so far, so a slow step shows where the time goes.
    const watching = yt || fs.some((f) => f.type.startsWith('video'));
    const STEPS = {
      prepare: 'Making the pictures smaller',
      gemini: watching ? 'Gemini is watching the video and reading the recipe (can take a minute)' : 'Gemini is reading the recipe',
      retry: 'Gemini didn’t answer properly, trying again',
      match: 'Matching the ingredients to foods',
    };
    let step = 'gemini';
    const t0 = Date.now();
    const show = () => { const s = Math.round((Date.now() - t0) / 1000); status.textContent = `${STEPS[step]}…${s >= 2 ? ` ${s} s` : ''}`; };
    const setStep = (x) => { step = x; show(); };
    status.className = 'status busy';
    show();
    const timer = setInterval(show, 1000);
    try {
      const raw = await readRecipe({ link: l, caption: c, files: fs, platform, onStep: setStep, onRetry: () => setStep('retry') });
      if (!raw.ingredients?.length) throw new Error('No recipe found in that. Add the caption or the video with the recipe.');
      setStep('match');
      await new Promise((r) => setTimeout(r, 0));   // let the step show
      const draft = toDraft(raw, await db.allProducts(), { link: l, caption: c });
      clearInterval(timer);
      status.className = 'status';
      status.textContent = '';
      drawDraft(out, draft);
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      status.className = 'status error';
      status.textContent = err.message;
    }
    clearInterval(timer);
    go.disabled = false;
  });
}

function drawDraft(out, d, { onSaved, onCancel } = {}) {
  let store = null;   // the "Shop at" supermarket, loaded below
  const pickOf = (it) => (it.pick >= 0 ? it.choices[it.pick] : null);
  const amount = (it) => { const p = pickOf(it); if (!p) return null; const f = it.grams / 100; return { kcal: p.per100.kcal * f, protein: p.per100.protein * f, carbs: p.per100.carbs * f, fat: p.per100.fat * f }; };
  const label = (p) => `${p.estimate ? '✨ ' : ''}${p.name}${p.brand && !p.estimate ? ` · ${p.brand}` : ''} (${fmt(p.per100.kcal, 'kcal')} kcal/100 g)`;
  const draw = () => {
    const ok = d.ingredients.filter(pickOf);
    const t = ok.map(amount).reduce((a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const per = { kcal: t.kcal / d.servings, protein: t.protein / d.servings, carbs: t.carbs / d.servings, fat: t.fat / d.servings };
    const tx = texts(d, view.original);
    out.innerHTML = `
      <h2 class="section-title">${d.editId ? 'Edit the recipe' : 'Check the recipe'}</h2>
      ${langToggle(d)}
      <section class="card import-review">
        <label>Name <input id="d-title" value="${esc(tx.title)}"${view.original ? ' readonly' : ''}></label>
        <label class="import-serv">Makes <input id="d-serv" type="number" inputmode="numeric" min="1" max="20" value="${d.servings}"> portions</label>
        <p class="voice-total"><strong>Per portion: ${fmt(per.kcal, 'kcal')} kcal</strong> · P ${fmt(per.protein)} · C ${fmt(per.carbs)} · F ${fmt(per.fat)}</p>
        ${statedLine(per, d)}
        ${d.notes ? `<p class="notice small">${esc(d.notes)}</p>` : ''}
      </section>
      <h3 class="section-title">Ingredients for the whole recipe</h3>
      ${store ? storePicker(store) : ''}
      <ul class="voice-list">${d.ingredients.map((it, i) => {
        const p = pickOf(it);
        const a = amount(it);
        return `<li ${p ? tintAttrs(p.per100, 'voice-item') : 'class="voice-item"'}>
          <div class="from-post">${icon('quote')}<span>${it.postName ? `<strong>${esc(it.postName)}</strong> ` : ''}<span class="small">${esc(tx.said[i])}</span>${it.optional ? ' <b class="imp-tag">Optional</b>' : ''}</span></div>
          <div class="voice-row">
            <select data-pick="${i}" aria-label="Food for ${esc(it.said)}">
              ${it.choices.map((c, j) => `<option value="${j}"${j === it.pick ? ' selected' : ''}>${esc(label(c))}</option>`).join('')}
              <option value="-1"${it.pick < 0 ? ' selected' : ''}>Leave out</option>
            </select>
            <label class="voice-g"><input type="number" inputmode="decimal" min="0" step="any" value="${fmt(it.grams)}" data-g="${i}" aria-label="Grams"> g</label>
          </div>
          <div class="small ${a ? '' : 'muted'}">${a ? `${macroLine(a)}${p.estimate ? ' · estimated' : ''}${it.brand && p.code && !String(p.code).startsWith('gen-') ? ' · label values' : ''}` : (it.optional ? 'Optional, left out: pick a food to add it' : 'Left out')}</div>
          ${p && buyName(p, it) !== it.postName ? `<div class="small to-buy">${icon('shopping-cart')}${esc(buyName(p, it))}</div>` : ''}
          ${store ? storeRow(store, buyName(p, it) || it.postName || it.said, i) : ''}
          ${it.lookup ? `<div class="small muted">${esc(it.lookup)}</div>` : ''}
        </li>`;
      }).join('')}</ul>
      <form class="add-ing" id="d-add">
        <input id="d-add-text" placeholder="Add an ingredient, e.g. 200 g Skyr" autocomplete="off">
        <button class="btn with-ic" type="submit">${icon('plus')} Add</button>
      </form>
      <section class="card">
        <h3 class="card-title">Method</h3>
        <ol class="steps">${tx.steps.map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">No steps in the post.</li>'}</ol>
      </section>
      <button class="btn primary big with-ic" id="d-save">${icon('bookmark-plus')} ${d.editId ? 'Save changes' : 'Save recipe'}</button>
      ${onCancel ? '<button class="btn ghost big" id="d-cancel" type="button">Cancel</button>' : ''}
      <p class="muted small">✨ = Gemini’s estimate, because nothing in your foods or the basic foods matched. Amounts from a video are estimates, so check them.</p>`;

    $('#btn-lang', out)?.addEventListener('click', () => { view.original = !view.original; draw(); });
    if (store) {
      bindStores(out, d.ingredients.map((it) => { const p = pickOf(it); return { name: buyName(p, it) || it.postName || it.said, per100: p?.per100 || null }; }), {
        onStore: async () => { store = await getStore(); draw(); },
        // Use the shop's product for this ingredient: it goes first in the menu and is picked.
        onUse: (i, p) => {
          const it = d.ingredients[i];
          const at = it.choices.findIndex((c) => c.code === p.code);
          if (at < 0) it.choices.unshift({ ...p, source: 'off', per100: { ...p.per100 } });
          it.pick = at < 0 ? 0 : at;
          it.touched = true;
          draw();
        },
      });
    }
    $('#d-title', out).addEventListener('change', (e) => { if (!view.original) d.title = e.target.value.trim() || d.title; });
    $('#d-serv', out).addEventListener('change', (e) => { d.servings = Math.max(1, Math.min(20, Math.round(+e.target.value) || 1)); draw(); });
    $$('[data-pick]', out).forEach((s) => s.addEventListener('change', () => { const it = d.ingredients[+s.dataset.pick]; it.pick = +s.value; it.touched = true; draw(); }));
    $$('[data-g]', out).forEach((inp) => inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.replace(',', '.'));
      if (v > 0) d.ingredients[+inp.dataset.g].grams = v;
      draw();
    }));
    $('#d-save', out).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      if (!view.original) d.title = $('#d-title', out).value.trim() || d.title;
      const r = await saveDraft(d);
      toast(d.editId ? 'Recipe updated' : 'Recipe saved under My recipes');
      if (onSaved) onSaved(r); else location.hash = `#/myrecipe/${r.id}`;
    });
    $('#d-cancel', out)?.addEventListener('click', () => onCancel());
    $('#d-add', out).addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = $('#d-add-text', out).value.trim();
      if (!text) return;
      d.ingredients.push(newIngredient(text, await db.allProducts()));
      draw();
      $('#d-add-text', out)?.focus();
    });
  };
  draw();
  getStore().then((s) => { store = s; if (document.body.contains(out.querySelector('#d-save'))) draw(); });
  lookUpBrands(d, draw);
}

/** Brand products named in the post: find the real product on Open Food Facts, one at a time. */
async function lookUpBrands(d, draw) {
  const here = () => document.body.contains(document.getElementById('d-save'));
  for (const it of d.ingredients.filter((x) => x.brand && x.product)) {
    const what = `${it.brand} ${it.product}`;
    it.lookup = `Looking up ${what} on Open Food Facts…`;
    draw();
    try {
      const found = await findBranded(it.brand, it.product, { onWait: (sec) => { it.lookup = `Looking up ${what} in ${sec} s (Open Food Facts allows only a few searches a minute)…`; if (here()) draw(); } });
      const exact = found.filter((p) => p.exact);
      if (addBranded(it, exact.length ? exact : found)) it.lookup = exact.length ? '' : `Closest ${it.brand} product on Open Food Facts. Check it’s the right one.`;
      else it.lookup = found.length ? '' : `${what} isn’t on Open Food Facts, so its macros are Gemini’s estimate.`;
    } catch (err) {
      it.lookup = `Couldn’t look up ${what}: ${err.message}`;
    }
    if (!here()) return;   // left the page
    draw();
  }
}

/** The post's own nutrition per portion, and a warning when ours is clearly different. */
function statedLine(per, d) {
  if (!d.stated) return '';
  const s = d.stated;
  const gaps = statedGaps(per, s);
  const names = { kcal: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat' };
  const list = gaps.map((g) => names[g.key]);
  const said = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
  return `<p class="small stated${gaps.length ? ' off' : ''}">The post says: ${fmt(s.kcal, 'kcal')} kcal · P ${fmt(s.protein)} · C ${fmt(s.carbs)} · F ${fmt(s.fat)}${d.statedFor ? ` (${esc(d.statedFor)})` : ''}${gaps.length
    ? `<br>${icon('triangle-alert')} The ${said} ${gaps.length === 1 ? 'is' : 'are'} quite different from the post. Check the foods and amounts below.`
    : ' · close to ours ✓'}</p>`;
}

/** Where an ingredient's macros come from: an Open Food Facts product, the basic foods, your own food or Gemini. */
function macroSource(item) {
  const code = String(item.code || '');
  const src = item.src || (code.startsWith('custom-ai-') ? 'ai' : code.startsWith('gen-') ? 'generic' : code.startsWith('custom-') ? 'manual' : /^\d{6,}$/.test(code) ? 'off' : '');
  const what = `${esc(item.name)}${item.brand ? ` · ${esc(item.brand)}` : ''}`;
  if (src === 'ai') return `Macros: ✨ Gemini’s estimate (no Open Food Facts match)`;
  if (src === 'generic') return `Macros from: ${what} <span class="muted">(basic foods)</span>`;
  if (src === 'off') return `Macros from: ${what} <span class="muted">(Open Food Facts)</span>`;
  return `Macros from: ${what} <span class="muted">(your foods)</span>`;
}

// ---------- One of my recipes ----------
export async function renderMyRecipe(el, id) {
  const r = await myRecipeById(id);
  if (!r) { el.innerHTML = '<p class="empty">Recipe not found.</p>'; return; }
  let portions = 1;
  let per = myRecipeTotals(r);
  let store = await getStore();
  const draw = () => {
    const items = myRecipeItems(r, portions);
    const t = { kcal: per.kcal * portions, protein: per.protein * portions, carbs: per.carbs * portions, fat: per.fat * portions };
    const tx = texts(r, view.original);
    el.innerHTML = `
      <div class="product-head">
        <div class="product-img placeholder">${icon('chef-hat')}</div>
        <div><h2>${esc(tx.title)}</h2>
          <p class="muted small with-ic">${r.minutes ? `${icon('clock')} ${r.minutes} min · ` : ''}makes ${r.servings} portion${r.servings === 1 ? '' : 's'}</p></div>
      </div>
      ${langToggle(r)}
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
      <div class="actions even">
        <button class="btn primary with-ic" id="btn-log">${icon('plus')} Add to today</button>
        <button class="btn with-ic" id="btn-save">${icon('bookmark-plus')} Save as meal</button>
        <button class="btn with-ic" id="btn-shop">${icon('shopping-cart')} Shopping list</button>
      </div>
      <section class="card">
        <div class="row-between"><h3 class="card-title">Ingredients</h3><button type="button" class="btn small with-ic" id="btn-edit">${icon('pencil')} Edit</button></div>
        ${storePicker(store)}
        <ul class="recipe-ingredients">${items.map((i, n) => `
          <li ${tintAttrs(i.per100)}>
            <span class="info"><span>${esc(r.items[n].postName || i.name)}${!r.items[n].postName && i.brand ? ` <span class="muted small">· ${esc(i.brand)}</span>` : ''}</span>${r.items[n].buy && r.items[n].buy !== r.items[n].postName ? `<span class="small to-buy">${icon('shopping-cart')}${esc(r.items[n].buy)}</span>` : ''}<span class="small macro-src">${macroSource(r.items[n])}</span><span class="small muted">${tx.said[n] ? `“${esc(tx.said[n])}” · ` : ''}${macroLine({ kcal: i.per100.kcal * i.grams / 100, protein: i.per100.protein * i.grams / 100, carbs: i.per100.carbs * i.grams / 100, fat: i.per100.fat * i.grams / 100 })}</span></span>
            <strong>${fmt(i.grams)} ${esc(i.unit)}</strong>
            ${storeRow(store, r.items[n].shopName || i.name, n, `<button type="button" class="btn icon ghost ing-rm" data-rm="${n}" aria-label="Remove ${esc(r.items[n].postName || i.name)}">${icon('x')}</button>`)}</li>`).join('')}
        </ul>
        <p class="muted small">Amounts are for ${portions === 1 ? 'one portion' : `${portions} portions`}. “Quoted” text is what the post said for the whole recipe.</p>
      </section>
      <section class="card">
        <h3 class="card-title">Method</h3>
        <ol class="steps">${tx.steps.map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">No steps.</li>'}</ol>
      </section>
      <button class="btn ghost with-ic" id="btn-del">${icon('trash-2')} Delete recipe</button>`;

    $('[data-dec]', el).addEventListener('click', () => { portions = Math.max(1, portions - 1); draw(); });
    $('[data-inc]', el).addEventListener('click', () => { portions = Math.min(20, portions + 1); draw(); });
    $('#btn-lang', el)?.addEventListener('click', () => { view.original = !view.original; draw(); });
    bindStores(el, r.items.map((i) => ({ name: i.shopName || i.name, per100: i.targetPer100 || i.per100 })), {
      onStore: async () => { store = await getStore(); draw(); },
      // Swap the ingredient for the shop's product: its macros replace the old ones.
      onUse: async (n, p) => { await useProduct(r, n, p); per = myRecipeTotals(r); draw(); },
    });
    $('#btn-edit', el).addEventListener('click', async () => {
      const d = draftFromRecipe(r, await db.allProducts());
      el.innerHTML = '<div class="import-edit"></div>';
      window.scrollTo(0, 0);
      const back = () => renderMyRecipe(el, id);
      drawDraft($('.import-edit', el), d, { onSaved: back, onCancel: back });
    });
    $$('[data-rm]', el).forEach((b) => b.addEventListener('click', async () => {
      const n = +b.dataset.rm;
      if (!confirm(`Remove “${r.items[n].postName || r.items[n].name}” from this recipe?`)) return;
      await removeIngredient(r, n);
      per = myRecipeTotals(r);
      draw();
    }));
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
