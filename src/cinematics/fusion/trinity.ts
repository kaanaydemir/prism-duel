// Prism Fusion (prism_fusion) → Trinity Crystal Wyrm (trinity_crystal_wyrm): the fusion cinematic (?look=v3 only; the
// old look falls through to the chain below every hook, unchanged). Storyboard: docs/v3/FUSION_STORYBOARD.md. Pixel set
// pieces: ./_fx.ts; sounds: src/audio/v3/fusion.ts; the sprite's reveal: src/art/monsters-v3/trinity_crystal_wyrm-anims.ts
// (SUMMON_BEATS, trinityMarks).
//
// Three hooks, one stage (FusionStage) handed down the batch through ctx.play hints:
//   prism_fusion 'activate'            OPENING  the spell's v3 opening (card beside its duelist), its energy arcs over the
//                                               destination zone and CRYSTALLIZES into a spinning prism; the spent card
//                                               fires a white beam into it and the prism SPLITS it into a rainbow — one
//                                               ray to each material, a rainbow fan on the floor; the arena dims.
//   trinity_crystal_wyrm 'fusion'      GATHER   each material answers along its ray: a hand card rises out of the hand, a
//                                               field wyrm flashes white; its LIGHT-FORM (the wyrm's own frame as white /
//                                               cyan light) tears free and swoops up on whole pixels with afterimages in
//                                               its strand colour, while its card drops to the graveyard; at the orbit it
//                                               pours into a comet (magenta, gold, teal).
//                                      HELIX    the Fusion Deck gives up its card (a violet streak, the pile ticks down);
//                                               the three comets orbit faster and tighter, braiding a three-strand helix
//                                               round the prism; a fusion sigil inks itself in on the tile.
//                                      CORE     the inhale (everything sucked in, the darkest beat, sound drops to a sub
//                                               and silence) → ONE BLINDING POINT: hit-stop, a short white wash, a star,
//                                               rainbow shock rings across the floor + the arena's own big shockwave and
//                                               a screen glitch; a pillar of light stands on the tile.
//   trinity_crystal_wyrm 'summon'      BIRTH    (from 'fusionDeck') the cocoon is born white in the pillar and drops onto
//                                               the tile (f2 land) → the glass lights from inside (f3) → the wings unfold,
//                                               refracting a rainbow onto the floor (f4–5) → heads A, B, C rise and roar
//                                               one by one, each with its own light burst and voice (f7 / f9 / f11) → the
//                                               TRIPLE ROAR (f12): core rays, a rainbow ring, the arena sweep in the
//                                               owner's colour, a heavy shake → the cut-in "TRINITY CRYSTAL WYRM!" while
//                                               the body settles → the badge pops, sparkles fall, the light comes back.
// Reduced motion: the same beats, shorter (no spiral: the forms rise straight in), no shake / hit-stop / white wash,
// half the particles. Speed and fast-forward act on the scene clock every beat here runs on.

import { CARDS, isMonster, type CardId, type MonsterId } from '../../data/cards';
import type { GameEvent, PlayerId, Uid } from '../../engine/types';
import { PAL, RAMPS } from '../../art/palette';
import { DEPTH, LOOK_V3, type XY, zoneXY } from '../../view/layout';
import { lightDim, lightFlash, lightPool, type LightHandle } from '../../view/light';
import { REDUCED_MOTION } from '../../view/v3/motion';
import { shake, wait } from '../../vfx/core';
import { Sparks as PxSparks } from '../../vfx/combat';
import { freeze, qbez, run } from '../../vfx/setpieces';
import type { MonsterUnit } from '../../duel/MonsterUnit';
import type { TileCard } from '../../view/TileCard';
import { fx, registerCardHook, type CinematicContext } from '../api';
import { cardLeaves } from '../_v3/card';
import { cutInV3 } from '../_v3/cutin';
import { cutInRhythm } from '../_v3/presets';
import { atFrame, fade, panAt, play, start } from '../_v3/sound';
import { runSummon, type Stage } from '../summon-a/_kit';
import { spellOpening } from '../spells/_kit';
import { SUMMON_BEATS, trinityMarks } from '../../art/monsters-v3/trinity_crystal_wyrm-anims';
import {
  Comet,
  FU_DEPTH,
  Layer,
  LightForm,
  RAINBOW,
  RAINBOW_HI,
  STRAND,
  TAU,
  ease,
  formTexture,
  inCubic,
  outCubic,
  paintBeam,
  paintFloorFan,
  paintPillar,
  paintPrism,
  paintRay,
  paintRays,
  paintShockRings,
  paintSigil,
  paintStar,
  seg,
} from './_fx';

const ID = 'trinity_crystal_wyrm' as MonsterId;
const SPELL = 'prism_fusion' as CardId;
const MATERIAL = 'crystal_wyrm' as MonsterId;
const RM = REDUCED_MOTION;
/** each material's call, a step up the chord (E, G#, B) */
const CALL_PITCH = [1, 1.26, 1.498];

type FusionEv = Extract<GameEvent, { type: 'fusionSummon' }>;
type Material = FusionEv['materials'][number];
type AnyCtx = CinematicContext<GameEvent>;

const bg = (p: Promise<unknown>): void => {
  p.catch((e) => console.error('[fusion]', e));
};
const ri = (v: number): number => Math.round(v);

/** The arena's reactive layer (board-nt/react.ts debug hooks; absent on other boards). */
function ntReact(): {
  shock?: (p: PlayerId, spot: 'monster', i: number, amount: number) => void;
  sweep?: (p: PlayerId) => void;
  glitch?: () => void;
} | null {
  const n = (globalThis as { __neon?: Record<string, unknown> }).__neon;
  return (n?.ntReact as ReturnType<typeof ntReact>) ?? null;
}

