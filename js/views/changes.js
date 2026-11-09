// What's new: the changes in each version, newest first. Add an entry on every release.
import { esc } from '../ui.js';

export const CHANGES = [
  { v: 'v66', date: '2026-11-09', items: ['Hevy workouts show an estimate of the calories you burned (🔥 ≈ N kcal), from the workout’s length, how many sets you did, any cardio and your weight in Goals. Open a workout to see how it was worked out.'] },
  { v: 'v65', date: '2026-11-06', items: ['Restaurant dish: add a photo or screenshot of the menu and just type the dish’s number.'] },
  { v: 'v64', date: '2026-11-06', items: ['Restaurant dish: type any dish (“Döner Kebab”, “rice with chicken and sauce”) and Gemini estimates a typical portion’s calories and macros. In Add food and Eat out.'] },
  { v: 'v63', date: '2026-11-05', items: ['Recipes tab: your saved meals are listed too, with calories and macros. Tap one to add it to today.'] },
  { v: 'v62', date: '2026-11-04', items: ['“What fits what’s left today?” (Recipes tab and Add food): your recipes and saved meals ranked by how well they match the calories and macros you have left, with the portion size that fits best.'] },
  { v: 'v61', date: '2026-11-04', items: ['Cooked for more than one day? In a meal’s ⋯ menu, pick “Cooked for more than one portion”: today keeps 1 portion and the rest is saved as a meal to add on another day.'] },
  { v: 'v60', date: '2026-11-04', items: ['The diary shows the time you logged each food. A recipe or saved meal shows its time once, above its ingredients.'] },
  { v: 'v59', date: '2026-11-04', items: ['Tap the version in the top-right corner to see what changed in each version.'] },
  { v: 'v58', date: '2026-11-04', items: ['Recipe import: when there’s only Gemini’s guess for an ingredient, the app looks it up on Open Food Facts and picks the real product.', '“Süßkartoffel-Gnocchi” no longer matches plain sweet potato.'] },
  { v: 'v57', date: '2026-11-04', items: ['Faster imports from several screenshots: Gemini joins overlapping screenshots and pictures are made smaller first.', 'The import shows which step is running and for how long.', 'A spinner next to every “Loading…” message.'] },
  { v: 'v56', date: '2026-11-04', items: ['“Recipe from social media” instead of “Recipe from Instagram”.'] },
  { v: 'v55', date: '2026-11-04', items: ['Colours: pick a background for the diary’s day total (soft, strong or solid).'] },
  { v: 'v54', date: '2026-11-04', items: ['Recipe import: choose Instagram, YouTube or TikTok. Gemini watches YouTube videos from the link.'] },
  { v: 'v53', date: '2026-11-04', items: ['The slim day total shows as soon as the macro numbers scroll away, and also on Add food.'] },
  { v: 'v52', date: '2026-11-04', items: ['Diary: the big day total scrolls away and a slim bar with kcal, kcal left and P/C/F takes its place.'] },
  { v: 'v51', date: '2026-11-04', items: ['The version and update time in the top-right corner.'] },
  { v: 'v50', date: '2026-11-04', items: ['Updates show straight away instead of after the second launch.'] },
  { v: 'v49', date: '2026-11-04', items: ['The shop link just says “Search on edeka.de”.'] },
  { v: 'v48', date: '2026-11-04', items: ['Edit a saved recipe’s ingredients with the same menus as the import, or add one by hand.', 'Same-size buttons on recipes.'] },
  { v: 'v47', date: '2026-11-03', items: ['The 🛒 buy line always matches the menu.', 'Foods saved from other recipes no longer show up on the wrong ingredient.'] },
  { v: 'v46', date: '2026-11-03', items: ['The post’s words are shown apart from the app’s pick.', 'Check what EDEKA (or another shop) has before saving.', 'Remove an ingredient from a saved recipe.'] },
  { v: 'v45', date: '2026-11-03', items: ['Fewer “Gemini’s answer couldn’t be read” errors: it tries again, then another model.'] },
  { v: 'v44', date: '2026-11-03', items: ['Saved recipes show what to buy and where each ingredient’s macros come from.'] },
  { v: 'v43', date: '2026-11-03', items: ['Recipe import keeps the post’s ingredient names and brand products, and compares with the post’s own nutrition.'] },
];

export function renderChanges(el) {
  const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  el.innerHTML = `
    ${CHANGES.map((c) => `
      <section class="card changes${c.v === self.APP_VERSION ? ' current' : ''}">
        <h2 class="changes-v">${esc(c.v)} <span class="muted small">${esc(day(c.date))}${c.v === self.APP_VERSION ? ' · this version' : ''}</span></h2>
        <ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </section>`).join('')}
    <p class="muted small">Older versions (from 2 Nov 2026): the diary, scanner, goals, reports, recipes, Eat out, voice logging, the widget and more.</p>`;
}
