// Adding food: scan / search / recent → product → amount → added to a meal.
// Also manual entry of nutrition values, and editing a diary entry.

import { Scanner } from '../scanner.js';
import { fetchProduct } from '../off.js';
import * as db from '../db.js';
import { today, isValidKey, dayLabel } from '../dates.js';
import {
  MACROS, hasMacros, scale, fmt, isValidGtin, isGermanCode, productFromForm, entryMacros,
} from '../nutrition.js';
import { $, $$, esc, go, backTo, nav, macroTiles, parseNum, toast } from '../ui.js';
import { icon } from '../icons.js';
import { searchGeneric, isGeneric, genericProduct } from '../generic.js';

let scanner;
export function stopCamera() { scanner?.stop(); scanner = null; }

function defaultMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snacks';
}

/** Read and validate the date + meal the food should go into. */
async function target(query) {
  const date = isValidKey(query.d) ? query.d : today();
  const meals = await db.mealsForDate(date);
  const meal = meals.find((m) => m.id === query.m) || meals.find((m) => m.id === defaultMeal()) || meals[0];
  return { date, meal, qs: `d=${date}&m=${encodeURIComponent(meal.id)}` };
}

function whenLabel(date) {
  const l = dayLabel(date);
  return l === 'Today' ? 'today' : l === 'Yesterday' ? 'yesterday' : l === 'Tomorrow' ? 'tomorrow' : l;
}

// ---------- Add food (scan / search / recent) ----------