// ================================================================ the stage

interface Ray {
  to: XY;
  color: number;
  hi: number;
  grow: number;
  lv: number;
}

/** Everything the three hooks share (handed down as hints.prismFusion / hints.fusion). */
export interface FusionStage {
  readonly player: PlayerId;
  readonly zone: number;
  /** the destination tile's floor point */
  readonly dest: XY;
  /** the vortex point over it (the prism) */
  readonly V: XY;
  readonly air: Layer;
  readonly floor: Layer;
  prism: {
    x: number;
    y: number;
    a: number;
    size: number;
    hot: number;
    spin: number;
  };
  beam: { from: XY | null; lv: number };
  rays: Ray[];
  fan: { lv: number; dir: number };
  sigil: { p: number; lv: number; spin: number; hot: number };
  pillar: { lv: number; hw: number };
  pools: LightHandle[];
  /** the spent spell card's way to its graveyard (the activation hook sets it) */
  leaveSpell: (() => Promise<void>) | null;
  disposed: boolean;
  dispose(): void;
}

function createStage(ctx: AnyCtx, player: PlayerId, zone: number): FusionStage {
  const sc = ctx.scene;
  const dest = zoneXY(player, 'monster', zone);
  const V = { x: ri(dest.x), y: ri(dest.y - 54) };
  const air = new Layer(sc, FU_DEPTH.air);
  const floor = new Layer(sc, FU_DEPTH.floor);
  const S: FusionStage = {
    player,
    zone,
    dest: { x: ri(dest.x), y: ri(dest.y) },
    V,
    air,
    floor,
    prism: { x: V.x, y: V.y, a: 0, size: 0, hot: 0, spin: 2.4 },
    beam: { from: null, lv: 0 },
    rays: [],
    fan: { lv: 0, dir: player === 0 ? Math.PI * 0.5 : -Math.PI * 0.5 },
    sigil: { p: 0, lv: 0, spin: 0, hot: 0 },
    pillar: { lv: 0, hw: 0 },
    pools: [],
    leaveSpell: null,
    disposed: false,
    dispose() {
      if (S.disposed) return;
      S.disposed = true;
      for (const p of S.pools) void p.fadeOut(300);
      S.pools = [];
      air.destroy();
      floor.destroy();
    },
  };
  // the standing painters: the floor (fan, sigil) and the air (rays, beam, prism, pillar)
  floor.add((g, el) => {
    paintFloorFan(g, S.dest, S.fan.dir, Math.PI * 0.9, 118, S.fan.lv, el);
    S.sigil.spin += 0.0;
    paintSigil(g, S.dest, 34, S.sigil.p, S.sigil.spin, S.sigil.lv, S.sigil.hot);
    return !S.disposed;
  });
  air.add((g, el, dt) => {
    const P = S.prism;
    P.a += (P.spin * dt) / 1000;
    if (S.pillar.lv > 0.02) paintPillar(g, S.dest.x, V.y, S.dest.y - 2, S.pillar.hw, S.pillar.lv, el);
    const tipB = { x: P.x, y: P.y + 20 };
    for (const r of S.rays) paintRay(g, tipB, r.to, r.color, r.hi, r.grow, r.lv, el);
    if (S.beam.from) paintBeam(g, S.beam.from, { x: P.x, y: P.y + 4 }, S.beam.lv, 1, el);
    paintPrism(g, P.x, P.y, P.a, P.size, P.hot);
    return !S.disposed;
  });
  return S;
}

/** Ease one numeric field of an object over `ms` (scene clock). */
function to<T extends object>(sc: Phaser.Scene, o: T, k: keyof T, v: number, ms: number, e: (t: number) => number = ease): Promise<void> {
  const v0 = o[k] as unknown as number;
  if (ms <= 0) {
    (o[k] as unknown as number) = v;
    return Promise.resolve();
  }
  return run(sc, ms, (t) => ((o[k] as unknown as number) = v0 + (v - v0) * e(t)));
}

/** Where a material is now (the prism's ray reaches for it): a hand card, a field body's core, a set card's tile. */
function materialAt(ctx: AnyCtx, player: PlayerId, m: Material): XY {
  const v = ctx.views;
  if (m.from === 'hand') {
    const h = v.hand.owner === player ? v.hand.cardXY(m.uid) : null;
    return h ?? v.hand.miniXY(player, 0);
  }
  const u = v.field.unit(m.uid);
  if (u && u.sprite.active && u.sprite.visible) return { x: ri(u.sprite.x), y: ri(u.sprite.y - 40) };
  const t = v.field.tileOf(m.uid);
  return t ? { x: ri(t.home.x), y: ri(t.home.y - 4) } : zoneXY(player, 'monster', m.zone ?? 0);
}

