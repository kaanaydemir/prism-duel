// Trinity Crystal Wyrm (trinity_crystal_wyrm) — v3 art (?look=v3), the fusion of three Crystal Wyrms (LIGHT Dragon
// Lv12, 4500/3800): a THREE-HEADED crystal dragon in the wyrm's own material language (white hide in value planes,
// cyan glass, gold horn — trinity_crystal_wyrm-gbuf.ts is the wyrm's raster pipeline on this bigger frame), bigger and
// heavier, with a prism core in the chest and prism wings whose trailing edges split the light into a faint rainbow.
//   trinity_crystal_wyrm-gbuf.ts   the raster pipeline (copied from the wyrm's: the frame size is baked into its pools)
//   trinity_crystal_wyrm-rig.ts    Pose → pixels: three necks + heads (A far / high, blade crown; B centre, gold crown;
//                                  C near / low, prism fins), wings, chest + core + veins, legs, tail, shatter
//   trinity_crystal_wyrm-anims.ts  every anim as poses with holds, marks and points; trinityMarks() / SUMMON_BEATS for
//                                  the fusion cinematic
// Frame 128×112 (the wyrm's is 116×104), 1 art px = 1 game px; anchor on the ground row between the planted feet.
// Anims: idle 20, guard 8, roar 12 (the triple roar), attack 14 ("Trinity Prism Braid": release = impact f7, contact
// f8 — the muzzle is the BRAID POINT where the three rays twist into one), hit 6, hitHeavy 7, hitMagic 7, summon 16
// (the reveal: cocoon drop → land f2 → glass lights f3 → wings unfold f4–5 → heads rise and roar one by one f6–11 →
// triple roar f12), death 10 (cracks → drain → prism shatter, dissolve f4), revive 9 (land f5), toGuard 6, fromGuard 6
// = 121 frames (≤ 140; 128 × 112 × 4 × 121 = 6.94 MB ≤ the ace's 7 MB).
// P2 is a relit sheet (p2: 'relight').

import type { AnyMonsterAnim, DrawOpts, MonsterAnim, MonsterAnimExtra, MonsterArt, MonsterPoints } from '../types';
import type { PixelCanvas } from '../pixel';
import card from '../cardart-v3/trinity_crystal_wyrm';
import { renderArt } from '../cardart-v3/_kit';
import { setLight } from './trinity_crystal_wyrm-gbuf';
import { H, W, drawTrinity } from './trinity_crystal_wyrm-rig';
import { ANCHOR, ANIMS, EXTRA_ANIMS, IMPACT, framePoints, framePose } from './trinity_crystal_wyrm-anims';

function render(p: PixelCanvas, anim: AnyMonsterAnim, frame: number, o?: DrawOpts) {
  setLight(o?.lightFrom ?? 'left');
  try {
    drawTrinity(p, framePose(anim, frame));
  } finally {
    setLight('left');
  }
}

const idle0 = framePoints('idle', 0);
const atk = framePoints('attack', IMPACT);

const trinityCrystalWyrmV3: MonsterArt = {
  id: 'trinity_crystal_wyrm',
  w: W,
  h: H,
  anchorX: ANCHOR[0],
  anchorY: ANCHOR[1],
  hover: 0,
  muzzle: { x: atk.muzzle!.x, y: atk.muzzle!.y },
  core: { x: idle0.core!.x, y: idle0.core!.y },
  anims: ANIMS,
  attackImpactFrame: IMPACT,
  weight: 'heavy',
  p2: 'relight',
  draw(p: PixelCanvas, anim: MonsterAnim, frame: number, o?: DrawOpts) {
    render(p, anim, frame, o);
  },
  extraAnims: EXTRA_ANIMS,
  drawExtra(p: PixelCanvas, anim: MonsterAnimExtra, frame: number, o?: DrawOpts) {
    render(p, anim, frame, o);
  },
  points(anim: AnyMonsterAnim, frame: number): MonsterPoints {
    return framePoints(anim, frame);
  },
  /** The card picture (v3, 44×34 on the 1× face). */
  portrait(p: PixelCanvas) {
    p.blit(renderArt(card, 0).smallPx, 0, 0);
  },
};

export default trinityCrystalWyrmV3;
