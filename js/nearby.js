// Nearest restaurants of the chains in chains.js, from OpenStreetMap (free, via the Overpass API).
// The phone's location only goes to the Overpass server, for this one search.

const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// Chain id → how OpenStreetMap names it (brand or name tag).
const MATCH = [
  ['mcd', /mc\s?donald/i],
  ['bk', /burger\s?king/i],
  ['kfc', /\bkfc\b|kentucky fried/i],
  ['subway', /^subway\b/i],
  ['dd', /dean\s?(&|and|und)\s?david/i],
];
const NAMES = "McDonald|Burger King|KFC|Kentucky Fried|Subway|dean ?(&|and|und) ?david";

export function chainOf(tags) {
  const s = `${tags.brand || ''} ${tags.name || ''}`.trim();
  for (const [id, re] of MATCH) if (re.test(tags.brand || '') || re.test(tags.name || '') || re.test(s)) return id;
  return null;
}

/** Ask the phone where it is. Resolves { lat, lon } or rejects with a readable message. */
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This browser can’t share your location.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1
        ? 'Location access is blocked. Allow it for this app in Chrome’s site settings, then try again.'
        : 'Couldn’t find your location. Check that location is on, then try again.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}

/** Distance in metres between two points. */
export function distance(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function query(q) {
  let lastErr;
  for (const url of SERVERS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }) });
      if (!res.ok) { lastErr = new Error(`Map server answered ${res.status}`); continue; }
      return (await res.json()).elements || [];
    } catch (err) { lastErr = err; }
  }
  throw new Error(lastErr?.message?.includes('Map server') ? `${lastErr.message}. Try again in a minute.` : 'Couldn’t reach the map server. Check your internet connection.');
}

/**
 * Restaurants of the listed chains near `here`, nearest first:
 * [{ chain, name, lat, lon, dist, address, hours }]. Searches 3 km, then 15 km if nothing is close.
 */
export async function nearby(here) {
  for (const radius of [3000, 15000]) {
    const q = `[out:json][timeout:25];
      (nwr["amenity"~"^(fast_food|restaurant|cafe|food_court)$"]["brand"~"${NAMES}",i](around:${radius},${here.lat},${here.lon});
       nwr["amenity"~"^(fast_food|restaurant|cafe|food_court)$"]["name"~"${NAMES}",i](around:${radius},${here.lat},${here.lon}););
      out center tags;`;
    const seen = new Set();
    const out = [];
    for (const e of await query(q)) {
      const key = `${e.type}${e.id}`;
      const tags = e.tags || {};
      const chain = chainOf(tags);
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (!chain || lat == null || seen.has(key)) continue;
      seen.add(key);
      const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
      out.push({
        chain, name: tags.name || tags.brand, lat, lon, dist: distance(here, { lat, lon }),
        address: [street, tags['addr:city']].filter(Boolean).join(', '), hours: tags.opening_hours || '',
      });
    }
    if (out.length) return out.sort((a, b) => a.dist - b.dist);
  }
  return [];
}

/** The nearest few: the closest of every chain first, then more by distance, at most `limit`. */
export function pickNearest(list, limit = 6) {
  const firsts = [];
  const seen = new Set();
  for (const r of list) if (!seen.has(r.chain)) { seen.add(r.chain); firsts.push(r); }
  const rest = list.filter((r) => !firsts.includes(r));
  return [...firsts, ...rest].slice(0, limit).sort((a, b) => a.dist - b.dist);
}

export const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`);
export const directionsUrl = (r) => `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}`;
