// German supermarkets: where to look for a recipe's ingredients.
// Products come from Open Food Facts (free, open data), filtered by the shop they're sold in.
// Each shop's own website is only linked to, never read.

import * as db from './db.js';
import { normalise } from './off.js';

const SETTING = 'store';
const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
const FIELDS = 'code,product_name,product_name_de,brands,quantity,image_front_small_url,nutriments,categories_tags';
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

const cacheKey = (store, q) => `storeProducts2:${store.id}:${q.toLowerCase()}`;

// Other German names shops use for the same food (Open Food Facts searches the words as written).
const SYNONYMS = {
  'hüttenkäse': ['körniger frischkäse', 'cottage cheese'],
  'körniger frischkäse': ['hüttenkäse', 'cottage cheese'],
  'cottage cheese': ['körniger frischkäse', 'hüttenkäse'],
  'hähnchenbrust': ['hähnchenbrustfilet', 'hähnchen brustfilet'],
  'putenbrust': ['putenbrustfilet', 'puten brustfilet'],
  'magerquark': ['speisequark magerstufe', 'quark mager'],
  'rinderhack': ['rinderhackfleisch', 'hackfleisch rind'],
  'hackfleisch': ['hackfleisch gemischt', 'rinderhackfleisch'],
  'eiklar': ['eiweiß', 'flüssiges eiweiß'],
  'haferflocken': ['haferflocken zart', 'kernige haferflocken'],
  'lachs': ['lachsfilet'],
  'thunfisch': ['thunfisch im eigenen saft', 'thunfisch naturale'],
  'reis': ['langkornreis', 'basmati reis'],
  'nudeln': ['spaghetti', 'penne'],
  'erdnussbutter': ['erdnusscreme', 'erdnussmus'],
  'proteinpulver': ['whey protein', 'eiweißpulver'],
};

// Ready-made foods: wrong when a recipe wants the basic ingredient (raw chicken, not cold cuts).
const PREPARED_CATS = /cold-cut|sliced|prepared|cooked|ham|sausage|charcuterie|meals|pasta|ravioli|tortellini|sandwich|salad|spread|snack|smoked|breaded|nugget|pizza|soup|sauce/;
const PREPARED_NAME = /aufschnitt|delikatess|gegart|gebraten|geräuchert|gekocht|salat|tortellini|ravioli|nugget|wurst|aufstrich|schnitzel|paniert|cordon|döner|kebab|snack|sandwich|klassik|in aspik|grill|pizza|suppe|soße|sauce/;

/** How far a product's macros per 100 g are from the recipe's (0 = the same). */
function macroDistance(a, b) {
  if (!b) return 0;
  const d = (k, floor) => Math.abs((a[k] || 0) - (b[k] || 0)) / Math.max(b[k] || 0, floor);
  return d('kcal', 40) * 1.5 + d('protein', 4) + d('carbs', 4) + d('fat', 3);
}

async function search(store, q) {
  const url = `${OFF_SEARCH}?search_terms=${enc(q)}&tagtype_0=stores&tag_contains_0=contains&tag_0=${enc(store.off)}`
    + `&tagtype_1=countries&tag_contains_1=contains&tag_1=germany&sort_by=unique_scans_n&page_size=24&json=1&fields=${FIELDS}&lc=de`;
  let res;
  try { res = await fetch(url, { headers: { Accept: 'application/json' } }); } catch { throw new Error('Couldn’t reach Open Food Facts. Check your internet connection.'); }
  if (res.status === 429 || res.status === 503) throw new Error('Open Food Facts is busy. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  return (await res.json()).products || [];
}

/**
 * Products for an ingredient that Open Food Facts lists as sold at the shop, the ones whose
 * macros are closest to the recipe's first. `want` is { name, per100 } of the recipe ingredient.
 * Resolves [{ code, name, brand, quantity, imageUrl, per100, house, match }]. Cached for a week.
 */
export async function findAtStore(store, want) {
  const name = typeof want === 'string' ? want : want.name;
  const target = typeof want === 'string' ? null : want.per100;
  const q = searchTerm(name);
  if (!q) return [];
  const key = cacheKey(store, `${q}|${target ? Math.round(target.kcal) : ''}`);
  try {
    const hit = JSON.parse(localStorage.getItem(key));
    if (hit && Date.now() - hit.at < 7 * 864e5) return hit.list;
  } catch { /* ignore */ }

  // A basic food (raw, plain) shouldn't turn into cold cuts or tortellini.
  const basic = /\broh\b|\braw\b|natur|plain|ungekocht|uncooked/i.test(name) || !PREPARED_NAME.test(q.toLowerCase());
  const terms = [q, ...(SYNONYMS[q.toLowerCase()] || [])];
  const seen = new Set();
  let list = [];
  for (const term of terms.slice(0, 3)) {
    const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/-/g, ''));
    for (const p of await search(store, term)) {
      if (!p.code || seen.has(p.code)) continue;
      if (p.nutriments?.['energy-kcal_100g'] == null && p.nutriments?.['energy-kj_100g'] == null) continue;
      seen.add(p.code);
      const n = normalise(p.code, p);
      const brand = (p.brands || '').toLowerCase();
      const pname = n.name.toLowerCase();
      const flat = pname.replace(/[\s-]+/g, '');
      const cats = (p.categories_tags || []).join(' ');
      const prepared = PREPARED_NAME.test(pname) || PREPARED_CATS.test(cats);
      const dist = macroDistance(n.per100, target);
      list.push({
        code: p.code, name: n.name, brand: n.brand, quantity: n.quantity, imageUrl: n.imageUrl, per100: n.per100, unit: n.unit,
        house: store.house.some((h) => brand.includes(h)),
        named: words.every((w) => flat.includes(w)),
        dist, prepared,
        score: dist + (basic && prepared ? 3 : 0) - (store.house.some((h) => brand.includes(h)) ? 0.15 : 0),
      });
    }
    // Enough good ones: no need to ask again with another name (Open Food Facts limits searches).
    if (list.some((x) => x.named && x.score < 1)) break;
  }
  // Products with the food in their name only, when there are any.
  const named = list.filter((p) => p.named);
  if (named.length) list = named;
  // Raw chicken wanted and raw chicken found: leave out the cold cuts and ready meals.
  if (basic && list.some((p) => !p.prepared)) list = list.filter((p) => !p.prepared);
  list = list.sort((a, b) => a.score - b.score).slice(0, 5)
    .map(({ score, dist, prepared: _p, named: _n, ...p }) => ({ ...p, match: target ? Math.max(0, Math.min(100, Math.round(100 - dist * 25))) : null }));
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), list })); } catch { /* ignore */ }
  return list;
}
