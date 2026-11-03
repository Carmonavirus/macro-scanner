// German supermarkets: where to look for a recipe's ingredients.
// Products come from Open Food Facts (free, open data), filtered by the shop they're sold in.
// Each shop's own website is only linked to, never read.

import * as db from './db.js';
import { normalise } from './off.js';

const SETTING = 'store';
const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
const FIELDS = 'code,product_name,product_name_de,brands,quantity,image_front_small_url,nutriments,stores_tags';
const enc = encodeURIComponent;

// house: the shop's own brands (shown first). search: the shop's own product search, where known.
// product: a direct product page for the shop's own brands, where its site has one by barcode.
export const STORES = [
  {
    id: 'edeka', name: 'EDEKA', off: 'edeka', house: ['gut & günstig', 'gut&günstig', 'edeka'],
    search: (q) => `https://www.edeka.de/sortiment/suche/?suchbegriff=${enc(q)}`,
    // EDEKA's own brands (barcodes 4311501…/4311596…) each have a page on edeka.de
    product: (code) => (/^43115(01|96)/.test(code) ? `https://www.edeka.de/sortiment/${code}/` : null),
  },
  { id: 'rewe', name: 'REWE', off: 'rewe', house: ['ja!', 'rewe'], search: (q) => `https://www.rewe.de/shop/productList?search=${enc(q)}` },
  { id: 'lidl', name: 'Lidl', off: 'lidl', house: ['milbona', 'chef select', 'pilos', 'solevita', 'golden seafood', 'vemondo', 'lidl'], search: (q) => `https://www.lidl.de/q/search?q=${enc(q)}` },
  { id: 'aldi', name: 'ALDI', off: 'aldi', house: ['milsani', 'gut bio', 'meine metzgerei', 'golden seafood', 'aldi'] },
  { id: 'kaufland', name: 'Kaufland', off: 'kaufland', house: ['k-classic', 'k-bio', 'k-purland', 'kaufland'] },
  { id: 'penny', name: 'Penny', off: 'penny', house: ['penny', 'naturgut', 'penny ready'] },
  { id: 'netto', name: 'Netto', off: 'netto', house: ['gut & günstig', 'netto'] },
];

export const storeById = (id) => STORES.find((s) => s.id === id) || STORES[0];
export const getStore = async () => storeById(await db.getSetting(SETTING, 'edeka'));
export const setStore = (id) => db.setSetting(SETTING, storeById(id).id);

/** "Hähnchenbrust, roh · Chicken breast, raw" → "Hähnchenbrust": the German food word to search for. */
export function searchTerm(name) {
  return String(name || '').split(/[·,(]/)[0].replace(/\b(roh|gekocht|natur|frisch)\b/gi, '').replace(/\s+/g, ' ').trim();
}

/** Link to search the shop's own website, or null when we don't know its search page. */
export const storeSearchUrl = (store, name) => (store.search ? store.search(searchTerm(name)) : null);

/** Where a found product opens: the shop's own page if it has one, otherwise Open Food Facts. */
export function productUrl(store, p) {
  return store.product?.(p.code) || `https://world.openfoodfacts.org/product/${enc(p.code)}`;
}

const cacheKey = (store, q) => `storeProducts:${store.id}:${q.toLowerCase()}`;

/**
 * Products for an ingredient that Open Food Facts lists as sold at the shop, own brands first.
 * Resolves [{ code, name, brand, quantity, imageUrl, per100, house }]. Cached on this phone for a week.
 */
export async function findAtStore(store, name) {
  const q = searchTerm(name);
  if (!q) return [];
  try {
    const hit = JSON.parse(localStorage.getItem(cacheKey(store, q)));
    if (hit && Date.now() - hit.at < 7 * 864e5) return hit.list;
  } catch { /* ignore */ }

  const url = `${OFF_SEARCH}?search_terms=${enc(q)}&tagtype_0=stores&tag_contains_0=contains&tag_0=${enc(store.off)}`
    + `&tagtype_1=countries&tag_contains_1=contains&tag_1=germany&sort_by=unique_scans_n&page_size=12&json=1&fields=${FIELDS}&lc=de`;
  let res;
  try { res = await fetch(url, { headers: { Accept: 'application/json' } }); } catch { throw new Error('Couldn’t reach Open Food Facts. Check your internet connection.'); }
  if (res.status === 429 || res.status === 503) throw new Error('Open Food Facts is busy. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const data = await res.json();
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/-/g, ''));
  const all = (data.products || [])
    .filter((p) => p.code && (p.nutriments?.['energy-kcal_100g'] != null || p.nutriments?.['energy-kj_100g'] != null))
    .map((p) => {
      const n = normalise(p.code, p);
      const brand = (p.brands || '').toLowerCase();
      const name = n.name.toLowerCase().replace(/[\s-]+/g, '');
      return {
        code: p.code, name: n.name, brand: n.brand, quantity: n.quantity, imageUrl: n.imageUrl, per100: n.per100, unit: n.unit,
        house: store.house.some((h) => brand.includes(h)),
        named: words.every((w) => name.includes(w)),
      };
    })
    // Own brand first; otherwise as popular as Open Food Facts says.
    .sort((a, b) => (b.house - a.house));
  // When some products have the food in their name, drop the rest (e.g. nuggets for chicken breast).
  const named = all.filter((p) => p.named);
  const list = (named.length ? named : all).slice(0, 5);
  try { localStorage.setItem(cacheKey(store, q), JSON.stringify({ at: Date.now(), list })); } catch { /* ignore */ }
  return list;
}