/** The prism crystallizes at V (it may already be there), and the split's rays reach for the materials. */
async function crystallize(ctx: AnyCtx, S: FusionStage, mats: readonly Material[], beamFrom: XY | null): Promise<void> {
  const sc = ctx.scene;
  const V = S.V;
  play('fusionPrism', { volume: 0.9, pan: panAt(V.x) });
  void lightFlash(sc, V.x, V.y, PAL.cyan4, 40, 420, {
    floorY: S.dest.y,
    intensity: 0.95,
    air: 0.7,
  });
  S.pools.push(
    lightPool(sc, V.x, V.y, {
      color: PAL.cyan3,
      radius: 34,
      floorY: S.dest.y,
      air: 0.55,
      airRadius: 18,
      intensity: 0.85,
      anim: 'shimmer',
      fadeIn: 120,
    }),
  );
  S.air.add((g, el) => {
    paintStar(g, V, 26 * (1 - seg(el, 0, 260)), 1 - seg(el, 120, 260));
    return el < 260;
  });
  // grows in whole-pixel steps
  await to(sc, S.prism, 'size', 1, 130, outCubic);
  // the beam from the spent card hits the prism; the prism splits it
  if (beamFrom) {
    S.beam.from = beamFrom;
    await to(sc, S.beam, 'lv', 1, 40);
  }
  play('fusionSplit', { volume: 0.85, pan: panAt(V.x) });
  void lightFlash(sc, V.x, V.y, PAL.white, 30, 260, {
    floorY: S.dest.y,
    intensity: 0.8,
  });
  S.prism.hot = 0.5;
  bg(to(sc, S.prism, 'hot', 0.15, 300));
  S.rays = mats.map((m, i) => ({
    to: materialAt(ctx, S.player, m),
    color: STRAND[i % 3][3],
    hi: STRAND[i % 3][4],
    grow: 0,
    lv: 1,
  }));
  // the floor fan and its coloured light
  bg(to(sc, S.fan, 'lv', 1, 220));
  const side = S.player === 0 ? 1 : -1;
  [PAL.mag3, PAL.gold3, PAL.teal3].forEach((c, i) => {
    S.pools.push(
      lightPool(sc, S.dest.x + (i - 1) * 34, S.dest.y + side * 30, {
        color: c,
        radius: 26,
        intensity: 0.55,
        anim: 'breathe',
        fadeIn: 260,
      }),
    );
  });
  const reach = Promise.all(S.rays.map((r, i) => wait(sc, i * 30).then(() => to(sc, r, 'grow', 1, 150, outCubic))));
  // the first material answers as its ray arrives
  await Promise.race([reach, wait(sc, 120)]);
}

// ================================================================ OPENING: prism_fusion 'activate'

registerCardHook(
  SPELL,
  'activate',
  async (ctx) => {
    const ev = ctx.ev;
    if (!LOOK_V3 || ev.kind !== 'spell') return ctx.base();
    const fi = ctx.findType('fusionSummon', (e) => e.spellUid === ev.uid);
    if (fi < 0) return ctx.base();
    const fEv = ctx.events[fi] as FusionEv;
    const gi = ctx.find((e) => e.type === 'toGraveyard' && e.uid === ev.uid, {
      until: (e) => e.type === 'activate' || e.type === 'decision',
    });
    const sc = ctx.scene;
    if (Math.abs(sc.cameras.main.scrollX) > 0.5 || Math.abs(sc.cameras.main.scrollY) > 0.5) await ctx.views.camera.unfocus(80);
    const op = await spellOpening(ctx, {
      uid: ev.uid,
      cardId: ev.cardId,
      player: ev.player,
      from: ev.from === 'spellTrap' ? 'set' : 'hand',
      zone: ev.zone,
      hold: 110,
      keepCard: true,
      releaseFrom: 'top',
    });
    const S = createStage(ctx, fEv.player, fEv.zone);
    void lightDim(sc, RM ? 0.4 : 0.55, 520);
    // the card's energy arcs over the destination zone and crystallizes into the prism there
    const cardTop = { x: ri(op.center.x), y: ri(op.center.y - 36) };
    await op.release(S.V, {
      ms: 230,
      path: 'arc',
      ramp: [PAL.white, PAL.cyan4, PAL.cyan3, PAL.cyan2, PAL.cyan1],
      size: 2,
    });
    await crystallize(ctx, S, fEv.materials, cardTop);
    S.leaveSpell = gi >= 0 && op.leave ? () => op.leave!(gi) : null;
    try {
      await ctx.play(fi, { prismFusion: S });
    } finally {
      const leave = S.leaveSpell as (() => Promise<void>) | null;
      S.leaveSpell = null;
      S.dispose();
      void lightDim(sc, 0, 600);
      if (leave) await leave();
    }
  },
  { priority: 20, name: 'fusion:prism_fusion:activate' },
);

// ================================================================ GATHER → HELIX → CORE: trinity 'fusion'

interface Strand {
  comet: Comet;
  /** in orbit (driven by the orbit) */
  on: boolean;
  slot: number;
}

