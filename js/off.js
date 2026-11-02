// Open Food Facts client. Free, no API key. Fair use: max ~15 product reads/min,
// so the app caches every product in IndexedDB and only calls the API once per barcode.

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = [
  'code', 'product_name', 'product_name_de', 'product_name_en', 'generic_name_de',
  'brands', 'quantity', 'serving_size', 'serving_quantity', 'image_front_small_url',
  'image_front_url', 'nutriments', 'nutrition_data_per',
].join(',');

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Map an OFF product into the app's product shape (see nutrition.js). */
export function normalise(code, p) {
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
    if (kj != null) kcal = kj / 4.184;
  }
  const quantity = (p.quantity || '').toLowerCase();
  const unit = /\bm?l\b|cl\b/.test(quantity) && !/\bg\b|kg\b/.test(quantity) ? 'ml' : 'g';
  return {
    code,
    name: p.product_name_de || p.product_name || p.product_name_en || p.generic_name_de || 'Unnamed product',
    brand: (p.brands || '').split(',')[0].trim(),
    imageUrl: p.image_front_small_url || p.image_front_url || null,
    quantity: p.quantity || null,
    per100: {
      kcal,
      protein: num(n.proteins_100g),
      carbs: num(n.carbohydrates_100g),
      fat: num(n.fat_100g),
      sugars: num(n.sugars_100g),
      saturatedFat: num(n['saturated-fat_100g']),
      fiber: num(n.fiber_100g),
      salt: num(n.salt_100g),
    },
    unit,
    servingGrams: num(p.serving_quantity),
    servingLabel: p.serving_size || null,
    source: 'off',
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Look up a barcode. Resolves to a product, or null when OFF doesn't know it.
 * Throws on network errors so the UI can tell "offline" apart from "not found".
 */
export async function fetchProduct(code) {
  const res = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${FIELDS}&lc=de`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('Too many lookups in a short time. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Open Food Facts answered with HTTP ${res.status}.`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  return normalise(code, data.product);
}
