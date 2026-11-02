// App shell: routing between screens.
//
// #/  or  #/day/<date>             diary for a day
// #/add/<date>/<meal>              add food (scan / search / recent)
// #/p/<code>?d=<date>&m=<meal>     product + amount → add to meal
// #/edit/<code|new>?d=&m=&why=     enter nutrition values by hand
// #/entry/<id>                     change or remove a diary entry
// #/reports/<day|week|month>/<date>
// #/goals                          daily kcal / macro goals
// #/supplements                    edit the supplement list
// #/more                           install, backup, about

import { $, $$, parseHash, setNavigateHandler, go, depth, nav } from './ui.js';
import { renderDiary } from './views/diary.js';
import { renderAdd, renderProduct, renderEdit, renderEntry, stopCamera } from './views/food.js';
import { renderReports } from './views/reports.js';
import { renderMore } from './views/more.js';
import { renderGoals } from './views/goals.js';
import { renderSupplements } from './views/supplements.js';
import { icon } from './icons.js';
import { startAutoSync, requestPersistence } from './sync.js';

// Static icons in the shell
$$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

// Keep the sticky day total just below the header
const topbar = $('.topbar');
const setTopbarH = () => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
new ResizeObserver(setTopbarH).observe(topbar);
setTopbarH();

const view = $('#view');
const title = $('#title');
const back = $('#btn-back');

const ROUTES = {
  '': { tab: 'diary', title: 'Diary', root: true, render: () => renderDiary(view) },
  day: { tab: 'diary', title: 'Diary', root: true, render: ([d]) => renderDiary(view, d) },
  add: { tab: 'diary', title: 'Add food', render: ([d, m]) => renderAdd(view, d, m) },
  p: { tab: 'diary', title: 'Food', render: ([code], q) => renderProduct(view, code, q) },
  edit: { tab: 'diary', title: 'Nutrition values', render: ([code], q) => renderEdit(view, code, q) },
  entry: { tab: 'diary', title: 'Edit entry', render: ([id]) => renderEntry(view, id) },
  reports: { tab: 'reports', title: 'Reports', root: true, render: ([p, d]) => renderReports(view, p, d) },
  more: { tab: 'more', title: 'More', root: true, render: () => renderMore(view) },
  goals: { tab: 'diary', title: 'Daily goals', render: () => renderGoals(view) },
  supplements: { tab: 'diary', title: 'My supplements', render: () => renderSupplements(view) },
};

let renderSeq = 0;
async function route() {
  stopCamera();
  const { parts, query } = parseHash();
  const [name = '', ...args] = parts;
  const r = ROUTES[name] || ROUTES[''];
  if (r.tab === 'diary' && r.root) nav.diaryDepth = depth();
  title.textContent = r.title;
  back.hidden = !!r.root;
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === r.tab));
  const seq = ++renderSeq;
  view.classList.add('loading');
  try {
    await r.render(args, query);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<p class="status error">Something went wrong: ${String(err.message).replace(/</g, '&lt;')}</p>`;
  }
  if (seq === renderSeq) view.classList.remove('loading');
  window.__booted = true;
  const bootError = document.getElementById('boot-error');
  if (bootError) bootError.hidden = true;
  window.scrollTo(0, 0);
}

setNavigateHandler(route);
window.addEventListener('popstate', route);
window.addEventListener('rerender', route);

// In-app links push history entries through go(), so depth tracking stays right.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const isTab = a.closest('#tabbar');
  go(a.getAttribute('href'), { replace: !!isTab && back.hidden });
});

back.addEventListener('click', () => (depth() > 0 ? history.back() : go('#/', { replace: true })));

if (!history.state) history.replaceState({ depth: 0 }, '', location.hash || '#/');
route();

requestPersistence();
startAutoSync();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
