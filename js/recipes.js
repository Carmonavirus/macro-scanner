// Built-in high-protein recipes. Written for this app, so they can be shown in full.
// Every ingredient is a basic food from generic.js, so calories and macros are worked
// out from the same values the diary uses. Amounts are for ONE portion.
//
// Recipe: { id, name, emoji, kind, minutes, veg, items: [[basicFoodId, grams]], steps: [...] }

import { genericProduct, PREFIX } from './generic.js';

const RECIPES = [
  {
    id: 'overnight-oats', name: 'Skyr overnight oats with blueberries', emoji: '🥣', kind: 'Breakfast', minutes: 5, veg: true,
    items: [['haferflocken', 50], ['skyr', 200], ['milch-15', 100], ['heidelbeeren', 80], ['chiasamen', 10]],
    steps: ['Stir oats, chia seeds, milk and skyr together in a jar.', 'Close it and leave it in the fridge overnight.', 'Top with blueberries in the morning.'],
  },
  {
    id: 'quark-bowl', name: 'Quark berry bowl with almonds', emoji: '🍓', kind: 'Breakfast', minutes: 5, veg: true,
    items: [['magerquark', 250], ['himbeeren', 100], ['mandeln', 15], ['honig', 8]],
    steps: ['Stir the quark smooth with a splash of water.', 'Top with raspberries and roughly chopped almonds.', 'Drizzle with honey.'],
  },
  {
    id: 'egg-white-scramble', name: 'Spinach and feta scramble on rye', emoji: '🍳', kind: 'Breakfast', minutes: 10, veg: true,
    items: [['ei', 110], ['eiklar', 100], ['spinat', 60], ['feta', 25], ['vollkornbrot', 50]],
    steps: ['Whisk the eggs and egg whites with a pinch of salt.', 'Wilt the spinach in a non-stick pan, pour in the eggs and stir gently over low heat.', 'Crumble the feta over it and serve on the bread.'],
  },
  {
    id: 'protein-shake', name: 'Banana peanut protein shake', emoji: '🥤', kind: 'Snack', minutes: 3, veg: true,
    items: [['proteinpulver', 30], ['milch-15', 300], ['banane', 120], ['erdnussbutter', 15]],
    steps: ['Put everything in a blender.', 'Blend for 30 seconds, add ice if you like it cold.'],
  },
  {
    id: 'cottage-plate', name: 'Cottage cheese snack plate', emoji: '🥒', kind: 'Snack', minutes: 5, veg: true,
    items: [['huettenkaese', 200], ['gurke', 100], ['cherrytomaten', 100], ['vollkornbrot', 50]],
    steps: ['Slice the cucumber and halve the tomatoes.', 'Season the cottage cheese with pepper and herbs.', 'Eat with the bread.'],
  },
  {
    id: 'chicken-rice-bowl', name: 'Chicken, rice and broccoli bowl', emoji: '🍗', kind: 'Lunch & dinner', minutes: 25,
    items: [['haehnchenbrust', 180], ['reis', 70], ['brokkoli', 200], ['olivenoel', 5]],
    steps: ['Cook the rice.', 'Season the chicken with salt, pepper and paprika and fry it in the oil for 5–6 minutes per side.', 'Steam the broccoli for 5 minutes.', 'Slice the chicken and serve everything in a bowl. Easy to make three at once for meal prep.'],
  },
  {
    id: 'lean-chili', name: 'Lean chili con carne', emoji: '🌶️', kind: 'Lunch & dinner', minutes: 30,
    items: [['rinderhack-mager', 150], ['kidneybohnen', 100], ['passierte-tomaten', 200], ['paprika-rot', 100], ['zwiebel', 50], ['mais', 40]],
    steps: ['Brown the mince with the chopped onion in a pot.', 'Add diced pepper, cumin, chili and paprika powder and fry for 2 minutes.', 'Add passata, beans and corn and simmer for 15–20 minutes.', 'Season with salt. Keeps 3 days in the fridge.'],
  },
  {
    id: 'tuna-wrap', name: 'Tuna skyr wrap', emoji: '🌯', kind: 'Lunch & dinner', minutes: 10,
    items: [['thunfisch', 130], ['wrap', 62], ['skyr', 40], ['gurke', 50], ['tomate', 60], ['kopfsalat', 20]],
    steps: ['Mix the drained tuna with skyr, salt, pepper and a little lemon juice.', 'Fill the wrap with lettuce, sliced tomato and cucumber and the tuna.', 'Roll it up tightly and cut in half.'],
  },
  {
    id: 'salmon-sweet-potato', name: 'Salmon with sweet potato and green beans', emoji: '🐟', kind: 'Lunch & dinner', minutes: 30,
    items: [['lachs', 150], ['suesskartoffel', 250], ['gruene-bohnen', 150]],
    steps: ['Cut the sweet potato into wedges and bake at 200 °C for 25 minutes.', 'Add the salmon to the tray for the last 12–15 minutes.', 'Boil the green beans for 6 minutes and season everything with salt, pepper and lemon.'],
  },
  {
    id: 'lentil-bolognese', name: 'Lentil bolognese', emoji: '🍝', kind: 'Lunch & dinner', minutes: 30, veg: true,
    items: [['linsen', 70], ['nudeln', 70], ['passierte-tomaten', 200], ['zwiebel', 50], ['karotte', 80], ['olivenoel', 5]],
    steps: ['Fry the chopped onion and grated carrot in the oil.', 'Add the lentils, passata and 200 ml water and simmer for 20 minutes until the lentils are soft.', 'Cook the pasta meanwhile and season the sauce with oregano, salt and pepper.'],
  },
  {
    id: 'shrimp-zucchini-pasta', name: 'Garlic shrimp zucchini pasta', emoji: '🦐', kind: 'Lunch & dinner', minutes: 20,
    items: [['garnelen', 150], ['nudeln', 70], ['zucchini', 200], ['cherrytomaten', 100], ['knoblauch', 5], ['olivenoel', 8]],
    steps: ['Cook the pasta.', 'Fry the sliced garlic and shrimp in the oil for 3 minutes, then take the shrimp out.', 'Fry the diced zucchini and halved tomatoes for 5 minutes.', 'Toss everything with the pasta and a splash of pasta water.'],
  },
  {
    id: 'tofu-quinoa', name: 'Tofu vegetable stir-fry with quinoa', emoji: '🥦', kind: 'Lunch & dinner', minutes: 25, veg: true,
    items: [['tofu', 200], ['quinoa', 60], ['paprika-rot', 100], ['brokkoli', 150], ['rapsoel', 8]],
    steps: ['Cook the quinoa.', 'Press the tofu dry, cube it and fry it in the oil until golden.', 'Add the vegetables and stir-fry for 5 minutes.', 'Season with soy sauce, ginger and chili and serve on the quinoa.'],
  },
  {
    id: 'turkey-chickpea-pan', name: 'Turkey and chickpea spinach pan', emoji: '🥘', kind: 'Lunch & dinner', minutes: 20,
    items: [['putenbrust', 150], ['kichererbsen', 100], ['spinat', 100], ['cherrytomaten', 100], ['zwiebel', 50], ['olivenoel', 5]],
    steps: ['Cut the turkey into strips and fry it in the oil.', 'Add the onion and fry until soft, then the chickpeas and tomatoes.', 'Stir in the spinach until it wilts and season with garlic, paprika, salt and pepper.'],
  },
];

