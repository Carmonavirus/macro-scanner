// Custom colours. Stored in settings (so cloud backup keeps them) and mirrored as
// ready-made CSS in localStorage, which a tiny script in index.html applies before
// the first paint so the app never flashes the default colours.

import * as db from './db.js';

export const DEFAULTS = {
  accent: '#ab2200',
  secondary: '#5b5b5b',
  goal: '#22c55e',
  protein: '#1d4ed8',
  carbs: '#a16207',
  fat: '#7e22ce',
};

const CSS_KEY = 'themeCss';

// Readable text (black or white) on top of a colour.
function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? '#111111' : '#ffffff';
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Build the CSS for a theme. Only colours that differ from the defaults are overridden. */
export function themeCss(theme = {}) {
  const t = Object.fromEntries(Object.entries(theme).filter(([k, v]) => k in DEFAULTS && isHex(v) && v.toLowerCase() !== DEFAULTS[k]));
  if (!Object.keys(t).length) return '';
  const light = [], dark = [];
  // In dark mode colours are lifted a little towards white so they stay readable on the dark background.
  const lift = (v, pct) => `color-mix(in srgb, ${v} ${pct}%, #ffffff)`;
  if (t.accent) {
    light.push(`--accent:${t.accent}`, `--accent-text:${inkOn(t.accent)}`);
    dark.push(`--accent:${lift(t.accent, 80)}`, `--accent-text:${inkOn(t.accent)}`);
  }
  if (t.secondary) {
    light.push(`--muted:${t.secondary}`, `--kcal:${t.secondary}`);
    dark.push(`--muted:${lift(t.secondary, 60)}`, `--kcal:${lift(t.secondary, 60)}`);
  }
  if (t.goal) {
    light.push(`--goal:color-mix(in srgb, ${t.goal} 22%, #ffffff)`, `--goal-line:color-mix(in srgb, ${t.goal} 60%, #ffffff)`, `--goal-ink:color-mix(in srgb, ${t.goal} 55%, #000000)`);
    dark.push(`--goal:color-mix(in srgb, ${t.goal} 25%, #1c1c1c)`, `--goal-line:color-mix(in srgb, ${t.goal} 55%, #1c1c1c)`, `--goal-ink:color-mix(in srgb, ${t.goal} 60%, #ffffff)`);
  }
  for (const k of ['protein', 'carbs', 'fat']) {
    if (t[k]) { light.push(`--${k}:${t[k]}`); dark.push(`--${k}:${lift(t[k], 80)}`); }
  }
  return `:root{${light.join(';')}}@media (prefers-color-scheme: dark){:root{${dark.join(';')}}}`;
}

/** Put a theme on the page right now (also used for the live preview). */
export function applyTheme(theme) {
  const css = themeCss(theme);
  let el = document.getElementById('theme-custom');
  if (!el) {
    el = document.createElement('style');
    el.id = 'theme-custom';
    document.head.appendChild(el);
  }
  el.textContent = css;
  return css;
}

export const getTheme = () => db.getSetting('theme', {});

export async function saveTheme(theme) {
  await db.setSetting('theme', theme);
  const css = applyTheme(theme);
  try { css ? localStorage.setItem(CSS_KEY, css) : localStorage.removeItem(CSS_KEY); } catch { /* ignore */ }
}

/** On start-up and after a restore: make the page match what's saved. */
export async function syncThemeFromDb() {
  const theme = await getTheme();
  const css = applyTheme(theme);
  try { css ? localStorage.setItem(CSS_KEY, css) : localStorage.removeItem(CSS_KEY); } catch { /* ignore */ }
}
