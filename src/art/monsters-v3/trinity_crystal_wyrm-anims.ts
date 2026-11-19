// Trinity Crystal Wyrm — every animation as poses of the rig (trinity_crystal_wyrm-rig.ts), with per-frame holds,
// marks and points. Weight 'heavy': long anticipations, short strikes, readable recoveries; the feet stay planted
// (IK) in every loop and transition. Every one-shot ends on idle f0 (or within a pixel of it), the loops close.
//
// The three heads are never one block: in the idle they ride three phases of one slow wave (a third of the loop
// apart), blink on their own frames, and the breath reaches them a frame after the chest; in the roar and the summon
// they rise and roar ONE BY ONE (A, B, C) before the triple roar; in the attack they draw back together and aim at
// one point — the braid — where their three rays twist into one.

import type { AnimSpec, AnyMonsterAnim, MonsterAnim, MonsterAnimExtra, MonsterPoints } from '../types';
import { GY, braidPoint, corePoint, eyePoint, headPos, legs, lerpPose, mouthPoint, pose, rig, type Head, type HeadDelta, type Pose, type PoseDelta } from './trinity_crystal_wyrm-rig';
import { add, polar, rnd, type V } from './trinity_crystal_wyrm-gbuf';

const TAU = Math.PI * 2;
const sin = Math.sin;
const mod = (a: number, n: number) => ((a % n) + n) % n;

// ------------------------------------------------------------------ idle (20 frames, 1.98 s)
//
//   body   two breaths a loop (the hip sinks 1 px on f4–7 and f14–17; the knees take it, the feet stay);
//   heads  one slow wave a loop, the three a third of a loop apart (A leads, B, C follow): each bobs ±1 px, sways
//          ±1 px and nods a few degrees; the breath reaches them a frame late; each blinks on its own frames;
//   wings  follow the breath one, two, three frames late (shoulder → wrist → tips), the membranes billow later;
//          the prism edge shimmers (the rainbow dashes march 0.625 px a frame: 12.5 px a loop = one dash cycle);
//   core   pulses twice a loop (in step with the breath), the veins with it; one glint on its lit facet (f9–11);
//   tail   one slow wave a loop.

export const IDLE_N = 20;
function idleDip(f: number): number {
  const g = mod(f, IDLE_N);
  return (g >= 4 && g <= 7) || (g >= 14 && g <= 17) ? 1 : 0;
}
const BLINK: readonly (readonly number[])[] = [
  [5, 6, 7],
  [11, 12, 13],
  [16, 17, 18],
];
function blinkOf(i: number, f: number): number {
  const k = BLINK[i].indexOf(mod(f, IDLE_N));
  return k < 0 ? 1 : k === 1 ? 0 : 0.5;
}

export function idlePose(f: number): Pose {
  const t = mod(f, IDLE_N) / IDLE_N;
  const br = (lag: number) => sin(2 * TAU * t - lag);
  const rel = (lag: number) => br(lag) - sin(-lag);
  const b = br(0);
  // the body holds still (a 1-px sink of this big white mass would shift most of its planes: the breath is carried
  // by the necks, the wings, the core and the crystals instead); the old sink survives as the necks' and tail's lag
  const dip = 0;
  const late = (n: number) => idleDip(f - n) - dip;
  const head = (i: number): HeadDelta => {
    const ph = (i * TAU) / 3;
    return {
      dy: Math.round(1.05 * sin(TAU * t - ph)),
      dx: 0,
      da: 0.03 * sin(2 * TAU * t - ph - 0.7),
      eye: blinkOf(i, f),
    };
  };
  const g = mod(f, IDLE_N);
  return pose({
    hy: dip,
    wingDy: 0,
    tailLag: [idleDip(f - 1), idleDip(f - 2)],
    h: [head(0), head(1), head(2)],
    nw: { a1: -122 - 1.6 * b, a2: -140 - 1.6 * br(Math.PI / 6), a3: -104 - 2 * br(Math.PI / 3), scal: 1 + 0.13 * rel(1.6), lag: late(1) },
    fw: { a1: -78 - 1.6 * rel(0.35), a2: -96 - 1.6 * rel(Math.PI / 6 + 0.35), a3: -78 - 2 * rel(Math.PI / 3 + 0.35), scal: 1 + 0.12 * rel(2), lag: late(2) },
    tail: 2 * t,
    tailAmp: 4,
    arm: br(1.2) > 0.3 ? 3 : 0,
    core: 0.5 + 0.45 * br(0.3),
    glow: 0.3 + 0.15 * br(0.6),
    shimmer: g * 0.625,
    glint: g === 10 ? 2 : g === 9 || g === 11 ? 1 : 0,
    // the light pulse runs out from the core along the crystals twice a loop (on the breath)
    wave: mod(3 * t, 1),
  });
}
const IDLE_HOLDS = Array.from({ length: IDLE_N }, (_, f) => (f === 6 || f === 12 || f === 17 ? 80 : 100));

