// Voice logging: speech → text (the phone's own speech recognition, via Chrome) → foods and
// amounts (Google Gemini with the user's own free API key, or a simple parser as fallback)
// → matched against the user's foods and the basic foods list.
//
// The Gemini key lives in localStorage on this phone only (never in backups or the gist).

import { searchGeneric, genericProduct } from './generic.js';
import { generateJson, checkKey } from './gemini.js';

const KEY = 'gemini';            // localStorage: { key }
const LANG_KEY = 'voiceLang';    // localStorage: 'de-DE' | 'en-US'
export const KEY_URL = 'https://aistudio.google.com/apikey';

export function geminiKey() { try { return JSON.parse(localStorage.getItem(KEY))?.key || ''; } catch { return ''; } }
export function setGeminiKey(key) {
  try { if (key) localStorage.setItem(KEY, JSON.stringify({ key })); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function voiceLang() { try { return localStorage.getItem(LANG_KEY) || 'de-DE'; } catch { return 'de-DE'; } }
export function setVoiceLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ } }

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const speechSupported = () => !!Recognition;

/**
 * Listen until stop() is called. onText(fullText, isFinal) gets the transcript so far.
 * Returns { stop }. Chrome stops by itself after a pause, so it restarts until stopped.
 */
export function listen({ lang, onText, onEnd, onError }) {
  const rec = new Recognition();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  let done = '';
  let stopped = false;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) done += `${r[0].transcript.trim()} `;
      else interim += r[0].transcript;
    }
    onText((done + interim).trim(), !interim);
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    stopped = true;
    onError?.(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in Chrome’s site settings.' : `Speech recognition error: ${e.error}`);
  };
  rec.onend = () => {
    if (!stopped) { try { rec.start(); return; } catch { /* fall through */ } }
    onEnd?.(done.trim());
  };
  rec.start();
  return { stop: () => { stopped = true; rec.stop(); } };
}

// ---------- Text → items ----------

const PROMPT = `You turn a spoken food log into JSON. The speaker lists foods they ate, usually with amounts, in German or English.
Return every food as an object:
- "said": the food as the speaker said it
- "de": a short German name for the food, as you'd find it in a German food database (e.g. "Putenhackfleisch", "Reis gekocht", "Haferflocken")
- "en": a short English name
- "grams": the amount in grams (or ml for drinks). Convert pieces, spoons, cups, slices etc. to a typical weight. If no amount is said, use a typical portion.
- "per100": your best estimate of kcal, protein, carbs (without fibre) and fat per 100 g of the food as eaten
Only list foods. Ignore filler words. Text:
`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          said: { type: 'STRING' }, de: { type: 'STRING' }, en: { type: 'STRING' }, grams: { type: 'NUMBER' },
          per100: {
            type: 'OBJECT',
            properties: { kcal: { type: 'NUMBER' }, protein: { type: 'NUMBER' }, carbs: { type: 'NUMBER' }, fat: { type: 'NUMBER' } },
            required: ['kcal', 'protein', 'carbs', 'fat'],
          },
        },
        required: ['said', 'de', 'en', 'grams', 'per100'],
      },
    },
  },
  required: ['items'],
};

async function callGemini(text, key) {
  return (await generateJson(key, [{ text: PROMPT + text }], SCHEMA)).items || [];
}

/** Check a key. Throws with a readable message when Google doesn't accept it; a busy Gemini is fine. */
export async function testKey(key) {
  await checkKey(key);
}

const NUM_WORDS = {
  ein: 1, eine: 1, einen: 1, einem: 1, one: 1, a: 1, an: 1, zwei: 2, two: 2, drei: 3, three: 3, vier: 4, four: 4,
  fünf: 5, fuenf: 5, five: 5, sechs: 6, six: 6, halb: 0.5, halbe: 0.5, halben: 0.5, half: 0.5,
};

/**
 * Simple fallback without AI: "200 g Hähnchenbrust, 80 Gramm Reis und ein Apfel".
 * Returns [{ said, de, en, grams, per100: null }].
 */