export async function renderAdd(el, date, mealId) {
  const t = await target({ d: date, m: mealId });
  el.innerHTML = `
    <p class="context">Adding to <strong>${esc(t.meal.name)}</strong>, ${esc(whenLabel(t.date))}</p>
    <div class="camera" id="camera">
      <video id="video" playsinline muted></video>
      <div class="reticle" aria-hidden="true"></div>
      <div class="camera-idle" id="camera-idle">
        <button class="btn primary big with-ic" id="btn-start">${icon('scan-barcode')} Scan a barcode</button>
        <p class="hint">Point the camera at the barcode on the pack.</p>
      </div>
      <div class="camera-controls" id="camera-controls" hidden>
        <button class="btn round" id="btn-torch" hidden title="Flashlight" aria-label="Flashlight">${icon('flashlight')}</button>
        <button class="btn round" id="btn-stop" title="Stop camera" aria-label="Stop camera">${icon('x')}</button>
      </div>
    </div>
    <p class="status" id="scan-status" role="status"></p>

    <form class="manual-code" id="form-code" autocomplete="off">
      <input id="input-code" inputmode="numeric" placeholder="…or type the barcode number" aria-label="Barcode number">
      <button class="btn" type="submit">Look up</button>
    </form>

    <div class="row-between">
      <h2 class="section-title">Your foods</h2>
      <button class="btn small with-ic" id="btn-custom">${icon('plus')} Food without barcode</button>
    </div>
    <label class="searchbox">${icon('search')}<input id="search" type="search" placeholder="Search your foods, or fruit, veg &amp; basics" aria-label="Search foods"></label>
    <p class="hint small" id="basics-hint">No barcode? Type e.g. <em>Apfel</em>, <em>Banane</em>, <em>Reis</em> or <em>Hähnchenbrust</em> to get typical macros.</p>
    <ul class="history" id="foods"></ul>
    <p class="empty" id="foods-empty" hidden>Nothing here yet. Scan something to get started.</p>
    <div id="basics" hidden>
      <h2 class="section-title with-ic">${icon('apple')} Basic foods (no barcode)</h2>
      <ul class="history" id="basics-list"></ul>
    </div>
  `;

  const status = $('#scan-status', el);
  const setStatus = (msg, kind = '') => { status.textContent = msg; status.className = `status ${kind}`; };
  const cameraUi = (on) => {
    $('#camera', el).classList.toggle('live', on);
    $('#camera-idle', el).hidden = on;
    $('#camera-controls', el).hidden = !on;
  };

  const lookupAndOpen = async (code) => {
    const res = await lookup(code, setStatus);
    if (res === 'found') go(`#/p/${code}?${t.qs}`);
    else if (res) go(`#/edit/${code}?${t.qs}&why=${res}`);
  };

  const start = async () => {
    setStatus('Starting camera…');
    stopCamera();
    scanner = new Scanner($('#video', el), {
      onDetected: (code) => { cameraUi(false); lookupAndOpen(code); },
      onError: (err) => { cameraUi(false); setStatus(`Scanner error: ${err.message}`, 'error'); },
    });
    try {
      await scanner.start();
      cameraUi(true);
      $('#btn-torch', el).hidden = !scanner.torchSupported;
      setStatus('Looking for a barcode…');
    } catch (err) {
      cameraUi(false);
      setStatus(err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in Chrome’s site settings, or type the number below.'
        : `Could not start the camera: ${err.message}`, 'error');
    }
  };

  let torchOn = false;
  $('#btn-start', el).addEventListener('click', start);
  $('#btn-stop', el).addEventListener('click', () => { stopCamera(); cameraUi(false); setStatus(''); });
  $('#btn-torch', el).addEventListener('click', async () => {
    torchOn = !torchOn;
    try { await scanner?.setTorch(torchOn); } catch { /* not supported */ }
  });
  $('#form-code', el).addEventListener('submit', (e) => {
    e.preventDefault();
    let code = $('#input-code', el).value.replace(/\D/g, '');
    if (code.length === 12) code = `0${code}`;
    if (!isValidGtin(code)) return setStatus('That doesn’t look like a valid barcode (8 or 13 digits). Check the number.', 'error');
    lookupAndOpen(code);
  });
  $('#btn-custom', el).addEventListener('click', () => go(`#/edit/new?${t.qs}`));

  // Your foods: recent first, filtered by search
  const foods = await db.recentProducts(200);
  const renderFoods = () => {
    const q = $('#search', el).value.trim().toLowerCase();
    const list = (q ? foods.filter((p) => `${p.name} ${p.brand}`.toLowerCase().includes(q)) : foods).slice(0, 40);
    const basics = q ? searchGeneric(q, 25).filter((g) => !list.some((p) => p.code === g.code)) : [];
    $('#foods-empty', el).hidden = list.length > 0 || basics.length > 0;
    $('#basics-hint', el).hidden = !!q;
    $('#basics', el).hidden = !basics.length;
    $('#basics-list', el).innerHTML = basics.map((g) => `<li><a href="#/p/${esc(g.code)}?${t.qs}">
      <span class="thumb">${icon('apple')}</span>
      <span class="info"><strong>${esc(g.name)}</strong><span class="small muted">${fmt(g.per100.kcal, 'kcal')} kcal /100 g · P ${fmt(g.per100.protein)} · C ${fmt(g.per100.carbs)} · F ${fmt(g.per100.fat)}</span></span></a></li>`).join('');
    $('#foods', el).innerHTML = list.map((p) => `<li><a href="#/p/${esc(p.code)}?${t.qs}">
      ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : `<span class="thumb">${icon('utensils')}</span>`}
      <span class="info"><strong>${esc(p.name)}</strong><span class="small muted">${hasMacros(p)
        ? `${fmt(p.per100.kcal, 'kcal')} kcal /100 ${esc(p.unit)}${p.brand ? ' · ' + esc(p.brand) : ''}`
        : 'no macros yet'}</span></span></a></li>`).join('');
  };
  $('#search', el).addEventListener('input', renderFoods);
  renderFoods();
}

