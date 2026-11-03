// Voice logging screen: say what you ate, check the list, add it to the meal.
// Also the "Voice logging (AI)" settings card, shown here and under More.

import * as db from '../db.js';
import { fmt, tintAttrs } from '../nutrition.js';
import { $, $$, esc, toast, backTo, nav } from '../ui.js';
import { icon } from '../icons.js';
import { today, isValidKey, dayLabel } from '../dates.js';
import {
  KEY_URL, geminiKey, setGeminiKey, testKey, voiceLang, setVoiceLang, speechSupported, listen, understand,
} from '../voice.js';

const LANGS = [{ id: 'de-DE', label: 'Deutsch' }, { id: 'en-US', label: 'English' }];

// ---------- Settings card ----------
export function renderAiCard(card, { onChange } = {}) {
  const key = geminiKey();
  card.innerHTML = key ? `
    <h2 class="card-title with-ic">${icon('mic')} Voice logging</h2>
    <p class="with-ic">${icon('circle-check', { cls: 'ok' })} Connected to Google Gemini</p>
    <p class="muted small">Tap the microphone in Add food and say what you ate, e.g. “200 Gramm Putenhackfleisch, 80 Gramm Reis und ein Apfel”.</p>
    <div class="actions"><button class="btn" id="btn-ai-off">Remove key</button></div>` : `
    <h2 class="card-title with-ic">${icon('mic')} Voice logging</h2>
    <p>Say what you ate and the app finds the foods and amounts for you. It uses Google Gemini with your own free key.</p>
    <ol class="steps">
      <li><a href="${KEY_URL}" target="_blank" rel="noopener">Open Google AI Studio</a> and sign in with your Google account.</li>
      <li>Tap <strong>Create API key</strong> and copy it.</li>
      <li>Paste it here:</li>
    </ol>
    <form id="form-ai" class="manual-code" autocomplete="off">
      <input id="ai-key" type="password" placeholder="Gemini API key" aria-label="Gemini API key" autocapitalize="off" spellcheck="false">
      <button class="btn primary" type="submit">Connect</button>
    </form>
    <p class="status error" id="ai-error"></p>
    <p class="muted small">The key stays on this phone and isn’t included in backups. Only the text of what you say is sent to Google, not the recording. With a free key, Google may use what you send to improve its products, so just list your food and don’t say anything private.</p>`;
  $('#btn-ai-off', card)?.addEventListener('click', () => {
    setGeminiKey('');
    renderAiCard(card, { onChange });
    onChange?.();
  });
  $('#form-ai', card)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const k = $('#ai-key', card).value.trim();
    if (!k) return;
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      await testKey(k);
      setGeminiKey(k);
      toast('Voice logging is ready');
      renderAiCard(card, { onChange });
      onChange?.();
    } catch (err) {
      $('#ai-error', card).textContent = err.message;
      btn.disabled = false; btn.textContent = 'Connect';
    }
  });
}