registerCardHook(
  ID,
  'fusion',
  async (ctx) => {
    const ev = ctx.ev;
    if (!LOOK_V3) return ctx.base();
    const sc = ctx.scene;
    const field = ctx.views.field;
    const P = ev.player;
    // ---- the batch: the materials' graveyard moves (ours), the rule breaks of their equips (played as they lift), the
    // Fusion Monster's summon (played at the birth)
    const matUids = new Set(ev.materials.map((m) => m.uid));
    let summonAt = -1;
    const others: number[] = [];
    for (let i = ctx.index + 1; i < ctx.events.length; i++) {
      if (ctx.isConsumed(i)) continue;
      const e = ctx.events[i];
      if (e.type === 'summon' && e.uid === ev.uid) {
        summonAt = i;
        break;
      }
      if (e.type === 'toGraveyard' && matUids.has(e.uid)) ctx.consumeAt(i);
      else if (e.type === 'destroy' || e.type === 'toGraveyard' || e.type === 'toDeck' || e.type === 'damage' || e.type === 'statChange') others.push(i);
      else break;
    }
    if (summonAt < 0) return ctx.base();
    let S = (ctx.hints.prismFusion as FusionStage | undefined) ?? null;
    const ownStage = !S;
    if (!S) {
      // no opening (a later batch, a negated chain…): the prism is born here
      S = createStage(ctx, P, ev.zone);
      void lightDim(sc, RM ? 0.4 : 0.55, 400);
      await crystallize(ctx, S, ev.materials, null);
    }
    const st = S;
    const V = st.V;
    const pan = panAt(V.x);
    const n = ev.materials.length;
    const gather = start('fusionGather', { volume: 0.85, pan });
    try {
      // ---- the orbit: strands circle the prism from the moment they arrive
      const orbit = { r: 34, cy: V.y + 14, w: 2.8, base: 0 };
      const strands: Strand[] = ev.materials.map((_, i) => ({
        comet: new Comet(STRAND[i % 3], V),
        on: false,
        slot: i,
      }));
      const slotAt = (i: number): XY => {
        const a = orbit.base + (i * TAU) / Math.max(3, n);
        return {
          x: V.x + Math.cos(a) * orbit.r,
          y: orbit.cy + Math.sin(a) * orbit.r * 0.42,
        };
      };
      st.air.add((g, _el, dt) => {
        orbit.base += (orbit.w * dt) / 1000;
        for (const s of strands) {
          if (s.on) s.comet.push(slotAt(s.slot));
          s.comet.paint(g);
        }
        return !st.disposed;
      });
      const motes = new PxSparks(sc, FU_DEPTH.air + 1);

      // ---- GATHER: each material answers its ray
      let othersStarted = false;
      const playOthers = async () => {
        for (const i of others) if (!ctx.isConsumed(i)) await ctx.play(i);
      };
      let othersDone: Promise<void> = Promise.resolve();
      const handLeft = ctx.stateAt(summonAt).players[P].hand;
      const takes = ev.materials.map((m, i) =>
        (async () => {
          await wait(sc, i * (RM ? 110 : 150));
          if (m.from === 'monster' && !othersStarted) {
            othersStarted = true;
            othersDone = playOthers();
          }
          const born = m.from === 'hand' ? await fromHand(ctx, m, P, i) : await fromField(ctx, m, P, i);
          // the ray has done its work: it pulls back into the prism
          const r = st.rays[i];
          if (r) bg(to(sc, r, 'lv', 0, 160));
          play('fusionCall', {
            volume: 0.75,
            pitch: CALL_PITCH[i % 3],
            pan: panAt(born.form.img.x),
          });
          await flyToOrbit(sc, born.form, strands[i], () => slotAt(i), born.flip, motes);
        })(),
      );
      // a hidden hand shows what is left once its cards have gone
      if (ev.materials.some((m) => m.from === 'hand') && ctx.views.hand.owner !== P)
        bg(
          wait(sc, 60).then(() =>
            ctx.views.hand.setCards(
              handLeft.map((u) => ({
                uid: u,
                cardId: ctx.state.cards[u].cardId,
              })),
              P,
            ),
          ),
        );
      await Promise.all(takes);
      await othersDone;
      st.beam.lv = 0;
      bg(to(sc, st.fan, 'lv', 0.45, 300));

      // ---- HELIX: the Fusion Deck gives up its card; the strands braid round the prism, ever faster and tighter
      const helix = start('fusionHelix', { volume: 0.9, pan });
      bg(deckDraw(ctx, st));
      bg(ctx.focus({ x: V.x, y: V.y + 30 }, { pan: 0.22, ms: 700 }));
      void lightDim(sc, RM ? 0.5 : 0.72, 600);
      const follow = strands.map((s) =>
        lightPool(sc, V.x, V.y, {
          color: s.comet.ramp[3],
          radius: 22,
          floorY: st.dest.y,
          air: 0.4,
          airRadius: 10,
          intensity: 0.7,
          fadeIn: 120,
        }).follow(() => s.comet.head, { floorY: st.dest.y }),
      );
      st.pools.push(...follow);
      st.sigil.lv = 1;
      // the strands dive round the tile (the sigil inks in under them), then braid UP into the prism: a rising
      // three-strand helix whose trails draw the column
      const H = RM ? 380 : 720;
      const floorY = st.dest.y - 8;
      const cy0 = orbit.cy;
      await run(sc, H, (t) => {
        const k = inCubic(t);
        const dive = ease(seg(t, 0, 0.3));
        const climb = ease(seg(t, 0.3, 1));
        orbit.w = 3.5 + 20 * k;
        orbit.r = 34 + 12 * dive - 38 * climb;
        orbit.cy = cy0 + (floorY - cy0) * dive + (V.y - floorY) * climb;
        for (const s of strands) s.comet.len = 12 + Math.round(26 * t);
        st.prism.spin = 2.4 + 16 * k;
        st.prism.hot = 0.15 + 0.5 * t;
        st.sigil.p = ease(Math.min(1, t * 1.4));
        st.sigil.spin = -t * 3;
        if (!RM && Math.random() < 0.5) {
          const a = Math.random() * TAU;
          const d = 50 + Math.random() * 60;
          motes.add({
            x: V.x + Math.cos(a) * d,
            y: V.y + Math.sin(a) * d * 0.6,
            tx: V.x,
            ty: V.y,
            curl: 12,
            life: 260,
            colors: [RAINBOW[Math.floor(Math.random() * 6)], PAL.white],
            shape: 'px',
            fadeAt: 1,
          });
        }
      });

      // ---- CORE: the inhale …
      gather.stop(60);
      helix.stop(40);
      play('fusionCollapse', { volume: 0.95, pan });
      void lightDim(sc, RM ? 0.6 : 0.9, 200);
      for (let k = 0; k < (RM ? 10 : 26); k++) {
        const a = Math.random() * TAU;
        const d = 70 + Math.random() * 90;
        motes.add({
          x: V.x + Math.cos(a) * d,
          y: V.y + Math.sin(a) * d * 0.6,
          tx: V.x,
          ty: V.y,
          curl: 20,
          life: 200 + Math.random() * 80,
          colors: [PAL.white, PAL.cyan4, RAINBOW_HI[k % 6]],
          shape: k % 4 ? 'px' : 'plus',
          fadeAt: 1,
        });
      }
      bg(to(sc, st.fan, 'lv', 0, 200));
      for (const r of st.rays) r.lv = 0;
      await run(sc, RM ? 180 : 300, (t) => {
        const k = inCubic(t);
        orbit.r = 10 * (1 - k);
        orbit.w = 25 + 20 * t;
        orbit.cy = V.y;
        st.prism.size = 1 - 0.85 * k;
        st.prism.hot = 0.65 + 0.35 * t;
        st.sigil.hot = t;
      });
      for (const s of strands) s.comet.lit = 0;
      st.prism.size = 0;
      for (const p of follow) void p.fadeOut(60);
      // … the silence (the collapse's sound ends dead on the point) …
      await wait(sc, RM ? 30 : 70);
      // … and ONE BLINDING POINT
      burst(ctx, st);
      if (!RM) {
        bg(shake(sc, 260, 4));
        await freeze(sc, 110);
      }
      // the pillar the cocoon is born in; the spent spell card leaves now (its light is used up)
      st.pillar.lv = 1;
      st.pillar.hw = 7;
      bg(to(sc, st.pillar, 'hw', 4, 260));
      const leave = st.leaveSpell;
      st.leaveSpell = null;
      if (leave) bg(wait(sc, 260).then(leave));
      motes.release();
      await wait(sc, RM ? 60 : 120);

      // ---- BIRTH: the summon (its own hook below)
      await ctx.play(summonAt, { fusion: st, noCard: true });
    } finally {
      gather.stop(80);
      if (ownStage) {
        st.dispose();
        void lightDim(sc, 0, 600);
      }
      bg(ctx.unfocus(400));
    }
  },
  { priority: 20, name: 'fusion:trinity_crystal_wyrm:fusion' },
);

