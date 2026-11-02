import { Scanner } from './scanner.js';
import { fetchProduct } from './off.js';
import * as db from './db.js';
import { MACROS, MAIN_KEYS, hasMacros, scale, fmt, isValidGtin, isGermanCode, productFromForm } from './nutrition.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const views = { scan: $('#view-scan'), product: $('#view-product'), edit: $('#view-edit') };
const status = $('#scan-status');
let scanner;

// ---------- Routing (hash based, so Android's back button works) ----------
// #/            scan view
// #/p/<code>    product
// #/edit/<code> manual entry

function go(hash) { location.hash = hash; }

async function route() {
  const [, view = '', code = ''] = location.hash.split('/');
  stopCamera();
  if (view === 'p' && code) return showProduct(code);
  if (view === 'edit' && code) return showEdit(code);
  show('scan');
  renderHistory();
  if (scanAfterRoute) { scanAfterRoute = false; startCamera(); }
}
let scanAfterRoute = false;

function show(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-back]').forEach((b) =>
  b.addEventListener('click', () => (history.length > 1 ? history.back() : go('#/'))));

// ---------- Scanning ----------

function setStatus(msg, kind = '') {
  status.textContent = msg;
  status.className = `status ${kind}`;
}

async function startCamera() {
  setStatus('Starting camera…');
  scanner = new Scanner($('#video'), {
    onDetected: (code) => { cameraUi(false); lookup(code); },
    onError: (err) => { cameraUi(false); setStatus(`Scanner error: ${err.message}`, 'error'); },
  });
  try {
    await scanner.start();
    cameraUi(true);
    $('#btn-torch').hidden = !scanner.torchSupported;
    setStatus('Looking for a barcode…');
  } catch (err) {
    cameraUi(false);
    const denied = err.name === 'NotAllowedError';
    setStatus(denied
      ? 'Camera access was blocked. Allow it in the browser’s site settings, or type the number below.'
      : `Could not start the camera: ${err.message}`, 'error');
  }
}

function stopCamera() {
  scanner?.stop();
  cameraUi(false);
}

function cameraUi(on) {
  $('#camera').classList.toggle('live', on);
  $('#camera-idle').hidden = on;
  $('#camera-controls').hidden = !on;
}

let torchOn = false;
$('#btn-start').addEventListener('click', startCamera);
$('#btn-stop').addEventListener('click', () => { stopCamera(); setStatus(''); });
$('#btn-torch').addEventListener('click', async () => {
  torchOn = !torchOn;
  try { await scanner.setTorch(torchOn); } catch { /* not supported */ }
});

$('#form-code').addEventListener('submit', (e) => {
  e.preventDefault();
  let code = $('#input-code').value.replace(/\D/g, '');
  if (code.length === 12) code = `0${code}`;
  if (!isValidGtin(code)) return setStatus('That doesn’t look like a valid barcode (8 or 13 digits). Check the number.', 'error');
  $('#input-code').value = '';
  lookup(code);
});

// ---------- Lookup ----------

async function lookup(code, { refresh = false } = {}) {
  setStatus(`Looking up ${code}…`);
  await db.addScan(code);
  let product = refresh ? null : await db.getProduct(code);
  if (!product) {
    try {
      product = await fetchProduct(code);
    } catch (err) {
      const offline = !navigator.onLine || err instanceof TypeError;
      setStatus(offline ? 'No internet connection. You can enter the values by hand instead.' : err.message, 'error');
      return go(`#/edit/${code}?offline`);
    }
    if (!product) {
      setStatus('');
      return go(`#/edit/${code}?notfound`);
    }
    await db.putProduct(product);
  }
  setStatus('');
  if (location.hash === `#/p/${code}`) showProduct(code); else go(`#/p/${code}`);
}

// ---------- Product view ----------

function portionOptions(p) {
  const opts = [{ label: `100 ${p.unit}`, grams: 100 }];
  if (p.servingGrams) opts.push({ label: `1 serving (${fmt(p.servingGrams)} ${p.unit})`, grams: p.servingGrams });
  const m = /([\d.,]+)\s*(kg|g|l|ml|cl)\b/i.exec(p.quantity || '');
  if (m) {
    const mult = { kg: 1000, g: 1, l: 1000, ml: 1, cl: 10 }[m[2].toLowerCase()];
    const grams = Number(m[1].replace(',', '.')) * mult;
    if (grams && grams !== 100) opts.push({ label: `Whole pack (${fmt(grams)} ${p.unit})`, grams });
  }
  return opts;
}

