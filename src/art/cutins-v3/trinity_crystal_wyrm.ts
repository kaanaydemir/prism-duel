// Trinity Crystal Wyrm — v3 ace cut-in portrait (200×144, faces right; ?look=v3 only, see src/art/cutins/index.ts).
//
// The fusion's band shows the THREE wyrms it was made of, at the cut-in's own density: the approved v3 crystal_wyrm
// bust (./crystal_wyrm.ts — head planes, gold horns, glass crest and wing, the prism light in the jaws) painted three
// times, stacked up the band as the Trinity's three heads — A (far, high, back), B (centre), C (near, low, front) — each
// in its own strand colour, the colours of the fusion's helix and of the Trinity's braid: A's glass magenta, B's gold,
// C keeps the wyrm's cyan. The far head sits one value step darker (depth), the near one covers the others' necks.
// Rhythm: the heads wake and roar one after another, A → B → C (each the wyrm's own six-frame roar, one frame apart),
// then all three hold the roar with the prism light in every mouth — the triple roar of the summon, on the band.
// P2 (p2: 'relight'): the wyrm bust's relit frames (lightFrom 'right'), recoloured the same way.

import type { CutinFactory } from '../cutins/index';
import wyrmFactory from './crystal_wyrm';
import { PAL } from '../palette';
import { PixelCanvas } from '../pixel';
import type { CutinArt, DrawOpts } from '../types';

const W = 200;
const H = 144;
/** each head's offset from the wyrm bust (canvas px) and the frame delay of its roar */
const HEADS: readonly { dx: number; dy: number; delay: number }[] = [
  { dx: -14, dy: -46, delay: 0 },
  { dx: 22, dy: -18, delay: 1 },
  { dx: -18, dy: 22, delay: 2 },
];
const FRAMES = 8;
const HOLDS: readonly number[] = [200, 70, 70, 90, 100, 110, 120, 420];

const CYAN: number[] = [PAL.cyan0, PAL.cyan1, PAL.cyan2, PAL.cyan3, PAL.cyan4];
const MAG = [PAL.mag0, PAL.mag1, PAL.mag2, PAL.mag3, PAL.mag4];
const GOLD = [PAL.gold0, PAL.gold1, PAL.gold2, PAL.gold3, PAL.gold4];
/** one value step down (the far head) */
const DARKER: Readonly<Record<number, number>> = {
  [PAL.white]: PAL.mist,
  [PAL.mist]: PAL.steel,
  [PAL.steel]: PAL.night3,
  [PAL.night3]: PAL.night2,
  [PAL.night2]: PAL.night1,
  [PAL.gold4]: PAL.gold3,
  [PAL.gold3]: PAL.gold2,
  [PAL.gold2]: PAL.gold1,
  [PAL.mag4]: PAL.mag3,
  [PAL.mag3]: PAL.mag2,
  [PAL.mag2]: PAL.mag1,
};

function recolor(src: PixelCanvas, to: readonly number[] | null, dark: boolean): PixelCanvas {
  const out = new PixelCanvas(src.w, src.h);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      let c = src.get(x, y);
      if (c === null) continue;
      if (to) {
        const k = CYAN.indexOf(c);
        if (k >= 0) c = to[k];
      }
      if (dark) c = DARKER[c] ?? c;
      out.set(x, y, c);
    }
  return out;
}

const factory: CutinFactory = (K) => {
  const wyrm: CutinArt = typeof wyrmFactory === 'function' ? (wyrmFactory as CutinFactory)(K) : (wyrmFactory as unknown as CutinArt);
  function draw(p: PixelCanvas, frame: number, o?: DrawOpts): void {
    const f = Math.max(0, Math.min(FRAMES - 1, frame));
    HEADS.forEach((h, i) => {
      const q = new PixelCanvas(W, H);
      // each head runs the wyrm's roar a frame behind the one before it, then holds it
      wyrm.draw(q, Math.max(0, Math.min(wyrm.frames - 1, f - h.delay)), o);
      const c = recolor(q, i === 0 ? MAG : i === 1 ? GOLD : null, i === 0);
      p.blit(c, h.dx, h.dy);
    });
  }
  return {
    id: 'trinity_crystal_wyrm',
    w: W,
    h: H,
    frames: FRAMES,
    fps: 12,
    accent: PAL.gold3,
    accentDark: PAL.gold1,
    holds: HOLDS,
    p2: 'relight',
    draw,
  };
};

export default factory;