/** A hand material: the card rises out of the hand, turns white and its light-form tears free; the card drops to the GY. */
async function fromHand(ctx: AnyCtx, m: Material, P: PlayerId, i: number): Promise<{ form: LightForm; flip: boolean }> {
  const sc = ctx.scene;
  const card = fx.takeHandCard(ctx, P, m.uid, m.cardId);
  card
    .setRotation(0)
    .setScale(1)
    .setDepth(DEPTH.FX + 12);
  card.setCard(m.cardId);
  card.setFaceUp(true);
  const cam = sc.cameras.main;
  const p0 = {
    x: ri(card.x + (cam.zoom === 1 ? cam.scrollX : 0)),
    y: ri(card.y + (cam.zoom === 1 ? cam.scrollY : 0)),
  };
  card.setPosition(p0.x, p0.y);
  const top = { x: p0.x, y: Math.min(p0.y - 44, 268) };
  await run(sc, RM ? 140 : 200, (t) => card.active && card.setPosition(p0.x, ri(p0.y + (top.y - p0.y) * outCubic(t))));
  void card.pulse(PAL.white, 140);
  void lightFlash(sc, top.x, top.y, STRAND[i % 3][3], 30, 300, {
    floorY: top.y + 34,
    intensity: 0.8,
    air: 0.6,
  });
  const f = formTexture(sc, MATERIAL, 'idle', 0);
  const flip = P === 1;
  const form = new LightForm(sc, f ?? { key: '__WHITE', w: 2, h: 2, ax: 1, ay: 1 }, { x: top.x, y: top.y + 34 }, flip, FU_DEPTH.form);
  await bornWhite(sc, form);
  // the empty card falls to its graveyard (the pile's own iso card is born where it hovered)
  const at = { x: ri(card.x), y: ri(card.y + 20) };
  card.destroy();
  bg(
    fx.cardToGraveyard(ctx, {
      owner: ctx.owner(m.uid),
      cardId: m.cardId,
      from: at,
      delay: 40,
    }),
  );
  return { form, flip };
}

/** A field material: the body (or the set card, flipped up first) flashes white, its light-form rises off it. */
async function fromField(ctx: AnyCtx, m: Material, P: PlayerId, i: number): Promise<{ form: LightForm; flip: boolean }> {
  const sc = ctx.scene;
  const field = ctx.views.field;
  const rel = field.release(m.uid);
  const tile: TileCard | null = rel.tile ?? null;
  const unit: MonsterUnit | null = rel.unit && rel.unit.sprite.active && rel.unit.sprite.visible ? rel.unit : null;
  let at: XY;
  let f: ReturnType<typeof formTexture>;
  let flip = P === 1;
  if (unit) {
    unit.badge.setVisible(false);
    const fi = unit.frameInfo();
    f = formTexture(sc, unit.cardId, fi.anim ?? 'idle', fi.frame) ?? formTexture(sc, MATERIAL, 'idle', 0);
    at = { x: ri(unit.sprite.x), y: ri(unit.sprite.y) };
    flip = unit.flipX;
  } else {
    // a set wyrm answers too: its card turns face up on the tile first
    if (tile && tile.active) {
      tile.setCard(m.cardId);
      ctx.sfx('cardFlip', { volume: 0.6 });
      await tile.flipUp(RM ? 160 : 220);
    }
    f = formTexture(sc, MATERIAL, 'idle', 0);
    at = tile ? { x: ri(tile.home.x), y: ri(tile.home.y) } : zoneXY(P, 'monster', m.zone ?? 0);
  }
  void lightFlash(sc, at.x, at.y - 30, STRAND[i % 3][3], 34, 320, {
    floorY: at.y,
    intensity: 0.85,
  });
  const form = new LightForm(sc, f ?? { key: '__WHITE', w: 2, h: 2, ax: 1, ay: 1 }, at, flip, FU_DEPTH.form);
  if (unit) unit.sprite.setVisible(false);
  await bornWhite(sc, form);
  unit?.retire(0);
  field.forget(m.uid);
  const home = tile ? { x: ri(tile.home.x), y: ri(tile.home.y) } : at;
  bg(
    cardLeaves(ctx, {
      owner: ctx.owner(m.uid),
      cardId: m.cardId,
      from: home,
      tile,
      delay: 80,
    }),
  );
  // it lifts off the floor
  await run(sc, RM ? 90 : 140, (t) => form.moveTo(at.x, at.y - 10 * outCubic(t)));
  return { form, flip };
}

