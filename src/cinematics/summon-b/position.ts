// Position change (GAME_DESIGN §6 positionChange):
//   attack → defense (≈0.5 s): the monster crouches (squash on its feet), drops into its guard
//     loop while the tile card turns 90°, and a blue hexagonal shield flashes in front of it
//     (white first frame, honeycomb cells, stepped fade) with a soft clink.
//   defense → attack (≈0.9 s): a quick crouch, it rises with a stretch and a little hop, the card
//     turns upright, and a short roar — roar SFX + a player-coloured floor ring on the roar's
//     climax frame.
// A face-down monster (no unit) only turns its card.
//
// v3 look (?look=v3; docs/v3/A0_ENVANTER.md §6.2 item 6, plan §5 "pozisyon değişimi 0,4 sn"):
// positionV3 below — the body never slides, squashes or roars. With the art's `toGuard` /
// `fromGuard` pose the monster plays it on the spot (feet planted: the sprite does not move) while
// the card turns under it; without one (the old monsters) it changes pose on the beat the card
// is half-way round, under the hex shield (to defense) or a small player-coloured floor ring (to
// attack). Whole thing ≤ 0.4 s; the badge flips with the card. The v3 hex is an outline that comes
// two frames after the guard pose lands, in front of it, and is gone within ~140 ms (A2 fix: the
// filled hex hid half of the new guard pose for ~300 ms).

import { PLAYER_RAMP, RAMPS, type Ramp } from '../../art/palette';
import { DEPTH, type XY } from '../../view/layout';
import { shockwave } from '../../vfx/summon';
import { registerEvent } from '../api';
import { ADD,  bg, capped, facing, hexPts, liveLayer, loop,  run,  fs, lightFlash, type AnyCtx } from './_kit';
import { alignStart } from '../_v3/posematch';

const BLUE: Ramp = RAMPS.water;

/**
 * v3 hex guard: an OUTLINE only (no fill, no white frame — the drawn guard pose behind it is the new
 * information), a whole-pixel swell, three colour steps down, gone within ~140 ms.
 */
function hexOutline(ctx: AnyCtx, at: XY, size: number, ms = 140): Promise<void> {
  const W = size;
  const H = Math.round(size * 1.18);
  const layer = liveLayer(ctx.scene, at.x, at.y, W * 3, H * 3, DEPTH.FX + 2, () => undefined, ADD);
  return run(ctx.scene, ms, (t) => {
    layer.r.draw((r) => {
      const step = t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
      const g = 0.92 + 0.04 * step;
      const outer = hexPts(at.x, at.y, Math.round(W * g), Math.round(H * g));
      loop(r, outer, [BLUE[4], BLUE[3], BLUE[2]][step]);
      if (step === 0) loop(r, hexPts(at.x, at.y, Math.round(W * g) - 3, Math.round(H * g) - 3), BLUE[2]);
    });
  }).then(() => layer.stop());
}

/** v3: the hex waits this long after the guard pose lands, so the pose reads first (≈ 2 frames). */
const HEX_AFTER_LAND_V3 = 40;

/** v3: the card's quarter turn (ms) and the whole change's ceiling (plan §5: 0.4 s). */
const TURN_V3 = 240;
const POS_MAX_V3 = 400;

/** v3 position change (see the header). */
async function positionV3(ctx: AnyCtx, ev: { uid: number; position: 'attack' | 'defense' }): Promise<void> {
  const unit = ctx.unit(ev.uid);
  const tile = ctx.tile(ev.uid);
  const toDef = ev.position === 'defense';
  const o = toDef ? 'side' : 'up';
  if (!unit || unit.retired || !unit.sprite.visible) {
    if (tile) await capped(ctx.scene, tile.rotateTo(o, TURN_V3), POS_MAX_V3);
    return;
  }
  const s = unit.sprite;
  const sc = ctx.scene;
  const pose = toDef ? 'toGuard' : 'fromGuard';
  unit.posed = true;
  try {
    ctx.sfx('cardSlide', { volume: 0.55 });
    const jobs: Promise<unknown>[] = [];
    if (tile && tile.orientation !== o) jobs.push(tile.rotateTo(o, TURN_V3));
    // the unit's position is the rules' now (badge + rest loop follow it); the pose bridges the two
    unit.position = ev.position;
    unit.badge.setPosition(ev.position);
    const landed = () => {
      const c = unit.core();
      if (toDef) {
        const size = Math.max(10, Math.min(18, Math.round(unit.art.w * 0.24)));
        // in front of the guard, not over it; the pose holds a beat before the shield answers
        const at = { x: Math.round(c.x + facing(unit) * size * 1.1), y: Math.round(c.y) };
        ctx.sfx('shieldBlock', { volume: 0.4, pitch: 1.25 });
        bg(ctx.wait(HEX_AFTER_LAND_V3).then(() => hexOutline(ctx, at, size)));
        void lightFlash(sc, at.x, at.y, BLUE[3], fs(20), 200, { floorY: unit.home.y, intensity: 0.5 });
      } else {
        const home = unit.home;
        void shockwave(sc, home.x, home.y, { ramp: PLAYER_RAMP[unit.player], radius: fs(30), ms: 300, thickness: 2 });
        void lightFlash(sc, home.x, home.y, PLAYER_RAMP[unit.player][3], fs(24), 280, { ring: true, intensity: 0.6 });
        void unit.badge.pop();
      }
    };
    if (unit.has(pose)) {
      // the transition pose on the spot (it ends on guard 0 / idle 0), then the loop
      const n = unit.frameCount(pose);
      const land = unit.markFrame(pose, 'land', n - 1);
      // a hovering body starts the pose where its idle bob left it (no first-frame jump)
      if (toDef) alignStart(unit, pose, 0);
      jobs.push(unit.playRange(pose, 0, undefined, { hold: true }).then(() => unit.rest()));
      jobs.push(unit.playToFrame(pose, land).then(landed));
    } else {
      // no transition pose: the body changes pose as the card is half-way round
      jobs.push(
        ctx.wait(Math.round(TURN_V3 * 0.45)).then(() => {
          unit.rest();
          landed();
        }),
      );
    }
    await capped(sc, Promise.all(jobs), POS_MAX_V3);
  } finally {
    unit.posed = false;
    if (s.active && !unit.retired) {
      s.setScale(1).setPosition(unit.rest0.x, unit.rest0.y);
      const want = unit.position === 'defense' ? 'guard' : 'idle';
      const cur = unit.frameInfo().anim;
      if (cur !== want || !s.anims.isPlaying) unit.rest();
    }
  }
}

registerEvent(
  'positionChange',
  async (ctx) => {
    const ev = ctx.ev;
    return positionV3(ctx, ev);
  },
  { name: 'summon-b:positionChange' },
);