/** Returns 'found', 'notfound', 'offline', or null on another error (shown in status). */
async function lookup(code, setStatus, { refresh = false } = {}) {
  setStatus(`Looking up ${code}…`);
  await db.addScan(code);
  if (!refresh && (await db.getProduct(code))) { setStatus(''); return 'found'; }
  try {
    const product = await fetchProduct(code);
    setStatus('');
    if (!product) return 'notfound';
    await db.putProduct(product);
    return 'found';
  } catch (err) {
    if (!navigator.onLine || err instanceof TypeError) { setStatus(''); return 'offline'; }
    setStatus(err.message, 'error');
    return null;
  }
}

// ---------- Product + amount ----------

function portionOptions(p) {
  const opts = [{ label: `100 ${p.unit}`, grams: 100 }];
  if (p.servingGrams) opts.push({ label: `${p.servingLabel || '1 serving'} (${fmt(p.servingGrams)} ${p.unit})`, grams: p.servingGrams });
  const m = /([\d.,]+)\s*(kg|g|l|ml|cl)\b/i.exec(p.quantity || '');
  if (m) {
    const mult = { kg: 1000, g: 1, l: 1000, ml: 1, cl: 10 }[m[2].toLowerCase()];
    const grams = Number(m[1].replace(',', '.')) * mult;
    if (grams && grams !== 100) opts.push({ label: `Whole pack (${fmt(grams)} ${p.unit})`, grams });
  }
  return opts;
}

export async function renderProduct(el, code, query) {
  let p = await db.getProduct(code);
  if (!p && isGeneric(code)) {
    // First use of a basic food: keep a copy so it shows up under "Your foods" from now on.
    p = genericProduct(code);
    if (p) { await db.putProduct(p); await db.addScan(code); }
  }
  const t = await target(query);
  if (!p) {
    el.innerHTML = '<p class="status">Looking up…</p>';
    const res = await lookup(code, (m) => { el.innerHTML = `<p class="status">${esc(m)}</p>`; });
    if (res === 'found') return renderProduct(el, code, query);
    if (res) return go(`#/edit/${code}?${t.qs}&why=${res}`, { replace: true });
    return;
  }
  const opts = portionOptions(p);
  const complete = hasMacros(p);
  const isCustom = code.startsWith('custom-') || isGeneric(code);
  const start = p.servingGrams || 100;

  el.innerHTML = `
    <div class="product-head">
      ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" class="product-img">` : `<div class="product-img placeholder">${icon('package')}</div>`}
      <div>
        <h2>${esc(p.name)}</h2>
        <p class="muted">${esc([p.brand, p.quantity].filter(Boolean).join(' · '))}</p>
        <p class="muted small">${isCustom ? '' : esc(code)} ${isGermanCode(code) ? '<span class="badge">DE</span>' : ''}
          ${p.source === 'manual' ? '<span class="badge">entered by you</span>' : ''}${p.source === 'generic' ? '<span class="badge">basic food</span>' : ''}</p>
      </div>
    </div>
    ${complete ? '' : `<div class="notice">Some macros are missing for this product.
        <button class="btn primary" id="btn-fill">Enter them from the label</button></div>`}
    <div class="portion">
      <div class="chips">${opts.map((o) => `<button class="chip" data-g="${o.grams}">${esc(o.label)}</button>`).join('')}</div>
      <label class="amount">Amount <input id="grams" type="text" inputmode="decimal" value="${fmt(start)}"> ${esc(p.unit)}</label>
    </div>
    <div id="tiles"></div>
    <button class="btn primary wide" id="btn-log" ${complete ? '' : 'disabled'}>Add to ${esc(t.meal.name)}</button>
    <table class="nutr"><thead><tr><th></th><th>per 100 ${esc(p.unit)}</th><th id="th-portion"></th></tr></thead><tbody id="nutr-body"></tbody></table>
    <div class="actions">
      <button class="btn" id="btn-edit">Edit values</button>
      ${p.source === 'off' ? '<button class="btn" id="btn-refresh">Refresh data</button>' : ''}
    </div>
    ${p.source === 'generic' ? '<p class="muted small">Typical values per 100 g for the fresh or plain food, based on USDA FoodData Central and German label averages. Your exact food can differ a little. Use Edit values to change them.</p>' : ''}
    ${p.source === 'off' ? `<p class="muted small">Values from <a href="https://world.openfoodfacts.org/product/${esc(code)}" target="_blank" rel="noopener">Open Food Facts</a>. Always double check against the pack.</p>` : ''}
  `;

  const gramsInput = $('#grams', el);
  const grams = () => parseNum(gramsInput.value) || 0;
  const render = () => {
    const g = grams();
    const v = scale(p.per100, g);
    $('#tiles', el).innerHTML = macroTiles(v);
    $('#th-portion', el).textContent = `per ${fmt(g)} ${p.unit}`;
    $('#nutr-body', el).innerHTML = MACROS.map((m) => `<tr class="${m.main ? '' : 'sub'}"><td>${m.label}</td>
      <td>${fmt(p.per100[m.key], m.key)}${Number.isFinite(p.per100[m.key]) ? ' ' + m.unit : ''}</td>
      <td>${fmt(v[m.key], m.key)}${Number.isFinite(v[m.key]) ? ' ' + m.unit : ''}</td></tr>`).join('');
    $$('.chip', el).forEach((c) => c.classList.toggle('active', Math.abs(Number(c.dataset.g) - g) < 0.05));
    $('#btn-log', el).disabled = !complete || g <= 0;
  };
  $$('.chip', el).forEach((c) => c.addEventListener('click', () => {
    gramsInput.value = fmt(Number(c.dataset.g));
    render();
  }));
  gramsInput.addEventListener('input', render);
  render();

  $('#btn-log', el).addEventListener('click', async () => {
    await db.addEntry({
      date: t.date, meal: t.meal.id, code, name: p.name, brand: p.brand || '',
      unit: p.unit, grams: grams(), per100: { ...p.per100 },
    });
    toast(`Added to ${t.meal.name}`);
    backTo(nav.diaryDepth, `#/day/${t.date}`);
  });
  $('#btn-fill', el)?.addEventListener('click', () => go(`#/edit/${code}?${t.qs}`));
  $('#btn-edit', el).addEventListener('click', () => go(`#/edit/${code}?${t.qs}`));
  $('#btn-refresh', el)?.addEventListener('click', async () => {
    const res = await lookup(code, (m, kind) => kind === 'error' && toast(m), { refresh: true });
    if (res === 'found') { toast('Updated'); renderProduct(el, code, query); } else if (res) toast('Could not refresh right now.');
  });
}

