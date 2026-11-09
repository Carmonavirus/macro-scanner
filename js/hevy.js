// Hevy link: pulls your workouts from the Hevy API (needs Hevy Pro) so they show
// up in the diary. Read-only: nothing is ever sent to Hevy.
//
// The API key lives in localStorage on this phone only (never in backups).
// Workouts are kept as small summaries in settings ('hevyWorkouts': { id: summary }),
// so cloud backup keeps them too.

import * as db from './db.js';
import { toKey } from './dates.js';

const API = 'https://api.hevyapp.com/v1';
const KEY = 'hevy';                    // localStorage: { key, lastSync, error, since }
const STORE = 'hevyWorkouts';          // settings key
const FIRST_SYNC_PAGES = 20;           // 10 per page → up to 200 most recent workouts
const AUTO_SYNC_AFTER_MS = 15 * 60 * 1000;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function save(cfg) {
  try { cfg ? localStorage.setItem(KEY, JSON.stringify(cfg)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('hevystatus'));
}
export const config = () => load();
export const isConnected = () => !!load()?.key;

async function get(path, key) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { headers: { 'api-key': key, accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new Error(navigator.onLine ? 'Couldn’t reach Hevy. Try again in a moment.' : 'No internet connection.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('Hevy didn’t accept the API key. Check it, and that you still have Hevy Pro.');
  if (res.status === 429) throw new Error('Hevy says too many requests. Try again in a minute.');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Hevy answered with HTTP ${res.status}.`);
  return res.json();
}

/** Keep only what the diary shows. */
export function summarise(w) {
  const exercises = (w.exercises || []).map((ex) => {
    const sets = (ex.sets || []).filter((s) => s.type !== 'warmup');
    const volume = sets.reduce((v, s) => v + (s.weight_kg || 0) * (s.reps || 0), 0);
    const best = sets.reduce((b, s) => ((s.weight_kg || 0) > (b?.weight_kg || 0) ? s : b), null);
    const dur = sets.reduce((d, s) => d + (s.duration_seconds || 0), 0);
    const dist = sets.reduce((d, s) => d + (s.distance_meters || 0), 0);
    return {
      title: ex.title || 'Exercise',
      sets: sets.length,
      volume: Math.round(volume),
      best: best && best.weight_kg ? `${String(+best.weight_kg.toFixed(1)).replace(".", ",")} kg × ${best.reps ?? 0}` : null,
      reps: best?.weight_kg ? null : sets.reduce((r, s) => r + (s.reps || 0), 0) || null,
      duration: dur || null,
      distance: dist || null,
    };
  });
  const start = w.start_time, end = w.end_time;
  return {
    id: w.id,
    title: w.title || 'Workout',
    date: toKey(new Date(start)),
    start, end,
    minutes: start && end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000)) : null,
    volume: exercises.reduce((v, e) => v + e.volume, 0),
    sets: exercises.reduce((n, e) => n + e.sets, 0),
    exercises,
    updated: w.updated_at || null,
  };
}

const getStore = () => db.getSetting(STORE, {});

export async function workoutsOn(date) {
  const all = await getStore();
  return Object.values(all).filter((w) => w.date === date).sort((a, b) => (a.start < b.start ? -1 : 1));
}

export async function workoutsBetween(from, to) {
  const all = await getStore();
  return Object.values(all).filter((w) => w.date >= from && w.date <= to);
}

/** Connect with an API key and do the first import. Returns the number of workouts imported. */
export async function connect(rawKey) {
  const key = rawKey.trim();
  if (!key) throw new Error('Paste your API key first.');
  const first = await get('/workouts?page=1&pageSize=10', key);
  if (!first) throw new Error('Hevy didn’t return any workouts.');
  const startedAt = new Date().toISOString();
  const store = {};
  const put = (list) => list.forEach((w) => { store[w.id] = summarise(w); });
  put(first.workouts || []);
  const pages = Math.min(first.page_count || 1, FIRST_SYNC_PAGES);
  for (let p = 2; p <= pages; p++) {
    const r = await get(`/workouts?page=${p}&pageSize=10`, key);
    put(r?.workouts || []);
  }
  await db.setSetting(STORE, { ...(await getStore()), ...store });
  save({ key, since: startedAt, lastSync: startedAt, error: null });
  return Object.keys(store).length;
}

export function disconnect({ keepWorkouts = true } = {}) {
  save(null);
  if (!keepWorkouts) return db.setSetting(STORE, {});
}

let running = null;
/** Fetch what changed in Hevy since the last sync (new, edited and deleted workouts). */
export function syncNow() {
  const cfg = load();
  if (!cfg?.key) return Promise.resolve(0);
  if (running) return running;
  running = (async () => {
    const startedAt = new Date().toISOString();
    try {
      const store = { ...(await getStore()) };
      let changes = 0;
      for (let page = 1, count = 1; page <= count && page <= 50; page++) {
        const r = await get(`/workouts/events?page=${page}&pageSize=10&since=${encodeURIComponent(cfg.since)}`, cfg.key);
        if (!r) break;
        count = r.page_count || 1;
        for (const ev of r.events || []) {
          if (ev.type === 'deleted') { const id = ev.id || ev.workout?.id; if (id && store[id]) { delete store[id]; changes++; } }
          else if (ev.workout) { store[ev.workout.id] = summarise(ev.workout); changes++; }
        }
      }
      if (changes) { await db.setSetting(STORE, store); window.dispatchEvent(new Event('hevyupdated')); }
      save({ ...load(), since: startedAt, lastSync: startedAt, error: null });
      return changes;
    } catch (err) {
      save({ ...load(), error: err.message });
      throw err;
    } finally { running = null; }
  })();
  return running;
}

/** On app open: catch up quietly if it's been a while. */
export function autoSync() {
  const cfg = load();
  if (!cfg?.key) return;
  if (Date.now() - Date.parse(cfg.lastSync || 0) > AUTO_SYNC_AFTER_MS) syncNow().catch(() => {});
}

// ---------- Calories burned (estimate) ----------
// Hevy's API doesn't give calories, so we estimate them the usual way:
//   kcal = (MET − 1) × body weight (kg) × hours
// MET values from the Compendium of Physical Activities (2024). We subtract 1 MET, the
// calories the body burns anyway at rest, so this is the *extra* burn, like the
// "active calories" a watch shows and like the steps estimate (steps.js).
//
// Cardio exercises (matched by name) count with their own MET for their logged time;
// running/walking with a distance use ~1 / 0.5 kcal per kg per km instead.
// The rest of the session is lifting: how busy it was (working sets per minute) picks
// light (3.5), moderate (5) or vigorous (6) resistance training. Lifting time is capped at
// 4 minutes per set, so a workout left running in Hevy doesn't count hours of rest.

const CARDIO = [
  [/jump ?rope|skipping|seilspring/i, 11, 'jump rope'],
  [/stair|step ?mill|stepper|treppe/i, 9, 'stair machine'],
  [/burpee|hiit|battle ?rope|sprint|assault|air ?bike|echo ?bike|ski ?erg/i, 8, 'intervals'],
  [/spin|cycl|bike|fahrrad|ergometer/i, 7, 'cycling'],
  [/row(ing)? ?(machine|erg)|rower|concept ?2|rudern|^rowing$/i, 7, 'rowing'],
  [/swim|schwimm/i, 7, 'swimming'],
  [/\brun|jog|lauf(?!band)/i, 9.8, 'running'],
  [/elliptical|cross ?trainer/i, 5, 'elliptical'],
  [/hik|wander/i, 6, 'hiking'],
  [/treadmill|laufband/i, 6, 'treadmill'],
  [/walk|gehen|spazier/i, 3.5, 'walking'],
];

// Loaded carries and lunges are lifting even when logged with a distance.
const NOT_CARDIO = /farmer|carry|lunge|ausfall|sled|schlitten|plank/i;
const cardioMatch = (title) => (NOT_CARDIO.test(title || '') ? null : CARDIO.find(([re]) => re.test(title || '')));

export const DEFAULT_WEIGHT = 75;

/** Estimate the calories a workout burned. Returns { kcal, cardioKcal, liftKcal, met, weight, assumedWeight } or null. */
export function estimateKcal(w, body) {
  if (!w?.minutes) return null;
  const assumedWeight = !(body?.weight > 0);
  const weight = assumedWeight ? DEFAULT_WEIGHT : body.weight;
  let cardioKcal = 0, cardioMin = 0, liftSets = 0;
  for (const ex of w.exercises || []) {
    const m = cardioMatch(ex.title);
    // Only treat it as cardio when it was logged with time or distance (a "Bike" title could be a lift).
    if (m && (ex.duration || ex.distance)) {
      const [, met, kind] = m;
      const min = (ex.duration || 0) / 60;
      const km = (ex.distance || 0) / 1000;
      const kmh = min ? km / (min / 60) : 0;
      if (km && /running|treadmill|walking|hiking/.test(kind)) {
        const perKm = kind === 'running' || (kind === 'treadmill' && kmh >= 7) ? 1.0 : 0.5;
        cardioKcal += perKm * weight * km;
      } else {
        cardioKcal += (met - 1) * weight * (min / 60);
      }
      cardioMin += min;
    } else {
      liftSets += ex.sets || 0;
    }
  }
  let liftKcal = 0, met = null;
  if (liftSets) {
    const liftMin = Math.min(Math.max(0, w.minutes - cardioMin), liftSets * 4);
    const perMin = liftMin ? liftSets / liftMin : 0;
    met = perMin >= 0.4 ? 6 : perMin >= 0.25 ? 5 : 3.5;
    liftKcal = (met - 1) * weight * (liftMin / 60);
  }
  const kcal = Math.round((cardioKcal + liftKcal) / 5) * 5;
  return { kcal, cardioKcal: Math.round(cardioKcal), liftKcal: Math.round(liftKcal), met, weight, assumedWeight };
}
