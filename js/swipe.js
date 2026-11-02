// Swipe a list row to the left to reveal a red Delete button behind it.
//
// Markup per row:
//   <li class="swipe"><button class="swipe-del">Delete</button><a class="swipe-row">…</a></li>
// Only one row is open at a time. Tapping an open row (or anywhere else) closes it.

const WIDTH = 88;   // px the row slides to reveal the button
const SLOP = 8;     // px of movement before we decide between swipe and scroll

let openRow = null;

function setX(row, x, animate) {
  row.style.transition = animate ? 'transform .2s ease' : 'none';
  row.style.transform = x ? `translateX(${x}px)` : '';
}

export function closeOpenRow() {
  if (openRow) { setX(openRow, 0, true); openRow.closest('.swipe')?.classList.remove('open'); openRow = null; }
}

document.addEventListener('pointerdown', (e) => {
  if (openRow && !openRow.closest('.swipe').contains(e.target)) closeOpenRow();
}, true);
window.addEventListener('hashchange', () => { openRow = null; });

/** Wire up every `.swipe` row inside root. onDelete(li) is called when its Delete button is tapped. */
export function enableSwipe(root, onDelete) {
  root.querySelectorAll('.swipe').forEach((li) => {
    const row = li.querySelector('.swipe-row');
    const del = li.querySelector('.swipe-del');
    let startX = 0, startY = 0, base = 0, x = 0, mode = null, id = null, swiped = false;

    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      id = e.pointerId; startX = e.clientX; startY = e.clientY;
      base = openRow === row ? -WIDTH : 0; x = base; mode = null; swiped = false;
    });
    row.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!mode) {
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
          mode = 'swipe'; swiped = true;
          if (openRow && openRow !== row) closeOpenRow();
          try { row.setPointerCapture(id); } catch { /* ignore */ }
        } else if (Math.abs(dy) > SLOP) { mode = 'scroll'; return; } else return;
      }
      if (mode !== 'swipe') return;
      e.preventDefault();
      x = Math.max(-WIDTH - 24, Math.min(0, base + dx));
      setX(row, x, false);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      if (mode !== 'swipe') return;
      const open = x < -WIDTH / 2;
      setX(row, open ? -WIDTH : 0, true);
      li.classList.toggle('open', open);
      openRow = open ? row : (openRow === row ? null : openRow);
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);

    // A swipe must not also open the item; a tap on an open row just closes it.
    row.addEventListener('click', (e) => {
      if (swiped || openRow === row) {
        e.preventDefault(); e.stopPropagation();
        if (!swiped) closeOpenRow();
        swiped = false;
      }
    }, true);

    del.addEventListener('click', () => { openRow = null; onDelete(li); });
  });
}

/** Collapse a row smoothly before it's removed. */
export function collapse(li) {
  return new Promise((resolve) => {
    li.style.height = `${li.offsetHeight}px`;
    li.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      li.style.transition = 'height .2s ease, opacity .2s ease';
      li.style.height = '0px'; li.style.opacity = '0';
      setTimeout(resolve, 210);
    });
  });
}