/** Two frames of solid white, then the light-form's own bands. */
async function bornWhite(sc: Phaser.Scene, form: LightForm): Promise<void> {
  form.img.setTintFill(PAL.white);
  await wait(sc, 50);
  if (form.img.active) form.img.clearTint();
}

/** The light-form swoops to its slot on the orbit (whole px, afterimages), then pours into its comet. */
async function flyToOrbit(sc: Phaser.Scene, form: LightForm, s: Strand, slot: () => XY, flip0: boolean, motes: PxSparks): Promise<void> {
  const ramp = s.comet.ramp;
  const ay = form.img.height * form.img.originY;
  const off = Math.round(ay * 0.45);
  const p0 = { x: form.img.x, y: form.img.y };
  const ms = RM ? 280 : 420;
  let lastTrail = -999;
  let lastX = p0.x;
  let flip = flip0;
  await run(sc, ms, (t, el) => {
    const end = slot();
    const e = { x: end.x, y: end.y + off };
    // a wide swoop: out to the side and up, then into the orbit
    const side = e.x >= p0.x ? -1 : 1;
    const c = RM ? { x: (p0.x + e.x) / 2, y: (p0.y + e.y) / 2 } : { x: (p0.x + e.x) / 2 + side * 70, y: Math.min(p0.y, e.y) - 30 };
    const p = qbez(p0, c, e, ease(t));
    form.moveTo(p.x, p.y);
    const dx = p.x - lastX;
    if (Math.abs(dx) > 0.6) {
      const f = dx < 0;
      if (f !== flip) {
        flip = f;
        form.face(f);
      }
    }
    lastX = p.x;
    if (!RM && el - lastTrail >= 40) {
      lastTrail = el;
      form.trail(ramp[3], 0.45);
    }
  });
  // it pours into its comet: three alpha steps while its light bursts into the strand
  const ctr = form.centre();
  s.comet.push(slot());
  s.on = true;
  for (let k = 0; k < (RM ? 6 : 14); k++) {
    const a = (k / 14) * TAU;
    motes.add({
      x: ctr.x + Math.cos(a) * 18,
      y: ctr.y + Math.sin(a) * 22,
      tx: s.comet.head.x,
      ty: s.comet.head.y,
      curl: 8,
      life: 180,
      colors: [PAL.white, ramp[4], ramp[3]],
      shape: 'px',
      fadeAt: 1,
    });
  }
  void lightFlash(sc, ctr.x, ctr.y, ramp[3], 30, 260, {
    floorY: ctr.y + 60,
    intensity: 0.8,
  });
  for (const a of [0.65, 0.35]) {
    form.img.setAlpha(a);
    await wait(sc, 34);
  }
  form.destroy();
}

/** The Fusion Deck gives up its card: a violet streak from the pile into the prism; the pile ticks down. */
async function deckDraw(ctx: AnyCtx, S: FusionStage): Promise<void> {
  const sc = ctx.scene;
  const pile = ctx.views.field.fusionPile(S.player);
  if (!pile) return;
  const from = pile.topXY();
  play('fusionDeckDraw', { volume: 0.8, pan: panAt(from.x) });
  pile.set(Math.max(0, pile.count - 1), null);
  pile.bump();
  void pile.flash(PAL.void4);
  void lightFlash(sc, from.x, from.y, PAL.void3, 26, 300, { intensity: 0.8 });
  const c = new Comet(RAMPS.void, from);
  c.len = 12;
  const ctrl = { x: (from.x + S.V.x) / 2, y: Math.min(from.y, S.V.y) - 40 };
  let pos = from;
  const done = S.air.add((g) => {
    c.push(pos);
    c.paint(g);
  });
  await run(sc, RM ? 220 : 320, (t) => (pos = qbez(from, ctrl, S.V, ease(t))));
  done();
  void lightFlash(sc, S.V.x, S.V.y, PAL.void4, 26, 220, {
    floorY: S.dest.y,
    intensity: 0.7,
  });
  S.prism.hot = Math.max(S.prism.hot, 0.6);
}

