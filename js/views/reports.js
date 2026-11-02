// Reports: day (by meal), week and month overviews.

import * as db from '../db.js';
import {
  today, addDays, isValidKey, weekStart, isoWeek, monthStart, monthEnd, addMonths, range,
  shortDay, dayNum, longDate, monthLabel, shortDate, dayLabel,
} from '../dates.js';
import { totals, fmt } from '../nutrition.js';
import { $, $$, esc, go, macroTiles, splitBar } from '../ui.js';

export async function renderReports(el, period = 'week', dateParam) {
  if (!['day', 'week', 'month'].includes(period)) period = 'week';
  const date = isValidKey(dateParam) ? dateParam : today();

  const tabs = `<div class="segmented" role="tablist">${['day', 'week', 'month'].map((p) =>
    `<button role="tab" aria-selected="${p === period}" class="${p === period ? 'active' : ''}" data-period="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>`;

  let from, to, label, prev, next;
  if (period === 'day') {
    from = to = date; label = dayLabel(date); prev = addDays(date, -1); next = addDays(date, 1);
  } else if (period === 'week') {
    from = weekStart(date); to = addDays(from, 6);
    label = `Week ${isoWeek(from)} · ${shortDate(from)} – ${shortDate(to)}`;
    prev = addDays(from, -7); next = addDays(from, 7);
  } else {
    from = monthStart(date); to = monthEnd(date); label = monthLabel(from);
    prev = addMonths(from, -1); next = addMonths(from, 1);
  }

  const entries = await db.entriesBetween(from, to);
  const days = range(from, to);
  const byDay = days.map((d) => ({ date: d, entries: entries.filter((e) => e.date === d) }))
    .map((d) => ({ ...d, t: totals(d.entries) }));
  const logged = byDay.filter((d) => d.entries.length);
  const sum = totals(entries);
  const avg = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, logged.length ? v / logged.length : 0]));

  let body;
  if (!entries.length) {
    body = `<p class="empty card">Nothing logged ${period === 'day' ? 'on this day' : `in this ${period}`}.</p>`;
  } else if (period === 'day') {
    body = await dayBody(date, entries, sum);
  } else {
    body = `
      <section class="card">
        <h2 class="card-title">Average per logged day <span class="muted small">(${logged.length} of ${days.length} days logged)</span></h2>
        ${macroTiles(avg)}
        ${splitBar(sum)}
      </section>
      <section class="card">
        <h2 class="card-title">Calories per day</h2>
        ${barChart(byDay, avg.kcal, period)}
        <div class="chart-tip" id="chart-tip" aria-live="polite"><span class="muted small">Tap a bar for details.</span></div>
      </section>
      <section class="card">
        <h2 class="card-title">Total for the ${period}</h2>
        <p class="big-number">${fmt(sum.kcal, 'kcal')} <small>kcal</small></p>
        <p class="muted">Protein ${fmt(sum.protein)} g · Carbs ${fmt(sum.carbs)} g · Fat ${fmt(sum.fat)} g</p>
      </section>
      <section class="card">
        <h2 class="card-title">Day by day</h2>
        ${dayTable(byDay.filter((d) => period === 'week' || d.entries.length))}
      </section>`;
  }

  el.innerHTML = `
    ${tabs}
    <div class="datenav">
      <button class="btn icon" data-to="${prev}" aria-label="Previous">‹</button>
      <span class="datelabel"><span>${esc(label)}</span></span>
      <button class="btn icon" data-to="${next}" aria-label="Next">›</button>
    </div>
    ${body}
  `;

  $$('[data-period]', el).forEach((b) => b.addEventListener('click', () =>
    go(`#/reports/${b.dataset.period}/${date}`, { replace: true })));
  $$('[data-to]', el).forEach((b) => b.addEventListener('click', () =>
    go(`#/reports/${period}/${b.dataset.to}`, { replace: true })));

  // Bar tap / hover → details
  const tip = $('#chart-tip', el);
  $$('.bar-hit', el).forEach((r) => {
    const show = () => {
      const d = byDay.find((x) => x.date === r.dataset.date);
      $$('.bar', el).forEach((b) => b.classList.toggle('sel', b.dataset.date === d.date));
      tip.innerHTML = d.entries.length
        ? `<strong>${esc(longDate(d.date))}</strong> · ${fmt(d.t.kcal, 'kcal')} kcal · P ${fmt(d.t.protein)} g · C ${fmt(d.t.carbs)} g · F ${fmt(d.t.fat)} g
           <a href="#/day/${d.date}">Open day ›</a>`
        : `<strong>${esc(longDate(d.date))}</strong> · nothing logged <a href="#/day/${d.date}">Open day ›</a>`;
    };
    r.addEventListener('click', show);
    r.addEventListener('mouseenter', show);
  });
}