// ------------------------------------------------------------------ guard (8 frames, 1.26 s)
//
// The cocoon: the wings wrapped forward round the body (a prism shield), the three heads drawn down behind it, the
// crouch breathing — one part a frame (membrane fills, the chest sinks, the wings settle, the heads), the edge of
// the shield shimmering, the core glowing through.

const GUARD_N = 8;
const G_CHEST = [0, 0, 1, 1, 1, 1, 0, 0];
const G_WING = [0, 0, 0, 1, 1, 1, 1, 0];
const G_HEAD = [0, 0, 0, 0, 1, 1, 1, 1];
const G_BULGE = [0, 1, 1, 1, 1, 0, 0, 0];
const GUARD_HEADS: readonly HeadDelta[] = [
  { dx: -8, dy: 15, da: 0.32 },
  { dx: -14, dy: 12, da: 0.4 },
  { dx: -12, dy: 4, da: 0.42 },
];
export function guardPose(f: number): Pose {
  const g = mod(f, GUARD_N);
  const at = (a: number[], n: number) => a[mod(g - n, GUARD_N)];
  const c = at(G_CHEST, 0);
  const hd = at(G_HEAD, 0) - c;
  return pose({
    guard: true,
    hy: 4 + c,
    lean: 0.14,
    h: GUARD_HEADS.map((h, i) => ({ ...h, dy: (h.dy ?? 0) + hd + (i === 1 && g >= 5 ? -1 : 0), eye: i === 2 && (g === 3 || g === 4) ? 0.5 : 1 })) as unknown as [HeadDelta, HeadDelta, HeadDelta],
    wingDy: at(G_WING, 0) - c,
    tailLag: [at(G_CHEST, 1) - c, at(G_CHEST, 2) - c],
    nw: { a1: -58, a2: 34, a3: 74, fan: 22, scal: G_BULGE[g] ? 1.2 : 0.98 },
    fw: { a1: -44, a2: 54, a3: 84, fan: 15, scal: G_BULGE[g] ? 1.14 : 0.98 },
    tailLift: -12,
    tailAmp: 2.5,
    tail: g / GUARD_N + 0.1,
    arm: 24,
    core: 0.55 + 0.3 * sin((g / GUARD_N) * TAU),
    glow: 0.4,
    shimmer: g,
  });
}
const GUARD_HOLDS = [180, 150, 140, 160, 180, 150, 140, 160];

// ------------------------------------------------------------------ transitions (6 frames each, ≤ 0.4 s)

function toGuardPose(f: number): Pose {
  const a = idlePose(0);
  const b = guardPose(0);
  const ts = [0.12, 0.3, 0.52, 0.72, 0.88, 1];
  const t = ts[f];
  const P = lerpPose(a, b, t);
  // the wing sweep needs the wrap in-betweens (the membranes slide to the wrap, then the guard layout takes over)
  if (t < 0.6) return { ...P, guard: false, wrap: t / 0.6, nw: lerpPose(a, { ...b, nw: { ...b.nw, a1: -74, a2: -20, a3: 12, fan: -12 } }, t).nw };
  return { ...P, guard: true, wrap: 1 };
}
function fromGuardPose(f: number): Pose {
  const a = guardPose(0);
  const b = idlePose(0);
  const ts = [0.12, 0.3, 0.5, 0.7, 0.88, 1];
  const t = ts[f];
  const P = lerpPose(a, b, t);
  if (t < 0.45) return { ...P, guard: true, wrap: 1 };
  if (t < 1) return { ...P, guard: false, wrap: 1 - (t - 0.45) / 0.55, nw: lerpPose({ ...a, nw: { ...a.nw, a1: -74, a2: -20, a3: 12, fan: -12 } }, b, t).nw };
  return P;
}
const TO_GUARD_HOLDS = [50, 60, 60, 70, 70, 80];
const FROM_GUARD_HOLDS = [50, 60, 60, 70, 70, 80];

