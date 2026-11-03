// Service worker: caches the app itself so it opens offline and loads instantly.
// Product data is cached separately in IndexedDB by the app. Bump VERSION on every release.
const VERSION = 'v36';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/scanner.js', 'js/off.js', 'js/db.js', 'js/nutrition.js', 'js/ui.js', 'js/dates.js', 'js/sync.js', 'js/icons.js',
  'js/views/diary.js', 'js/views/food.js', 'js/views/reports.js', 'js/views/more.js', 'js/views/goals.js', 'js/views/supplements.js', 'js/views/colours.js', 'js/theme.js', 'js/swipe.js', 'js/hevy.js', 'js/generic.js', 'js/views/hevy.js', 'js/views/shopping.js', 'js/recipes.js', 'js/views/recipes.js', 'js/steps.js', 'js/chains.js', 'js/views/eatout.js', 'js/voice.js', 'js/views/voice.js', 'js/nearby.js',
  'vendor/barcode-detector-ponyfill.js', 'vendor/zxing_reader.wasm',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never mixes in old files.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API + images go to network
  // Network first for the app files (so updates show up), cache as offline fallback.
  e.respondWith(
    // 'no-cache' revalidates with the server every time (cheap 304s), so files from two
    // different releases are never mixed, which would break the app's module imports.
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
