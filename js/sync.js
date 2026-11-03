// Automatic cloud backup to a secret GitHub Gist in the user's own account.
//
// Free, no server of our own: the phone talks straight to the GitHub API with a
// personal access token (scope: gist) that the user creates once and pastes in.
// The token and settings are kept in localStorage on this phone only.
//
// - After every change (debounced) and when the app opens, the full backup JSON
//   is written to the gist.
// - On a new phone, connecting with a token finds the existing gist and restores it.

import * as db from './db.js';

const API = 'https://api.github.com';
const FILE = 'macro-scanner-backup.json';
const DESCRIPTION = 'Macro Scanner backup (do not delete)';
const KEY = 'cloudBackup';
const DEBOUNCE_MS = 8000;
const OPEN_SYNC_AFTER_MS = 60 * 60 * 1000;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function save(cfg) {
  try { cfg ? localStorage.setItem(KEY, JSON.stringify(cfg)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('syncstatus'));
}

export const config = () => load();
export const isConnected = () => !!load()?.token;

async function gh(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('GitHub didn’t accept the token. It may be wrong, expired or revoked.');
  if (res.status === 403 || res.status === 404) {
    throw new Error('The token can’t access Gists. Create it with the “gist” permission ticked.');
  }
  if (!res.ok) throw new Error(`GitHub answered with HTTP ${res.status}.`);
  return res.status === 204 ? null : res.json();
}

async function findGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, { token });
    const hit = list.find((g) => g.files?.[FILE]);
    if (hit) return hit;
    if (list.length < 100) return null;
  }
  return null;
}

async function readGistBackup(token, gistId) {
  const gist = await gh(`/gists/${gistId}`, { token });
  const file = gist.files?.[FILE];
  if (!file) return null;
  let text = file.content;
  if (file.truncated) text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
  return JSON.parse(text);
}

/**
 * Connect with a token. Returns { restored: boolean, user } —
 * restored is true when an existing backup was found and merged into this phone.
 */
export async function connect(rawToken) {
  const token = rawToken.trim();
  if (!token) throw new Error('Paste the token first.');
  const user = await gh('/user', { token });
  const existing = await findGist(token);
  let restored = false;
  let gistId;
  if (existing) {
    gistId = existing.id;
    const data = await readGistBackup(token, gistId);
    if (data) { await db.importAll(data); restored = true; }
  } else {
    const gist = await gh('/gists', {
      token, method: 'POST',
      body: { description: DESCRIPTION, public: false, files: { [FILE]: { content: JSON.stringify(await db.exportAll()) } } },
    });
    gistId = gist.id;
  }
  save({ token, gistId, login: user.login, lastSync: restored ? null : new Date().toISOString(), error: null });
  if (restored) await backupNow();
  return { restored, user: user.login };
}

export function disconnect() { save(null); }

let running = null;
let again = false;

/** Upload the full backup now. Safe to call often; calls are serialised. */
export async function backupNow() {
  const cfg = load();
  if (!cfg?.token) return;
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      const content = JSON.stringify(await db.exportAll());
      await gh(`/gists/${cfg.gistId}`, {
        token: cfg.token, method: 'PATCH', body: { files: { [FILE]: { content } } },
      });
      save({ ...load(), lastSync: new Date().toISOString(), error: null });
    } catch (err) {
      const offline = !navigator.onLine || err instanceof TypeError;
      save({ ...load(), error: offline ? 'offline' : err.message });
    } finally {
      running = null;
      if (again) { again = false; backupNow(); }
    }
  })();
  return running;
}

/** Text of another file in the backup gist (e.g. steps written by Macro Widget), or null. */
export async function readGistFile(name) {
  const cfg = load();
  if (!cfg?.token) return null;
  const gist = await gh(`/gists/${cfg.gistId}`, { token: cfg.token });
  const file = gist.files?.[name];
  if (!file) return null;
  return file.truncated ? (await fetch(file.raw_url, { cache: 'no-store' })).text() : file.content;
}

/** Restore from the cloud into this phone (merges; nothing local is deleted). */
export async function restoreNow() {
  const cfg = load();
  if (!cfg?.token) throw new Error('Not connected.');
  const data = await readGistBackup(cfg.token, cfg.gistId);
  if (!data) throw new Error('No backup found in your GitHub account.');
  await db.importAll(data);
}

// ---------- Automatic backup ----------
let timer;
window.addEventListener('datachanged', () => {
  if (!isConnected()) return;
  clearTimeout(timer);
  timer = setTimeout(backupNow, DEBOUNCE_MS);
});
// Back up straight away when the app goes to the background (e.g. user switches apps).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && timer && isConnected()) { clearTimeout(timer); timer = null; backupNow(); }
});
window.addEventListener('online', () => { if (load()?.error === 'offline') backupNow(); });

export function startAutoSync() {
  const cfg = load();
  if (!cfg?.token) return;
  const last = cfg.lastSync ? Date.parse(cfg.lastSync) : 0;
  if (cfg.error || Date.now() - last > OPEN_SYNC_AFTER_MS) backupNow();
}

/** Ask the browser not to evict our data when the phone runs low on space. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}

export async function isPersisted() {
  try { return !!(await navigator.storage?.persisted?.()); } catch { return false; }
}