const scaled = (per100, g) => {
  const out = {};
  for (const k of ['kcal', 'protein', 'carbs', 'fat']) out[k] = (per100[k] || 0) * g / 100;
  return out;
};

/** Ingredients as diary-ready items: { code, name, brand, unit, grams, per100 }. */
export function recipeItems(r, portions = 1) {
  return r.items.map(([id, grams]) => {
    const p = genericProduct(PREFIX + id);
    return { code: p.code, name: p.name, brand: p.brand, unit: p.unit, grams: grams * portions, per100: { ...p.per100 } };
  });
}

/** Calories and macros for one portion. */
export function recipeTotals(r) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const it of recipeItems(r)) {
    const v = scaled(it.per100, it.grams);
    for (const k in t) t[k] += v[k];
  }
  return t;
}

export const ALL_RECIPES = RECIPES
  .map((r) => ({ ...r, totals: recipeTotals(r) }))
  .sort((a, b) => b.totals.protein - a.totals.protein);

export const recipeById = (id) => ALL_RECIPES.find((r) => r.id === id) || null;

// ---------- More ideas online ----------

/** Recipe sites with lots of high-protein dishes. Linked to, never copied. */
export const CREATOR_SITES = [
  { name: 'Skinnytaste', who: 'Gina Homolka, author of the “Skinnytaste High Protein” cookbook', url: 'https://www.skinnytaste.com/high-protein/', note: 'Macros on every recipe' },
  { name: 'Oh Snap Macros', who: 'Macro-friendly recipes for trackers', url: 'https://ohsnapmacros.com/high-protein-dinner-recipes/', note: 'Macros on every recipe' },
  { name: 'Cheat Day Design', who: 'Macro-friendly, high-protein meal ideas', url: 'https://cheatdaydesign.com/high-protein-recipes/', note: 'Macros listed' },
  { name: 'Tastes Better From Scratch', who: 'Popular family recipe blog, high-protein section', url: 'https://tastesbetterfromscratch.com/category/high-protein-recipes/', note: 'Nutrition per serving' },
  { name: 'MORE Nutrition Rezepte', who: 'German fitness brand, high-protein recipes in German', url: 'https://morenutrition.de/blogs/rezepte', note: 'Auf Deutsch' },
];