async function dayBody(date, entries, sum) {
  const meals = await db.mealsForDate(date);
  const rows = meals.map((m) => ({ name: m.name, t: totals(entries.filter((e) => e.meal === m.id)), n: entries.filter((e) => e.meal === m.id).length }))
    .filter((r) => r.n);
  return `
    <section class="card">
      <h2 class="card-title">Day total</h2>
      ${macroTiles(sum)}
      ${splitBar(sum)}
    </section>
    <section class="card">
      <h2 class="card-title">By meal</h2>
      <table class="nutr report">
        <thead><tr><th>Meal</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${fmt(r.t.kcal, 'kcal')}</td><td>${fmt(r.t.protein)} g</td><td>${fmt(r.t.carbs)} g</td><td>${fmt(r.t.fat)} g</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td>${fmt(sum.kcal, 'kcal')}</td><td>${fmt(sum.protein)} g</td><td>${fmt(sum.carbs)} g</td><td>${fmt(sum.fat)} g</td></tr></tfoot>
      </table>
      <p><a href="#/day/${date}">Open this day in the diary ›</a></p>
    </section>`;
}

function dayTable(days) {
  return `<table class="nutr report">
    <thead><tr><th>Day</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead>
    <tbody>${days.map((d) => `<tr class="${d.entries.length ? '' : 'sub'}">
      <td><a href="#/day/${d.date}">${esc(longDate(d.date))}</a></td>
      ${d.entries.length
        ? `<td>${fmt(d.t.kcal, 'kcal')}</td><td>${fmt(d.t.protein)}</td><td>${fmt(d.t.carbs)}</td><td>${fmt(d.t.fat)}</td>`
        : '<td colspan="4">–</td>'}</tr>`).join('')}</tbody>
  </table>`;
}

/** Simple SVG bar chart of kcal per day, with a dashed average line. */
function barChart(days, avgKcal, period) {
  const W = 340, H = 180, padL = 34, padR = 6, padT = 12, padB = 22;
  const max = Math.max(...days.map((d) => d.t.kcal), avgKcal, 1);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const slot = (W - padL - padR) / days.length;
  const bw = Math.max(3, Math.min(28, slot - 2)); // ≥2px gap between bars
  const grid = [];
  for (let v = 0; v <= top; v += step) {
    grid.push(`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${padL - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`);
  }
  const t = today();
  const bars = days.map((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const h = Math.max(0, y(0) - y(d.t.kcal));
    const r = Math.min(4, bw / 2, h);
    const showLabel = period === 'week' || i % 5 === 0 || i === days.length - 1;
    const label = period === 'week' ? shortDay(d.date) : dayNum(d.date);
    // bar with rounded top corners, anchored square on the baseline
    const path = h > 0
      ? `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + bw - r} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r} V${y(0)} Z`
      : '';
    return `<g>
      ${path ? `<path class="bar${d.date === t ? ' today' : ''}" data-date="${d.date}" d="${path}"/>` : ''}
      ${showLabel ? `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(label)}</text>` : ''}
      <rect class="bar-hit" data-date="${d.date}" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${H - padT - padB + 10}"><title>${esc(longDate(d.date))}: ${fmt(d.t.kcal, 'kcal')} kcal</title></rect>
    </g>`;
  }).join('');
  const avgLine = avgKcal > 0 ? `<line class="avg" x1="${padL}" x2="${W - padR}" y1="${y(avgKcal)}" y2="${y(avgKcal)}"/>
    <text class="axis avg-label" x="${W - padR}" y="${y(avgKcal) - 4}" text-anchor="end">avg ${fmt(avgKcal, 'kcal')}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories per day bar chart">${grid.join('')}${bars}${avgLine}</svg>`;
}

function niceStep(max) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
}