// ---------- Voice screen ----------
export async function renderVoice(el, dateParam, mealParam) {
  const date = isValidKey(dateParam) ? dateParam : today();
  const meals = await db.mealsForDate(date);
  const meal = meals.find((m) => m.id === mealParam) || meals[0];
  const when = dayLabel(date);

  if (!geminiKey()) {
    el.innerHTML = '<section class="card" id="ai-card"></section>';
    renderAiCard($('#ai-card', el), { onChange: () => renderVoice(el, date, meal.id) });
    return;
  }

  let lang = voiceLang();
  el.innerHTML = `
    <p class="context">Adding to <strong>${esc(meal.name)}</strong>, ${esc(when === 'Today' ? 'today' : when)}</p>
    <section class="card voice-card">
      <div class="chips">${LANGS.map((l) => `<button class="chip${l.id === lang ? ' active' : ''}" data-lang="${l.id}">${esc(l.label)}</button>`).join('')}</div>
      ${speechSupported() ? `<button class="mic-btn" id="mic" aria-label="Start speaking">${icon('mic')}</button>
      <p class="hint center" id="mic-hint">Tap and say what you ate, with amounts.<br>e.g. “200 Gramm Putenhackfleisch, 80 Gramm Reis und ein Apfel”</p>`
        : '<p class="hint">This browser can’t listen. Type what you ate below instead.</p>'}
      <textarea id="said" rows="3" placeholder="What you said shows up here. You can also type or fix it."></textarea>
      <button class="btn primary with-ic" id="btn-find" disabled>${icon('search')} Find foods</button>
      <p class="status" id="voice-status" role="status"></p>
    </section>
    <div id="voice-out"></div>`;

  const said = $('#said', el);
  const status = $('#voice-status', el);
  const findBtn = $('#btn-find', el);
  const out = $('#voice-out', el);
  const mic = $('#mic', el);
  let session = null;
  let items = [];
  let findAfterStop = false;

  const setListening = (on) => {
    mic?.classList.toggle('on', on);
    mic?.setAttribute('aria-label', on ? 'Stop' : 'Start speaking');
    if ($('#mic-hint', el)) $('#mic-hint', el).textContent = on ? 'Listening… tap again when you’re done.' : 'Tap to speak again, or fix the text and tap Find foods.';
  };
  const stopListening = () => { session?.stop(); session = null; setListening(false); };

  $$('[data-lang]', el).forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; setVoiceLang(lang);
    $$('[data-lang]', el).forEach((x) => x.classList.toggle('active', x === b));
    if (session) { stopListening(); }
  }));
  said.addEventListener('input', () => { findBtn.disabled = !said.value.trim(); });

  mic?.addEventListener('click', () => {
    if (session) { findAfterStop = true; stopListening(); return; }
    const before = said.value.trim();
    status.textContent = '';
    try {
      session = listen({
        lang,
        onText: (t) => { said.value = before ? `${before}, ${t}` : t; findBtn.disabled = !said.value.trim(); },
        onEnd: () => { session = null; setListening(false); if (findAfterStop) { findAfterStop = false; find(); } },
        onError: (msg) => { session = null; setListening(false); status.textContent = msg; status.className = 'status error'; },
      });
      setListening(true);
    } catch (err) {
      status.textContent = `Couldn’t start listening: ${err.message}`;
    }
  });

  const find = async () => {
    const text = said.value.trim();
    if (!text) return;
    findBtn.disabled = true;
    status.className = 'status'; status.textContent = 'Working out what you ate…';
    const res = await understand(text, await db.allProducts());
    findBtn.disabled = false;
    items = res.items;
    status.className = res.aiError ? 'status error' : 'status';
    status.textContent = res.aiError ? `Gemini didn’t answer (${res.aiError}), so a simple reading was used. Check the list.` : '';
    drawItems();
  };
  findBtn.addEventListener('click', () => { stopListening(); find(); });

  const pickOf = (it) => (it.pick >= 0 ? it.choices[it.pick] : null);
  const amountOf = (it) => {
    const p = pickOf(it);
    if (!p) return null;
    const f = it.grams / 100;
    return { kcal: p.per100.kcal * f, protein: p.per100.protein * f, carbs: p.per100.carbs * f, fat: p.per100.fat * f };
  };
  const label = (p) => `${p.estimate ? '✨ ' : ''}${p.name}${p.brand && !p.estimate ? ` · ${p.brand}` : ''} (${fmt(p.per100.kcal, 'kcal')} kcal/100 g)`;

  const drawItems = () => {
    if (!items.length) { out.innerHTML = '<p class="empty">No foods found in that. Try again with amounts, e.g. “150 g Skyr”.</p>'; return; }
    const ok = items.filter(pickOf);
    const t = ok.map(amountOf).reduce((a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    out.innerHTML = `
      <h2 class="section-title">Check and add</h2>
      <ul class="voice-list">${items.map((it, i) => {
        const p = pickOf(it);
        const a = amountOf(it);
        return `<li ${p ? tintAttrs(p.per100, 'voice-item') : 'class="voice-item"'}>
          <div class="voice-said muted small">“${esc(it.said)}”</div>
          <div class="voice-row">
            <select data-pick="${i}" aria-label="Food for ${esc(it.said)}">
              ${it.choices.map((c, j) => `<option value="${j}"${j === it.pick ? ' selected' : ''}>${esc(label(c))}</option>`).join('')}
              <option value="-1"${it.pick < 0 ? ' selected' : ''}>${it.choices.length ? 'Leave out' : 'Not found, left out'}</option>
            </select>
            <label class="voice-g"><input type="number" inputmode="decimal" min="0" step="any" value="${fmt(it.grams)}" data-g="${i}" aria-label="Grams"> g</label>
          </div>
          <div class="small ${a ? '' : 'muted'}">${a ? `${fmt(a.kcal, 'kcal')} kcal · P ${fmt(a.protein)} · C ${fmt(a.carbs)} · F ${fmt(a.fat)}${p.estimate ? ' · estimated' : ''}` : 'Find it under Add food instead.'}</div>
        </li>`;
      }).join('')}</ul>
      <p class="voice-total"><strong>${fmt(t.kcal, 'kcal')} kcal</strong> · P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}</p>
      <button class="btn primary big with-ic" id="btn-add-all"${ok.length ? '' : ' disabled'}>${icon('plus')} Add ${ok.length} food${ok.length === 1 ? '' : 's'} to ${esc(meal.name)}</button>
      <p class="muted small">✨ = Gemini’s estimate, because nothing in your foods or the basic foods matched. It’s saved to your foods so you can fix the values later.</p>`;

    $$('[data-pick]', out).forEach((s) => s.addEventListener('change', () => { items[+s.dataset.pick].pick = +s.value; drawItems(); }));
    $$('[data-g]', out).forEach((inp) => inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.replace(',', '.'));
      items[+inp.dataset.g].grams = v > 0 ? v : items[+inp.dataset.g].grams;
      drawItems();
    }));
    $('#btn-add-all', out).addEventListener('click', addAll);
  };

  const addAll = async () => {
    const btn = $('#btn-add-all', out);
    btn.disabled = true;
    let n = 0;
    for (const it of items) {
      let p = pickOf(it);
      if (!p) continue;
      if (p.estimate) {
        p = {
          code: `custom-ai-${Date.now().toString(36)}${n}`, name: p.name, brand: '', imageUrl: null, quantity: null,
          per100: { ...p.per100, sugars: null, fiber: null, saturatedFat: null, salt: null },
          unit: 'g', source: 'ai', fetchedAt: new Date().toISOString(),
        };
        await db.putProduct(p);
      } else if (!(await db.getProduct(p.code))) {
        await db.putProduct(p);   // first use of a basic food: keep it under Your foods
      }
      await db.addEntry({
        date, meal: meal.id, code: p.code, name: p.name, brand: p.brand || '',
        unit: p.unit || 'g', grams: it.grams, per100: { ...p.per100 },
      });
      n++;
    }
    toast(`Added ${n} food${n === 1 ? '' : 's'} to ${meal.name}`);
    backTo(nav.diaryDepth, `#/day/${date}`);
  };
}