// ---------- TheMealDB (free, open recipe database) ----------

const MEALDB = 'https://www.themealdb.com/api/json/v1/1/';
/** Categories in TheMealDB that are naturally protein-rich. */
export const MEALDB_CATEGORIES = ['Chicken', 'Seafood', 'Beef', 'Pork', 'Lamb', 'Vegetarian'];

async function mealdb(path) {
  const res = await fetch(MEALDB + path);
  if (!res.ok) throw new Error(`TheMealDB answered ${res.status}`);
  return res.json();
}

/** Short list of meals in a category: [{ id, name, thumb }]. */
export async function mealdbCategory(cat) {
  const { meals } = await mealdb(`filter.php?c=${encodeURIComponent(cat)}`);
  return (meals || []).map((m) => ({ id: m.idMeal, name: m.strMeal, thumb: m.strMealThumb }));
}

/** Search by name: [{ id, name, thumb }]. */
export async function mealdbSearch(q) {
  const { meals } = await mealdb(`search.php?s=${encodeURIComponent(q)}`);
  return (meals || []).map((m) => ({ id: m.idMeal, name: m.strMeal, thumb: m.strMealThumb }));
}

/** One meal with ingredients and method. */
export async function mealdbMeal(id) {
  const { meals } = await mealdb(`lookup.php?i=${encodeURIComponent(id)}`);
  const m = meals?.[0];
  if (!m) return null;
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || '').trim();
    if (name) ingredients.push({ name, measure: (m[`strMeasure${i}`] || '').trim() });
  }
  return {
    id: m.idMeal, name: m.strMeal, thumb: m.strMealThumb, category: m.strCategory, area: m.strArea,
    instructions: (m.strInstructions || '').split(/\r?\n+/).map((s) => s.trim()).filter((s) => s && !/^step\s*\d+[.:]?$/i.test(s)),
    ingredients, source: m.strSource || null, youtube: m.strYoutube || null,
  };
}
