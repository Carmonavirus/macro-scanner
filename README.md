# Macro Scanner

A free, installable web app (PWA) for Android that scans barcodes on food products
(built with German products in mind), logs them into meals and shows calories,
protein, carbs and fat per meal, day, week and month.

Live: https://carmonavirus.github.io/macro-scanner/

- **Scanning:** Chrome's built-in barcode reader on Android, with a bundled ZXing
  WebAssembly reader as fallback (`vendor/`, MIT licensed). Reads EAN-13, EAN-8, UPC.
- **Data:** [Open Food Facts](https://world.openfoodfacts.org) API, free, no key.
  Each product is fetched once and cached on the phone.
- **Missing data:** if a product is unknown or has no macros, you type the values
  from the pack and they're remembered.
- **Privacy:** everything is stored in the browser's IndexedDB on the phone.
  No account, no server. Optional automatic backup goes to a secret Gist in the
  user's own GitHub account.

## Files

| File | What it does |
|---|---|
| `index.html`, `css/app.css` | App shell, styles |
| `js/app.js` | Routing between screens |
| `js/ui.js`, `js/dates.js` | Shared helpers (navigation, tiles, dates) |
| `js/views/diary.js` | Daily diary with meals and totals |
| `js/views/food.js` | Add food: scan, search, amount, manual entry, edit entry |
| `js/views/reports.js` | Day / week / month reports |
| `js/views/more.js` | Install to home screen, cloud backup setup, backup file |
| `js/sync.js` | Automatic backup to a secret GitHub Gist (token with `gist` scope, kept on the phone) |
| `js/scanner.js` | Camera + barcode detection |
| `js/off.js` | Open Food Facts lookup, maps to the app's product format |
| `js/nutrition.js` | Product format, macro maths, barcode validation |
| `js/db.js` | IndexedDB storage: products, scans, diary log, meals per day |
| `sw.js` | Offline cache of the app files. Bump `VERSION` on each release. |

## Run locally

Any static server works, e.g. `python3 -m http.server 8000`, then open
`http://localhost:8000`. The camera needs HTTPS (or localhost).

## Host for free on GitHub Pages

Push these files to the root of a GitHub repo, then Settings → Pages →
"Deploy from a branch" → `main` / `(root)`. The app will be at
`https://<user>.github.io/<repo>/`. On the phone, open it in Chrome and choose
"Add to Home screen" / "Install app".