// ------------------------------------------------------------------ roar (12 frames) — the triple roar
//
// gather (crouch, the three heads down and back, wings tucked, the core drawing in: long) → the body rears and the
// wings fling open → the heads roar in a wave (A, then B, then C a frame apart) → all three roar, trembling → fold.

const H0 = (o: HeadDelta = {}): HeadDelta => o;
const R_GATHER: PoseDelta = {
  hy: 3,
  lean: 0.08,
  h: [H0({ dx: -4, dy: 5, da: 0.3 }), H0({ dx: -6, dy: 4, da: 0.32 }), H0({ dx: -5, dy: 3, da: 0.35 })],
  nw: { a1: -98, a2: -112, a3: -84, fan: -34, scal: 0.92 },
  fw: { a1: -70, a2: -86, a3: -70, fan: -26 },
  core: 0.3,
  glow: 0.6,
  tailLift: -6,
};
const roarHead = (jaw: number, up: number, tremble = 0): HeadDelta => ({ dx: 2 + tremble, dy: -3 - up, da: -0.32 * Math.min(1, jaw + 0.3), jaw, eye: 1 });
const R_REAR = (jaws: [number, number, number], tremble = 0, rays = 0.6): PoseDelta => ({
  hy: -2,
  lean: -0.12,
  h: [roarHead(jaws[0], 2, tremble), roarHead(jaws[1], 1, -tremble), roarHead(jaws[2], 0, tremble)],
  nw: { a1: -128, a2: -148, a3: -112, fan: -44, span: 1.04, scal: 1.15 },
  fw: { a1: -88, a2: -108, a3: -88, fan: -34, span: 1.05 },
  tailLift: 10,
  tailAmp: 6,
  arm: 14,
  core: 1,
  glow: 0.95,
  rays,
});
function roarPose(f: number): Pose {
  const base = (d: PoseDelta) => pose({ ...d, shimmer: f * 1.5 });
  switch (f) {
    case 0:
      {
      // the first stir: the heads dip, the core draws in
      const P = idlePose(0);
      P.h.forEach((h) => ((h.dy += 1), (h.da += 0.06)));
      return { ...P, core: 0.2, glint: 0 };
    }
    case 1:
      return base(R_GATHER);
    case 2:
      return base({ ...R_GATHER, hy: 4, core: 0.5 });
    case 3:
      return lerpPose(base(R_GATHER), base(R_REAR([0, 0, 0], 0, 0)), 0.45);
    case 4:
      return base(R_REAR([0.5, 0.2, 0], 0, 0.3));
    case 5:
      return base(R_REAR([1, 0.6, 0.2]));
    case 6:
      return base(R_REAR([1, 1, 0.7], 1, 0.8));
    case 7:
      return base(R_REAR([1, 1, 1], -1, 1));
    case 8:
      return base(R_REAR([0.9, 1, 1], 1, 0.8));
    case 9:
      return lerpPose(base(R_REAR([0.4, 0.5, 0.6], 0, 0.3)), idlePose(0), 0.35);
    case 10:
      return lerpPose(base(R_REAR([0, 0, 0.2], 0, 0)), idlePose(0), 0.7);
    default:
      return idlePose(0);
  }
}
const ROAR_HOLDS = [90, 160, 140, 60, 60, 60, 70, 90, 80, 100, 110, 120];

// ------------------------------------------------------------------ attack (14 frames) — "Trinity Prism Braid"
//
// The three heads draw back together, their mouths gathering light while the core blazes and its rays grow (the
// long anticipation, f4 the longest); the heads lunge and aim at one point in front of the centre snout — A noses
// down, C up, B straight — and their three rays (void, gold, cyan: the prism split three ways) braid into one at
// the braid point (release f7 = impact; contact f8, the braid blazing white: the cinematic's beam leaves from the
// muzzle = the braid point); the rays fade, the heads recover.

