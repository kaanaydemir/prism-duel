// Hi-res render mode (the Sky Temple arena): the canvas is drawn at HIRES× the 640×360 game resolution.
//
// Game code, cameras and pointer coordinates stay in 640×360 game pixels; only the WebGL projection
// maps them onto the bigger canvas (src/view/wide.ts installHires). So every 1× sprite, card, effect
// and the HUD look exactly as before (each game pixel is HIRES×HIRES canvas pixels), while art made at
// HIRES× density and drawn at 1/HIRES scale (the Sky Temple arena) keeps its fine detail.
//
// On when the chosen arena is the Sky Temple (settings, src/scenes/launch.ts) or with ?hires=2 (QA);
// ?hires=1 forces it off. Read once at boot: switching the arena reloads the page. No Phaser import
// here, so art modules may read it.

import { resolveArena } from './arena-choice';

function detect(): 1 | 2 {
  try {
    // a page that embeds the game can ask for it before boot (e.g. a shareable preview build)
    const g = (globalThis as { __PRISM_HIRES?: unknown }).__PRISM_HIRES;
    if (g === 2 || g === 1) return g;
    if (typeof location !== 'undefined' && typeof URLSearchParams !== 'undefined') {
      const q = new URLSearchParams(location.search).get('hires');
      if (q === '2') return 2;
      if (q === '1') return 1;
    }
    // ?arena=old / calm: the retired calm arena (no Sky Temple there)
    if (typeof location === 'undefined' || /[?&]arena=(old|calm)\b/.test(location.search)) return 1;
    // the remembered arena choice (src/view/arena-choice.ts; ?arena=sky|neon wins)
    if (resolveArena() === 'sky') return 2;
  } catch {
    /* no storage / bad JSON: off */
  }
  return 1;
}

/** Canvas pixels per game pixel: 1 (the classic arena) or 2 (Sky Temple). */
export const HIRES: 1 | 2 = detect();
