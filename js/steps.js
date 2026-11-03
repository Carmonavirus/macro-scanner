// Daily steps from the phone's Health Connect. A web app can't read Health Connect,
// so the Macro Widget Android app reads them and writes them to a file in the same
// private gist as the backup. This module picks them up from there.

import * as sync from './sync.js';
import { today } from './dates.js';

const FILE = 'macro-scanner-steps.json';
const KEY = 'stepsCache';
const MIN_GAP_MS = 2 * 60 * 1000;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}

/** Steps on a day (number), or null when unknown. */
export function stepsOn(date) {
  const v = load()?.days?.[date];
  return Number.isFinite(v) ? v : null;
}

/** When the widget app last sent steps (ISO string), or null. */
export const stepsUpdatedAt = () => load()?.updatedAt || null;

let busy = null;

/** Fetch the latest steps from the gist (at most every 2 minutes unless forced). */
export function refreshSteps(force = false) {
  if (!sync.isConnected()) return Promise.resolve();
  const c = load();
  if (!force && c?.fetchedAt && Date.now() - c.fetchedAt < MIN_GAP_MS) return Promise.resolve();
  if (busy) return busy;
  busy = (async () => {
    try {
      const text = await sync.readGistFile(FILE);
      const before = JSON.stringify(load()?.days || {}) + (load()?.updatedAt || '');
      const data = text ? JSON.parse(text) : {};
      const next = { days: data.days || {}, updatedAt: data.updatedAt || null, fetchedAt: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      if (JSON.stringify(next.days) + (next.updatedAt || '') !== before) window.dispatchEvent(new Event('stepsupdated'));
    } catch { /* offline or no token: keep what we have */ } finally { busy = null; }
  })();
  return busy;
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshSteps(); });

export const isToday = (date) => date === today();

// ---------- Calories from steps ----------
// Walking burns about 0.5 kcal per kg of body weight per km on top of what the body burns
// anyway (the usual estimate for normal walking pace). Step length ≈ 41.5 % of body height.
// Same formula as the Macro Widget app (Data.java), so both show the same number.
export const DEFAULT_BODY = { weight: 75, height: 175 };

export function stepKcal(steps, body) {
  const weight = body?.weight > 0 ? body.weight : DEFAULT_BODY.weight;
  const height = body?.height > 0 ? body.height : DEFAULT_BODY.height;
  const km = (steps * height * 0.415) / 100000;
  return Math.round(km * weight * 0.5);
}