const pull = (i: number, k: number, mouth: number): HeadDelta => ({ dx: -5 * k, dy: (i === 0 ? -2 : i === 1 ? -1 : 1) * k, da: -0.12 * k, mouth, eye: 1 });
const AIM: readonly HeadDelta[] = [
  { dx: 15, dy: -4, da: 0.08 },
  { dx: 2, dy: 1, da: 0.02 },
  { dx: 7, dy: 1, da: -0.2 },
];
const aim = (i: number, jaw: number, back = 0): HeadDelta => ({ ...AIM[i], dx: (AIM[i].dx ?? 0) - back, jaw: jaw * 0.72, eye: 1, blaze: 1 });
const A_CHARGE = (k: number, mouth: number, d: PoseDelta = {}): PoseDelta => ({
  hy: Math.round(2 * k),
  lean: 0.05 * k,
  h: [pull(0, k, mouth), pull(1, k, mouth), pull(2, k, mouth)],
  nw: { a1: -122 - 8 * k, a2: -140 - 8 * k, a3: -104 - 8 * k, fan: -42 - 3 * k, scal: 1 - 0.08 * k },
  fw: { a1: -78 - 8 * k, a2: -96 - 8 * k, a3: -78 - 6 * k },
  core: 0.6 + 0.4 * k,
  glow: 0.5 + 0.45 * k,
  tailLift: 6 * k,
  arm: 6 * k,
  ...d,
});
const A_FIRE = (jaw: number, beam: number, back = 0, d: PoseDelta = {}): PoseDelta => ({
  hx: 2,
  hy: 0,
  lean: -0.06,
  h: [aim(0, jaw, back), aim(1, jaw, back), aim(2, jaw, back)],
  nw: { a1: -126, a2: -146, a3: -108, fan: -46, scal: 1.12 },
  fw: { a1: -88, a2: -106, a3: -86, fan: -34 },
  core: 1,
  glow: 0.95,
  rays: 0.7,
  beam,
  tailLift: 4,
  tailAmp: 6,
  arm: 10,
  ...d,
});
function attackPose(f: number): Pose {
  const base = (d: PoseDelta) => pose({ ...d, shimmer: f * 2 });
  switch (f) {
    case 0:
      {
      // the first stir: the heads draw back a pixel, the lips begin to glow, the core brightens
      const P = idlePose(0);
      P.h.forEach((h) => ((h.dx -= 1), (h.da -= 0.03), (h.mouth = 0.3)));
      return { ...P, core: 0.8, glint: 0 };
    }
    case 1:
      return base(A_CHARGE(1, 0.35));
    case 2:
      return base(A_CHARGE(1.1, 0.55, { rays: 0.2 }));
    case 3:
      return base(A_CHARGE(1.15, 0.75, { rays: 0.4 }));
    case 4:
      return base(A_CHARGE(1.2, 0.95, { rays: 0.7, glint: 2 }));
    case 5:
      return base(A_CHARGE(1.2, 1, { rays: 0.9, hx: 1, glint: 1 }));
    case 6:
      return lerpPose(base(A_CHARGE(1.2, 1, { rays: 0.9 })), base(A_FIRE(0.6, 0)), 0.55);
    case 7:
      return base(A_FIRE(1, 0.7));
    case 8:
      return base(A_FIRE(1, 1));
    case 9:
      return base(A_FIRE(1, 1, 1, { hx: 1 }));
    case 10:
      return base(A_FIRE(0.7, 0.5, 2, { hx: 1, rays: 0.3 }));
    case 11:
      return lerpPose(base(A_FIRE(0.3, 0, 2, { rays: 0 })), idlePose(0), 0.4);
    case 12:
      return lerpPose(base(A_FIRE(0, 0, 2, { rays: 0 })), idlePose(0), 0.75);
    default:
      return idlePose(0);
  }
}
const ATTACK_HOLDS = [90, 120, 130, 150, 200, 120, 60, 50, 70, 80, 90, 100, 110, 120];

// ------------------------------------------------------------------ recoils

/** The struck contact frame: only the contact region moves (the chest, the necks and heads): the heads snap back
 *  with their eyes shut, the chest is knocked back under the still wings; hip, legs, tail and wings hold idle f0. */
