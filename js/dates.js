// Date helpers. Dates are local calendar days as 'YYYY-MM-DD' strings.

const pad = (n) => String(n).padStart(2, '0');

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => toKey(new Date());

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function isValidKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key || '') && toKey(fromKey(key)) === key;
}

/** Monday of the week containing `key` (ISO weeks, as used in Germany). */
export function weekStart(key) {
  const d = fromKey(key);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return toKey(d);
}

export function isoWeek(key) {
  const d = fromKey(key);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

export function monthStart(key) { return `${key.slice(0, 7)}-01`; }

export function monthEnd(key) {
  const d = fromKey(monthStart(key));
  d.setMonth(d.getMonth() + 1, 0);
  return toKey(d);
}

export function addMonths(key, n) {
  const d = fromKey(monthStart(key));
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

export function range(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

const LOCALE = undefined; // follow the phone's language for date names

export function dayLabel(key) {
  const t = today();
  if (key === t) return 'Today';
  if (key === addDays(t, -1)) return 'Yesterday';
  if (key === addDays(t, 1)) return 'Tomorrow';
  return fromKey(key).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' });
}

export const shortDay = (key) => fromKey(key).toLocaleDateString(LOCALE, { weekday: 'short' });
export const dayNum = (key) => String(fromKey(key).getDate());
export const longDate = (key) => fromKey(key).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
export const monthLabel = (key) => fromKey(key).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
export const shortDate = (key) => fromKey(key).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
