// Colours: pick the app's highlight and secondary colours, the macro colours,
// and the colour a value turns when its goal is reached. Changes preview live.

import { $, $$, esc, toast, macroTiles, kcalHeader } from '../ui.js';
import { tintAttrs } from '../nutrition.js';
import { icon } from '../icons.js';
import { DEFAULTS, getTheme, saveTheme, applyTheme, DEFAULT_TINT } from '../theme.js';

const GROUPS = [
  { title: 'App', rows: [
    { key: 'accent', label: 'Highlight', hint: 'Header, buttons, active tab',
      presets: ['#ab2200', '#dc2626', '#ea580c', '#0f766e', '#2563eb', '#7c3aed', '#db2777'] },
    { key: 'secondary', label: 'Secondary', hint: 'Small text and kcal',
      presets: ['#5b5b5b', '#6b7280', '#57534e', '#475569', '#3f6212', '#1e3a8a'] },
  ] },
  { title: 'Goal reached', rows: [
    { key: 'goal', label: 'Highlight when reached', hint: 'Background of a macro once you hit its goal',
      presets: ['#22c55e', '#10b981', '#14b8a6', '#0ea5e9', '#eab308', '#f97316', '#ec4899'] },
  ] },
  { title: 'Macros', rows: [
    { key: 'protein', label: 'Protein', presets: ['#1d4ed8', '#0891b2', '#dc2626', '#16a34a', '#9333ea'] },
    { key: 'carbs', label: 'Carbs', presets: ['#a16207', '#ea580c', '#ca8a04', '#16a34a', '#0891b2'] },
    { key: 'fat', label: 'Fat', presets: ['#7e22ce', '#db2777', '#e11d48', '#0d9488', '#64748b'] },
  ] },
];

export async function renderColours(el) {
  const saved = await getTheme();
  let theme = { ...DEFAULTS, tint: DEFAULT_TINT, ...saved };
  let done = false;

  const preview = () => `
    ${kcalHeader(1640, 2200)}
    ${macroTiles({ protein: 152, carbs: 160, fat: 58 }, { goals: { protein: 150, carbs: 250, fat: 70 }, keys: ['protein', 'carbs', 'fat'] })}
    <div class="preview-actions"><span class="btn primary">Button</span><span class="chip active">Selected</span><span class="muted small">Secondary text</span></div>`;

  el.innerHTML = `
    <p class="hint">Pick your colours. You see the change straight away. Tap Save to keep it.</p>
    <section class="card summary colour-preview" aria-label="Preview">${preview()}</section>
    ${GROUPS.map((g) => `
      <section class="card">
        <h2 class="card-title">${esc(g.title)}</h2>
        ${g.rows.map((r) => `
          <div class="colour-row" data-key="${r.key}">
            <div class="colour-head">
              <label class="colour-pick">
                <input type="color" value="${theme[r.key]}" data-color="${r.key}" aria-label="${esc(r.label)} colour">
                <span><strong>${esc(r.label)}</strong>${r.hint ? `<span class="muted small">${esc(r.hint)}</span>` : ''}</span>
              </label>
              <button type="button" class="btn icon ghost reset" data-reset="${r.key}" aria-label="Back to default">${icon('rotate-ccw')}</button>
            </div>
            <div class="swatches">
              ${r.presets.map((c) => `<button type="button" class="swatch" style="--sw:${c}" data-preset="${c}" aria-label="Use ${c}"></button>`).join('')}
            </div>
          </div>`).join('')}
      </section>`).join('')}
    <section class="card">
      <h2 class="card-title">Macro line</h2>
      <p class="hint">Each food gets a line along its bottom edge in the macro colours, split by how many of its calories come from protein, carbs and fat. Half fat, half protein shows half and half.</p>
      <div class="chips tint-chips" role="radiogroup" aria-label="Macro line">${[['off', 'Off'], ['light', 'Thin'], ['medium', 'Medium'], ['strong', 'Thick']].map(([v, l]) => `<button type="button" class="chip" role="radio" data-tint="${v}">${l}</button>`).join('')}</div>
      <ul class="entries tint-preview">
        <li><a ${tintAttrs({ protein: 23, carbs: 0, fat: 1.5 })}><span class="info"><strong>Hähnchenbrust</strong><span class="muted small">P 23 · C 0 · F 1.5 per 100 g</span></span></a></li>
        <li><a ${tintAttrs({ protein: 13, carbs: 58, fat: 6.5 })}><span class="info"><strong>Haferflocken</strong><span class="muted small">P 13 · C 58 · F 6.5 per 100 g</span></span></a></li>
        <li><a ${tintAttrs({ protein: 25, carbs: 20, fat: 50 })}><span class="info"><strong>Erdnussbutter</strong><span class="muted small">P 25 · C 20 · F 50 per 100 g</span></span></a></li>
        <li><a ${tintAttrs({ protein: 19.7, carbs: 0, fat: 11.3 })}><span class="info"><strong>Puten-Hackfleisch</strong><span class="muted small">P 19.7 · C 0 · F 11.3 per 100 g</span></span></a></li>
      </ul>
    </section>
    <button class="btn primary wide" id="btn-colours-save">Save colours</button>
    <button class="btn wide with-ic" id="btn-colours-reset">${icon('rotate-ccw')} Reset all to default</button>
  `;

  const sync = () => {
    $$('[data-color]', el).forEach((i) => { i.value = theme[i.dataset.color]; });
    $$('.colour-row', el).forEach((row) => {
      const k = row.dataset.key;
      $$('.swatch', row).forEach((s) => s.classList.toggle('on', s.dataset.preset.toLowerCase() === theme[k].toLowerCase()));
    });
    $$('[data-tint]', el).forEach((b) => { const on = b.dataset.tint === theme.tint; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); });
    applyTheme(theme);
  };
  const set = (k, v) => { theme = { ...theme, [k]: v.toLowerCase() }; sync(); };

  $$('[data-color]', el).forEach((i) => i.addEventListener('input', () => set(i.dataset.color, i.value)));
  $$('.colour-row', el).forEach((row) => {
    $$('[data-preset]', row).forEach((b) => b.addEventListener('click', () => set(row.dataset.key, b.dataset.preset)));
    $('[data-reset]', row).addEventListener('click', () => set(row.dataset.key, DEFAULTS[row.dataset.key]));
  });
  $$('[data-tint]', el).forEach((b) => b.addEventListener('click', () => { theme = { ...theme, tint: b.dataset.tint }; sync(); }));
  $('#btn-colours-reset', el).addEventListener('click', () => { theme = { ...DEFAULTS, tint: DEFAULT_TINT }; sync(); });
  $('#btn-colours-save', el).addEventListener('click', async () => {
    await saveTheme(theme);
    done = true;
    toast('Colours saved');
    history.length > 1 ? history.back() : (location.hash = '#/more');
  });

  // Leaving without saving puts the saved colours back.
  const onLeave = () => { if (!done) applyTheme(saved); };
  window.addEventListener('hashchange', onLeave, { once: true });
  sync();
}