function struck(k: number, d: { blaze?: boolean; jaw?: number } = {}): PoseDelta {
  const i0 = idlePose(0);
  return {
    ...i0,
    h: [0, 1, 2].map((i) => ({ ...i0.h[i], dx: -Math.round(1.5 * k), dy: i0.h[i].dy - 1, da: -0.05 * k, eye: d.blaze ? 1 : 0, blaze: d.blaze ? 1 : 0, jaw: d.jaw ?? 0 })) as unknown as [HeadDelta, HeadDelta, HeadDelta],
    core: 0.9,
    rays: 0,
  } as PoseDelta;
}
function reel(k: number, d: PoseDelta = {}): PoseDelta {
  return {
    hx: -Math.round(1.5 * k),
    hy: Math.round(k),
    lean: -0.07 * k,
    h: [
      { dx: -4 * k, dy: -2 * k, da: -0.18 * k, eye: 0.5 },
      { dx: -5 * k, dy: -1 * k, da: -0.2 * k, eye: 0.5 },
      { dx: -4 * k, dy: 0, da: -0.16 * k, eye: 0.5 },
    ],
    nw: { a1: -104 + 6 * k, a2: -120 + 6 * k, a3: -90, scal: 1.12, lag: -1 },
    fw: { a1: -74 + 4 * k, a2: -92 + 4 * k, a3: -76 },
    tailLag: [1, 2],
    core: 0.25,
    ...d,
  };
}
function hitPose(f: number): Pose {
  switch (f) {
    case 0:
      return pose(struck(1));
    case 1:
      return pose(reel(0.8));
    case 2:
      return pose(reel(1));
    case 3:
      return lerpPose(pose(reel(1)), idlePose(0), 0.35);
    case 4:
      return lerpPose(pose(reel(1)), idlePose(0), 0.7);
    default:
      return lerpPose(pose(reel(1)), idlePose(0), 0.92);
  }
}
const HIT_HOLDS = [50, 60, 80, 100, 110, 130];

function hitHeavyPose(f: number): Pose {
  switch (f) {
    case 0:
      return pose(struck(1.6));
    case 1:
      return pose(reel(1.4, { hy: 2 }));
    case 2:
      return pose(reel(1.8, { hy: 3, hx: -3, arm: 12, tailLag: [2, 3] }));
    case 3:
      return pose(reel(1.5, { hy: 3, hx: -2 }));
    case 4:
      return lerpPose(pose(reel(1.4, { hy: 2, hx: -2 })), idlePose(0), 0.4);
    case 5:
      return lerpPose(pose(reel(1.4, { hy: 2, hx: -2 })), idlePose(0), 0.72);
    default:
      return lerpPose(pose(reel(1.4)), idlePose(0), 0.94);
  }
}
const HIT_HEAVY_HOLDS = [50, 60, 90, 110, 110, 130, 140];

/** Magic: the glass flares and the eyes blaze on the contact frame, the jaws bare; a rigid clench, a shudder. */
function hitMagicPose(f: number): Pose {
  switch (f) {
    case 0:
      return pose({ ...struck(0.8, { blaze: true, jaw: 0.3 }) });
    case 1:
      return pose(reel(0.7, { flare: 1, glow: 1, hx: 0, h: [{ dx: -3, dy: -2, da: -0.2, jaw: 0.35, blaze: 1 }, { dx: -4, dy: -1, da: -0.22, jaw: 0.35, blaze: 1 }, { dx: -3, da: -0.18, jaw: 0.35, blaze: 1 }] }));
    case 2:
      return pose(reel(0.8, { flare: 1, glow: 0.9, hx: 1 }));
    case 3:
      return pose(reel(0.8, { flare: 0, glow: 0.7, hx: -1 }));
    case 4:
      return lerpPose(pose(reel(0.7)), idlePose(0), 0.45);
    case 5:
      return lerpPose(pose(reel(0.7)), idlePose(0), 0.75);
    default:
      return lerpPose(pose(reel(0.7)), idlePose(0), 0.94);
  }
}
const HIT_MAGIC_HOLDS = [50, 60, 70, 90, 100, 120, 140];

