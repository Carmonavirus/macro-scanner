// Dishes from German restaurant chains, for "Eat out": what fits the calories and macros you
// have left today. Values are per portion as served in Germany. They are approximate: taken from
// published German nutrition tables where available (McDonald's), otherwise from the chains'
// calorie values as listed in German food databases with macros estimated to match. Always check
// the chain's own app for the exact numbers.
//
// Dish: [name, grams, kcal, protein, carbs, fat, kind, price €]   kind: m = main, s = side, d = dessert
// Prices: typical single-item prices in Germany (burgerpreise.de / mcdomenu.de for the fast-food
// chains, a Berlin menu for dean&david), checked on PRICES_CHECKED. They differ by restaurant and
// are usually higher on delivery apps. null = not sold on its own or not found.

export const CHAINS_CHECKED = '2026-11-03';
export const PRICES_CHECKED = '2026-11-03';

const RAW = {
  mcd: {
    badge: 'McD', color: '#da291c', name: "McDonald's", emoji: '🍔',
    site: 'https://www.mcdonalds.com/de/de-de.html', nutritionSrc: 'https://mcdomenu.de/kalorien-naehrwerte/', priceSrc: 'https://burgerpreise.de/mc-donalds-preise/',
    dishes: [
      ['Hamburger', 100, 253, 13, 30, 8.8, 'm', 2.20],
      ['Cheeseburger', 114, 302, 16, 31, 13, 'm', 2.50],
      ['Double Cheeseburger', 169, 448, 26, 32, 24, 'm', 3.89],
      ['Big Mac', 215, 503, 26, 42, 26, 'm', 6.39],
      ['Hamburger Royal TS', 232, 551, 30, 37, 31, 'm', 6.09],
      ['Hamburger Royal Käse', 200, 527, 31, 36, 29, 'm', 6.09],
      ['Big Tasty Bacon', 340, 890, 50, 50, 54, 'm', 7.99],
      ['Chickenburger', 128, 339, 13, 42, 13, 'm', 2.50],
      ['McChicken Classic', 204, 439, 20, 48, 18, 'm', 5.89],
      ['McCrispy', 222, 519, 25, 52, 23, 'm', 6.09],
      ['Filet-o-Fish', 138, 331, 15, 37, 13, 'm', 4.89],
      ['McPlant', 215, 490, 21, 48, 23, 'm', 5.49],
      ['6 Chicken McNuggets', 102, 261, 16, 15, 14, 'm', 5.39],
      ['9 Chicken McNuggets', 153, 391, 24, 23, 22, 'm', 6.49],
      ['20 Chicken McNuggets', 340, 869, 54, 50, 48, 'm', 10.89],
      ['Pommes small', 80, 231, 2.9, 29, 11, 's', 2.00],
      ['Pommes medium', 114, 330, 4.1, 41, 16, 's', 3.79],
      ['Pommes large', 150, 434, 5.4, 54, 21, 's', 4.29],
      ['Snack Salad (no dressing)', 60, 15, 0.9, 1.8, 0.2, 's', 2.99],
      ['4 Chicken McNuggets', 68, 174, 11, 10, 9.6, 's', null],
      ['Apple bag', 80, 37, 0.2, 8.3, 0.1, 's', 1.99],
      ['McFlurry Oreo', 185, 377, 7.8, 54, 14, 'd', 3.00],
      ['McSundae Chocolate', 135, 258, 5.4, 38, 9.1, 'd', 2.00],
    ],
  },
  bk: {
    badge: 'BK', color: '#f28c00', name: 'Burger King', emoji: '👑',
    site: 'https://www.burgerking.de/', nutritionSrc: 'https://www.fatsecret.de/Kalorien-Ern%C3%A4hrung/burger-king', priceSrc: 'https://burgerpreise.de/burger-king-preise/',
    dishes: [
      ['Whopper', 282, 613, 28, 49, 33, 'm', 7.19],
      ['Whopper Jr.', 145, 315, 14, 28, 16, 'm', 4.99],
      ['Double Whopper', 363, 846, 47, 49, 51, 'm', 9.59],
      ['Plant-based Whopper', 282, 590, 25, 51, 31, 'm', 7.09],
      ['Big King', 192, 501, 26, 36, 28, 'm', 6.69],
      ['Big King XXL', 363, 940, 54, 45, 61, 'm', 9.69],
      ['Cheeseburger', 128, 307, 16, 30, 13, 'm', 2.69],
      ['Chili Cheese Burger', 139, 381, 16, 34, 20, 'm', 2.99],
      ['Crispy Chicken', 179, 493, 19, 48, 25, 'm', 6.29],
      ['Long Chicken', 215, 595, 22, 52, 33, 'm', 6.49],
      ['King Nuggets 6er', 114, 271, 15, 18, 15, 'm', 5.79],
      ['King Nuggets 9er', 171, 407, 23, 27, 23, 'm', 7.29],
      ['King Pommes medium', 116, 313, 3.5, 40, 15, 's', 3.79],
      ['King Pommes large', 159, 429, 4.8, 55, 21, 's', 4.19],
      ['Onion Rings 6er', 70, 170, 2.5, 20, 9, 's', 3.99],
      ['Chili Cheese Nuggets 6er', 105, 318, 9, 30, 18, 's', 5.79],
      ['Gitterkartoffeln', 111, 309, 3.5, 34, 17, 's', 3.99],
    ],
  },
  kfc: {
    badge: 'KFC', color: '#c8102e', name: 'KFC', emoji: '🍗',
    site: 'https://www.kfc.de/', nutritionSrc: 'https://www.fatsecret.de/Kalorien-Ern%C3%A4hrung/kfc', priceSrc: 'https://burgerpreise.de/kfc-preise/',
    dishes: [
      ['Original Chicken breast piece', 110, 234, 24, 8, 12, 'm', 3.49],
      ['2 Original Chicken pieces (breast + drumstick)', 162, 356, 34, 12, 19.5, 'm', 6.49],
      ['3 Crispy Strips', 123, 291, 21, 18, 15, 'm', 5.99],
      ['6 Crispy Strips', 246, 582, 42, 36, 30, 'm', 9.99],
      ['6 Hot Wings', 156, 498, 30, 18, 34, 'm', 6.49],
      ['Classic Zinger Burger', 200, 490, 25, 48, 21, 'm', 6.19],
      ['Twister', 223, 433, 19, 46, 19, 'm', 6.19],
      ['Crispy Cheese Burger', 116, 277, 13, 28, 12, 'm', 2.29],
      ['Classic Veggie Burger', 191, 433, 14, 50, 19, 'm', 6.19],
      ['Pommes small', 80, 226, 2.6, 29, 11, 's', 3.29],
      ['Pommes large', 110, 311, 3.6, 40, 15, 's', 3.99],
      ['Coleslaw', 150, 255, 1.5, 15, 21, 's', 3.99],
      ['Mashed potatoes with gravy', 200, 112, 3, 18, 3, 's', 3.99],
      ['Original Chicken drumstick', 52, 122, 10, 4, 7.5, 's', 3.49],
    ],
  },
  subway: {
    badge: 'SUB', color: '#008c3a', name: 'Subway', emoji: '🥖',
    site: 'https://www.subway.com/de-DE', nutritionSrc: 'https://www.fatsecret.de/Kalorien-Ern%C3%A4hrung/subway', priceSrc: 'https://burgerpreise.de/subway-preise/',
    dishes: [
      ['Chicken Teriyaki Sub 15 cm', 226, 307, 23, 41, 5, 'm', 6.09],
      ['Chicken Teriyaki Sub Footlong', 452, 614, 46, 82, 10, 'm', 9.99],
      ['Chicken Fajita Sub 15 cm', 208, 250, 20, 32, 4.5, 'm', 6.09],
      ['Chicken Fajita Sub Footlong', 416, 500, 40, 64, 9, 'm', 9.99],
      ['Chicken Tandoori Sub 15 cm', 234, 388, 23, 44, 12.5, 'm', 6.79],
      ['Philly Beef & Cheese Sub 15 cm', 220, 304, 21, 36, 8, 'm', 6.29],
      ['Philly Beef & Cheese Sub Footlong', 440, 608, 42, 72, 16, 'm', 10.19],
      ['Tuna Sub 15 cm', 226, 350, 17, 37, 14.5, 'm', 6.09],
      ['Italian B.M.T. Sub 15 cm', 216, 369, 18, 38, 16, 'm', 6.09],
      ['Ham Sub 15 cm', 194, 256, 16, 37, 4.5, 'm', 5.99],
      ['Veggie Delite Sub 15 cm', 164, 244, 9, 42, 4.5, 'm', 5.79],
      ['BBQ Rib Sub 15 cm', 266, 545, 25, 55, 25, 'm', 6.29],
      ['Sliced Chicken Wrap', 244, 423, 25, 45, 15, 'm', 5.99],
      ['Chicken Teriyaki Wrap', 250, 372, 25, 45, 9.5, 'm', 6.09],
      ['Chicken Fajita Wrap', 232, 352, 22, 40, 11, 'm', 6.09],
      ['Cookie', 45, 214, 2.5, 28, 10, 'd', 1.29],
    ],
  },
  dd: {
    badge: 'd&d', color: '#2b2b2b', name: 'dean&david', emoji: '🥗',
    site: 'https://www.deananddavid.com/', nutritionSrc: 'https://www.fatsecret.de/Kalorien-Ern%C3%A4hrung/dean-david', priceSrc: 'https://www.speisekarte.de/berlin/restaurant/deandavid_bowls_salate_curries_snacks_in_berlin_schlossstrasse/speisekarte',
    dishes: [
      ['Avocado Chicken Bowl', 400, 571, 35, 40, 29, 'm', 13.75],
      ['Chicken Teriyaki Bowl', 450, 713, 38, 90, 22, 'm', 13.95],
      ['Crunchy Chicken Bowl', 450, 860, 36, 80, 44, 'm', 13.75],
      ['Vegan Falafel Bowl', 450, 696, 20, 75, 34, 'm', 9.95],
      ['Veggie Buddha Bowl', 450, 883, 25, 85, 49, 'm', 12.25],
      ['Hot Chicken Teriyaki Wrap', 300, 533, 30, 60, 18, 'm', 8.75],
      ['Mango Chicken Curry', 450, 767, 35, 90, 30, 'm', 11.95],
      ['Korma Curry Chicken', 450, 637, 33, 70, 25, 'm', null],
    ],
  },
};

