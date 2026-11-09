// Hevy: the connect card under More, and the per-day workout card in the diary.

import * as hevy from '../hevy.js';
import { $, esc, toast } from '../ui.js';
import { icon } from '../icons.js';
import { getBody } from '../db.js';

const KEY_URL = 'https://hevy.com/settings?developer';

const ago = (iso) => {
  if (!iso) return 'not yet';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString();
};
const kg = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} t` : `${n} kg`);
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

// ---------- More: connect card ----------
export function renderHevyCard(card) {
  const cfg = hevy.config();
  if (!cfg) {
    card.innerHTML = `
      <h2 class="card-title with-ic">${icon('dumbbell')} Hevy workouts</h2>
      <p>Show your Hevy workouts in the diary, next to what you ate. Needs Hevy Pro.</p>
      <ol class="steps">
        <li><a href="${KEY_URL}" target="_blank" rel="noopener">Open Hevy’s developer settings</a> and sign in.</li>
        <li>Tap <strong>Generate API key</strong> (or copy the one shown).</li>
        <li>Paste it here:</li>
      </ol>
      <form id="form-hevy" class="manual-code" autocomplete="off">
        <input id="hevy-key" type="password" placeholder="API key" aria-label="Hevy API key" autocapitalize="off" spellcheck="false">
        <button class="btn primary" type="submit">Connect</button>
      </form>
      <p class="status error" id="hevy-error"></p>
      <p class="muted small">The app only reads your workouts. The key stays on this phone.</p>`;
    $('#form-hevy', card).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Importing…';
      try {
        const n = await hevy.connect($('#hevy-key', card).value);
        toast(`Connected to Hevy. ${n} workout${n === 1 ? '' : 's'} imported.`);
        renderHevyCard(card);
      } catch (err) {
        $('#hevy-error', card).textContent = err.message;
        btn.disabled = false; btn.textContent = 'Connect';
      }
    });
    return;
  }
  const state = cfg.error
    ? `${icon('triangle-alert', { cls: 'warn' })} Last sync failed: ${esc(cfg.error)}`
    : `${icon('circle-check', { cls: 'ok' })} Synced ${esc(ago(cfg.lastSync))}`;
  card.innerHTML = `
    <h2 class="card-title with-ic">${icon('dumbbell')} Hevy workouts</h2>
    <p class="with-ic">${state}</p>
    <p class="muted small">Your workouts show up in the diary on the day you did them. New ones come in when you open the app.</p>
    <div class="actions">
      <button class="btn" id="btn-hevy-sync">Sync now</button>
      <button class="btn ghost danger" id="btn-hevy-off">Disconnect</button>
    </div>`;
  $('#btn-hevy-sync', card).addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Syncing…';
    try { const n = await hevy.syncNow(); toast(n ? `${n} workout change${n === 1 ? '' : 's'} from Hevy` : 'Up to date'); } catch (err) { toast(err.message); }
    renderHevyCard(card);
  });
  $('#btn-hevy-off', card).addEventListener('click', async () => {
    if (!confirm('Disconnect Hevy on this phone? Workouts already imported stay in your diary.')) return;
    await hevy.disconnect();
    renderHevyCard(card);
  });
}

// ---------- Diary: the day's workouts ----------
export async function workoutsCard(date) {
  if (!hevy.isConnected()) return '';
  const list = await hevy.workoutsOn(date);
  if (!list.length) return '';
  const body = await getBody();
  return list.map((w) => ({ w, est: hevy.estimateKcal(w, body) })).map(({ w, est }) => `
    <section class="card workout">
      <details>
        <summary class="meal-head">
          <div class="meal-title">
            <h2 class="with-ic">${icon('dumbbell')} ${esc(w.title)}</h2>
            <p class="muted small">${[
              w.start ? new Date(w.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
              w.minutes ? mins(w.minutes) : '',
              `${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'}`,
              w.volume ? kg(w.volume) : '',
            ].filter(Boolean).join(' · ')}</p>
          </div>
          ${est?.kcal ? `<span class="workout-burn" aria-label="about ${est.kcal} kcal burned">${icon('flame')}<strong>≈ ${est.kcal}</strong><span class="muted">kcal</span></span>` : ''}
          <span class="chev">${icon('chevron-down')}</span>
        </summary>
        <ul class="workout-ex">${w.exercises.map((ex) => `
          <li><span>${esc(ex.title)}</span><span class="muted small">${[
            `${ex.sets} set${ex.sets === 1 ? '' : 's'}`,
            ex.best ? `best ${esc(ex.best)}` : ex.reps ? `${ex.reps} reps` : '',
            ex.duration ? mins(Math.round(ex.duration / 60)) : '',
            ex.distance ? `${(ex.distance / 1000).toFixed(1).replace('.', ',')} km` : '',
          ].filter(Boolean).join(' · ')}</span></li>`).join('')}
        </ul>
        ${est?.kcal ? `<p class="muted small workout-burn-note">≈ ${est.kcal} kcal burned is an estimate on top of what your body burns at rest${
          est.met ? `, counting the lifting as ${est.met === 6 ? 'vigorous' : est.met === 5 ? 'moderate' : 'light'} strength training` : ''
        }${est.cardioKcal ? ` plus ${est.cardioKcal} kcal of cardio` : ''}. ${
          est.assumedWeight ? `It assumes you weigh ${hevy.DEFAULT_WEIGHT} kg: <a href="#/goals">add your weight</a> for a better number.` : `Based on your weight of ${String(est.weight).replace('.', ',')} kg.`
        } Hevy doesn’t track calories.</p>` : ''}
      </details>
    </section>`).join('');
}
