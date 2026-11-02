// App shell: routing between screens.
//
// #/  or  #/day/<date>             diary for a day
// #/add/<date>/<meal>              add food (scan / search / recent)
// #/p/<code>?d=<date>&m=<meal>     product + amount → add to meal
// #/edit/<code|new>?d=&m=&why=     enter nutrition values by hand
// #/entry/<id>                     change or remove a diary entry
// #/reports/<day|week|month>/<date>
// #/more                           install, backup, about

import { $, $$, parseHash, setNavigateHandler, go, depth, nav } from './ui.js';
import { renderDiary } from './views/diary.js';
import { renderAdd, renderProduct, renderEdit, renderEntry, stopCamera } from './views/food.js';
import { renderReports } from './views/reports.js';
import { renderMore } from './views/more.js';

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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