// Plain text badges (initials in a colour), not logos: those are the chains' trademarks.
export const CHAINS = Object.entries(RAW).map(([id, c]) => ({ id, name: c.name, emoji: c.emoji, badge: c.badge, color: c.color, site: c.site, nutritionSrc: c.nutritionSrc, priceSrc: c.priceSrc }));
export const chainById = (id) => CHAINS.find((c) => c.id === id) || { id, name: id === 'own' ? 'My dish' : id, emoji: '⭐', badge: '★', color: '#6b6b6b' };

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** All built-in dishes: { id, chain, name, grams, kcal, protein, carbs, fat, kind }. */
export const DISHES = Object.entries(RAW).flatMap(([chain, c]) => c.dishes.map(([name, grams, kcal, protein, carbs, fat, kind, price = null]) => ({
  id: `${chain}-${slug(name)}`, chain, name, grams, kcal, protein, carbs, fat, kind, price,
})));

/**
 * How well a dish (or combo) fits what's left. 0 is a perfect fit, bigger is worse.
 * Close to the calories left is best; too little protein, or too much carbs or fat, costs points.
 */
export function fitScore(x, left) {
  const kcal = Math.max(left.kcal, 1);
  // Using up less than what's left is fine-ish, going over is worse.
  let s = (x.kcal <= kcal ? 0.8 : 1.5) * Math.abs(kcal - x.kcal) / kcal;
  if (left.protein > 0) s += 1.2 * Math.max(0, left.protein - x.protein) / Math.max(left.protein, 20);
  s += Math.max(0, x.protein - Math.max(left.protein, 0)) / 200;
  s += Math.max(0, x.carbs - Math.max(left.carbs, 0)) / Math.max(left.carbs, 30);
  s += 1.2 * Math.max(0, x.fat - Math.max(left.fat, 0)) / Math.max(left.fat, 15);
  return s;
}