// ------------------------------------------------------------------ summon (16 frames) — the REVEAL
//
// The fusion cinematic's sequence (beats exported as SUMMON_BEATS):
//   f0–1   the cocoon drops onto the tile: the wings wrapped round the body, the heads hidden behind them, the core
//          a dim light inside;
//   f2     LAND (mark): the crouch takes the drop;
//   f3     the glass lights from inside (flare), the core flashes;
//   f4–5   the wings UNFOLD (in-between → spread wide);
//   f6–7   head A rises (f6) and roars (f7);
//   f8–9   head B rises (f8) and roars (f9);
//   f10–11 head C rises (f10) and roars (f11);
//   f12–13 the triple roar: all three jaws wide, the body reared, the core's rays at full;
//   f14–15 the jaws close, the wings settle → idle f0.

const HIDDEN: readonly HeadDelta[] = [
  { dx: -8, dy: 16, da: 0.34, eye: 0.5 },
  { dx: -14, dy: 12, da: 0.42, eye: 0.5 },
  { dx: -12, dy: 4, da: 0.44, eye: 0.5 },
];
const risen = (i: number, jaw: number): HeadDelta => ({ dx: 2, dy: -3 - (i === 0 ? 1 : 0), da: -0.3 * Math.min(1, 0.3 + jaw), jaw, eye: 1, blaze: jaw > 0.8 ? 1 : 0 });
const SPREAD: PoseDelta = {
  nw: { a1: -128, a2: -150, a3: -112, fan: -45, span: 1.04, scal: 1.12 },
  fw: { a1: -88, a2: -108, a3: -88, fan: -34, span: 1.05 },
};
function summonHeads(f: number): [HeadDelta, HeadDelta, HeadDelta] {
  // head i rises at 6 + 2i, roars at 7 + 2i, then holds the roar half-open until the triple roar
  const out: HeadDelta[] = [];
  for (let i = 0; i < 3; i++) {
    const r = 6 + 2 * i;
    if (f < r) out.push(HIDDEN[i]);
    else if (f === r) out.push({ ...risen(i, 0.35), dy: -1 });
    else if (f === r + 1) out.push(risen(i, 1));
    else if (f < 12) out.push(risen(i, 0.45));
    else out.push(risen(i, f === 12 ? 1 : 0.9));
  }
  return out as [HeadDelta, HeadDelta, HeadDelta];
}
function summonPose(f: number): Pose {
  const cocoon = (d: PoseDelta) => pose({ ...guardPose(0), h: HIDDEN as [HeadDelta, HeadDelta, HeadDelta], ...d } as PoseDelta);
  switch (f) {
    case 0:
      return cocoon({ lift: -18, tuck: 0.7, hy: 2, core: 0.2, glow: 0.3 });
    case 1:
      return cocoon({ lift: -7, tuck: 0.35, hy: 2, core: 0.3, glow: 0.3 });
    case 2:
      return cocoon({ hy: 7, core: 0.5, glow: 0.5 });
    case 3:
      return cocoon({ hy: 6, core: 1, glow: 1, flare: 1, rays: 0.5, shimmer: 3 });
    case 4: {
      const a = cocoon({ hy: 5, core: 1, glow: 0.9 });
      const b = pose({ ...SPREAD, hy: 3, h: HIDDEN as [HeadDelta, HeadDelta, HeadDelta], core: 1, glow: 0.9 });
      return { ...lerpPose(a, b, 0.5), guard: false, wrap: 0.5, nw: lerpPose(a, { ...b, nw: { ...b.nw, a1: -74, a2: -20, a3: 12, fan: -12 } }, 0.5).nw };
    }
    default: {
      const k = f >= 12 ? 1 : 0;
      const settle = f >= 14 ? (f === 14 ? 0.55 : 1) : 0;
      const P = pose({
        ...SPREAD,
        hy: f === 5 ? 3 : k ? -2 : 1,
        lean: k ? -0.12 : -0.04,
        h: summonHeads(f),
        core: 1,
        glow: k ? 0.95 : 0.8,
        rays: f === 12 ? 1 : f === 13 ? 0.7 : f === 5 ? 0.6 : 0,
        tailLift: k ? 10 : 4,
        tailAmp: 6,
        arm: k ? 14 : 6,
        shimmer: f * 1.5,
      } as PoseDelta);
      if (f === 13) P.h.forEach((h: Head, i: number) => (h.dx += i === 1 ? -1 : 1));
      return settle ? lerpPose(P, idlePose(0), settle) : P;
    }
  }
}
const SUMMON_HOLDS = [80, 60, 90, 140, 60, 80, 110, 120, 110, 120, 110, 120, 170, 140, 120, 110];
export const SUMMON_LAND = 2;
/** The reveal beats for a fusion cinematic (frame indices of the summon anim). */
export const SUMMON_BEATS = Object.freeze({ land: 2, flare: 3, unfold: [4, 5] as const, rise: [6, 8, 10] as const, roar: [7, 9, 11] as const, triple: 12, settle: [14, 15] as const });

