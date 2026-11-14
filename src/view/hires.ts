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

const SETTINGS_KEY = 'neon-duello:settings';

function detect(): 1 | 2 {
  try {
    if (typeof location !== 'undefined' && typeof URLSearchParams !== 'undefined') {
      const q = new URLSearchParams(location.search).get('hires');
      if (q === '2') return 2;
      if (q === '1') return 1;
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw && (JSON.parse(raw) as { arena?: string }).arena === 'sky') return 2;
    }
  } catch {
    /* no storage / bad JSON: off */
  }
  return 1;
}

/** Canvas pixels per game pixel: 1 (the classic arena) or 2 (Sky Temple). */
export const HIRES: 1 | 2 = detect();
