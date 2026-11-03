// Recipes from Instagram (or TikTok, YouTube, any post): the user pastes the link and the
// caption, and can add the video or screenshots. Google Gemini (the user's own key, see
// voice.js) reads them and returns the ingredients with amounts and the steps.
//
// The app never downloads anything from Instagram itself: Instagram doesn't allow that.
// The user's own recipes are kept in the setting 'myRecipes' (so they're in the backup).

import * as db from './db.js';
import { geminiKey, matchFood } from './voice.js';
import { generateJson } from './gemini.js';

const KEY = 'myRecipes';
/** Gemini takes files inline up to about 20 MB per request; base64 makes them a third bigger. */
export const MAX_MEDIA_BYTES = 14 * 1024 * 1024;

const PROMPT = `You read a cooking post from social media (Instagram, TikTok, YouTube or similar) and write down the recipe.
You get the post's caption and/or its video or screenshots. Use everything you get: the caption, text on screen, what is said and what you see being added.
Return JSON:
- "language": the language of the post as a two-letter code, e.g. "de", "en", "es"
- "title": a short dish name in English
- "titleOriginal": the dish name in the post's own language
- "servings": how many portions the recipe makes (a number; guess from the amounts if not said, usually 1–4)
- "minutes": total time in minutes, your best estimate
- "ingredients": every ingredient of the WHOLE recipe, one entry per food. A line with two foods ("etwas Tomatenmark und Senf", "Salz und Öl") is two entries; split the amount sensibly. Each entry has
  - "said": that ingredient and amount exactly as written or shown, in the post's language, e.g. "2 EL Erdnussbutter"
  - "saidEn": the same in English, e.g. "2 tbsp peanut butter"
  - "name": the ingredient's name exactly as the post writes it, without the amount, keeping brand and product names (e.g. "Exquisa Paprika-Chilli fitline", "Schalotten oder Zwiebeln", "Cremefine 7%")
  - "brand": the brand when the post names one, exactly as written (e.g. "Exquisa", "Philadelphia", "Ehrmann"), otherwise ""
  - "product": for a named brand product, its product name exactly as written in the post's language without the brand (e.g. "Paprika-Chilli fitline"), otherwise ""
  - "de": the food's German name as in a German food database, keeping exactly what it is: a processed food stays that food (Tomatenmark is "Tomatenmark", not "Tomate"; Frischkäse is "Frischkäse", not "Hüttenkäse"; Senf is "Senf"). Add the flavour or type when said (e.g. "Frischkäse Paprika Chili light", "Kochcreme 7% Fett", "Reis gekocht")
  - "en": the same in English (e.g. "tomato paste", "light cream cheese with paprika and chili")
  - "optional": true when the post calls it optional, a side or "nach Wahl/optional", otherwise false
  - "grams": the amount in grams (ml for liquids) for the whole recipe; convert spoons, cups, pieces etc. to a typical weight; if no amount is given, estimate what was used
  - "per100": kcal, protein, carbs (without fibre) and fat per 100 g as used. For a brand product use that product's real label values if you know them
- "steps": the method as short, clear steps in English. If the post doesn't say, work out sensible steps from what is shown.
- "stepsOriginal": the same steps in the post's own language (the same text as "steps" if the post is in English)
- "stated": the nutrition per portion when the post states it (e.g. "Nährwerte p.P.: 483 kcal, 26 g KH, 14 g F, 63 g EW"), as kcal, protein, carbs and fat; all 0 when the post doesn't state it. Say in "statedFor" what it covers if the post says, e.g. "without rice", otherwise ""
- "notes": anything uncertain, in one short English sentence, or ""
Never leave out an ingredient that has calories, and never replace one food with a different one. Skip only salt, pepper, water and spices without calories. If there is no recipe at all, return an empty "ingredients" list.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    title: { type: 'STRING' },
    titleOriginal: { type: 'STRING' },
    servings: { type: 'NUMBER' },
    minutes: { type: 'NUMBER' },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          said: { type: 'STRING' }, saidEn: { type: 'STRING' }, name: { type: 'STRING' }, brand: { type: 'STRING' }, product: { type: 'STRING' },
          de: { type: 'STRING' }, en: { type: 'STRING' }, optional: { type: 'BOOLEAN' }, grams: { type: 'NUMBER' },
          per100: {
            type: 'OBJECT',
            properties: { kcal: { type: 'NUMBER' }, protein: { type: 'NUMBER' }, carbs: { type: 'NUMBER' }, fat: { type: 'NUMBER' } },
            required: ['kcal', 'protein', 'carbs', 'fat'],
          },
        },
        required: ['said', 'name', 'de', 'en', 'grams', 'per100'],
      },
    },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    stepsOriginal: { type: 'ARRAY', items: { type: 'STRING' } },
    stated: {
      type: 'OBJECT',
      properties: { kcal: { type: 'NUMBER' }, protein: { type: 'NUMBER' }, carbs: { type: 'NUMBER' }, fat: { type: 'NUMBER' } },
    },
    statedFor: { type: 'STRING' },
    notes: { type: 'STRING' },
  },
  required: ['language', 'title', 'titleOriginal', 'servings', 'ingredients', 'steps', 'stepsOriginal'],
};

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(new Error(`Couldn’t read ${file.name}`));
  r.readAsDataURL(file);
});

/** Is this a link to a post? Returns the cleaned https URL or ''. */
export function cleanLink(s) {
  const m = String(s || '').match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return '';
  try {
    const u = new URL(m[0]);
    if (/instagram\.com$/i.test(u.hostname.replace(/^www\./, ''))) u.search = '';   // drop tracking (?igsh=…)
    return u.toString();
  } catch { return ''; }
}

/** Text that came with a share or paste, without the link itself. */
export const textWithoutLink = (s) => String(s || '').replace(/https?:\/\/[^\s<>"']+/gi, '').trim();

/**
 * Ask Gemini for the recipe. `files` are File objects (video or images).
 * Resolves the raw recipe JSON, or throws with a readable message.
 */
export async function readRecipe({ link, caption, files = [], onRetry }) {
  const key = geminiKey();
  if (!key) throw new Error('Connect Google Gemini first.');
  const size = files.reduce((n, f) => n + f.size, 0);
  if (size > MAX_MEDIA_BYTES) throw new Error('The video or pictures are too big (over 14 MB). Use a shorter clip or a few screenshots instead.');
  const parts = [{ text: `${PROMPT}\n\nLink to the post: ${link || '(none)'}\nCaption:\n${caption || '(no caption given)'}` }];
  for (const f of files) parts.push({ inlineData: { mimeType: f.type || 'application/octet-stream', data: await toBase64(f) } });

  return generateJson(key, parts, SCHEMA, { temperature: 0.2, onRetry });
}

const fold = (x) => String(x || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
const STOP = new Set(['green', 'grun', 'grune', 'grunes', 'gruner', 'fresh', 'frisch', 'frische', 'light', 'leicht', 'natur', 'plain', 'with', 'oder']);

/** Does the food's name share a real word with what Gemini called the ingredient? */
function relevant(p, it) {
  const hay = fold(`${p.name} ${p.brand || ''}`);
  const words = fold(`${it.de || ''} ${it.en || ''}`).split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  return words.some((w) => hay.includes(w) || hay.includes(w.slice(0, -1)));
}

/** The food's main German word is in the name: "Tomatenmark" is not "Tomate", "Frischkäse" not "Hüttenkäse". */
function sameFood(p, it) {
  const main = fold(it.de).split(/\s+/).find((w) => w.length > 2 && !STOP.has(w));
  if (!main) return true;
  return fold(`${p.name} ${p.brand || ''}`).replace(/\s+/g, '').includes(main);
}

/**
 * Turn Gemini's recipe into something to check: each ingredient gets matching foods
 * (your foods and basic foods first, Gemini's estimate last) like voice logging.
 */
export function toDraft(raw, products, { link, caption }) {
  const servings = Math.max(1, Math.min(20, Math.round(Number(raw.servings) || 1)));
  return {
    title: String(raw.title || 'Recipe').trim(),
    lang: String(raw.language || 'en').toLowerCase().slice(0, 2),
    original: { title: String(raw.titleOriginal || '').trim(), steps: (raw.stepsOriginal || []).map((s) => String(s).trim()).filter(Boolean) },
    servings,
    minutes: Math.max(0, Math.round(Number(raw.minutes) || 0)),
    steps: (raw.steps || []).map((s) => String(s).trim()).filter(Boolean),
    notes: String(raw.notes || '').trim(),
    link: link || '',
    caption: caption || '',
    stated: stated(raw.stated),
    statedFor: String(raw.statedFor || '').trim(),
    ingredients: (raw.ingredients || []).map((it) => {
      const brand = String(it.brand || '').trim();
      const product = brand ? String(it.product || '').trim() : '';
      // The name as the post writes it: kept as the ingredient's name and used for shop searches.
      const postName = String(it.name || '').trim() || (brand ? `${brand} ${product}`.trim() : '') || nameOf(it.said) || it.de || it.en || '';
      // A brand product: only your own foods of that brand count; the basic foods are a different food.
      const choices = brand ? matchFood(it, products).filter((p) => fold(p.brand).includes(fold(brand).trim())) : matchFood(it, products);
      if (it.per100 && it.per100.kcal >= 0) {
        choices.push({
          code: null, name: postName || it.de || it.en, brand: 'Estimated by Gemini', unit: 'g', estimate: true,
          per100: { kcal: +it.per100.kcal || 0, protein: +it.per100.protein || 0, carbs: +it.per100.carbs || 0, fat: +it.per100.fat || 0 },
        });
      }
      // A loose match (e.g. "green pesto" → green peas) is worse than Gemini's own estimate.
      const est = choices[choices.length - 1];
      if (est?.estimate && choices.length > 1 && !(relevant(choices[0], it) && sameFood(choices[0], it))) choices.unshift(choices.pop());
      const optional = !!it.optional;
      return {
        said: it.said || it.en || it.de, saidEn: it.saidEn || '', postName, brand, product, optional,
        grams: Math.max(0, Math.round(Number(it.grams) || 0)) || 100, choices,
        // Optional extras (a side of rice) start left out, like the post's own nutrition usually does.
        pick: choices.length && !optional ? 0 : -1,
      };
    }),
  };
}

/** "400g Hähnchenbrust" → "Hähnchenbrust", "Optional: 200g Skyr" → "Skyr". */
function nameOf(said) {
  return String(said || '').replace(/^\s*optional:?\s*/i, '')
    .replace(/^\s*(ca\.?\s*)?[\d.,/½¼¾-]+\s*(g|kg|ml|l|el|tl|stk\.?|stück|prise|tbsp|tsp|cups?|oz)?\.?\s+/i, '')
    .replace(/^\s*(etwas|eine?n?|some|a little)\s+/i, '').trim();
}

/** The post's own per-portion nutrition, or null when it gives none. */
function stated(x) {
  if (!x || !(+x.kcal > 0)) return null;
  return { kcal: +x.kcal || 0, protein: +x.protein || 0, carbs: +x.carbs || 0, fat: +x.fat || 0 };
}

/**
 * Compare our per-portion totals with the post's. Returns the macros that are clearly off
 * (over 15% and more than a few grams/kcal), e.g. [{ key: 'kcal', ours: 610, theirs: 483 }].
 */
export function statedGaps(ours, theirs) {
  if (!theirs) return [];
  const floor = { kcal: 40, protein: 5, carbs: 5, fat: 4 };
  return Object.keys(floor)
    .filter((k) => Math.abs(ours[k] - theirs[k]) > Math.max(floor[k], theirs[k] * 0.15))
    .map((k) => ({ key: k, ours: ours[k], theirs: theirs[k] }));
}

/** A brand product found on Open Food Facts: put it first for ingredient `it` and pick it. */
export function addBranded(it, found) {
  const fresh = found.filter((p) => !it.choices.some((c) => c.code === p.code));
  if (!fresh.length) return false;
  it.choices.unshift(...fresh);
  // Keep what the user chose by hand; otherwise use the real product.
  if (it.touched) { if (it.pick >= 0) it.pick += fresh.length; } else it.pick = it.optional ? -1 : 0;
  return true;
}

// ---------- My recipes ----------

export const getMyRecipes = () => db.getSetting(KEY, []);
export const myRecipeById = async (id) => (await getMyRecipes()).find((r) => r.id === id) || null;

/** Save a checked draft. Gemini estimates become your own foods so you can fix them later. */
export async function saveDraft(d) {
  const items = [];
  let n = 0;
  for (const it of d.ingredients) {
    let p = it.pick >= 0 ? it.choices[it.pick] : null;
    if (!p) continue;
    if (p.estimate) {
      p = {
        code: `custom-ai-${Date.now().toString(36)}${n++}`, name: p.name, brand: '', imageUrl: null, quantity: null,
        per100: { ...p.per100, sugars: null, fiber: null, saturatedFat: null, salt: null },
        unit: 'g', source: 'ai', fetchedAt: new Date().toISOString(),
      };
      await db.putProduct(p);
    } else if (!(await db.getProduct(p.code))) {
      await db.putProduct(p);
    }
    // Stored per portion, like the built-in recipes.
    const postName = it.postName || '';
    items.push({
      code: p.code, name: p.name, brand: p.brand || '', unit: p.unit || 'g', grams: it.grams / d.servings, per100: { ...p.per100 }, said: it.said, saidEn: it.saidEn,
      ...(postName ? { postName, shopName: postName, targetPer100: { ...p.per100 } } : {}),
    });
  }
  const recipe = {
    id: `my-${Date.now().toString(36)}`, name: d.title, servings: d.servings, minutes: d.minutes,
    link: d.link, steps: d.steps, notes: d.notes, items,
    ...(isTranslated(d) ? { lang: d.lang, original: d.original } : {}), createdAt: new Date().toISOString(),
  };
  await db.setSetting(KEY, [recipe, ...(await getMyRecipes())]);
  return recipe;
}

/** Use a shop's product (from stores.js) for ingredient n, and keep it under Your foods. */
export async function useProduct(r, n, p) {
  const product = {
    code: p.code, name: p.name, brand: p.brand || '', imageUrl: p.imageUrl || null, quantity: p.quantity || null,
    per100: { ...p.per100 }, unit: p.unit || 'g', source: 'off', fetchedAt: new Date().toISOString(),
  };
  if (!(await db.getProduct(p.code))) await db.putProduct(product);
  const old = r.items[n];
  // shopName keeps searching for the plain food ("Hähnchenbrust"), not the brand product's long name.
  r.items[n] = { ...old, code: p.code, name: p.name, brand: p.brand || '', unit: product.unit, per100: product.per100, shopName: old.shopName || old.name, targetPer100: old.targetPer100 || old.per100 };
  await db.setSetting(KEY, (await getMyRecipes()).map((x) => (x.id === r.id ? r : x)));
}

export async function deleteMyRecipe(id) {
  await db.setSetting(KEY, (await getMyRecipes()).filter((r) => r.id !== id));
}

/** One portion's calories and macros. */
export function myRecipeTotals(r) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const i of r.items) for (const k in t) t[k] += (i.per100[k] || 0) * i.grams / 100;
  return t;
}

/** Diary-ready items for `portions` portions. */
export const myRecipeItems = (r, portions = 1) => r.items.map(({ said, saidEn, postName, ...i }) => ({ ...i, per100: { ...i.per100 }, grams: i.grams * portions }));

// ---------- Translation ----------

/** True when the post wasn't in English and Gemini gave the original text too. */
export const isTranslated = (r) => !!(r.lang && r.lang !== 'en' && r.original && (r.original.title || r.original.steps?.length));

/** The language's own name, e.g. "Deutsch" for "de". */
export function languageName(code) {
  try { return new Intl.DisplayNames([code], { type: 'language' }).of(code).replace(/^./, (c) => c.toUpperCase()); } catch { return code; }
}

/** Title, steps and ingredient texts in English or in the post's language. */
export function texts(r, showOriginal) {
  const orig = showOriginal && isTranslated(r);
  const list = r.items || r.ingredients || [];
  return {
    title: (orig && r.original.title) || r.title || r.name,
    steps: orig && r.original.steps.length ? r.original.steps : r.steps,
    said: list.map((i) => (orig ? i.said : (i.saidEn || i.said)) || ''),
  };
}

/** "instagram.com" etc., for the source link. */
export function sourceName(link) {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return 'the original post'; }
}
