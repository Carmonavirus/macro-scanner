// Local storage in IndexedDB. Everything stays on the device.
//
// Stores:
//   products  key: code   – cached Open Food Facts products and manually entered ones (v1)
//   scans     key: auto   – { code, at } history of scans (v1)
//   log       key: auto   – diary entries (v2), see addEntry()
//   days      key: date   – { date, meals?: [{ id, name }], taken?: { suppId: true } } (v2)
//   settings  key: key    – { key, value } e.g. key 'goals' (v3)

const DB_NAME = 'macro-scanner';
const DB_VERSION = 3;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        const old = e.oldVersion;
        if (old < 1) {
          db.createObjectStore('products', { keyPath: 'code' });
          const scans = db.createObjectStore('scans', { keyPath: 'id', autoIncrement: true });
          scans.createIndex('at', 'at');
        }
        if (old < 2) {
          const log = db.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
          log.createIndex('date', 'date');
          db.createObjectStore('days', { keyPath: 'date' });
        }
        if (old < 3) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // A newer version of the app wants to upgrade the database: let it, and reload.
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      // An older copy of the app (another tab or the installed app) still has the database open.
      req.onblocked = () => window.dispatchEvent(new Event('dbblocked'));
    });
  }
  return dbPromise;
}

/** Fired after every change to the user's data, so backup can run. */
const changed = (r) => { window.dispatchEvent(new Event('datachanged')); return r; };

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

// ---------- Products ----------

export const getProduct = (code) => tx('products', 'readonly', (s) => s.get(code));
export const putProduct = (product) => tx('products', 'readwrite', (s) => s.put(product)).then(changed);
export const allProducts = () => tx('products', 'readonly', (s) => s.getAll());

export async function addScan(code) {
  await tx('scans', 'readwrite', (s) => s.add({ code, at: new Date().toISOString() }));
}