/** The blinding point: sound, star, rainbow shock rings on the floor, the arena's shockwave + glitch, a light surge. */
function burst(ctx: AnyCtx, S: FusionStage): void {
  const sc = ctx.scene;
  const V = S.V;
  play('fusionBurst', { volume: 1, pan: panAt(V.x) });
  S.air.add((g, el) => {
    const L = el < 90 ? 20 + (el / 90) * 80 : 100 * (1 - seg(el, 90, 460));
    paintStar(g, V, L, 1 - seg(el, 300, 460));
    return el < 460;
  });
  const R = RM ? 160 : 320;
  for (const [delay, lv] of RM
    ? [[0, 0.9]]
    : [
        [0, 1],
        [140, 0.55],
      ]) {
    S.floor.add((g, el) => {
      const t = seg(el - delay, 0, 720);
      if (t <= 0) return true;
      paintShockRings(g, S.dest, 6 + outCubic(t) * R, lv * (1 - t));
      return t < 1;
    });
  }
  const nt = ntReact();
  try {
    nt?.shock?.(S.player, 'monster', S.zone, 3000);
    if (!RM) nt?.glitch?.();
  } catch (e) {
    console.warn('[fusion] arena react', e);
  }
  void lightFlash(sc, V.x, V.y, PAL.white, 90, 700, {
    floorY: S.dest.y,
    intensity: 1,
    ring: true,
    air: 1,
  });
  void lightDim(sc, RM ? -0.4 : -0.85, 40).then(() => lightDim(sc, RM ? 0.3 : 0.4, 560));
  S.sigil.lv = 0;
}

// ================================================================ BIRTH: trinity 'summon' (from the Fusion Deck)

registerCardHook(
  ID,
  'summon',
  async (ctx) => {
    if (!LOOK_V3) return ctx.base();
    const ev = ctx.ev;
    if (ev.from !== 'fusionDeck') return ctx.base();
    await runSummon(ctx, birth, birth);
  },
  { priority: 20, name: 'fusion:trinity_crystal_wyrm:summon' },
);

