// Google Gemini with the user's own free key: one place for every call (voice logging,
// recipes from posts). Busy models are retried, then the next free model is tried.

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// Stable models first (the "-latest" names point at the newest model, which is often overloaded on
// free keys). The lite models have their own limits, so they often work when the others are busy.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
const BUSY = new Set([429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class GeminiError extends Error {
  constructor(message, { busy = false, badKey = false } = {}) { super(message); this.busy = busy; this.badKey = badKey; }
}

async function errorText(res) {
  try { return (await res.json())?.error?.message || ''; } catch { return ''; }
}

/** Gemini's JSON text, also when it comes wrapped in ```json fences or with text around it. */
export function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* try the outermost object */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* unreadable */ } }
  return undefined;
}

// Why an answer had no readable JSON, in words.
const WHY = {
  MAX_TOKENS: 'the answer got cut off',
  SAFETY: 'Google’s safety filter blocked it',
  RECITATION: 'Google blocked it for quoting the post too closely',
  PROHIBITED_CONTENT: 'Google blocked it',
  BLOCKLIST: 'Google blocked it',
};

const isBadKey = (status, msg) => (status === 400 || status === 401 || status === 403) && /api key|permission|unauthori[sz]ed|forbidden/i.test(msg);

/**
 * Generate JSON with a response schema. `parts` are Gemini content parts (text, inlineData).
 * Resolves the parsed JSON, or throws a GeminiError with a readable message.
 */
export async function generateJson(key, parts, schema, { temperature = 0.1, onRetry } = {}) {
  let busy = false;
  let unreadable = '';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetch(`${API}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            // A second try gets a little more variety, which gets it out of a loop that never ends.
            generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 16384, temperature: attempt ? Math.max(temperature, 0.5) : temperature },
          }),
        });
      } catch {
        throw new GeminiError('Couldn’t reach Google Gemini. Check your internet connection.');
      }
      if (res.ok) {
        let data = null;
        try { data = await res.json(); } catch { /* unreadable */ }
        const cand = data?.candidates?.[0];
        const out = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
        const json = parseJson(out);
        if (json !== undefined) return json;
        // Empty, cut off or blocked: try once more, then the next model.
        const reason = cand?.finishReason || data?.promptFeedback?.blockReason || '';
        unreadable = WHY[reason] || (out ? 'it wasn’t valid JSON' : 'it was empty');
        onRetry?.();
        continue;
      }
      if (res.status === 404) break;                     // model not offered to this key: next one
      const msg = await errorText(res);
      if (isBadKey(res.status, msg)) throw new GeminiError('The Gemini key isn’t valid. Check it under More.', { badKey: true });
      if (res.status === 413) throw new GeminiError('That’s too big for Gemini. Use a shorter video or a few screenshots.');
      if (!BUSY.has(res.status)) throw new GeminiError(msg || `Gemini answered ${res.status}`);
      busy = true;
      if (res.status === 429) break;                     // this model's free limit: try the next model now
      onRetry?.();
      if (attempt === 0) await wait(1500);
    }
  }
  if (unreadable) throw new GeminiError(`Gemini’s answer couldn’t be read (${unreadable}). Try again, or add the caption as text.`);
  throw new GeminiError(busy
    ? 'Google Gemini is very busy right now. Try again in a minute or two.'
    : 'No Gemini model is available for this key.', { busy });
}

/**
 * Check a key without using up the free limit: listing the models only needs a valid key,
 * so it works even when Gemini is too busy to answer. Throws GeminiError if the key is wrong.
 */
export async function checkKey(key) {
  let res;
  try {
    res = await fetch(`${API}?pageSize=1`, { headers: { 'x-goog-api-key': key } });
  } catch {
    throw new GeminiError('Couldn’t reach Google. Check your internet connection.');
  }
  if (res.ok) return true;
  const msg = await errorText(res);
  if (BUSY.has(res.status)) return true;                 // can't tell now; the key is probably fine
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiError('Google didn’t accept this key. Copy it again from Google AI Studio.', { badKey: true });
  throw new GeminiError(msg || `Google answered ${res.status}`);
}