// ------------------------------------------------------------------ death (10 frames, 0.85 s) — prism shatter
//
// From the magic recoil: the cracks run out from the core (f0–3), the knees buckle and the heads sag, the light
// drains into the core and the core flares one last time (f3); then the crystal body SHATTERS (dissolve f4) into
// prism shards that burst out from the core, glint and fall, eroding to nothing.

function deathPose(f: number): Pose {
  const sag = (k: number): PoseDelta => ({
    hy: Math.round(4 * k),
    lean: 0.1 * k,
    h: [
      { dx: -2, dy: 6 * k, da: 0.4 * k, eye: k > 0.5 ? 0 : 0.5 },
      { dx: -3, dy: 7 * k, da: 0.5 * k, eye: k > 0.5 ? 0 : 0.5 },
      { dx: -2, dy: 7 * k, da: 0.55 * k, eye: 0 },
    ],
    nw: { a1: -122 - 22 * k, a2: -140 - 34 * k, a3: -104 - 56 * k, fan: -42 + 8 * k, scal: 1 + 0.3 * k },
    fw: { a1: -78 - 18 * k, a2: -96 - 30 * k, a3: -78 - 50 * k, scal: 1 + 0.2 * k },
    tailLift: -8 * k,
    arm: -10 * k,
  });
  switch (f) {
    case 0:
      return pose({ ...struck(1, { blaze: true, jaw: 0.4 }), cracks: 0.2 });
    case 1:
      return pose({ ...sag(0.3), cracks: 0.5, drain: 0.2, core: 0.9 });
    case 2:
      return pose({ ...sag(0.7), cracks: 0.8, drain: 0.5, core: 1 });
    case 3:
      return pose({ ...sag(1), cracks: 1, drain: 0.8, core: 1, rays: 1 });
    default: {
      const S = [0.1, 0.24, 0.4, 0.56, 0.7, 1][f - 4];
      return pose({ ...sag(1), cracks: 1, drain: 0.9, core: 0.6, shatter: S });
    }
  }
}
const DEATH_HOLDS = [50, 80, 90, 100, 70, 80, 80, 90, 100, 110];

// ------------------------------------------------------------------ revive (9 frames)
//
// The shards fly in from all round and lock (the shatter run backwards), the cracks close as the light refills from
// the core, the heads lift, a first breath → idle f0.

function revivePose(f: number): Pose {
  const low: PoseDelta = { hy: 3, lean: 0.06, h: [{ dy: 4, da: 0.3, eye: 0 }, { dy: 5, da: 0.35, eye: 0 }, { dy: 4, da: 0.35, eye: 0 }] };
  switch (f) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
      return pose({ ...low, shatter: [0.7, 0.55, 0.4, 0.24, 0.1][f], cracks: 1, drain: 1, core: 0.3 });
    case 5:
      return pose({ ...low, cracks: 0.6, drain: 0.4, core: 0.8 });
    case 6:
      return pose({ ...low, hy: 2, cracks: 0.2, core: 1, rays: 0.8, glow: 0.9, h: [{ dy: 2, da: 0.15, eye: 0.5 }, { dy: 2, da: 0.2, eye: 0.5 }, { dy: 2, da: 0.2, eye: 0.5 }] });
    case 7:
      return lerpPose(pose({ hy: -1, lean: -0.05, core: 1, glow: 0.8, h: [{ dy: -2, da: -0.1, jaw: 0.3 }, { dy: -2, da: -0.12, jaw: 0.3 }, { dy: -1, da: -0.1, jaw: 0.3 }], ...SPREAD }), idlePose(0), 0.2);
    default:
      return idlePose(0);
  }
}
const REVIVE_HOLDS = [80, 70, 70, 70, 80, 100, 110, 120, 120];

