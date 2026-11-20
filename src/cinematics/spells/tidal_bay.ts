// Gelgit Körfezi (tidal_bay) — "the bay rises": the field card lands on its seal with a splash, the seal bursts into a water
// spout and the tide floods the graphite stage (BoardViewNt.setTide → board-nt/tide.ts: the foam crest runs over the slab, the
// caustics light the floor, cascades pour over the near walls into foaming pools). As the water reaches each monster:
//   WATER / WIND  GELGİT KUTSAMASI (+400): a double helix of water spirals up round it and bursts into droplets, the body takes
//                 the water's light; then it keeps the 'tide' aura (ripples at its feet, bubbles / air curls, drips)
//   FIRE          SÖNDÜRME (−400): a curling wave breaks over it, the body goes deep blue, steam boils off it; then it keeps
//                 the steam aura
// The 'field' hook also plays the ebb when the bay leaves the field: the water draws back into the seal, the auras end, the
// badges roll back. Before the Neon Tower stage (no tide layer) the beats still play on the bare floor.

import type { GameEvent, PlayerId } from '../../engine/types';
import { PAL } from '../../art/palette';
import { zoneXY } from '../../view/layout';
import { wait } from '../../vfx/core';
import { steamAura } from '../../duel/auras';
import { tideAura } from '../../duel/auras-tide';
import type { MonsterUnit } from '../../duel/MonsterUnit';
import { fx, registerCardHook, type CinematicContext } from '../api';
import { bg, evAt, idxOf, relax, spellOpening, lightFlash, fs } from './_kit';
import { numberUnderBar } from '../_v3/spellfx';
import { impactNumber } from '../_v3/number';
import { panAt, play as playV3 } from '../_v3/sound';
import { numberSpot, type NumberSpot } from './volcano_arena';
import { beatTimes } from './_volcano_v3';
import { tideBlessing, tideDouse } from './_tide_beats';
import { SPOUT_MS, SURGE_MS, tideArrivalMs } from '../../view/board-nt/tide';

type AnyCtx = CinematicContext<GameEvent>;
type StatEv = Extract<GameEvent, { type: 'statChange' }>;

/** The contiguous statChange events right after ctx.index (consumed). */
function takeStatChanges(ctx: AnyCtx): StatEv[] {
  const out: StatEv[] = [];
  for (let i = ctx.index + 1; i < ctx.events.length; i++) {
    const e = ctx.events[i];
    if (e.type !== 'statChange') break;
    if (ctx.isConsumed(i)) continue;
    ctx.consumeAt(i);
    out.push(e);
  }
  return out;
}

function statDelta(e: StatEv): { up: boolean; delta: number } {
  const d = e.atk - e.prevAtk;
  return { up: d >= 0, delta: Math.abs(d) };
}

/** The tide aura a unit keeps on the bay (null: none). */
export function tideAuraFor(scene: Phaser.Scene, u: MonsterUnit): ReturnType<typeof tideAura> | null {
  if (u.attribute === 'WATER') return tideAura(scene, u, 'water');
  if (u.attribute === 'WIND') return tideAura(scene, u, 'wind');
  if (u.attribute === 'FIRE') return steamAura(scene, u);
  return null;
}

/** A monster's beat as the water reaches it. `show`: ms after the start when its number pops. */
async function waterBeat(ctx: AnyCtx, u: MonsterUnit, e: StatEv, spots: NumberSpot[], show: number): Promise<void> {
  const sc = ctx.scene;
  const { up, delta } = statDelta(e);
  const text = (up ? '+' : '-') + delta;
  const visible = !u.retired && u.sprite.active && u.sprite.visible && u.sprite.alpha > 0.3;
  if (!visible) {
    await u.setStats(e.atk, e.def, false);
    if (!u.retired && !u.hasAura('tide')) {
      const a = tideAuraFor(sc, u);
      if (a) u.setAura('tide', a);
    }
    return;
  }
  const fire = u.attribute === 'FIRE' || !up;
  const play = fire ? tideDouse(sc, u, { seed: u.uid * 41 + 9 }) : tideBlessing(sc, u, { seed: u.uid * 43 + 5 });
  bg(play);
  await wait(sc, show);
  if (u.retired || !u.sprite.active) return;
  const t = u.worldPoint('top');
  const n = numberSpot(spots, t.x, numberUnderBar(t.y - 4).y, text);
  bg(impactNumber(sc, n.x, n.y, delta, { kind: up ? 'heal' : 'damage', rise: numberUnderBar(n.y).rise }));
  void u.setStats(e.atk, e.def, true);
  if (!u.retired && !u.hasAura('tide')) {
    const a = tideAuraFor(sc, u);
    if (a) u.setAura('tide', a);
  }
}