export function parseSimple(text) {
  return text
    .replace(/(\d),(\d)/g, '$1.$2')
    .split(/,|;|\n|\bund\b|\band\b|\bmit\b|\bwith\b|\bplus\b|\bdann\b|\bthen\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      let grams = null;
      let count = null;
      let rest = s;
      const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|kilo\w*|g\b|gr\b|gramm\w*|grams?|ml|milliliter\w*|l\b|liter\w*)?/i);
      if (m) {
        const n = parseFloat(m[1]);
        const u = (m[2] || '').toLowerCase();
        rest = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
        if (u) grams = /^(k|l\b|liter)/.test(u) ? n * 1000 : n;
        else if (n >= 10) grams = n;          // "200 Reis": grams
        else count = n;                       // "2 Eier": pieces
      } else {
        const [w, ...more] = s.split(/\s+/);
        if (NUM_WORDS[w.toLowerCase()]) { count = NUM_WORDS[w.toLowerCase()]; rest = more.join(' '); }
      }
      return { said: s, de: clean(rest), en: '', grams, count, per100: null };
    })
    .filter((it) => it.de);
}

const clean = (s) => s.replace(/\s+/g, ' ').trim().replace(/^(von|vom|of|an|a|ich hatte|ich habe|i had)\s+/i, '').replace(/[.!?]+$/, '').trim();

/**
 * Text → items to review: [{ said, grams, choices: [product...], pick: index, estimate }].
 * `estimate` is the AI's own guess, used when nothing in the lists matches.
 */
export async function understand(text, products) {
  const key = geminiKey();
  let items;
  let usedAi = false;
  let aiError = null;
  if (key) {
    try { items = await callGemini(text, key); usedAi = true; } catch (err) { aiError = err.message; }
  }
  if (!items) items = parseSimple(text);
  return {
    usedAi, aiError,
    items: items.map((it) => {
      const choices = matchFood(it, products);
      const first = choices[0];
      let grams = Number(it.grams) > 0 ? Math.round(Number(it.grams)) : null;
      if (!grams && first) grams = Math.round((first.servingGrams || 100) * (it.count || 1));
      const estimate = it.per100 && it.per100.kcal >= 0 ? {
        code: null, name: it.de || it.said, brand: 'Estimated by Gemini', unit: 'g',
        per100: { kcal: +it.per100.kcal || 0, protein: +it.per100.protein || 0, carbs: +it.per100.carbs || 0, fat: +it.per100.fat || 0 },
        estimate: true,
      } : null;
      if (estimate) choices.push(estimate);
      return { said: it.said, grams: grams || 100, choices, pick: choices.length ? 0 : -1 };
    }),
  };
}

const fold = (s) => (s || '').toLowerCase()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');

/** Best matches for a spoken food: the user's own foods first, then basic foods. */
export function matchFood(it, products) {
  const names = [it.de, it.en, it.said].filter(Boolean).map(fold);
  const out = [];
  const seen = new Set();
  const add = (p) => { if (p && !seen.has(p.code)) { seen.add(p.code); out.push(p); } };
  for (const n of names) {
    const words = n.split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) continue;
    for (const p of products) {
      if (!p.per100 || !(p.per100.kcal >= 0)) continue;
      const hay = fold(`${p.name} ${p.brand || ''}`);
      const joined = hay.replace(/\s+/g, '');
      if (words.every((w) => hay.includes(w) || joined.includes(w))) add(p);
    }
  }
  for (const n of names) for (const g of searchGeneric(n, 3)) add(genericProduct(g.code));
  if (!out.length) {
    // Try word by word ("Putenhackfleisch gebraten" → "Putenhackfleisch").
    for (const n of names) for (const w of n.split(/\s+/).filter((x) => x.length > 3)) for (const g of searchGeneric(w, 2)) add(genericProduct(g.code));
  }
  return out.slice(0, 4);
}
