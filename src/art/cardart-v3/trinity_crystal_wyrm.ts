// Card art v3 — Trinity Crystal Wyrm (trinity_crystal_wyrm, LIGHT Dragon Lv12, the fusion of three Crystal Wyrms):
// the sprite's own pixels, 1:1, in a card composition (like polar_sovereign's picture: KART_RESIMLERI §5 "the sprite's
// pixels in a new composition"), so the card, the board sprite and the summon read as one character.
//
// big (88×68)   the breath before the braid (the summon's triple-roar pose, jaws a little open, a star of light in
//               each mouth): the three heads raised in a fan — A (blade crown)
//               high at the back, B (gold crown) leading, C (prism fins) low in front — the lead head's eye the focus, the
//               prism core blazing low in its gold bezel, the near prism wing rising behind and bleeding off
//               the left edge, the body cut by the bottom edge at the thighs. Behind them the LIGHT halo (gold) set
//               on the focus, and three faint rays fanning from the core across the sky (mag / gold / teal, one
//               tone each, on the backdrop only).
// small (44×34) the same picture at half size (the big subject reduced, the backdrop native), then the 1-px marks a
//               reduction loses put back by hand: the three eyes, the three mouth stars, the core's white table.
// Living (4 frames, 150 ms): the prism edges shimmer, the core pulses, the light pulse runs along the crests.
// Colours only from PAL (the sprite's tones folded to the card budget, ≤ 20 with the backdrop).

import { PixelCanvas } from '../pixel';
import { PAL } from '../palette';
import { drawTrinity, eyePoint, corePoint, mouthPoint, W as SW, H as SH, type Pose } from '../monsters-v3/trinity_crystal_wyrm-rig';
import { framePose } from '../monsters-v3/trinity_crystal_wyrm-anims';
import { setLight } from '../monsters-v3/trinity_crystal_wyrm-gbuf';
import { newLayers, paintBackdrop, recolor, reduceSubject } from './_kit';
import type { ArtLayers, CardArtV3 } from './_types';

/** sprite frame → big picture offset (frame px → picture px 1:1) */
const BIG_DX = -38;
const BIG_DY = -6;

function cardPose(f: number): Pose {
  const P = framePose('summon', 12);
  // the jaws a little open, each mouth gathering its light (the breath before the braid)
  P.h.forEach((h, i) => ((h.jaw = 0.38), (h.mouth = f % 2 === i % 2 ? 1 : 0.8), (h.blaze = 0)));
  return { ...P, rays: 0, shimmer: f * 3, core: f % 2 ? 0.8 : 1, wave: (f % 4) / 4, glint: f === 1 ? 2 : 0 };
}

const EYE_B = eyePoint(cardPose(0), 1);
const FOCUS = [Math.floor(EYE_B[0]) + BIG_DX, Math.floor(EYE_B[1]) + BIG_DY] as const;
const FOCUS_SMALL = [Math.floor(FOCUS[0] / 2), Math.floor(FOCUS[1] / 2)] as const;
const CORE_BIG = ((c) => [c[0] + BIG_DX, c[1] + BIG_DY] as const)(corePoint(cardPose(0)));

/** The card's tone budget: the sprite's rarest tones folded into their neighbours. */
const FOLD: Readonly<Record<number, number>> = {
  [PAL.night0]: PAL.ink,
  [PAL.cyan0]: PAL.night2,
  [PAL.crim1]: PAL.night2,
  [PAL.void4]: PAL.void3,
  [PAL.gold4]: PAL.gold3,
  [PAL.teal3]: PAL.cyan3,
  [PAL.night3]: PAL.steel,
};

function sprite(f: number): PixelCanvas {
  const p = new PixelCanvas(SW, SH);
  setLight('left');
  drawTrinity(p, cardPose(f));
  return recolor(p, FOLD);
}

/** One step up the LIGHT backdrop's own tones (the prism rays never add a tone to the sky). */
const UP: Readonly<Record<number, number>> = { [PAL.night1]: PAL.night2, [PAL.night2]: PAL.gold1, [PAL.gold1]: PAL.gold2 };

/** Three prism rays fanning up from the core across the sky (dashed, flowing outward a step a frame). */
function prismRays(p: PixelCanvas, cx: number, cy: number, f: number, k: number): void {
  const angs = [-150, -115, -78];
  for (const a0 of angs) {
    const a = (a0 * Math.PI) / 180;
    let lx = NaN;
    let ly = NaN;
    for (let i = 10 * k; i < 70 * k; i++) {
      if ((((i / k) >> 2) - f) % 3 === 0) continue;
      const x = Math.round(cx + Math.cos(a) * i);
      const y = Math.round(cy + Math.sin(a) * i);
      if (x === lx && y === ly) continue;
      lx = x;
      ly = y;
      const c = p.get(x, y);
      if (c === null) continue;
      const up = UP[c];
      if (up !== undefined) p.set(x, y, up);
    }
  }
}

function big(l: ArtLayers, f: number): void {
  paintBackdrop(l.backdrop, 'LIGHT', { focus: FOCUS, radius: 30 });
  prismRays(l.backdrop, CORE_BIG[0], CORE_BIG[1], f, 1);
  l.subject.blit(sprite(f), BIG_DX, BIG_DY);
}

function small(l: ArtLayers, f: number, bigL?: ArtLayers): void {
  const B =
    bigL ??
    (() => {
      const b = newLayers('big');
      big(b, f);
      return b;
    })();
  paintBackdrop(l.backdrop, 'LIGHT', { focus: FOCUS, radius: 30 });
  l.subject.blit(reduceSubject(B.subject), 0, 0);
  // the 1-px marks the reduction loses, put back by hand from the rig's own points at half size: the three eyes
  // (A's a step down), the three mouth stars, the core's white table
  const P = cardPose(f);
  const half = (q: readonly number[]): [number, number] => [Math.floor((q[0] + BIG_DX) / 2), Math.floor((q[1] + BIG_DY) / 2)];
  for (let i = 0; i < 3; i++) {
    const [x, y] = half(eyePoint(P, i));
    if (l.subject.isOpaque(x, y)) l.subject.set(x, y, i === 0 ? PAL.cyan3 : PAL.cyan4);
    const [mx, my] = half(mouthPoint(P, i));
    l.light.set(mx + 1, my, PAL.white);
  }
  const [cx, cy] = half(corePoint(P));
  l.light.set(cx, cy, PAL.white);
}

const art: CardArtV3 = {
  id: 'trinity_crystal_wyrm',
  focus: FOCUS,
  focusSmall: FOCUS_SMALL,
  frames: 4,
  holdMs: 150,
  big,
  small,
};

export default art;