async function showProduct(code) {
  const p = await db.getProduct(code);
  if (!p) return lookup(code);
  show('product');
  const el = $('#product');
  const opts = portionOptions(p);
  const complete = hasMacros(p);

  el.innerHTML = `
    <div class="product-head">
      ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" class="product-img">` : '<div class="product-img placeholder">🥫</div>'}
      <div>
        <h2>${esc(p.name)}</h2>
        <p class="muted">${esc([p.brand, p.quantity].filter(Boolean).join(' · '))}</p>
        <p class="muted small">${esc(code)} ${isGermanCode(code) ? '<span class="badge">🇩🇪 DE</span>' : ''}
          ${p.source === 'manual' ? '<span class="badge">entered by you</span>' : ''}</p>
      </div>
    </div>
    ${complete ? '' : `<div class="notice">Open Food Facts is missing some macros for this product.
        <button class="btn primary" id="btn-fill">Enter them from the label</button></div>`}
    <div class="portion">
      <div class="chips">${opts.map((o, i) => `<button class="chip${i === 0 ? ' active' : ''}" data-g="${o.grams}">${esc(o.label)}</button>`).join('')}</div>
      <label class="amount">Amount <input id="grams" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" value="100"> ${p.unit}</label>
    </div>
    <div class="tiles" id="tiles"></div>
    <table class="nutr"><thead><tr><th></th><th>per 100 ${p.unit}</th><th id="th-portion">per 100 ${p.unit}</th></tr></thead><tbody id="nutr-body"></tbody></table>
    <div class="actions">
      <button class="btn" id="btn-edit">Edit values</button>
      ${p.source === 'off' ? '<button class="btn" id="btn-refresh">Refresh data</button>' : ''}
      <button class="btn primary" id="btn-scan-again">Scan another</button>
    </div>
    ${p.source === 'off' ? `<p class="muted small">Values from <a href="https://world.openfoodfacts.org/product/${esc(code)}" target="_blank" rel="noopener">Open Food Facts</a>. Always double check against the pack.</p>` : ''}
  `;

  const gramsInput = $('#grams');
  const render = () => {
    const g = Number(String(gramsInput.value).replace(',', '.')) || 0;
    const v = scale(p.per100, g);
    $('#tiles').innerHTML = MAIN_KEYS.map((k) => {
      const m = MACROS.find((x) => x.key === k);
      return `<div class="tile tile-${k}"><span class="val">${fmt(v[k], k)}</span><span class="unit">${m.unit}</span><span class="lbl">${m.label}</span></div>`;
    }).join('');
    $('#th-portion').textContent = `per ${fmt(g)} ${p.unit}`;
    $('#nutr-body').innerHTML = MACROS.map((m) => `<tr class="${m.main ? '' : 'sub'}"><td>${m.label}</td>
      <td>${fmt(p.per100[m.key], m.key)}${Number.isFinite(p.per100[m.key]) ? ' ' + m.unit : ''}</td>
      <td>${fmt(v[m.key], m.key)}${Number.isFinite(v[m.key]) ? ' ' + m.unit : ''}</td></tr>`).join('');
  };
  el.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    el.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
    gramsInput.value = Math.round(Number(c.dataset.g) * 10) / 10;
    render();
  }));
  gramsInput.addEventListener('input', () => {
    el.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', Number(x.dataset.g) === Number(gramsInput.value)));
    render();
  });
  render();

  $('#btn-fill')?.addEventListener('click', () => go(`#/edit/${code}`));
  $('#btn-edit').addEventListener('click', () => go(`#/edit/${code}`));
  $('#btn-refresh')?.addEventListener('click', () => lookup(code, { refresh: true }));
  $('#btn-scan-again').addEventListener('click', () => { scanAfterRoute = true; go('#/'); });
}

// ---------- Manual entry ----------

async function showEdit(rawCode) {
  const [code, reason] = rawCode.split('?');
  show('edit');
  const form = $('#form-edit');
  form.reset();
  const existing = await db.getProduct(code);
  form.code.value = code;
  if (existing) {
    form.name.value = existing.name === 'Unnamed product' ? '' : existing.name;
    form.brand.value = existing.brand || '';
    for (const { key } of MACROS) {
      const v = existing.per100?.[key];
      form[key].value = Number.isFinite(v) ? Math.round(v * 10) / 10 : '';
    }
    form.servingGrams.value = existing.servingGrams ?? '';
  }
  $('#edit-reason').textContent = {
    notfound: 'This barcode isn’t in Open Food Facts yet. Copy the values from the nutrition table on the pack and they’ll be remembered on this phone.',
    offline: 'Couldn’t reach Open Food Facts. Enter the values from the pack, or go back and try again later.',
  }[reason] || (existing && !hasMacros(existing)
    ? 'Some values are missing. Fill them in from the nutrition table on the pack.'
    : 'Correct or complete the values from the nutrition table on the pack.');
}

$('#form-edit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const existing = await db.getProduct(data.code);
  const product = productFromForm(data);
  if (existing) {
    product.imageUrl = existing.imageUrl;
    product.quantity = existing.quantity;
    product.unit = existing.unit;
    product.servingLabel = existing.servingLabel;
  }
  await db.putProduct(product);
  history.replaceState(null, '', `#/p/${data.code}`);
  showProduct(data.code);
});

// ---------- History ----------

async function renderHistory() {
  const items = await db.recentScans();
  $('#history-empty').hidden = items.length > 0;
  $('#history').innerHTML = items.map(({ code, product: p }) => {
    const macros = p && hasMacros(p)
      ? `${fmt(p.per100.kcal, 'kcal')} kcal · P ${fmt(p.per100.protein)} · C ${fmt(p.per100.carbs)} · F ${fmt(p.per100.fat)} <span class="muted">/100 ${p.unit}</span>`
      : '<span class="muted">no macros yet</span>';
    return `<li><a href="#/p/${esc(code)}">
      ${p?.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : '<span class="thumb">🥫</span>'}
      <span class="info"><strong>${esc(p?.name || code)}</strong><span class="small">${macros}</span></span></a></li>`;
  }).join('');
}

// ---------- Boot ----------

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
