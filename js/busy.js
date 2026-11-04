// A spinner next to any "…" message (Loading…, Looking up…, Syncing…), so it's clear the app is working.
const SEL = '.status, button, p.small.muted, div.small.muted';
const check = (el) => { if (el.nodeType === 1 && el.matches(SEL)) el.classList.toggle('auto-busy', /…\s*$/.test(el.textContent) && !el.classList.contains('error')); };
const scan = (root) => { if (root.nodeType !== 1) return; check(root); root.querySelectorAll(SEL).forEach(check); };
new MutationObserver((list) => {
  for (const m of list) {
    const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (t) { check(t); const c = t.closest(SEL); if (c && c !== t) check(c); }
    m.addedNodes.forEach(scan);
  }
}).observe(document.body, { childList: true, characterData: true, subtree: true });
scan(document.body);
