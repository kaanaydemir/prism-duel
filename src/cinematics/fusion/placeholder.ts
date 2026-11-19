// Fusion Summon — PLACEHOLDER presentation (the fusion cinematic lane replaces it).
//
// Hook names (registry.ts):
//   registerEvent('fusionSummon', …)                         'fusionSummon'                     — this generic fallback
//   registerCardHook('trinity_crystal_wyrm', 'fusion', …)    'fusionSummon:trinity_crystal_wyrm' — a pass-through slot here
//   registerCardHook('prism_fusion', 'fusionSpell', …)       keyed by the spell (consulted after the monster's hook)
// A real cinematic registers its card hook at the default priority (0): it outranks both of these (DEFAULT_PRIORITY).
//
// The event (engine/types.ts 'fusionSummon') comes BEFORE anything moves; this handler owns what follows it in the batch:
// one toGraveyard per material (+ the rule-destroys of a field material's equips, played as they come), the Fusion
// Monster's summon (from 'fusionDeck') — played at the end through its own chain — and leaves the spell's toGraveyard
// ('resolved') to the Director.
//
// Beats: the materials (hand cards rising from the hand, field units / tiles) are drawn into one light point above the
// destination zone while shrinking and fading; their cards drop into the graveyard; the point flares white, the Fusion
// Deck pile ticks down, and the Fusion Monster's summon plays (tile flash + summon entrance).

import { DEFAULT_PRIORITY, registerCardHook, registerEvent } from '../api';
import { all, attrOf, cardToGraveyard, takeHandCard } from '../_core/helpers';
import type { CinematicContext } from '../_core/types';
import type { GameEvent } from '../../engine/types';
import { PAL } from '../../art/palette';
import { DEPTH, zoneXY } from '../../view/layout';
import { flash, tween, wait } from '../../vfx/core';
import { tributeStream } from '../../vfx/summon';

type FusionCtx = CinematicContext<Extract<GameEvent, { type: 'fusionSummon' }>>;

async function placeholderFusion(ctx: FusionCtx): Promise<void> {
  const ev = ctx.ev;
  const v = ctx.views;
  const field = v.field;
  const sc = ctx.scene;
  await v.camera.unfocus(120);
  const dest = zoneXY(ev.player, 'monster', ev.zone);
  const point = { x: Math.round(dest.x), y: Math.round(dest.y - 34) };
  const matUids = new Set(ev.materials.map((m) => m.uid));
  // own the materials' graveyard arrivals and find the summon
  let summonAt = -1;
  for (let i = ctx.index + 1; i < ctx.events.length; i++) {
    const e = ctx.events[i];
    if (e.type === 'toGraveyard' && matUids.has(e.uid)) ctx.consumeAt(i);
    else if (e.type === 'destroy' && e.reason === 'rule' && e.sourceUid !== null && matUids.has(e.sourceUid)) void ctx.play(i);
    else if (e.type === 'summon' && e.uid === ev.uid) {
      summonAt = i;
      break;
    } else if (e.type !== 'toGraveyard' && e.type !== 'statChange') break;
  }
  ctx.sfx('summonCharge', { volume: 0.8 });
  // the light point
  const orb = sc.add.circle(point.x, point.y, 2, PAL.white, 1).setDepth(DEPTH.FX + 10);
  const halo = sc.add.circle(point.x, point.y, 6, PAL.void3, 0.45).setDepth(DEPTH.FX + 9);
  void tween(sc, { targets: halo, scale: 2.2, alpha: 0.7, duration: 900, ease: 'Sine.InOut' });
  const pulls: Promise<void>[] = [];
  ev.materials.forEach((m, i) => {
    pulls.push(
      (async () => {
        await wait(sc, i * 150);
        if (m.from === 'hand') {
          const card = takeHandCard(ctx, ev.player, m.uid, ctx.canSee(ev.player) ? m.cardId : null);
          card.setDepth(DEPTH.FX + 8);
          ctx.sfx('whoosh', { volume: 0.5, pitch: 1 + i * 0.08 });
          await tween(sc, { targets: card, x: point.x, y: point.y, scale: 0.15, alpha: 0.2, duration: 520, ease: 'Cubic.In' });
          card.destroy();
        } else {
          const { tile, unit } = field.release(m.uid);
          const from = tile ? tile.home : zoneXY(ev.player, 'monster', m.zone ?? 0);
          if (tile) void tile.dissolve(520).then(() => tile.destroy());
          ctx.sfx('tribute', { volume: 0.6, pitch: 1 + i * 0.08 });
          if (unit && unit.sprite.visible) {
            unit.badge.setVisible(false);
            await tributeStream(sc, unit.sprite, point, { attribute: attrOf(m.cardId) });
          } else await wait(sc, 520);
          unit?.retire();
          field.forget(m.uid);
          void from;
        }
        void cardToGraveyard(ctx, { owner: ctx.owner(m.uid), cardId: m.cardId, from: point, delay: 60 });
      })(),
    );
  });
  await all(pulls);
  // the flare: the point blooms white, the Fusion Deck gives up its card
  ctx.sfx('summonBurst', { volume: 0.9 });
  const pile = field.fusionPile(ev.player);
  if (pile) {
    pile.set(Math.max(0, pile.count - 1), null);
    pile.bump();
  }
  void flash(sc, 160, PAL.white, 0.55);
  await tween(sc, { targets: orb, scale: 9, alpha: 0, duration: 320, ease: 'Quad.Out' });
  void tween(sc, { targets: halo, alpha: 0, duration: 260 }).then(() => halo.destroy());
  orb.destroy();
  if (summonAt >= 0) await ctx.play(summonAt);
}

registerEvent('fusionSummon', placeholderFusion, { priority: DEFAULT_PRIORITY, name: 'fusionSummon' });
registerCardHook('trinity_crystal_wyrm', 'fusion', (ctx) => ctx.base(), { priority: DEFAULT_PRIORITY, name: 'fusionSummon:trinity_crystal_wyrm' });

/** toFusionDeck (a bounced Fusion Monster): the unit fades and its tile flies to the Fusion Deck pile. */
registerEvent(
  'toFusionDeck',
  async (ctx) => {
    const ev = ctx.ev;
    const field = ctx.views.field;
    const { tile, unit } = field.release(ev.uid);
    unit?.retire(0);
    const pile = field.fusionPile(ev.owner);
    if (tile) {
      const to = pile ? pile.topXY() : zoneXY(ev.owner, 'deck');
      ctx.sfx('whoosh', { volume: 0.5 });
      await tween(ctx.scene, { targets: tile, x: to.x, y: to.y, alpha: 0, duration: 380, ease: 'Cubic.In' }).catch(() => undefined);
      tile.destroy();
    }
    field.forget(ev.uid);
    if (pile) {
      pile.set(pile.count + 1, null);
      pile.bump();
    }
  },
  { priority: DEFAULT_PRIORITY, name: 'toFusionDeck' },
);