registerCardHook('tidal_bay', 'activate', async (ctx) => {
  const ev = ctx.ev;
  const run0 = fx.resolutionRun(ctx);
  const oldDi = idxOf(ctx, run0, (e) => e.type === 'destroy' && e.location === 'field');
  const oldFi = idxOf(ctx, run0, (e) => e.type === 'fieldSpell' && !e.active && e.uid !== ev.uid);
  const fi = idxOf(ctx, run0, (e) => e.type === 'fieldSpell' && e.active && e.uid === ev.uid);
  const op = await spellOpening(ctx, { uid: ev.uid, cardId: ev.cardId, player: ev.player, from: 'hand', zone: null, hold: 100 });
  // an old field spell goes first (its own scene: a volcano cools, an old bay ebbs)
  if (oldDi >= 0) await ctx.play(oldDi);
  if (oldFi >= 0) {
    const oldF = evAt(ctx, oldFi, 'fieldSpell');
    // a bay replacing a bay: the water stays (no ebb)
    if (oldF && oldF.cardId === 'tidal_bay') ctx.consumeAt(oldFi);
    else await ctx.play(oldFi);
  }
  const pad = zoneXY(ev.player, 'field', 0);
  const land = (): void => {
    playV3('tideSplash', { volume: 0.8, pan: panAt(pad.x) });
    bg(ctx.views.board.flashTile(ev.player, 'field', 0, PAL.cyan3, 160));
  };
  if (op.landV3) await op.landV3({ spot: 'field', index: 0, ms: 90, lieMs: 90, onLand: land });
  else await op.land({ spot: 'field', index: 0 });
  if (fi >= 0) await ctx.play(fi);
  await fx.playRun(ctx, fx.resolutionRun(ctx));
  relax(ctx, 400);
});

registerCardHook('tidal_bay', 'field', async (ctx) => {
  const ev = ctx.ev as Extract<GameEvent, { type: 'fieldSpell' }>;
  const sc = ctx.scene;
  const board = ctx.views.board;
  const pad = zoneXY(ev.player, 'field', 0);
  const stats = takeStatChanges(ctx);
  const items = stats.map((e) => ({ e, u: ctx.unit(e.uid) })).filter((x): x is { e: StatEv; u: MonsterUnit } => !!x.u);
  const spots: NumberSpot[] = [];
  if (!ev.active) {
    // only ebb if no other bay took its place in this batch
    const stillWet = ctx.after.players.some((p) => p.fieldSpell && p.fieldSpell.faceUp && ctx.after.cards[p.fieldSpell.uid].cardId === 'tidal_bay');
    if (stillWet) return;
    void lightFlash(sc, pad.x, pad.y, PAL.teal3, fs(26), 380, { floorY: pad.y, intensity: 0.45 });
    bg(board.setTide(false, true, ev.player));
    const times = beatTimes(items.map((x) => Math.round(Math.max(0, SURGE_MS - tideArrivalMs(ev.player, x.u.home)) / 3)));
    await fx.all(
      items.map((x, i) =>
        wait(sc, 200 + times[i]).then(() => {
          x.u.setAura('tide', null);
          const { up, delta } = statDelta(x.e);
          if (!x.u.retired && x.u.sprite.active && x.u.sprite.visible && delta > 0) {
            const t = x.u.worldPoint('top');
            const n = numberSpot(spots, t.x, numberUnderBar(t.y - 4).y, (up ? '+' : '-') + delta);
            bg(impactNumber(sc, n.x, n.y, delta, { kind: up ? 'heal' : 'damage', rise: numberUnderBar(n.y).rise }));
          }
          return x.u.setStats(x.e.atk, x.e.def, true);
        }),
      ),
    );
    return;
  }
  // ---- the surge
  bg(ctx.focus(pad, { zoom: 1.04, ms: 160, pan: 0.2 }).then(() => wait(sc, 160)).then(() => ctx.unfocus(800)));
  bg(board.setTide(true, board.tide !== true, ev.player));
  // each monster's beat as the sheet reaches its zone, the numbers ≥ 150 ms apart
  const arrivals = items.map((x) => tideArrivalMs(ev.player, x.u.home));
  const starts = beatTimes(arrivals, 150);
  const LEAD = 300; // the number pops on the beat's peak (the helix burst / the steam)
  const beats = items.map((x, i) => wait(sc, starts[i]).then(() => waterBeat(ctx, x.u, x.e, spots, LEAD)));
  const last = starts.length ? Math.max(...starts) + LEAD : 0;
  await wait(sc, Math.max(SPOUT_MS + SURGE_MS * 0.8, last + 120));
  await fx.all(beats);
});

/** Testing / QA: when the tide reaches a unit's zone (ms), as the scene schedules it. */
export function tideBeatAt(origin: PlayerId, at: { x: number; y: number }): number {
  return tideArrivalMs(origin, at);
}
