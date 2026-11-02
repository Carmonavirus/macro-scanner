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
