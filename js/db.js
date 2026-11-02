// Local storage in IndexedDB. Everything stays on the device.
//
// Stores (v1):
//   products  key: code   – cached Open Food Facts products and manually entered ones
//   scans     key: auto   – { code, at } history of scans
// Future (v2): a "log" store for daily entries { id, date, code, grams, meal } that
// weekly reports can be built on. Add it in onupgradeneeded with `if (old < 2)`.

const DB_NAME = 'macro-scanner';
const DB_VERSION = 1;
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
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

export const getProduct = (code) => tx('products', 'readonly', (s) => s.get(code));
export const putProduct = (product) => tx('products', 'readwrite', (s) => s.put(product));

export async function addScan(code) {
  await tx('scans', 'readwrite', (s) => s.add({ code, at: new Date().toISOString() }));
}

/** Most recent scans, one entry per barcode, joined with the product. */
export async function recentScans(limit = 20) {
  const scans = await tx('scans', 'readonly', (s) => s.getAll());
  const seen = new Set();
  const out = [];
  for (const scan of scans.reverse()) {
    if (seen.has(scan.code)) continue;
    seen.add(scan.code);
    out.push(scan);
    if (out.length >= limit) break;
  }
  return Promise.all(out.map(async (scan) => ({ ...scan, product: await getProduct(scan.code) })));
}
