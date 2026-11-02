// "More": install on home screen, backup / restore, about.

import * as db from '../db.js';
import { $, esc, toast } from '../ui.js';
import { today } from '../dates.js';

// ---------- Install (Add to Home screen) ----------
let deferredPrompt = null;
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.dispatchEvent(new Event('installable'));
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  document.querySelectorAll('.install-banner').forEach((b) => b.remove());
  toast('Installed. Open it from your home screen.');
});

let bannerDismissed = (() => { try { return localStorage.getItem('installDismissed') === '1'; } catch { return false; } })();

/** Small banner on the diary when the app can be installed. */
export function installBanner() {
  if (isInstalled() || !deferredPrompt || bannerDismissed) return '';
  return `<div class="install-banner card">
    <span>📲 Put Macro Scanner on your home screen</span>
    <span class="row"><button class="btn primary small" data-install>Install</button>
    <button class="btn small ghost" data-install-dismiss aria-label="Not now">✕</button></span>
  </div>`;
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-install]')) {
    if (!deferredPrompt) return toast('Use Chrome’s ⋮ menu → “Add to Home screen”.');
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
  }
  if (e.target.closest('[data-install-dismiss]')) {
    bannerDismissed = true;
    try { localStorage.setItem('installDismissed', '1'); } catch { /* ignore */ }
    e.target.closest('.install-banner')?.remove();
  }
});

export function renderMore(el) {
  el.innerHTML = `
    <section class="card">
      <h2 class="card-title">Home screen</h2>
      ${isInstalled()
        ? '<p>✅ You’re using the installed app.</p>'
        : `<p>Install Macro Scanner so it opens from your home screen like a normal app, full screen and offline.</p>
           ${deferredPrompt ? '<button class="btn primary" data-install>📲 Install app</button>' : `
           <ol class="steps">
             <li>Open this page in <strong>Chrome</strong> on your phone.</li>
             <li>Tap the <strong>⋮</strong> menu in the top right.</li>
             <li>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>), then <strong>Install</strong>.</li>
           </ol>`}`}
    </section>

    <section class="card">
      <h2 class="card-title">Backup</h2>
      <p class="muted">Your diary lives only on this phone. Save a backup file now and then, and use it to move to a new phone.</p>
      <div class="actions">
        <button class="btn" id="btn-export">⬇️ Save backup</button>
        <label class="btn">⬆️ Restore backup<input type="file" id="file-import" accept="application/json,.json" hidden></label>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">About</h2>
      <p class="muted small">Product data © <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> contributors (ODbL).
      Barcode reading by ZXing (MIT). No account, no tracking. Everything stays on this phone.</p>
    </section>
  `;

  $('#btn-export', el).addEventListener('click', async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `macro-scanner-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  $('#file-import', el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await db.importAll(JSON.parse(await file.text()));
      toast('Backup restored');
    } catch (err) {
      toast(esc(err.message || 'Could not read that file.'));
    }
  });
}

document.addEventListener('installable', () => {
  // Refresh visible screens that show install UI
  if (location.hash === '' || location.hash.startsWith('#/day') || location.hash === '#/' || location.hash.startsWith('#/more')) {
    window.dispatchEvent(new Event('rerender'));
  }
});