// ---------- Manual nutrition entry ----------

export async function renderEdit(el, code, query) {
  const isNew = code === 'new';
  const existing = isNew ? null : await db.getProduct(code);
  const t = await target(query);
  const reason = {
    notfound: 'This barcode isn’t in Open Food Facts yet. Copy the values from the nutrition table on the pack. They’ll be remembered on this phone.',
    offline: 'Couldn’t reach Open Food Facts. Enter the values from the pack, or go back and try again later.',
  }[query.why] || (isNew
    ? 'For home-cooked food, fresh produce or anything without a barcode.'
    : existing && !hasMacros(existing)
      ? 'Some values are missing. Fill them in from the nutrition table on the pack.'
      : 'Correct or complete the values from the nutrition table on the pack.');
  const num = (k) => (Number.isFinite(existing?.per100?.[k]) ? fmt(existing.per100[k]) : '');
  const field = (k, label, req) => `<label>${label}<input name="${k}" type="text" inputmode="decimal" ${req ? 'required' : ''} value="${num(k)}"></label>`;

  el.innerHTML = `
    <h2>${isNew ? 'New food' : 'Nutrition values'}</h2>
    <p class="hint">${esc(reason)}</p>
    <form id="form-edit" class="edit-form" autocomplete="off">
      ${isNew ? '' : `<label>Barcode<input name="code" value="${esc(code)}" readonly></label>`}
      <label>Name<input name="name" required placeholder="e.g. Haferflocken" value="${esc(existing && existing.name !== 'Unnamed product' ? existing.name : '')}"></label>
      <label>Brand<input name="brand" placeholder="optional" value="${esc(existing?.brand || '')}"></label>
      <fieldset>
        <legend>Per 100 g / 100 ml (from the label)</legend>
        <div class="grid2">
          ${field('kcal', 'Energy (kcal)', true)}${field('protein', 'Protein (g)', true)}
          ${field('carbs', 'Carbs (g)', true)}${field('fat', 'Fat (g)', true)}
          ${field('sugars', 'of which sugars (g)')}${field('saturatedFat', 'of which saturated (g)')}
          ${field('fiber', 'Fibre (g)')}${field('salt', 'Salt (g)')}
        </div>
      </fieldset>
      <label>Serving size in g (optional)<input name="servingGrams" type="text" inputmode="decimal" value="${existing?.servingGrams ? fmt(existing.servingGrams) : ''}"></label>
      <p class="hint">Tip: German labels list “Brennwert” in kJ and kcal. Use the kcal number.</p>
      <p class="status error" id="edit-error"></p>
      <button class="btn primary" type="submit">Save</button>
    </form>
  `;

  $('#form-edit', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'sugars', 'saturatedFat', 'fiber', 'salt', 'servingGrams']) {
      if (String(data[k] ?? '').trim() !== '' && parseNum(data[k]) == null) {
        $('#edit-error', el).textContent = 'Please use numbers only, like 12,5 or 12.5.';
        return;
      }
    }
    data.code = isNew ? `custom-${Date.now().toString(36)}` : code;
    const product = productFromForm(data);
    if (existing) Object.assign(product, {
      imageUrl: existing.imageUrl, quantity: existing.quantity, unit: existing.unit, servingLabel: existing.servingLabel,
    });
    await db.putProduct(product);
    if (isNew) await db.addScan(product.code); // so it shows up under "Your foods"
    go(`#/p/${product.code}?${t.qs}`, { replace: true });
  });
}