// ------------------------------------------------------------------ specs

const spec = (holds: number[], loop: boolean, marks?: AnimSpec['marks']): AnimSpec => ({
  frames: holds.length,
  fps: Math.round(1000 / (holds.reduce((a, b) => a + b, 0) / holds.length)),
  loop,
  holds,
  ...(marks ? { marks } : {}),
});

export const IMPACT = 7;
export const ANIMS: Record<MonsterAnim, AnimSpec> = {
  idle: spec(IDLE_HOLDS, true),
  roar: spec(ROAR_HOLDS, false, { charge: 1, release: 5, impact: 5, recover: 9 }),
  attack: spec(ATTACK_HOLDS, false, { charge: 1, release: IMPACT, impact: IMPACT, contact: 8, recover: 11 }),
  hit: spec(HIT_HOLDS, false, { impact: 0, contact: 0, recover: 4 }),
  guard: spec(GUARD_HOLDS, true),
};
export const EXTRA_ANIMS: Partial<Record<MonsterAnimExtra, AnimSpec>> = {
  summon: spec(SUMMON_HOLDS, false, { land: SUMMON_LAND }),
  death: spec(DEATH_HOLDS, false, { impact: 0, contact: 0, dissolve: 4 }),
  revive: spec(REVIVE_HOLDS, false, { land: 5 }),
  hitHeavy: spec(HIT_HEAVY_HOLDS, false, { impact: 0, contact: 0, recover: 4 }),
  hitMagic: spec(HIT_MAGIC_HOLDS, false, { impact: 0, contact: 0, recover: 4 }),
  toGuard: spec(TO_GUARD_HOLDS, false),
  fromGuard: spec(FROM_GUARD_HOLDS, false),
};

const POSES: Partial<Record<AnyMonsterAnim, (f: number) => Pose>> = {
  idle: idlePose,
  guard: guardPose,
  roar: roarPose,
  attack: attackPose,
  hit: hitPose,
  hitHeavy: hitHeavyPose,
  hitMagic: hitMagicPose,
  summon: summonPose,
  death: deathPose,
  revive: revivePose,
  toGuard: toGuardPose,
  fromGuard: fromGuardPose,
};

export function framePose(anim: AnyMonsterAnim, f: number): Pose {
  const fn = POSES[anim];
  return fn ? fn(f) : idlePose(0);
}

/** The ground contact (the anchor, carried by the summon drop). */
export const ANCHOR: V = [59, GY];

export function framePoints(anim: AnyMonsterAnim, f: number): MonsterPoints {
  const P = framePose(anim, f);
  const r = rig(P);
  const b = braidPoint(P);
  const c = corePoint(P);
  const e = rnd(eyePoint(P, 1));
  const claw = rnd(add(r.att([8, 10]), add(polar(62 - P.arm, 8.5), polar(-30 - P.arm * 1.4, 12))));
  const L = legs(P);
  return {
    muzzle: { x: b[0], y: b[1] },
    core: { x: c[0], y: c[1] },
    head: { x: e[0], y: e[1] },
    claw: { x: claw[0], y: claw[1] },
    feet: { x: ANCHOR[0], y: Math.round(Math.max(L.footN[1], L.footF[1] + 3) + 2.5) },
  };
}

/**
 * The fusion's own marks for a cinematic (frame px, facing right): the three heads (pivot and eye), the three
 * mouths (where each ray leaves), the braid point (where the three rays twist into one = the muzzle) and the core.
 * Index 0 = A (far, high, blade crown), 1 = B (centre, gold crown), 2 = C (near, low, prism fins).
 */
export interface TrinityMarks {
  heads: [V, V, V];
  eyes: [V, V, V];
  mouths: [V, V, V];
  braid: V;
  core: V;
}
export function trinityMarks(anim: AnyMonsterAnim, f: number): TrinityMarks {
  const P = framePose(anim, f);
  const three = (fn: (i: number) => V) => [rnd(fn(0)), rnd(fn(1)), rnd(fn(2))] as [V, V, V];
  return {
    heads: three((i) => headPos(P, i)),
    eyes: three((i) => eyePoint(P, i)),
    mouths: three((i) => mouthPoint(P, i)),
    braid: braidPoint(P),
    core: corePoint(P),
  };
}