/** Most recently scanned or logged products, newest first, one per barcode. */
export async function recentProducts(limit = 30) {
  const [scans, log] = await Promise.all([
    tx('scans', 'readonly', (s) => s.getAll()),
    tx('log', 'readonly', (s) => s.getAll()),
  ]);
  const events = [
    ...scans.map((s) => ({ code: s.code, at: s.at })),
    ...log.filter((e) => e.code).map((e) => ({ code: e.code, at: e.at })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const seen = new Set();
  const out = [];
  for (const ev of events) {
    if (seen.has(ev.code)) continue;
    seen.add(ev.code);
    const product = await getProduct(ev.code);
    if (product) out.push(product);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Diary ----------
// Entry: { id, date: 'YYYY-MM-DD', meal: mealId, code, name, brand, unit, grams,
//          per100: {kcal, protein, ...}, at: ISO }
// per100 is a snapshot, so later product edits don't change past days.

export const addEntry = (entry) => tx('log', 'readwrite', (s) => s.add({ ...entry, at: new Date().toISOString() })).then(changed);
export const getEntry = (id) => tx('log', 'readonly', (s) => s.get(id));
export const putEntry = (entry) => tx('log', 'readwrite', (s) => s.put(entry)).then(changed);
export const deleteEntry = (id) => tx('log', 'readwrite', (s) => s.delete(id)).then(changed);

export const entriesForDate = (date) =>
  tx('log', 'readonly', (s) => s.index('date').getAll(date));

/** Entries with from <= date <= to (inclusive, YYYY-MM-DD strings). */
export const entriesBetween = (from, to) =>
  tx('log', 'readonly', (s) => s.index('date').getAll(IDBKeyRange.bound(from, to)));

export const DEFAULT_MEALS = [
  { id: 'breakfast', name: 'Breakfast' },
  { id: 'lunch', name: 'Lunch' },
  { id: 'dinner', name: 'Dinner' },
  { id: 'snacks', name: 'Snacks' },
];

const getDay = (date) => tx('days', 'readonly', (s) => s.get(date));

/** Merge fields into a day's record (keeps the other fields). */
async function updateDay(date, fields) {
  const day = (await getDay(date)) || { date };
  await tx('days', 'readwrite', (s) => s.put({ ...day, ...fields, date }));
  changed();
}

export async function mealsForDate(date) {
  const day = await getDay(date);
  return day?.meals || DEFAULT_MEALS.map((m) => ({ ...m }));
}

export const setMealsForDate = (date, meals) => updateDay(date, { meals });

// ---------- Supplements ----------
// The list lives in settings ('supplements': [{ id, name, dose }]);
// what was taken on a day lives on that day's record ('taken': { id: true }).

// Saved meals: reusable sets of foods with amounts (settings 'savedMeals').
// [{ id, name, items: [{ code, name, brand, unit, grams, per100 }], createdAt }]
export const getSavedMeals = () => getSetting('savedMeals', []);
export const setSavedMeals = (list) => setSetting('savedMeals', list);

export async function saveMeal(name, entries) {
  const items = entries.map(({ code, name: n, brand, unit, grams, per100 }) => ({ code, name: n, brand: brand || '', unit: unit || 'g', grams, per100: { ...per100 } }));
  const list = await getSavedMeals();
  const meal = { id: `sm${Date.now().toString(36)}`, name, items, createdAt: new Date().toISOString() };
  await setSavedMeals([meal, ...list]);
  return meal;
}

/** Log every item of a saved meal into a day's meal. */
export async function logSavedMeal(saved, date, mealId) {
  for (const it of saved.items) await addEntry({ ...it, per100: { ...it.per100 }, date, meal: mealId });
}

export const getSupplements = () => getSetting('supplements', []);
export const setSupplements = (list) => setSetting('supplements', list);

export async function takenOn(date) {
  return (await getDay(date))?.taken || {};
}

export async function setTaken(date, id, value) {
  const taken = { ...(await takenOn(date)) };
  if (value) taken[id] = true; else delete taken[id];
  await updateDay(date, { taken });
}

// ---------- Settings ----------

export async function getSetting(key, fallback = null) {
  const row = await tx('settings', 'readonly', (s) => s.get(key));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await tx('settings', 'readwrite', (s) => s.put({ key, value }));
  changed();
}

/** Daily goals: { kcal, protein, carbs, fat } – numbers or null when not set. */
export const getGoals = () => getSetting('goals', { kcal: null, protein: null, carbs: null, fat: null });
export const setGoals = (goals) => setSetting('goals', goals);
/** Weight (kg) and height (cm), for calories burned by steps. */
export const getBody = () => getSetting('body', { weight: null, height: null });
export const setBody = (body) => setSetting('body', body);

// ---------- Backup ----------

export async function exportAll() {
  const [products, log, days, settings] = await Promise.all([
    allProducts(),
    tx('log', 'readonly', (s) => s.getAll()),
    tx('days', 'readonly', (s) => s.getAll()),
    tx('settings', 'readonly', (s) => s.getAll()),
  ]);
  return { app: 'macro-scanner', version: 3, exportedAt: new Date().toISOString(), products, log, days, settings };
}

export async function importAll(data) {
  if (data?.app !== 'macro-scanner') throw new Error('This is not a Macro Scanner backup file.');
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['products', 'log', 'days', 'settings'], 'readwrite');
    for (const p of data.products || []) t.objectStore('products').put(p);
    for (const e of data.log || []) t.objectStore('log').put(e);
    for (const d of data.days || []) t.objectStore('days').put(d);
    for (const st of data.settings || []) t.objectStore('settings').put(st);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

/** Rough count of what's stored, for status messages. */
export async function counts() {
  const [entries, products] = await Promise.all([
    tx('log', 'readonly', (s) => s.count()),
    tx('products', 'readonly', (s) => s.count()),
  ]);
  return { entries, products };
}
