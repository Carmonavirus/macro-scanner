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
const SUMMARY_VERSION = 2;            // bump when summarise() keeps more: old summaries get re-imported

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
    // For the calorie estimate: every set including warm-ups (they cost energy too).
    const all = ex.sets || [];
    return {
      load: Math.round(all.reduce((v, s) => v + (s.weight_kg || 0) * (s.reps || 0), 0)),
      repsAll: all.reduce((r, s) => r + (s.reps || 0), 0),
      setsAll: all.length,
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
    sv: SUMMARY_VERSION,
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

/** Fetch the most recent workouts (up to FIRST_SYNC_PAGES pages) and store their summaries. */
async function importAll(key) {
  const first = await get('/workouts?page=1&pageSize=10', key);
  if (!first) throw new Error('Hevy didn’t return any workouts.');
  const store = {};
  const put = (list) => list.forEach((w) => { store[w.id] = summarise(w); });
  put(first.workouts || []);
  const pages = Math.min(first.page_count || 1, FIRST_SYNC_PAGES);
  for (let p = 2; p <= pages; p++) {
    const r = await get(`/workouts?page=${p}&pageSize=10`, key);
    put(r?.workouts || []);
  }
  await db.setSetting(STORE, { ...(await getStore()), ...store });
  return Object.keys(store).length;
}

/** Connect with an API key and do the first import. Returns the number of workouts imported. */
export async function connect(rawKey) {
  const key = rawKey.trim();
  if (!key) throw new Error('Paste your API key first.');
  const startedAt = new Date().toISOString();
  const n = await importAll(key);
  save({ key, since: startedAt, lastSync: startedAt, error: null });
  return n;
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
      // Workouts imported by an older version lack the per-set numbers: fetch them again once.
      let changes = 0;
      if (Object.values(await getStore()).some((w) => w.sv !== SUMMARY_VERSION)) {
        changes += await importAll(cfg.key);
        // Older than the last 200: keep them as they are (the estimate falls back), and don't try again.
        const st = await getStore();
        for (const w of Object.values(st)) w.sv = SUMMARY_VERSION;
        await db.setSetting(STORE, st);
      }
      const store = { ...(await getStore()) };
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
// Hevy's API doesn't give calories, so we estimate them, exercise by exercise.
// All numbers are the *extra* burn on top of what the body burns at rest anyway, like the
// "active calories" a watch shows and like the steps estimate (steps.js).
//
// Lifting = two parts:
//  1. Being at it: the session's lifting time at 3.5 MET ("resistance training, light"
//     in the Compendium of Physical Activities 2024), i.e. (3.5 − 1) × kg × hours. Each
//     exercise gets its share by number of sets. Lifting time is capped at 4 min per working
//     set (2 per warm-up), so a workout left running in Hevy doesn't count hours of rest.
//  2. The work itself: every rep lifts the weight (plus part of your body for squats,
//     pull-ups, dips, push-ups…) through the exercise's range of motion. Mechanical work
//     = mass × 9.81 × distance; muscles turn only about 10 % of the energy they burn into
//     lifting once lowering, bracing and recovery between reps are counted, so
//     kcal = work (J) / 0.10 / 4184. Heavier weight or more reps → more kcal.
//
// Cardio exercises (matched by name, logged with time or distance) use their own MET for
// their time; running/walking with a distance use ~1 / 0.5 kcal per kg per km instead.

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

// [name pattern, range of motion in metres, share of body weight that moves with it].
// First match wins, so specific names come before general ones.
const LIFTS = [
  [/calf|wade/i, 0.08, 1],
  [/shrug/i, 0.08, 0],
  [/hip thrust|glute bridge/i, 0.3, 0.4],
  [/leg press|hack squat/i, 0.5, 0],
  [/romanian|rdl|stiff|good ?morning/i, 0.5, 0.4],
  [/deadlift|kreuzheben/i, 0.55, 0.4],
  [/split squat|lunge|ausfall|step ?up|bulgarian/i, 0.45, 0.8],
  [/squat|kniebeuge/i, 0.6, 0.8],
  [/pull ?up|chin ?up|klimmz/i, 0.6, 1],
  [/muscle ?up/i, 1.0, 1],
  [/dip/i, 0.4, 1],
  [/push ?up|liegest/i, 0.35, 0.65],
  [/inverted row/i, 0.4, 0.6],
  [/pulldown|pull down|latzug/i, 0.6, 0],
  [/row|rudern/i, 0.45, 0],
  [/bench|chest press|bankdr/i, 0.4, 0],
  [/overhead|shoulder press|military|arnold|push press|schulterdr/i, 0.5, 0],
  [/fly|flye|pec deck|butterfly|crossover/i, 0.35, 0],
  [/lateral|front raise|rear delt|seitheben/i, 0.4, 0],
  [/curl/i, 0.35, 0],
  [/tricep|pushdown|extension|skull|kickback|trizeps/i, 0.3, 0],
  [/crunch|sit ?up|leg raise|knee raise|ab wheel|rollout/i, 0.3, 0.3],
  [/hyperextension|back extension/i, 0.4, 0.5],
  [/clean|snatch|jerk/i, 1.0, 0.3],
  [/swing/i, 0.8, 0.2],
];
const liftInfo = (title) => {
  const m = LIFTS.find(([re]) => re.test(title || ''));
  return m ? { rom: m[1], body: m[2] } : { rom: 0.4, body: 0 };
};

const LIFT_MET = 3.5;      // being at it, between and during sets
const EFFICIENCY = 0.10;   // share of burned energy that ends up as lifting work
const G = 9.81;

export const DEFAULT_WEIGHT = 75;

/** Calories from the lifting work of one exercise (weight × reps × range of motion). */
function workKcal(ex, weight) {
  const { rom, body } = liftInfo(ex.title);
  const sets = ex.setsAll ?? ex.sets ?? 0;
  const reps = ex.repsAll ?? (ex.reps || sets * 8);   // old summaries: no rep count for weighted sets
  const load = ex.load ?? ex.volume ?? 0;             // kg × reps
  const assisted = /assist/i.test(ex.title || '');
  const lifted = Math.max(0, body * weight * reps + (assisted ? -load : load)); // kg × reps
  return (lifted * G * rom) / EFFICIENCY / 4184;
}

/**
 * Estimate the calories a workout burned.
 * Returns { kcal, cardioKcal, liftKcal, baseKcal, workKcal, weight, assumedWeight, perExercise: [kcal per exercise] } or null.
 */
export function estimateKcal(w, body) {
  if (!w?.minutes) return null;
  const assumedWeight = !(body?.weight > 0);
  const weight = assumedWeight ? DEFAULT_WEIGHT : body.weight;
  const exs = w.exercises || [];
  const per = exs.map(() => 0);
  let cardioKcal = 0, cardioMin = 0, capMin = 0, liftSets = 0;
  const lifting = [];
  exs.forEach((ex, i) => {
    const m = cardioMatch(ex.title);
    // Only treat it as cardio when it was logged with time or distance (a "Bike" title could be a lift).
    if (m && (ex.duration || ex.distance)) {
      const [, met, kind] = m;
      const min = (ex.duration || 0) / 60;
      const km = (ex.distance || 0) / 1000;
      const kmh = min ? km / (min / 60) : 0;
      let k;
      if (km && /running|treadmill|walking|hiking/.test(kind)) {
        k = (kind === 'running' || (kind === 'treadmill' && kmh >= 7) ? 1.0 : 0.5) * weight * km;
      } else {
        k = (met - 1) * weight * (min / 60);
      }
      per[i] = k; cardioKcal += k; cardioMin += min;
    } else {
      const sets = ex.setsAll ?? ex.sets ?? 0;
      const warm = sets - (ex.sets || 0);
      capMin += (ex.sets || 0) * 4 + warm * 2;
      liftSets += sets;
      lifting.push(i);
    }
  });
  let baseKcal = 0, work = 0;
  if (liftSets) {
    const liftMin = Math.min(Math.max(0, w.minutes - cardioMin), capMin);
    baseKcal = (LIFT_MET - 1) * weight * (liftMin / 60);
    for (const i of lifting) {
      const ex = exs[i];
      const wk = workKcal(ex, weight);
      work += wk;
      per[i] = baseKcal * ((ex.setsAll ?? ex.sets ?? 0) / liftSets) + wk;
    }
  }
  const total = cardioKcal + baseKcal + work;
  return {
    kcal: Math.round(total / 5) * 5,
    cardioKcal: Math.round(cardioKcal),
    liftKcal: Math.round(baseKcal + work),
    baseKcal: Math.round(baseKcal),
    workKcal: Math.round(work),
    weight, assumedWeight,
    perExercise: per.map((k) => Math.round(k)),
  };
}