// ---------- Edit a diary entry ----------

export async function renderEntry(el, id) {
  const entry = await db.getEntry(Number(id));
  if (!entry) { el.innerHTML = '<p class="empty">This entry no longer exists.</p>'; return; }
  const meals = await db.mealsForDate(entry.date);

  el.innerHTML = `
    <h2>${esc(entry.name)}</h2>
    <p class="muted">${esc(entry.brand || '')}</p>
    <div class="edit-form">
      <label>Meal
        <select id="meal">${meals.map((m) => `<option value="${esc(m.id)}" ${m.id === entry.meal ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </label>
      <label>Amount (${esc(entry.unit || 'g')})<input id="grams" type="text" inputmode="decimal" value="${fmt(entry.grams)}"></label>
    </div>
    <div id="tiles"></div>
    <div class="actions">
      <button class="btn primary" id="btn-save">Save</button>
      <button class="btn danger with-ic" id="btn-delete">${icon('trash-2')} Remove</button>
    </div>
  `;
  const render = () => { $('#tiles', el).innerHTML = macroTiles(entryMacros({ ...entry, grams: parseNum($('#grams', el).value) || 0 })); };
  $('#grams', el).addEventListener('input', render);
  render();

  const done = () => backTo(nav.diaryDepth, `#/day/${entry.date}`);
  $('#btn-save', el).addEventListener('click', async () => {
    const g = parseNum($('#grams', el).value);
    if (!g || g <= 0) return toast('Enter an amount above 0.');
    await db.putEntry({ ...entry, grams: g, meal: $('#meal', el).value });
    done();
  });
  $('#btn-delete', el).addEventListener('click', async () => {
    await db.deleteEntry(entry.id);
    toast('Removed');
    done();
  });
}