/** Score as a 0–100 "fit" percentage for display. */
export const fitPercent = (score) => Math.max(0, Math.min(100, Math.round(100 - score * 60)));

const sum = (parts) => parts.reduce((t, p) => ({
  kcal: t.kcal + p.kcal, protein: t.protein + p.protein, carbs: t.carbs + p.carbs, fat: t.fat + p.fat, grams: t.grams + p.grams,
  // Total price only when every part has one.
  price: t.price == null || p.price == null ? null : Math.round((t.price + p.price) * 100) / 100,
}), { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0, price: 0 });

/** Ways to order the list. */
export const SORTS = [
  { id: 'fit', label: 'Best fit' },
  { id: 'protein', label: 'Most protein' },
  { id: 'carbs', label: 'Most carbs' },
  { id: 'fat', label: 'Most fat' },
  { id: 'price', label: 'Cheapest' },
];
const BY = {
  fit: (a, b) => a.score - b.score,
  protein: (a, b) => b.protein - a.protein || a.score - b.score,
  carbs: (a, b) => b.carbs - a.carbs || a.score - b.score,
  fat: (a, b) => b.fat - a.fat || a.score - b.score,
  price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.score - b.score,
};

/**
 * Ranked suggestions for what's left today, as a meal you could order: one main, optionally
 * with a side and/or a dessert, all from the same chain. Nothing over the calories left
 * (5 % leeway). Each main leads at most two suggestions and each chain at most `perChain`,
 * so the list stays varied. `sort`: one of SORTS (fit, protein, carbs, fat, price).
 * Returns [{ chain, parts: [dish...], kcal, protein, carbs, fat, grams, score }].
 */
