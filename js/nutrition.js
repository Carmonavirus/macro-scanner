// Normalised product shape used everywhere in the app (and by future logging/reports):
// {
//   code, name, brand, imageUrl, quantity,
//   per100: { kcal, protein, carbs, fat, sugars, saturatedFat, fiber, salt },  // numbers or null
//   unit: 'g' | 'ml',
//   servingGrams: number|null, servingLabel: string|null,
//   source: 'off' | 'manual', fetchedAt: ISO string
// }

export const MACROS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', main: true },
  { key: 'protein', label: 'Protein', unit: 'g', main: true },
  { key: 'carbs', label: 'Carbs', unit: 'g', main: true },
  { key: 'fat', label: 'Fat', unit: 'g', main: true },
  { key: 'sugars', label: 'of which sugars', unit: 'g' },
  { key: 'saturatedFat', label: 'of which saturated fat', unit: 'g' },
  { key: 'fiber', label: 'Fibre', unit: 'g' },
  { key: 'salt', label: 'Salt', unit: 'g' },
];

export const MAIN_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

/** True when the product has all four main macros. */
export function hasMacros(product) {
  return !!product && MAIN_KEYS.every((k) => Number.isFinite(product.per100?.[k]));
}

/** Macros for a given amount in grams (or ml). */
export function scale(per100, grams) {
  const out = {};
  for (const { key } of MACROS) {
    const v = per100?.[key];
    out[key] = Number.isFinite(v) ? (v * grams) / 100 : null;
  }
  return out;
}

export function fmt(value, key) {
  if (!Number.isFinite(value)) return '–';
  if (key === 'kcal') return String(Math.round(value));
  if (value > 0 && value < 0.1) return value.toFixed(2).replace(/0$/, '');
  if (value < 10) return value.toFixed(1).replace(/\.0$/, '');
  return String(Math.round(value));
}

/** Validate EAN-13 / EAN-8 / UPC-A (12) / GTIN-14 check digit. */
export function isValidGtin(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

/** GS1 prefixes 400–440 are assigned to Germany. */
export function isGermanCode(code) {
  if (code.length !== 13) return false;
  const p = Number(code.slice(0, 3));
  return p >= 400 && p <= 440;
}

/** Normalise a manual-entry form into the product shape. */
export function productFromForm(data) {
  const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
  const per100 = {};
  for (const { key } of MACROS) per100[key] = num(data[key]);
  return {
    code: data.code,
    name: data.name.trim(),
    brand: (data.brand || '').trim(),
    imageUrl: null,
    quantity: null,
    per100,
    unit: 'g',
    servingGrams: num(data.servingGrams),
    servingLabel: null,
    source: 'manual',
    fetchedAt: new Date().toISOString(),
  };
}
