// "More": install on home screen, backup / restore, about.

import * as db from '../db.js';
import { $, esc, toast } from '../ui.js';
import { today } from '../dates.js';
import * as sync from '../sync.js';
import { icon } from '../icons.js';

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
    <span class="with-ic">${icon('smartphone')} Put Macro Scanner on your home screen</span>
    <span class="row"><button class="btn primary small" data-install>Install</button>
    <button class="btn small ghost icon" data-install-dismiss aria-label="Not now">${icon('x')}</button></span>
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
        ? `<p class="with-ic">${icon('circle-check', { cls: 'ok' })} You’re using the installed app.</p>`
        : `<p>Install Macro Scanner so it opens from your home screen like a normal app, full screen and offline.</p>
           ${deferredPrompt ? `<button class="btn primary with-ic" data-install>${icon('smartphone')} Install app</button>` : `
           <ol class="steps">
             <li>Open this page in <strong>Chrome</strong> on your phone.</li>
             <li>Tap the <strong>⋮</strong> menu in the top right.</li>
             <li>Tap <strong>Install app</strong> (on some phones: <strong>Add to Home screen</strong>), then confirm.</li>
           </ol>`}`}
    </section>

    <section class="card">
      <h2 class="card-title">Daily goals</h2>
      <p class="muted">Calories, protein, carbs and fat to aim for each day.</p>
      <a class="btn" href="#/goals">Set daily goals</a>
    </section>

    <section class="card" id="cloud"></section>

    <section class="card">
      <h2 class="card-title">Backup file</h2>
      <p class="muted">Save a copy of everything as a file, or restore one. Handy if you ever stop using cloud backup.</p>
      <div class="actions">
        <button class="btn with-ic" id="btn-export">${icon('download')} Save backup file</button>
        <label class="btn with-ic">${icon('upload')} Restore from file<input type="file" id="file-import" accept="application/json,.json" hidden></label>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">About</h2>
      <p class="muted small">Product data © <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> contributors (ODbL).
      Barcode reading by ZXing (MIT). No account, no tracking. Your data stays on this phone, plus your own GitHub account if cloud backup is on.</p>
    </section>
  `;

  renderCloud($('#cloud', el));

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
      const c = await db.counts();
      toast(`Backup restored: ${c.entries} diary entries`);
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

// ---------- Cloud backup card ----------

window.addEventListener('syncstatus', () => {
  const card = document.getElementById('cloud');
  if (card && !card.contains(document.activeElement)) renderCloud(card);
});

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Macro%20Scanner%20backup';

function ago(iso) {
  if (!iso) return 'not yet';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString();
}

async function renderCloud(card) {
  const cfg = sync.config();
  const persisted = await sync.isPersisted();
  if (!cfg) {
    card.innerHTML = `
      <h2 class="card-title with-ic">${icon('cloud-upload')} Automatic cloud backup</h2>
      <p>Your diary is saved on this phone. Turn this on to also back it up to your free GitHub account automatically after every change, so nothing is lost if you lose or reset your phone.</p>
      <ol class="steps">
        <li><a href="${TOKEN_URL}" target="_blank" rel="noopener">Open this GitHub page</a> and sign in.</li>
        <li>Under <strong>Expiration</strong> pick <strong>No expiration</strong>. Leave <strong>gist</strong> ticked.</li>
        <li>Tap <strong>Generate token</strong> at the bottom, then copy the token (starts with <code>ghp_</code>).</li>
        <li>Paste it here:</li>
      </ol>
      <form id="form-token" class="manual-code" autocomplete="off">
        <input id="token" type="password" placeholder="ghp_…" aria-label="GitHub token" autocapitalize="off" spellcheck="false">
        <button class="btn primary" type="submit">Connect</button>
      </form>
      <p class="status error" id="cloud-error"></p>
      <p class="muted small">The token only allows access to your Gists and stays on this phone. On a new phone, do the same steps and your diary comes back.</p>`;
    $('#form-token', card).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Connecting…';
      try {
        const { restored } = await sync.connect($('#token', card).value);
        toast(restored ? 'Connected. Your diary was restored from the cloud.' : 'Connected. Backup is on.');
        renderCloud(card);
      } catch (err) {
        $('#cloud-error', card).textContent = err instanceof TypeError ? 'No internet connection. Try again when you’re online.' : err.message;
        btn.disabled = false; btn.textContent = 'Connect';
      }
    });
    return;
  }
  const state = cfg.error === 'offline'
    ? `${icon('wifi-off')} Waiting for internet. It will back up when you’re online.`
    : cfg.error ? `${icon('triangle-alert', { cls: 'warn' })} Last backup failed: ${esc(cfg.error)}`
      : `${icon('circle-check', { cls: 'ok' })} Backed up ${esc(ago(cfg.lastSync))}`;
  card.innerHTML = `
    <h2 class="card-title with-ic">${icon('cloud-upload')} Automatic cloud backup</h2>
    <p class="with-ic">${state}</p>
    <p class="muted small">On, to GitHub account <strong>${esc(cfg.login)}</strong>. Every change is backed up automatically.${persisted ? ' This phone is also told never to clear the app’s data.' : ''}</p>
    <div class="actions">
      <button class="btn" id="btn-sync">Back up now</button>
      <button class="btn" id="btn-restore">Restore from cloud</button>
      <button class="btn ghost danger" id="btn-disconnect">Turn off</button>
    </div>`;
  $('#btn-sync', card).addEventListener('click', async () => { await sync.backupNow(); renderCloud(card); });
  $('#btn-restore', card).addEventListener('click', async () => {
    try { await sync.restoreNow(); const c = await db.counts(); toast(`Restored: ${c.entries} diary entries`); } catch (err) { toast(err.message); }
  });
  $('#btn-disconnect', card).addEventListener('click', () => {
    if (!confirm('Turn off cloud backup on this phone? Your backup stays in your GitHub account.')) return;
    sync.disconnect();
    renderCloud(card);
  });
}

/** Diary hint while cloud backup is off. */
let backupHintDismissed = (() => { try { return localStorage.getItem('backupHintDismissed') === '1'; } catch { return false; } })();
export function backupBanner() {
  if (sync.isConnected() || backupHintDismissed) return '';
  return `<div class="install-banner card backup-banner">
    <span class="with-ic">${icon('cloud-upload')} <span>Your diary is only on this phone. <a href="#/more">Turn on cloud backup</a></span></span>
    <button class="btn small ghost icon" data-backup-dismiss aria-label="Not now">${icon('x')}</button>
  </div>`;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-backup-dismiss]')) return;
  backupHintDismissed = true;
  try { localStorage.setItem('backupHintDismissed', '1'); } catch { /* ignore */ }
  e.target.closest('.backup-banner')?.remove();
});