export function suggest(left, { chains = null, extra = [], limit = 30, perChain = 6, sort = 'fit' } = {}) {
  const pool = [...DISHES, ...extra].filter((d) => !chains || chains.includes(d.chain));
  const max = left.kcal * 1.05;
  const options = [];
  const byChain = {};
  for (const d of pool) (byChain[d.chain] ||= []).push(d);
  for (const list of Object.values(byChain)) {
    const extras = list.filter((d) => d.kind !== 'm');
    for (const m of list.filter((d) => d.kind === 'm')) {
      options.push([m]);
      extras.forEach((x, i) => {
        options.push([m, x]);
        // At most one side and one dessert: fries with fries isn't a meal.
        for (let j = i + 1; j < extras.length; j++) if (extras[j].kind !== x.kind) options.push([m, x, extras[j]]);
      });
    }
  }
  const ranked = options
    .map((parts) => ({ chain: parts[0].chain, parts, ...sum(parts) }))
    .filter((o) => o.kcal <= max)
    .map((o) => ({ ...o, score: fitScore(o, left) + 0.03 * (o.parts.length - 1) }))
    .sort(BY[sort] || BY.fit);
  const perMain = {};
  const inChain = {};
  const cap = chains && chains.length === 1 ? limit : perChain;
  const out = [];
  for (const o of ranked) {
    const k = o.parts[0].id;
    if ((perMain[k] || 0) >= 2 || (inChain[o.chain] || 0) >= cap) continue;
    perMain[k] = (perMain[k] || 0) + 1;
    inChain[o.chain] = (inChain[o.chain] || 0) + 1;
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}

/** Same dish twice shows as "2× name". */
export function partsLabel(parts) {
  const counts = new Map();
  for (const p of parts) counts.set(p.name, (counts.get(p.name) || 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(' + ');
}

/** A dish as a diary item: { code, name, brand, unit, grams, per100 }. */
export function dishItem(d) {
  const f = 100 / d.grams;
  return {
    code: `eat-${d.id}`, name: d.name, brand: chainById(d.chain).name, unit: 'g', grams: d.grams,
    per100: { kcal: d.kcal * f, protein: d.protein * f, carbs: d.carbs * f, fat: d.fat * f },
  };
}