async function birth(G: Stage): Promise<void> {
  const ctx = G.ctx;
  const sc = G.scene;
  const u = G.unit;
  const given = (ctx.hints.fusion as FusionStage | undefined) ?? null;
  const S = given ?? createStage(ctx as unknown as AnyCtx, G.player, G.ev.zone);
  const home = { x: ri(G.home.x), y: ri(G.home.y) };
  const pan = panAt(home.x);
  const mark = (f: number, k: 'mouths' | 'core', i = 0): XY => {
    const M = trinityMarks('summon', f);
    const p = k === 'core' ? M.core : M.mouths[i];
    const w = u.framePoint(p[0], p[1]);
    return { x: ri(w.x), y: ri(w.y) };
  };
  if (!u.has('summon')) {
    S.pillar.lv = 0;
    if (!given) S.dispose();
    return;
  }
  // the cocoon is born white inside the pillar
  u.sprite.setPosition(ri(u.rest0.x), ri(u.rest0.y));
  u.pose('summon', 0);
  u.showSprite();
  u.badge.setVisible(false);
  u.sprite.setTintFill(PAL.white);
  bg(
    wait(sc, 70)
      .then(() => u.sprite.active && u.sprite.setTint(PAL.cyan4))
      .then(() => wait(sc, 50))
      .then(() => u.sprite.active && u.sprite.clearTint()),
  );
  bg(ctx.focus({ x: home.x, y: home.y - 40 }, { pan: 0.28, ms: 460 }));
  const glow = G.glow({
    color: PAL.cyan3,
    radius: 46,
    intensity: 0.6,
    anim: 'breathe',
    fadeIn: 80,
  });
  const refr: LightHandle[] = [];

  // f2 LAND
  atFrame(
    u,
    'summon',
    SUMMON_BEATS.land,
    () => {
      play('trinityLand', { volume: 1, pan });
      bg(to(sc, S.pillar, 'lv', 0, 160));
      void lightFlash(sc, home.x, home.y - 6, PAL.cyan4, 54, 380, {
        floorY: home.y,
        intensity: 0.95,
        ring: true,
      });
      u.tile?.dust(RM ? 6 : 16, 1.4);
      if (!RM) bg(shake(sc, 170, 3));
      S.floor.add((g, el) => {
        const t = seg(el, 0, 380);
        paintShockRings(g, home, 8 + outCubic(t) * 56, 1 - t, [PAL.gold4, PAL.gold3, PAL.cyan3]);
        return t < 1;
      });
    },
    { maxMs: 4000 },
  );
  // f3 the glass lights from inside
  atFrame(
    u,
    'summon',
    SUMMON_BEATS.flare,
    () => {
      play('trinityFlare', { volume: 0.9, pan });
      const c = mark(SUMMON_BEATS.flare, 'core');
      void lightFlash(sc, c.x, c.y, PAL.white, 60, 420, {
        floorY: home.y,
        intensity: 1,
        air: 0.8,
      });
      glow.setIntensity(1, 60);
      S.air.add((g, el) => {
        const t = seg(el, 0, 300);
        paintRays(g, c, 8, 4, 18 * Math.sin(Math.PI * t), 1 - t * 0.6, [PAL.cyan4, PAL.gold4], 0.2);
        return t < 1;
      });
    },
    { maxMs: 4000 },
  );
  // f4–5 the wings unfold: the prism wings refract a rainbow onto the floor
  atFrame(
    u,
    'summon',
    SUMMON_BEATS.unfold[0],
    () => {
      play('trinityUnfold', { volume: 0.85, pan });
      const side = G.dir;
      S.floor.add((g, el) => {
        const lv = seg(el, 0, 200) * (S.disposed ? 0 : 1);
        paintFloorFan(g, home, Math.PI + 0.35 * side, 1.1, 96, lv * 0.85, el);
        paintFloorFan(g, home, 0 - 0.35 * side, 1.1, 96, lv * 0.85, el);
        return !S.disposed;
      });
      for (const [dx, c] of [
        [-46, PAL.mag3],
        [0, PAL.gold3],
        [46, PAL.teal3],
      ] as const)
        refr.push(
          lightPool(sc, home.x + dx, home.y + 8, {
            color: c,
            radius: 30,
            intensity: 0.7,
            anim: 'shimmer',
            fadeIn: 180,
          }),
        );
    },
    { maxMs: 4000 },
  );
  // f7 / f9 / f11: heads A, B, C roar one by one
  (['trinityRoarA', 'trinityRoarB', 'trinityRoarC'] as const).forEach((name, i) => {
    const f = SUMMON_BEATS.roar[i];
    atFrame(
      u,
      'summon',
      f,
      () => {
        play(name, { volume: 0.95, pan });
        const m = mark(f, 'mouths', i);
        const ramp = STRAND[i];
        void lightFlash(sc, m.x, m.y, ramp[3], 34, 340, {
          floorY: home.y,
          intensity: 0.95,
          air: 0.8,
        });
        if (!RM) bg(shake(sc, 110, i === 2 ? 2 : 1));
        S.air.add((g, el) => {
          const t = seg(el, 0, 280);
          paintRays(g, m, 8, 2, 14 * Math.sin(Math.PI * Math.min(1, t * 1.3)), 1 - t * 0.5, [ramp[4], ramp[3]], i * 0.4);
          return t < 1;
        });
      },
      { maxMs: 4000 },
    );
  });
  // f12 the triple roar
  atFrame(
    u,
    'summon',
    SUMMON_BEATS.triple,
    () => {
      play('trinityTriple', { volume: 1, pan });
      const c = mark(SUMMON_BEATS.triple, 'core');
      void lightFlash(sc, c.x, c.y, PAL.white, 110, 640, {
        floorY: home.y,
        intensity: 1,
        ring: true,
        air: 1,
      });
      for (let i = 0; i < 3; i++) {
        const m = mark(SUMMON_BEATS.triple, 'mouths', i);
        void lightFlash(sc, m.x, m.y, STRAND[i][3], 30, 420, {
          floorY: home.y,
          intensity: 0.9,
        });
      }
      void lightDim(sc, -0.3, 60).then(() => lightDim(sc, 0.2, 420));
      if (!RM) bg(shake(sc, 380, 4));
      try {
        ntReact()?.sweep?.(G.player);
      } catch {
        /* the arena may not react */
      }
      S.air.add((g, el) => {
        const t = seg(el, 0, 520);
        paintRays(g, c, 14, 6, 54 * Math.sin(Math.PI * Math.min(1, t * 1.15)), 1 - t * 0.7, RAINBOW_HI, el * 0.0015);
        return t < 1;
      });
      S.floor.add((g, el) => {
        const t = seg(el, 0, 640);
        paintShockRings(g, home, 10 + outCubic(t) * (RM ? 120 : 220), 1 - t);
        return t < 1;
      });
      glow.setIntensity(1.3, 40);
    },
    { maxMs: 4000 },
  );

  // the cut-in starts on the triple roar (the band passes under its feet while the roar holds), its own sting; the
  // generic cut-in accents step back
  const R = cutInRhythm(ID);
  let ci: { exit: Promise<void> } | null = null;
  const startCut = () => {
    if (ci) return;
    const name = CARDS[ID] && isMonster(CARDS[ID]) ? CARDS[ID].name : 'Trinity Crystal Wyrm';
    const clear = fx.screenPoint(ctx as unknown as AnyCtx, {
      x: home.x,
      y: home.y + 22,
    });
    ci = cutInV3(sc, {
      monsterId: ID,
      name,
      attribute: 'LIGHT',
      player: G.player,
      clear,
    });
    play('trinityCutin', { volume: 0.9, pan: 0 });
    bg(wait(sc, 1).then(() => fade(['cutIn'], 30)));
    bg(wait(sc, 61).then(() => fade(['whoosh'], 40)));
    bg(wait(sc, R.flare + 1).then(() => fade(['roarBig'], 40)));
    bg(wait(sc, R.slam + 1).then(() => fade(['cardSlam', 'impactHeavy'], 30)));
    bg(wait(sc, R.exit + 1).then(() => fade(['summonBurst'], 40)));
  };
  atFrame(u, 'summon', SUMMON_BEATS.triple, () => void wait(sc, 140).then(startCut), { maxMs: 4000 });
  await u.playRange('summon', 0);
  startCut();
  u.rest();
  await Promise.race([(ci as { exit: Promise<void> } | null)?.exit ?? Promise.resolve(), wait(sc, 1000)]);
  // the badge, the sparkle tail, the light comes back
  play('fusionSparkle', { volume: 0.8, pan });
  bg(u.badge.pop());
  const tail = new PxSparks(sc, FU_DEPTH.air + 1);
  for (let k = 0; k < (RM ? 10 : 26); k++) {
    tail.add({
      x: home.x + (Math.random() - 0.5) * 120,
      y: home.y - 110 + Math.random() * 40,
      vy: 14 + Math.random() * 18,
      vx: (Math.random() - 0.5) * 8,
      life: 700 + Math.random() * 500,
      delay: Math.random() * 300,
      colors: [PAL.white, RAINBOW_HI[k % 6], RAINBOW[k % 6]],
      shape: k % 5 ? 'px' : 'plus',
      fadeAt: 0.6,
      flicker: true,
    });
  }
  tail.release();
  void lightDim(sc, 0, 700);
  glow.setIntensity(0.5, 500);
  for (const p of refr) void p.fadeOut(700);
  void glow.fadeOut(900);
  await wait(sc, 200);
  if (!given) S.dispose();
}
