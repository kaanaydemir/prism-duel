// Trinity Crystal Wyrm (trinity_crystal_wyrm) — the rig: Pose → pixels, in the Crystal Wyrm's material language
// (trinity_crystal_wyrm-gbuf.ts = the wyrm's raster pipeline on this bigger frame): white hide in value planes, cyan
// glass wings in flat facets with white / cyan4 rims, gold horn in four bands, two-value crystal shards, junction
// creases and a cyan2 bounce rim — the three wyrms fused into ONE bigger body:
//   body    the wyrm's rearing biped stance, heavier: a massive crystalline chest with THE PRISM CORE (a faceted
//           gem that pulses white → cyan, three light veins running from it up into the three necks), thick
//           planted legs, a long tail with a crystal ridge ending in a three-pronged crystal blade;
//   heads   three necks out of one chest, fanned like a staircase into depth (the far one highest, the near one
//           lowest), each head the wyrm's head language (white top plane, mist side plane, steel cheek wedge and
//           eye mask, cyan iris) with its OWN crown facet:
//             A  far / high   the BLADE crown: three cyan crystal blades rising back off the crown;
//             B  centre / lead the GOLD crown: the wyrm's gold horn sweep, doubled, plus a brow tine;
//             C  near / low    the PRISM fins: two glass fins swept back from the cheek, rainbow-edged;
//   wings   two prism wings (bigger than the wyrm's): flat glass cells, the trailing edge splits the light into a
//           faint rainbow (short dashes of mag3 / gold4 / teal3 / void3 between white tips) that shimmers along the
//           edge frame by frame (Pose.shimmer).
// Light (after the outline, never outlined): the core's rays, the light gathering in each mouth, the three rays that
// braid into one at the braid point (the attack's release; the cinematic's beam leaves from there).
// Death: the cracks run from the core, the light drains, and the body SHATTERS into prism shards (Voronoi cells of
// the drawn body, each with a lit edge and a prism glint) that burst out from the core and fall; revive runs it back.
// Pure and deterministic (no Phaser, no randomness).

import { PixelCanvas, bezier } from '../pixel';
import { PAL } from '../palette';
import {
  DEG,
  FLAT_N,
  H,
  LIGHT,
  M,
  W,
  add,
  clamp,
  composite,
  crease,
  despeckle,
  distPoly,
  distSeg,
  dorsal,
  dot,
  edgeNormal,
  edgePaint,
  fillPoly,
  flo,
  gEll,
  gFacet,
  gShard,
  gTube,
  ik,
  len,
  lerp,
  lerpV,
  lineOn,
  maskOf,
  mul,
  newCanvas,
  newG,
  norm,
  polar,
  resetPools,
  rimLight,
  rnd,
  rotV,
  samplePath,
  selout,
  sub,
  twinkle,
  type Fold,
  type V,
} from './trinity_crystal_wyrm-gbuf';

export { W, H };

/** The ground row: the lowest opaque row of the planted feet. */
export const GY = 107;

// ------------------------------------------------------------------ pose

export interface Wing {
  /** humerus angle (deg, screen space) */
  a1: number;
  /** forearm angle */
  a2: number;
  /** first (outer) finger angle */
  a3: number;
  /** finger fan step (deg) */
  fan: number;
  /** bone length multiplier */
  span: number;
  /** depth of the trailing-edge scallops (1 = rest) */
  scal?: number;
  /** vertical lag (px) of the wrist and finger tips (overlap) */
  lag?: number;
}

/** One head (deltas from its rest pose). */
export interface Head {
  dx: number;
  dy: number;
  /** angle delta (rad, + = nose down) */
  da: number;
  /** 0..1 */
  jaw: number;
  /** 1 open, 0.5 half-lid, 0 shut */
  eye: number;
  /** 0..1 light gathered in the mouth */
  mouth: number;
  /** ≥ 0.5: the eye blazes */
  blaze: number;
  /** extra offset of the neck's middle handles (the S of the neck) */
  nk: V;
}

export interface Pose {
  hx: number;
  hy: number;
  /** torso rotation around the hip (rad, negative = rear up) */
  lean: number;
  /** extra rotation of the chest and what hangs on it (a struck frame: the wings, hip, legs, tail hold) */
  chestLean: number;
  /** whole-body lift (px, negative = up): the summon drop */
  lift: number;
  /** 0..1 the legs drawn up under the belly (airborne) */
  tuck: number;
  /** the three heads: 0 = A (far, high, blade crown), 1 = B (centre, gold crown), 2 = C (near, low, prism fins) */
  h: [Head, Head, Head];
  nw: Wing;
  fw: Wing;
  /** whole-px vertical offset of both wings against the body */
  wingDy: number;
  tail: number;
  tailAmp: number;
  tailLift: number;
  /** vertical lag (px) of the tail's middle and tip */
  tailLag: V;
  /** arm raise (deg) */
  arm: number;
  /** 0..1 the prism core's light (pulse) */
  core: number;
  /** 0..1 crystal energy (≥ 0.75: the shards one tone up) */
  glow: number;
  /** rainbow phase along the wings' trailing edges (px) */
  shimmer: number;
  /** wings wrapped forward (the guard / cocoon layout) */
  guard: boolean;
  /** 0..1 the membrane roots slide toward the wrap (in-betweens) */
  wrap: number;
  /** 0..1 the wing glass flares a tone brighter */
  flare: number;
  /** 0..1 cracks run from the core over the body */
  cracks: number;
  /** 0..1 the inner light drains into the core and out */
  drain: number;
  /** 0..1 the body is shattered into prism shards that burst out and fall (death; revive runs it back) */
  shatter: number;
  /** 0..1 the three rays braid at the braid point (attack release) */
  beam: number;
  /** 0..1 the core's rays (unoutlined light) */
  rays: number;
  /** the crystal glint on the core's lit facet vertex: 0 none, 1 = 1 px, 2 = 3-px cross */
  glint: number;
  /** < 0: off; else the phase (0..1) of the light pulse that runs out from the core along the crystals (the necks'
   *  crests, the back spikes, the tail ridge): the shards it passes light one tone up */
  wave: number;
}

/** The glow of a crystal at u (0 at the core … 1 at the farthest tip) under the travelling light pulse. */
function glowAt(P: Pose, u: number): number {
  if (P.wave < 0) return P.glow;
  const d = (((u - P.wave) % 1) + 1) % 1;
  return d < 0.3 ? Math.max(P.glow, 0.8) : P.glow;
}

const HEAD0: Head = { dx: 0, dy: 0, da: 0, jaw: 0, eye: 1, mouth: 0, blaze: 0, nk: [0, 0] };

export const NEUTRAL: Pose = {
  hx: 0,
  hy: 0,
  lean: 0,
  chestLean: 0,
  lift: 0,
  tuck: 0,
  h: [HEAD0, HEAD0, HEAD0],
  nw: { a1: -122, a2: -140, a3: -104, fan: -42, span: 1 },
  fw: { a1: -78, a2: -96, a3: -78, fan: -30, span: 1 },
  wingDy: 0,
  tail: 0,
  tailAmp: 4,
  tailLift: 0,
  tailLag: [0, 0],
  arm: 0,
  core: 0.4,
  glow: 0.3,
  shimmer: 0,
  guard: false,
  wrap: 0,
  flare: 0,
  cracks: 0,
  drain: 0,
  shatter: 0,
  beam: 0,
  rays: 0,
  glint: 0,
  wave: -1,
};

export type HeadDelta = Partial<Head>;
export type PoseDelta = Partial<Omit<Pose, 'nw' | 'fw' | 'h'>> & { nw?: Partial<Wing>; fw?: Partial<Wing>; h?: readonly [HeadDelta?, HeadDelta?, HeadDelta?] };

export function pose(d: PoseDelta): Pose {
  const hh = d.h ?? [];
  return {
    ...NEUTRAL,
    ...d,
    nw: { ...NEUTRAL.nw, ...(d.nw ?? {}) },
    fw: { ...NEUTRAL.fw, ...(d.fw ?? {}) },
    h: [{ ...HEAD0, ...(hh[0] ?? {}) }, { ...HEAD0, ...(hh[1] ?? {}) }, { ...HEAD0, ...(hh[2] ?? {}) }],
  };
}

const lerpHead = (a: Head, b: Head, t: number): Head => ({
  dx: lerp(a.dx, b.dx, t),
  dy: lerp(a.dy, b.dy, t),
  da: lerp(a.da, b.da, t),
  jaw: lerp(a.jaw, b.jaw, t),
  eye: lerp(a.eye, b.eye, t),
  mouth: lerp(a.mouth, b.mouth, t),
  blaze: lerp(a.blaze, b.blaze, t),
  nk: lerpV(a.nk, b.nk, t),
});
const lerpWing = (a: Wing, b: Wing, t: number): Wing => ({
  a1: lerp(a.a1, b.a1, t),
  a2: lerp(a.a2, b.a2, t),
  a3: lerp(a.a3, b.a3, t),
  fan: lerp(a.fan, b.fan, t),
  span: lerp(a.span, b.span, t),
  scal: lerp(a.scal ?? 1, b.scal ?? 1, t),
  lag: lerp(a.lag ?? 0, b.lag ?? 0, t),
});

/** Numeric in-between of two poses (discrete fields from b). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const n = (k: 'hx' | 'hy' | 'lean' | 'chestLean' | 'lift' | 'tuck' | 'wingDy' | 'tail' | 'tailAmp' | 'tailLift' | 'arm' | 'core' | 'glow' | 'shimmer' | 'wrap' | 'flare' | 'cracks' | 'drain' | 'shatter' | 'beam' | 'rays') => lerp(a[k], b[k], t);
  return {
    ...b,
    hx: n('hx'),
    hy: n('hy'),
    lean: n('lean'),
    chestLean: n('chestLean'),
    lift: n('lift'),
    tuck: n('tuck'),
    wingDy: n('wingDy'),
    tail: n('tail'),
    tailAmp: n('tailAmp'),
    tailLift: n('tailLift'),
    arm: n('arm'),
    core: n('core'),
    glow: n('glow'),
    shimmer: n('shimmer'),
    wrap: n('wrap'),
    flare: n('flare'),
    cracks: n('cracks'),
    drain: n('drain'),
    shatter: n('shatter'),
    beam: n('beam'),
    rays: n('rays'),
    tailLag: lerpV(a.tailLag, b.tailLag, t),
    nw: lerpWing(a.nw, b.nw, t),
    fw: lerpWing(a.fw, b.fw, t),
    h: [lerpHead(a.h[0], b.h[0], t), lerpHead(a.h[1], b.h[1], t), lerpHead(a.h[2], b.h[2], t)],
  };
}

// ------------------------------------------------------------------ skeleton

export interface Rig {
  hip: V;
  chest: V;
  tAng: number;
  att: (o: V) => V;
}

export function rig(P: Pose): Rig {
  const hip: V = [46 + P.hx, 81 + P.hy + P.lift];
  const lean = P.lean + P.chestLean;
  const tAng = -1.2 + lean;
  const chest = add(hip, [Math.cos(tAng) * 22, Math.sin(tAng) * 22]);
  const att = (o: V): V => add(chest, rotV(o, lean));
  return { hip, chest, tAng, att };
}

/** Per head: its scale, rest pivot (offset from the chest), rest angle, neck base (chest space), neck widths, and
 *  the neck's base handle (chest space). */
interface HeadDef {
  s: number;
  off: V;
  ha: number;
  base: V;
  w0: number;
  w1: number;
  up: V;
  far: boolean;
}
const HEADS: readonly HeadDef[] = [
  { s: 0.94, off: [15, -38], ha: 0.2, base: [-1, -12], w0: 8.5, w1: 6, up: [-2, -14], far: true },
  { s: 1.12, off: [38, -22], ha: 0.04, base: [4, -10], w0: 10, w1: 7, up: [7, -12], far: false },
  { s: 1.02, off: [36, -3], ha: 0.12, base: [8, -4], w0: 10, w1: 7, up: [10, -4], far: false },
];

/** The head pivot of head i (whole px: a head never moves by a fraction — its planes would crawl). */
export function headPos(P: Pose, i: number): V {
  const R = rig(P);
  const d = HEADS[i];
  const hd = P.h[i];
  return rnd(add(add(R.chest, rotV(d.off, (P.lean + P.chestLean) * 0.5)), [hd.dx, hd.dy]));
}
export function headAngle(P: Pose, i: number): number {
  return HEADS[i].ha + P.h[i].da;
}

const HINGE: V = [-1.5, 1.4];
const JAW_OPEN = 0.62;

interface HeadFrame {
  T: (x: number, y: number) => V;
  J: (x: number, y: number) => V;
  jawA: number;
  ha: number;
}
function headFrame(P: Pose, i: number): HeadFrame {
  const hp = headPos(P, i);
  const ha = headAngle(P, i);
  const s = HEADS[i].s;
  const T = (x: number, y: number): V => add(hp, rotV([x * s, y * s], ha));
  const jawA = P.h[i].jaw * JAW_OPEN;
  const J = (x: number, y: number): V => {
    const q = add(HINGE, rotV(sub([x, y], HINGE), jawA));
    return T(q[0], q[1]);
  };
  return { T, J, jawA, ha };
}

/** The open mouth's centre of head i (where its ray leaves). */
export function mouthPoint(P: Pose, i: number): V {
  const { T, J } = headFrame(P, i);
  return lerpV(T(17.5, 1.4), J(17, 1.4), 0.5);
}
/** The eye of head i. */
export function eyePoint(P: Pose, i: number): V {
  return headFrame(P, i).T(3, -3.4);
}
/** The prism core (centre of the chest gem). */
export function corePoint(P: Pose): V {
  return rnd(rig(P).att([1, 5]));
}
/** Where the three rays braid into one (in front of the centre head's snout, between the three mouths). */
export function braidPoint(P: Pose): V {
  const m = [0, 1, 2].map((i) => mouthPoint(P, i));
  const x = Math.min(W - 5, Math.max(m[0][0], m[1][0], m[2][0]) + 7);
  return rnd([x, (m[0][1] + m[1][1] + m[2][1]) / 3]);
}

export function neckBase(P: Pose, i: number): V {
  return rig(P).att(HEADS[i].base);
}
export function neckPath(P: Pose, i: number): V[] {
  const d = HEADS[i];
  const R = rig(P);
  const base = R.att(d.base);
  const { T, ha } = headFrame(P, i);
  const end = T(-3.2, -0.6);
  const c1 = add(add(base, rotV(d.up, (P.lean + P.chestLean) * 0.6)), P.h[i].nk);
  const c2 = add(add(end, polar(ha / DEG + 150, 9 * d.s)), mul(P.h[i].nk, 0.5));
  return bezier(base, c1, c2, end, 18) as V[];
}

// ------------------------------------------------------------------ wings

const NEAR_FINGERS = [17, 25, 21];
const FAR_FINGERS = [15, 19, 15];

interface WingRig {
  S: V;
  E: V;
  Wr: V;
  tips: V[];
  attach: V;
}
function wingRig(S: V, w: Wing, fingers: number[], l1: number, l2: number, attach: V): WingRig {
  const E = add(S, polar(w.a1, l1 * w.span));
  const lag: V = [0, w.lag ?? 0];
  const Wr = add(add(E, polar(w.a2, l2 * w.span)), mul(lag, 0.5));
  const tips = fingers.map((fl, i) => add(add(Wr, polar(w.a3 + w.fan * i, fl * w.span)), mul(lag, 0.5)));
  return { S, E, Wr, tips, attach };
}
function shiftWing(w: WingRig, dy: number) {
  const d: V = [0, dy];
  w.S = add(w.S, d);
  w.E = add(w.E, d);
  w.Wr = add(w.Wr, d);
  w.attach = add(w.attach, d);
  w.tips = w.tips.map((t) => add(t, d));
}
/** A wing that would leave the frame's 3-px margin (the claw shard included) is drawn a little shorter: the frame
 *  edge never cuts a wing, whatever the pose (a spread roar, the summon's unfold). */
function fitWing(S: V, w: Wing, fingers: number[], l1: number, l2: number, attach: V): WingRig {
  let r = wingRig(S, w, fingers, l1, l2, attach);
  for (let k = 0; k < 14; k++) {
    const claw = add(add(r.Wr, mul(norm(sub(r.Wr, r.E)), 8)), [0, -4]);
    const pts = [r.E, r.Wr, claw, ...r.tips];
    const minX = Math.min(...pts.map((q) => q[0]));
    const minY = Math.min(...pts.map((q) => q[1]));
    if (minX >= 4 && minY >= 4) break;
    r = wingRig(S, { ...w, span: w.span * Math.pow(0.965, k + 1) }, fingers, l1, l2, attach);
  }
  return r;
}

function wings(P: Pose) {
  const { hip, chest, att } = rig(P.chestLean ? { ...P, chestLean: 0 } : P);
  const back = add(lerpV(hip, chest, 0.35), rotV([-9, -4], P.lean));
  const farWing = fitWing(att([2, -11]), P.fw, FAR_FINGERS, 13, 15, att([-5, -6]));
  const nearWing = fitWing(att([-6, -9]), P.nw, NEAR_FINGERS, 15, 18, back);
  if (P.guard) {
    nearWing.attach = add(hip, [2, 10]);
    farWing.attach = att([14, 12]);
  } else if (P.wrap > 0) {
    nearWing.attach = lerpV(nearWing.attach, add(hip, [2, 10]), P.wrap);
    farWing.attach = lerpV(farWing.attach, att([14, 12]), P.wrap);
  }
  const dy = Math.round(P.wingDy);
  if (dy) for (const w of [farWing, nearWing]) shiftWing(w, dy);
  return { farWing, nearWing };
}

/** The prism: the rainbow tones the wings' trailing edges split the light into (short dashes between white). */
const PRISM: readonly number[] = [PAL.mag3, PAL.gold4, PAL.teal3, PAL.void3];
/** Rainbow tone of a trailing-edge pixel at arc length u (px along its scallop) and shimmer phase; null = the plain rim. */
function prismAt(u: number, total: number, phase: number): number | null {
  const k = u / Math.max(1, total);
  if (k < 0.16 || k > 0.86) return null;
  const step = Math.floor((u + phase) / 2.5);
  const i = ((step % 5) + 5) % 5;
  return i < 4 ? PRISM[i] : null;
}

function drawWing(r: WingRig, far: boolean, P: Pose): PixelCanvas {
  const g = newG();
  const glass = far ? M.GLASS_FAR : M.GLASS;
  const { S, E, Wr, tips, attach } = r;
  const n = tips.length;
  const shield = P.guard && !far;
  const w = far ? P.fw : P.nw;
  const scal = w.scal ?? 1;
  const cellTone = (i: number): [number, number] => (shield ? (i < n - 1 ? [3, 2] : [2, 1]) : far ? (i < n - 1 ? [3, 3] : [2, 2]) : i < n - 1 ? [3, 3] : [3, 2]);
  const curves: V[][] = [];
  for (let i = 0; i < n; i++) {
    const a = tips[i];
    const inner = i + 1 >= n;
    const b = inner ? attach : tips[i + 1];
    const hub = inner ? lerpV(Wr, E, 0.5) : Wr;
    const curve = bezier(a, lerpV(lerpV(a, b, 0.5), hub, (inner ? 0.4 : 0.6) * scal), b, undefined, 12) as V[];
    curves.push(curve);
    const [lead, trail] = cellTone(i);
    const root = (x: number, y: number) => inner && !shield && !far && distSeg([x + 0.5, y + 0.5], attach, S) < 5;
    const up = P.flare >= 0.5 ? 1 : 0;
    const trailUp = up && lead === trail ? 0 : up;
    gFacet(g, [Wr, ...curve.slice(0, 7)], glass, FLAT_N, 0, (x, y) => (root(x, y) ? 1 + up : lead + up));
    gFacet(g, inner ? [Wr, ...curve.slice(6), S, E] : [Wr, ...curve.slice(6)], glass, FLAT_N, 0, (x, y) => (root(x, y) ? 1 + up : trail + trailUp));
  }
  const c = g.render(0, false);

  // trailing-edge rims (white toward the key light, cyan4 away) — and the prism: short rainbow dashes along the
  // middle of every scallop, marching with the shimmer phase
  const flared = P.flare >= 0.5;
  const rimHi = far ? PAL.cyan2 : shield ? PAL.cyan3 : PAL.white;
  const rimLo = far ? PAL.cyan2 : shield ? PAL.cyan2 : flared ? PAL.white : PAL.cyan4;
  {
    const lens = curves.map((cv) => {
      let L = 0;
      for (let i = 1; i < cv.length; i++) L += len(sub(cv[i], cv[i - 1]));
      return L;
    });
    const hits: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!c.isOpaque(x, y)) continue;
        if (c.isOpaque(x - 1, y) && c.isOpaque(x + 1, y) && c.isOpaque(x, y - 1) && c.isOpaque(x, y + 1)) continue;
        const q: V = [x + 0.5, y + 0.5];
        let best = Infinity;
        let bi = -1;
        let bu = 0;
        curves.forEach((cv, ci) => {
          let acc = 0;
          for (let i = 1; i < cv.length; i++) {
            const d = distSeg(q, cv[i - 1], cv[i]);
            const sl = len(sub(cv[i], cv[i - 1]));
            if (d < best) {
              best = d;
              bi = ci;
              const ab = sub(cv[i], cv[i - 1]);
              bu = acc + clamp(dot(sub(q, cv[i - 1]), ab) / (sl * sl || 1), 0, 1) * sl;
            }
            acc += sl;
          }
        });
        if (best >= 1.6) continue;
        let nx = 0;
        let ny = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !c.isOpaque(x + dx, y + dy)) (nx += dx), (ny += dy);
        const f = dot(norm([nx, ny]), LIGHT.v2);
        const pr = !far && !shield ? prismAt(bu, lens[bi], P.shimmer + bi * 3) : null;
        hits.push(x, y, pr ?? (f > -0.05 ? rimHi : rimLo));
      }
    for (let i = 0; i < hits.length; i += 3) c.set(hits[i], hits[i + 1], hits[i + 2]);
  }

  // ONE fold line across the inner sheet
  if (!shield) {
    const inner = curves[n - 1];
    const fold = far ? (flared ? PAL.cyan2 : PAL.cyan1) : flared ? PAL.cyan4 : PAL.cyan3;
    const from = lerpV(E, Wr, 0.12);
    const to = inner[6];
    const glassCols = new Set<number>(far ? [PAL.night1, PAL.cyan0, PAL.cyan1, PAL.cyan2, PAL.cyan3, PAL.cyan4] : [PAL.cyan0, PAL.cyan1, PAL.cyan2, PAL.cyan3, PAL.cyan4, PAL.white]);
    lineOn(c, lerpV(from, to, 0.08), lerpV(from, to, 0.93), fold, (cur) => glassCols.has(cur) && cur !== rimHi && cur !== rimLo && !PRISM.includes(cur));
  }

  // bones: humerus + forearm, a flat spar with ONE lit edge and ONE dark underside
  {
    const gb = newG();
    const bone = far ? M.BONE_FAR : M.BONE;
    gTube(gb, [S, E, Wr], 5.6, 4, bone, { z: 4, flat: 3 });
    gEll(gb, Wr, 2.8, 2.8, 0, bone, { z: 5, flat: 3 });
    gEll(gb, E, 3, 3, 0, bone, { z: 5, flat: 3 });
    const b = gb.render(0, false);
    if (far) edgePaint(b, PAL.mist, PAL.night3, { lit: 0.45, dark: -0.2 });
    else {
      edgePaint(b, PAL.white, null, { lit: 0.12 });
      const hum = (x: number, y: number) => distSeg([x + 0.5, y + 0.5], S, E) < distSeg([x + 0.5, y + 0.5], E, Wr);
      const hits: number[] = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const cur = b.get(x, y);
          if (cur === null || cur === PAL.white) continue;
          if (b.isOpaque(x - 1, y) && b.isOpaque(x + 1, y) && b.isOpaque(x, y - 1) && b.isOpaque(x, y + 1)) continue;
          if (dot(norm(edgeNormal(b, x, y)), LIGHT.v2) <= -0.2) hits.push(x, y, hum(x, y) ? PAL.steel : PAL.cyan1);
        }
      for (let i = 0; i < hits.length; i += 3) b.set(hits[i], hits[i + 1], hits[i + 2]);
      const k = flo(add(Wr, [LIGHT.side < 0 ? -1 : 0, -1]));
      if (b.isOpaque(k[0], k[1])) b.set(k[0], k[1], PAL.cyan4);
      if (b.isOpaque(k[0] + 1, k[1])) b.set(k[0] + 1, k[1], PAL.cyan4);
    }
    composite(c, b, (_x, _y, behind) => behind);
  }

  // the wrist's crystal claw: a two-facet shard standing off the knuckle (the wyrm's wing spike, grown)
  {
    const gs = newG();
    const dir = norm(sub(Wr, E));
    gShard(gs, Wr, add(dir, [0, -0.5]), far ? 6 : 8, far ? 1.8 : 2.4, far ? M.GLASS_FAR : M.CRYS, 6, P.glow);
    composite(c, gs.render(0, false));
  }

  // finger bones
  for (let i = 0; i < n; i++) {
    const t = tips[i];
    const a = flo(Wr);
    const e = flo(t);
    if (shield) {
      lineOn(c, lerpV(Wr, t, 0.2), lerpV(Wr, t, 0.86), i === 0 ? PAL.white : PAL.mist);
      continue;
    }
    if (far) {
      if (i === 0) {
        c.line(a[0] + 1, a[1], e[0], e[1], PAL.steel);
        const m = flo(lerpV(Wr, t, 0.8));
        c.line(m[0], m[1], e[0], e[1], PAL.mist);
      } else if (i === n - 1) c.line(a[0], a[1], e[0], e[1], PAL.steel);
      continue;
    }
    const dir = norm(sub(t, Wr));
    const sd: V = Math.abs(dir[0]) > Math.abs(dir[1]) ? [0, 1] : [1, 0];
    const bLit = dot(sd, LIGHT.v2) > 0;
    const mid = flo(lerpV(Wr, t, 0.55));
    if (i === 2) {
      c.line(a[0], a[1], e[0], e[1], PAL.mist);
      continue;
    }
    c.line(a[0], a[1], mid[0], mid[1], bLit ? PAL.mist : PAL.white);
    c.line(a[0] + sd[0], a[1] + sd[1], mid[0] + sd[0], mid[1] + sd[1], bLit ? PAL.white : PAL.mist);
    c.line(mid[0], mid[1], e[0], e[1], PAL.white);
  }
  return c;
}

// ------------------------------------------------------------------ legs

const FOOT_NEAR: V = [55, 104.5];
const ANKLE_NEAR: V = [47, 99];
const FOOT_FAR: V = [67, 101.5];
const ANKLE_FAR: V = [60, 96];

export interface Legs {
  footN: V;
  ankleN: V;
  footF: V;
  ankleF: V;
}
export function legs(P: Pose): Legs {
  const lift: V = [0, P.lift];
  const hip = rig(P).hip;
  const t = P.tuck;
  const at = (planted: V, tucked: V): V => {
    const pl = add(planted, lift);
    return t > 0 ? lerpV(pl, add(hip, tucked), t) : pl;
  };
  return { footN: at(FOOT_NEAR, [9, 18]), ankleN: at(ANKLE_NEAR, [1, 14]), footF: at(FOOT_FAR, [19, 15]), ankleF: at(ANKLE_FAR, [12, 11]) };
}

// ------------------------------------------------------------------ helpers

const KEEP = new Uint8Array(W * H);
const FAR_MASK = new Uint8Array(W * H);
const LEG_MASK = new Uint8Array(W * H);

function cleanCrumbs(p: PixelCanvas) {
  const hits: number[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (KEEP[y * W + x]) continue;
      const c = p.get(x, y);
      if (c === null || c === PAL.ink) continue;
      let same = false;
      for (let dy = -1; dy <= 1 && !same; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && p.get(x + dx, y + dy) === c) same = true;
      if (same) continue;
      const n4: number[] = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const q = p.get(x + dx, y + dy);
        if (q === null || q === PAL.ink) break;
        n4.push(q);
      }
      if (n4.length < 4) continue;
      let best = n4[0];
      let bn = 0;
      for (const q of n4) {
        const k = n4.filter((v) => v === q).length;
        if (k > bn) [best, bn] = [q, k];
      }
      hits.push(x, y, best);
    }
  for (let i = 0; i < hits.length; i += 3) p.set(hits[i], hits[i + 1], hits[i + 2]);
}

const SHADOW: Record<number, number> = {
  [PAL.white]: PAL.steel,
  [PAL.mist]: PAL.steel,
  [PAL.steel]: PAL.night3,
  [PAL.cyan2]: PAL.cyan1,
  [PAL.cyan3]: PAL.cyan1,
  [PAL.cyan4]: PAL.cyan2,
};
function castShadow(p: PixelCanvas, layer: PixelCanvas, off: V = [2, 2]) {
  const ox = -LIGHT.side * off[0];
  const oy = off[1];
  const hits: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (layer.isOpaque(x, y) || !p.isOpaque(x, y)) continue;
      if (!layer.isOpaque(x - ox, y - oy)) continue;
      const to = SHADOW[p.get(x, y)!];
      if (to !== undefined) hits.push(x, y, to);
    }
  for (let i = 0; i < hits.length; i += 3) p.set(hits[i], hits[i + 1], hits[i + 2]);
}

function footEdges(c: PixelCanvas, foot: V, far: boolean) {
  const x0 = Math.floor(foot[0]);
  const y0 = Math.floor(foot[1]);
  for (let y = y0 - 4; y <= y0 + 3; y++)
    for (let x = x0 - 7; x <= x0 + 6; x++) {
      if (c.get(x, y) === null) continue;
      if (!c.isOpaque(x, y + 1) && y >= y0) c.set(x, y, far ? PAL.night2 : PAL.night3);
    }
}
function claws(c: PixelCanvas, foot: V, far: boolean) {
  const col = far ? PAL.steel : PAL.white;
  const x = Math.floor(foot[0]);
  const y = Math.floor(foot[1]);
  for (const [dx, dy] of [[5, 1], [4, 2], [3, 2], [1, 2], [0, 2], [-2, 2]] as const) c.set(x + dx, y + dy, col);
}
function hand(c: PixelCanvas, wr: V, ang: number, far: boolean) {
  const col = far ? PAL.steel : PAL.white;
  const tipCol = far ? PAL.night3 : PAL.mist;
  const palm = add(wr, polar(ang, 1));
  for (const [da, long] of [[0, true], [48, false]] as const) {
    let k = 1.5;
    let a = flo(add(palm, polar(ang + da, k)));
    while (c.isOpaque(a[0], a[1]) && k < 6) {
      k += 0.5;
      a = flo(add(palm, polar(ang + da, k)));
    }
    c.set(a[0], a[1], col);
    if (long) {
      const b = flo(add(palm, polar(ang + da + 35, k + 1.2)));
      if (!c.isOpaque(b[0], b[1])) c.set(b[0], b[1], tipCol);
    }
  }
}

const HIDE_COLS = [PAL.white, PAL.mist, PAL.steel] as const;
const onHide = (cur: number) => (HIDE_COLS as readonly number[]).includes(cur);
const FOLD_LEG: Fold = { top: 1, side: 2, bottom: 3 };
const FOLD_NECK: Fold = { top: 1, side: 1, bottom: 2 };

// ------------------------------------------------------------------ heads

type P2 = readonly [number, number];
// head space: x forward along the snout, y down; scaled by the head's s, rotated by its angle. The wyrm's head
// language, cut sharper (a longer wedge snout, a flatter brow): the fused heads are its evolution, not copies.
const SKULL: P2[] = [[-5.5, 1.4], [-6.6, -2.2], [-4.6, -5.8], [-0.6, -7.6], [4.6, -7.4], [8.4, -5.6], [11, -4.4], [15.6, -3.6], [18.4, -3.0], [20.2, -1.6], [20.4, 0.2], [19.4, 1.4], [10, 1.4], [3, 1.4]];
const TOP: P2[] = [[-4.6, -5.8], [-0.6, -7.6], [4.6, -7.4], [8.4, -5.6], [11, -4.4], [15.6, -3.6], [18.4, -3.0], [20.2, -1.6], [20.4, -0.6], [16.6, -1.0], [12.6, -1.5], [9.4, -2.4], [7.0, -4.0], [3.4, -5.0], [-0.4, -5.1], [-3.6, -4.1], [-5.8, -3.0]];
const CHEEK: P2[] = [[-6.4, -1.4], [-5.8, -2.8], [-3.6, -4.0], [-1.0, -1.8], [-2.6, -0.6], [-6.0, -0.6]];
const MASK: P2[] = [[-0.6, -4.9], [7.4, -4.4], [8.6, -2.8], [6.6, -1.7], [1.4, -1.7], [-1.4, -3.0]];
const JAW: P2[] = [[-4.6, 1.4], [19, 1.4], [19.2, 2.8], [16, 4.0], [9, 4.8], [2, 5.6], [-2.8, 5.4], [-5, 3.4]];
const CHIN: P2[] = [[15.6, 1.6], [19.2, 1.6], [19.2, 3.0], [15.8, 3.3]];
const BROW: P2[] = [[-3.2, -4.6], [5.6, -4.9], [7.6, -3.6]];
const NOSTRIL: P2 = [17.6, -1.4];
const EYE_AT: P2 = [1.4, -4.0];
const EYE_OPEN = ['2wdd2', '2ddd2'];
const EYE_HALF = ['23333', '2ddd2'];
const EYE_SHUT = ['23333', '.222.'];
const EYE_BLAZE = ['2wwe2', '2eww2'];
const EYE_KEY: Record<string, number> = { '2': PAL.night2, '3': PAL.night3, d: PAL.cyan3, w: PAL.white, e: PAL.cyan4 };
const EYE_KEY_FAR: Record<string, number> = { '2': PAL.night1, '3': PAL.night2, d: PAL.cyan3, w: PAL.cyan4, e: PAL.cyan4 };

const MOUTH_MASK = new Uint8Array(W * H);
const JAW_MASK = new Uint8Array(W * H);
const SKULL_MASK = new Uint8Array(W * H);

function fillPoly2(pts: readonly V[], cb: (x: number, y: number) => unknown) {
  fillPoly(pts, (x, y) => void cb(x, y));
}

/** The gold horn bands (by the horn's own geometry: the same in both lights). */
const hornBand = (root: number) => (u: number, _v: number, _ox: number, oy: number) => (u < root ? 0 : oy < -0.42 ? 3 : oy > 0.3 ? 1 : 2);

function drawHead(p: PixelCanvas, P: Pose, i: number) {
  const d = HEADS[i];
  const hp = P.h[i];
  const far = d.far;
  const dn = far ? 1 : 0; // the far head is one value down
  const { T, J, jawA, ha } = headFrame(P, i);
  const Ts = (pts: readonly P2[]) => pts.map(([x, y]) => T(x, y));
  const Js = (pts: readonly P2[]) => pts.map(([x, y]) => J(x, y));
  const open = hp.jaw > 0.1;
  MOUTH_MASK.fill(0);
  JAW_MASK.fill(0);

  // crown behind the skull (A: the blades; C: the far fin)
  if (i === 0) {
    const gs = newG();
    const blades: [P2, number, number, number][] = [
      [[-3.6, -5.4], -132, 8, 2.2],
      [[0.4, -7.0], -114, 10, 2.4],
      [[4.0, -6.8], -96, 7, 1.8],
    ];
    for (const [at, a, l, w] of blades) gShard(gs, T(at[0], at[1]), polar(a + ha / DEG, 1), l * d.s, w * d.s, M.CRYS, 0, Math.max(glowAt(P, 0.85), 0.5));
    composite(p, gs.render(0, false), (x, y, b) => crease(x, y, b));
  }
  if (i === 2) {
    const gf = newG();
    const fin = [T(-2.0, -5.6), T(-9.0, -10.8), T(-13.6, -10.4), T(-6.0, -3.6)];
    gFacet(gf, fin, M.GLASS_FAR, FLAT_N, 0, 3);
    composite(p, gf.render(0, false));
  }

  // mouth cavity
  if (open) {
    const g = newG();
    gFacet(g, [T(-2.6, 1.4), T(19.4, 1.4), J(19, 1.4), J(-2.6, 1.4)], M.MOUTH, FLAT_N, 0);
    const c = g.render(0, false);
    const back = T(-1, 1.4);
    const front = T(19.4, 1.4);
    const m = lerpV(T(17, 1.4), J(16.5, 1.4), 0.5);
    const axis = sub(front, back);
    const al = len(axis) || 1;
    const jawLine = [J(-2, 1.4), J(19, 1.4)];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!c.isOpaque(x, y)) continue;
        const q: V = [x + 0.5, y + 0.5];
        const along = ((q[0] - back[0]) * axis[0] + (q[1] - back[1]) * axis[1]) / (al * al);
        const dm = len(sub(q, m));
        let col: number = along < 0.42 ? PAL.night0 : PAL.night1;
        if (hp.mouth > 0.5) {
          if (dm < 1.7) col = PAL.white;
          else if (dm < 2.9) col = PAL.cyan4;
          else if (dm < 4.1) col = PAL.cyan3;
          else if (along > 0.5) col = PAL.cyan1;
        } else if (along > 0.3 && along < 0.85 && distSeg(q, jawLine[0], jawLine[1]) < 1.6) col = PAL.crim1;
        c.set(x, y, col);
      }
    maskOf(c, MOUTH_MASK);
    composite(p, c);
  }

  // lower jaw
  {
    const g = newG();
    gFacet(g, Js(JAW), M.HIDE_D, FLAT_N, 0, 2 - dn);
    gFacet(g, Js(CHIN), M.HIDE_D, FLAT_N, 1, 3 - dn);
    const c = g.render(0, false);
    const down = rotV([0, 1], ha + jawA);
    const hits: number[] = [];
    const side = far ? PAL.night3 : PAL.steel;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (c.get(x, y) !== side) continue;
        if (!c.isOpaque(x + Math.round(down[0]), y + Math.round(down[1])) || !c.isOpaque(x, y + 1)) hits.push(x, y);
      }
    for (let k = 0; k < hits.length; k += 2) c.set(hits[k], hits[k + 1], far ? PAL.night2 : PAL.night3);
    maskOf(c, JAW_MASK);
    composite(p, c, (x, y, b) => (MOUTH_MASK[y * W + x] ? PAL.ink : selout(x, y, b)));
  }

  // upper head: side plane, lit top plane, cheek wedge, eye mask
  const g = newG();
  gFacet(g, Ts(SKULL), M.HIDE_D, FLAT_N, 0, 3 - dn);
  maskOf(g.render(0, false), SKULL_MASK);
  const inSkull = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && SKULL_MASK[y * W + x] === 1;
  fillPoly2(Ts(TOP), (x, y) => inSkull(x, y) && g.put(x, y, M.HIDE_D, 0, 0, 1, 1, 4 - dn));
  fillPoly2(Ts(CHEEK), (x, y) => inSkull(x, y) && g.put(x, y, M.HIDE_D, 0, 0, 1, 2, 2 - dn));
  fillPoly2(Ts(MASK), (x, y) => inSkull(x, y) && g.put(x, y, M.HIDE_D, 0, 0, 1, 2, 2 - dn));
  const c = g.render(0, false);
  for (let k = 1; k < BROW.length; k++) lineOn(c, T(...BROW[k - 1]), T(...BROW[k]), far ? PAL.night2 : PAL.night3);
  {
    const n0 = flo(T(...NOSTRIL));
    c.paint(n0[0], n0[1], PAL.night2);
    if (n0[0] >= 0 && n0[1] >= 0 && n0[0] < W && n0[1] < H) KEEP[n0[1] * W + n0[0]] = 1;
  }
  if (!open && hp.mouth > 0.2) lineOn(c, T(6, 1.0), T(19, 0.8), hp.mouth > 0.6 ? PAL.cyan4 : PAL.cyan3);
  composite(p, c, (x, y, b) => {
    const k = y * W + x;
    if (MOUTH_MASK[k]) return PAL.ink;
    if (JAW_MASK[k]) return open ? PAL.ink : PAL.night1;
    return selout(x, y, b);
  });

  // eye
  {
    const e = flo(T(...EYE_AT));
    const rows = hp.eye > 0.75 ? (hp.blaze >= 0.5 ? EYE_BLAZE : EYE_OPEN) : hp.eye > 0.25 ? EYE_HALF : EYE_SHUT;
    const key = far ? EYE_KEY_FAR : EYE_KEY;
    for (let j = 0; j < rows.length; j++)
      for (let k = 0; k < rows[j].length; k++) {
        let col = key[rows[j][k]];
        if (col === undefined) continue;
        if (rows[j][k] === 'd' && P.glow > 0.85) col = PAL.cyan4;
        const x = e[0] + k;
        const y = e[1] + j;
        if (p.isOpaque(x, y) && p.get(x, y) !== PAL.ink) {
          p.set(x, y, col);
          KEEP[y * W + x] = 1;
        }
      }
  }

  // fangs
  if (open) {
    const down = rotV([0, 1], ha);
    const up = rotV([0, -1], ha + jawA);
    const tooth = (from: V, dir: V) => {
      let seenInk = false;
      for (let k = 0; k < 8; k += 0.5) {
        const q = flo(add(from, mul(dir, k)));
        if (q[0] < 0 || q[1] < 0 || q[0] >= W || q[1] >= H) return;
        const idx = q[1] * W + q[0];
        if (!MOUTH_MASK[idx]) {
          if (seenInk) return;
          continue;
        }
        if (p.get(q[0], q[1]) === PAL.ink) {
          seenInk = true;
          continue;
        }
        p.set(q[0], q[1], far ? PAL.mist : PAL.white);
        return;
      }
    };
    for (const tx of [8, 12, 16.4]) tooth(T(tx, 0.4), down);
    for (const tx of [11, 15.6]) tooth(J(tx, 2.6), up);
  }

  // crowns in front of the skull
  if (i === 1) {
    // the GOLD crown: the wyrm's horn sweep (doubled: a long upper horn, a lower one parallel to it), a short brow
    // tine standing up over the eye, and the cheek horn
    const g2 = newG();
    gTube(g2, bezier(T(-1.6, -6.4), T(-6.8, -8.4), T(-12.0, -8.6), T(-17.0, -10.4), 12) as V[], 3.8, 1, M.GOLD_D, { biasAt: hornBand(0.035) });
    gTube(g2, bezier(T(-3.6, -4.2), T(-8.0, -5.0), T(-11.6, -5.0), T(-15.2, -6.6), 10) as V[], 3, 1, M.GOLD_D, { z: -1, biasAt: hornBand(0.04) });
    gTube(g2, bezier(T(4.2, -6.8), T(5.0, -9.0), T(5.0, -10.6), T(4.0, -12.4), 6) as V[], 2.6, 1, M.GOLD_D, { z: 1, biasAt: hornBand(0.1) });
    composite(p, g2.render(0, false), selout, { top: 1, side: 1, bottom: 1 });
    const g3 = newG();
    gTube(g3, bezier(T(-3.6, -0.4), T(-7, -0.2), T(-9.4, 0.8), T(-11.6, 3), 8) as V[], 2.6, 1, M.GOLD_D, { z: 1, biasAt: hornBand(-1) });
    composite(p, g3.render(0, false), () => PAL.night2, { top: 1, side: 1, bottom: 1 });
  } else if (i === 0) {
    // the far head's cheek spike: one small crystal
    const gs = newG();
    gShard(gs, T(-3.6, -0.2), polar(168 + ha / DEG, 1), 6 * d.s, 1.6, M.CRYS, 0, P.glow);
    composite(p, gs.render(0, false));
  } else {
    // the near head's PRISM fin: a broad glass fin swept back from the cheek, a white leading edge and a rainbow
    // trailing edge (the wings' prism, in small)
    const gf = newG();
    const lead: V[] = [T(-1.0, -4.6), T(-7.4, -8.6), T(-14.6, -8.0)];
    const fin = [T(-1.0, -4.6), T(-7.4, -8.6), T(-14.6, -8.0), T(-9.6, -4.4), T(-12.6, -1.2), T(-4.0, -0.6)];
    gFacet(gf, fin, M.GLASS, FLAT_N, 0, (x, y) => (distPoly([x + 0.5, y + 0.5], lead) < 2.2 ? 4 : 3));
    const fc = gf.render(0, false);
    // the free trailing edge: prism dashes
    const trail: V[] = [T(-14.6, -8.0), T(-9.6, -4.4), T(-12.6, -1.2)];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!fc.isOpaque(x, y)) continue;
        if (fc.isOpaque(x - 1, y) && fc.isOpaque(x + 1, y) && fc.isOpaque(x, y - 1) && fc.isOpaque(x, y + 1)) continue;
        const q: V = [x + 0.5, y + 0.5];
        if (distPoly(q, lead) < 1.2) fc.set(x, y, PAL.white);
        else if (distPoly(q, trail) < 1.4) {
          const u = Math.floor((x + y) / 2) + Math.floor(P.shimmer / 2.5);
          const q5 = ((u % 5) + 5) % 5;
          fc.set(x, y, q5 < 4 ? PRISM[q5] : PAL.white);
        }
      }
    composite(p, fc, selout);
  }
}

// ------------------------------------------------------------------ body parts

function drawNeck(p: PixelCanvas, P: Pose, i: number) {
  const d = HEADS[i];
  const path = neckPath(P, i);
  // the crest: crystal shards along the dorsal side, in a dark cyan0 channel
  {
    const gs = newG();
    for (const t of [0.34, 0.5, 0.66, 0.8]) {
      const s = samplePath(path, t);
      const dn = dorsal(s.tan);
      const r = lerp(d.w0, d.w1, t) / 2;
      const b = add(s.p, mul(dn, r - 0.5));
      gShard(gs, b, add(dn, mul(s.tan, -0.55)), lerp(7, 4.5, t) * d.s, lerp(2.2, 1.6, t), d.far ? M.GLASS_FAR : M.CRYS, 0, glowAt(P, 0.15 + t * 0.6));
    }
    composite(p, gs.render(0, false), (x, y, b) => (b === PAL.cyan1 || b === PAL.cyan2 ? PAL.cyan0 : crease(x, y, b)), { top: 2, side: 2, bottom: 2 });
  }
  const g = newG();
  gTube(g, path, d.w0, d.w1, d.far ? M.HIDE_FAR : M.HIDE, { flat: 1.3, biasAt: (u, _v, _ox, oy) => (oy > 0.2 ? -0.25 * oy : 0) + (u < 0.15 ? -0.2 : 0) });
  const c = g.render();
  // the core's vein: one light line up the throat side of the neck (the trinity motif: the core feeds every head)
  {
    const pulse = P.core;
    const col = d.far ? (pulse > 0.6 ? PAL.cyan3 : PAL.cyan2) : pulse > 0.75 ? PAL.cyan4 : pulse > 0.4 ? PAL.cyan3 : PAL.cyan2;
    const pts: V[] = [];
    for (let t = 0.08; t <= 0.8; t += 0.04) {
      const s = samplePath(path, t);
      const dn = dorsal(s.tan);
      const r = lerp(d.w0, d.w1, t) / 2;
      pts.push(sub(s.p, mul(dn, r * 0.35)));
    }
    for (let k = 1; k < pts.length; k++) lineOn(c, pts[k - 1], pts[k], col, (cur) => cur !== PAL.ink);
  }
  if (!d.far) rimLight(c, p);
  composite(p, c, crease, FOLD_NECK);
}

const TAIL_UNDER = 0.4;
const THIGH_TURN = 0.6;
const FAR_LEG_BIAS = -0.15;

function tailPath(P: Pose): V[] {
  const { hip } = rig(P);
  const base = [150, 158, 166, 174, 182, 190, 198, 208, 220, 234, 248, 262];
  const pts: V[] = [add(hip, rotV([-8, 4], P.lean * 0.4))];
  for (let i = 0; i < base.length; i++) {
    const k = i / (base.length - 1);
    const a = base[i] - P.tailLift * k * k + Math.sin((P.tail - i * 0.07) * Math.PI * 2) * P.tailAmp * (0.3 + k);
    pts.push(add(pts[i], polar(a, 3.25)));
  }
  for (let i = 1; i < pts.length; i++) {
    const k = i / (pts.length - 1);
    const dy = k < 0.3 ? 0 : k < 0.65 ? P.tailLag[0] * ((k - 0.3) / 0.35) : lerp(P.tailLag[0], P.tailLag[1], (k - 0.65) / 0.35);
    if (dy) pts[i] = add(pts[i], [0, dy]);
  }
  return pts;
}

/** The prism core: a faceted gem set in a gold bezel in the chest — four facets (lit white | cyan4 over cyan3 | cyan2
 *  shade) stepped by its pulse, a white table at full light, and its light spilling onto the hide round it (mist →
 *  cyan4, steel → cyan2 within a radius that breathes with the pulse). Drawn over the neck roots, outlined with the body. */
const GEM_HALF = [0, 1, 2, 3, 4, 4, 4, 3, 2, 1, 0];
function drawCore(c: PixelCanvas, P: Pose) {
  const o = corePoint(P);
  const k = P.drain > 0.6 ? 0 : P.core;
  const lit = k > 0.66 ? [PAL.white, PAL.cyan4, PAL.cyan4, PAL.cyan3] : k > 0.33 ? [PAL.white, PAL.cyan4, PAL.cyan3, PAL.cyan2] : [PAL.cyan4, PAL.cyan3, PAL.cyan2, PAL.cyan1];
  const s = LIGHT.side < 0 ? 1 : -1;
  const n = GEM_HALF.length;
  const top = o[1] - (n >> 1);
  const inGem = (x: number, y: number) => {
    const j = y - top;
    return j >= 0 && j < n && Math.abs(x - o[0]) <= GEM_HALF[j];
  };
  // the light pool on the hide round the gem
  if (k > 0.3 && P.shatter <= 0) {
    const r = 6.5 + k * 3;
    for (let y = o[1] - 11; y <= o[1] + 11; y++)
      for (let x = o[0] - 11; x <= o[0] + 11; x++) {
        const d = Math.hypot((x - o[0]) * 1.1, y - o[1]);
        if (d > r || d < 5.5) continue;
        const cur = c.get(x, y);
        if (cur === PAL.mist) c.set(x, y, PAL.cyan4);
        else if (cur === PAL.steel) c.set(x, y, PAL.cyan2);
        else if (cur === PAL.night3 && d < r - 1.5) c.set(x, y, PAL.cyan1);
      }
  }
  // the bezel: gold, lit on the key-light side
  for (let y = top - 1; y <= top + n; y++)
    for (let x = o[0] - 5; x <= o[0] + 5; x++) {
      if (inGem(x, y) || !c.isOpaque(x, y) || c.get(x, y) === PAL.ink) continue;
      if (!(inGem(x - 1, y) || inGem(x + 1, y) || inGem(x, y - 1) || inGem(x, y + 1))) continue;
      const litSide = (x - o[0]) * s < 0 || (x === o[0] && y < o[1]);
      c.set(x, y, y < o[1] ? (litSide ? PAL.gold4 : PAL.gold3) : litSide ? PAL.gold2 : PAL.gold1);
      KEEP[y * W + x] = 1;
    }
  for (let j = 0; j < n; j++) {
    const y = top + j;
    for (let dx = -GEM_HALF[j]; dx <= GEM_HALF[j]; dx++) {
      const x = o[0] + dx;
      if (!c.isOpaque(x, y) || c.get(x, y) === PAL.ink) continue;
      const left = dx * s < 0 || (dx === 0 && j < n >> 1);
      const up = j < n >> 1;
      let col = up ? (left ? lit[0] : lit[1]) : left ? lit[2] : lit[3];
      // the table: a small white diamond in the middle at full light
      if (k > 0.66 && Math.abs(dx) + Math.abs(j - (n >> 1)) <= 1) col = PAL.white;
      c.set(x, y, col);
      KEEP[y * W + x] = 1;
    }
  }
}

/** Three veins from the core: up the chest into the three neck bases. */
function veins(c: PixelCanvas, P: Pose) {
  const o = corePoint(P);
  const col = P.drain > 0.4 ? PAL.night3 : P.core > 0.75 ? PAL.cyan4 : P.core > 0.4 ? PAL.cyan3 : PAL.cyan2;
  for (let i = 0; i < 3; i++) {
    const b = neckBase(P, i);
    const from = add(o, [i - 1, -5]);
    lineOn(c, from, lerpV(from, b, 0.92), col, (cur) => cur === PAL.white || cur === PAL.mist || cur === PAL.steel || cur === PAL.night3);
  }
}

// ------------------------------------------------------------------ cracks / drain / shatter

interface Crack {
  from: number;
  pts: V[];
}
function crackSet(P: Pose): Crack[] {
  const o = corePoint(P);
  const R = rig(P);
  const out: Crack[] = [];
  const rays: [number, number, number][] = [
    [-60, 22, 0],
    [-100, 26, 0.1],
    [-20, 18, 0.15],
    [150, 20, 0.05],
    [100, 26, 0.2],
    [40, 16, 0.3],
    [200, 24, 0.35],
  ];
  for (const [a, l, from] of rays) {
    const pts: V[] = [o];
    let q = o;
    for (let k = 1; k <= 3; k++) {
      q = add(q, polar(a + (k % 2 ? 14 : -12), l / 3));
      pts.push(q);
    }
    out.push({ from, pts });
  }
  // up each neck
  for (let i = 0; i < 3; i++) out.push({ from: 0.4 + i * 0.1, pts: [neckBase(P, i), samplePath(neckPath(P, i), 0.5).p] });
  out.push({ from: 0.5, pts: [R.hip, add(R.hip, [-6, 12])] });
  return out;
}
function cracksOn(p: PixelCanvas, P: Pose) {
  for (const cr of crackSet(P)) {
    const k = clamp((P.cracks - cr.from) / (1 - cr.from), 0, 1);
    if (k <= 0) continue;
    let total = 0;
    for (let i = 1; i < cr.pts.length; i++) total += len(sub(cr.pts[i], cr.pts[i - 1]));
    let left = total * k;
    for (let i = 1; i < cr.pts.length && left > 0; i++) {
      const a = cr.pts[i - 1];
      const sl = len(sub(cr.pts[i], a));
      const b = lerpV(a, cr.pts[i], Math.min(1, left / sl));
      left -= sl;
      // the crack: an ink line with a lit lip on its light side
      lineOn(p, a, b, PAL.night1, (cur) => cur !== PAL.ink && cur !== PAL.white);
      const s = LIGHT.side < 0 ? -1 : 1;
      lineOn(p, add(a, [s, -1]), add(b, [s, -1]), PAL.cyan4, (cur) => cur === PAL.mist || cur === PAL.steel || cur === PAL.white);
    }
  }
}

/** The light drains: every glowing tone farther from the core than the front goes cold. */
const COLD: Record<number, number> = {
  [PAL.white]: PAL.mist,
  [PAL.cyan4]: PAL.steel,
  [PAL.cyan3]: PAL.cyan1,
  [PAL.cyan2]: PAL.cyan1,
  [PAL.gold4]: PAL.gold2,
  [PAL.gold3]: PAL.gold2,
  [PAL.mag3]: PAL.night3,
  [PAL.teal3]: PAL.night3,
  [PAL.void3]: PAL.night3,
};
function drainLight(p: PixelCanvas, P: Pose) {
  const o = corePoint(P);
  const front = (1 - P.drain) * 90 - 4;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = p.get(x, y);
      if (c === null) continue;
      if (Math.hypot(x + 0.5 - o[0], y + 0.5 - o[1]) <= front) continue;
      const to = COLD[c];
      if (to !== undefined) p.set(x, y, to);
    }
}

/** Deterministic hash → [0,1). */
function hash(n: number): number {
  let x = (n * 374761393 + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const SHARD_N = 46;
const GLASSY: Record<number, number> = { [PAL.mist]: PAL.cyan4, [PAL.steel]: PAL.cyan3, [PAL.night3]: PAL.cyan2, [PAL.night2]: PAL.cyan1, [PAL.night1]: PAL.cyan1, [PAL.gold2]: PAL.gold3, [PAL.gold1]: PAL.gold2 };
const SH_MASK = new Int16Array(W * H);
/**
 * Shatter: the drawn body is cut into prism shards (Voronoi cells round fixed seeds), each shard bursts out from
 * the core along its own direction, spins its light (one lit edge, one prism glint), falls, and erodes from its
 * edges — at shatter = 1 nothing is left. Revive runs the same function backwards (the shards fly in and lock).
 */
function shatterBody(p: PixelCanvas, P: Pose) {
  const t = clamp(P.shatter, 0, 1);
  const src = newCanvas();
  src.blit(p, 0, 0);
  p.clear();
  const b = src.bounds();
  if (!b) return;
  const o = corePoint(P);
  const seeds: V[] = [];
  for (let i = 0; i < SHARD_N; i++) seeds.push([b.x + hash(i * 2 + 1) * b.w, b.y + hash(i * 2 + 2) * b.h]);
  SH_MASK.fill(-1);
  const area = new Int32Array(SHARD_N);
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (!src.isOpaque(x, y)) continue;
      let best = Infinity;
      let bi = 0;
      for (let i = 0; i < SHARD_N; i++) {
        // anisotropic distance: long thin shards (cut along a slanted grain)
        const dx = x + 0.5 - seeds[i][0];
        const dy = y + 0.5 - seeds[i][1];
        const u = dx * 0.8 + dy * 0.6;
        const v = -dx * 0.6 + dy * 0.8;
        const d = u * u * 0.55 + v * v * 1.4;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      SH_MASK[y * W + x] = bi;
      area[bi]++;
    }
  const ease = 1 - (1 - t) * (1 - t);
  for (let i = 0; i < SHARD_N; i++) {
    if (!area[i]) continue;
    const sd = seeds[i];
    const dir = norm(sub(sd, o));
    const sp = 9 + hash(i * 7 + 3) * 16;
    const off: V = rnd(add(mul(dir, sp * ease), [0, 16 * t * t + hash(i * 5 + 9) * 4 * t]));
    // erosion: shards shrink from their edges (bigger ones live longer)
    const life = 0.55 + hash(i * 11 + 4) * 0.4;
    const keep = t <= 0.15 ? 1 : clamp(1 - (t - 0.15) / (life - 0.1), 0, 1);
    if (keep <= 0) continue;
    const r = Math.sqrt(area[i]) * 0.9 * keep + 0.6;
    // a shard smaller than a few pixels is gone (lone specks read as noise, not glass)
    if (r < 3) continue;
    const pal = PRISM[i % 4];
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        if (SH_MASK[y * W + x] !== i) continue;
        if (Math.hypot(x + 0.5 - sd[0], y + 0.5 - sd[1]) > r) continue;
        const tx = x + off[0];
        const ty = y + off[1];
        if (tx < 3 || ty < 3 || tx >= W - 3 || ty > GY) continue;
        // the shard's lit edge (toward the key light) and its prism glint pixel
        const edgeL = SH_MASK[y * W + x - 1] !== i;
        const edgeT = SH_MASK[(y - 1) * W + x] !== i;
        let col = src.get(x, y)!;
        // the broken body is crystal all through: its hide turns to glass as it flies
        if (t > 0.12) col = GLASSY[col] ?? col;
        if (t > 0.12 && (edgeT || (LIGHT.side < 0 ? edgeL : SH_MASK[y * W + x + 1] !== i))) col = col === PAL.ink ? PAL.cyan3 : PAL.cyan4;
        if (t > 0.12 && x === Math.round(sd[0]) && y === Math.round(sd[1])) col = pal;
        if (col === PAL.ink) col = PAL.night2;
        p.set(tx, ty, col);
      }
  }
}

// ------------------------------------------------------------------ the dragon

export function drawTrinity(p: PixelCanvas, P: Pose) {
  resetPools();
  KEEP.fill(0);
  const R = rig(P);
  const { hip, chest, tAng, att } = R;
  const { farWing, nearWing } = wings(P);
  const L = legs(P);

  // far wing
  composite(p, drawWing(farWing, true, P));

  // far neck + head A (the highest head is the far one: the necks fan into depth like a staircase)
  drawNeck(p, P, 0);
  drawHead(p, P, 0);

  // far leg
  {
    const g = newG();
    const j = add(hip, [9, 0]);
    const knee = ik(j, L.ankleF, 12, 11, -1);
    gTube(g, [j, knee], 12, 7.5, M.HIDE_FAR, { bias: FAR_LEG_BIAS });
    gTube(g, [knee, L.ankleF], 7, 5, M.HIDE_FAR, { z: 1, bias: FAR_LEG_BIAS });
    gTube(g, [L.ankleF, add(L.footF, [-1, 0])], 5, 4.4, M.HIDE_FAR, { z: 2 });
    gEll(g, L.footF, 4, 2.2, 0, M.HIDE_FAR, { z: 2 });
    const c = g.render();
    footEdges(c, L.footF, true);
    claws(c, L.footF, true);
    maskOf(c, FAR_MASK);
    composite(p, c);
  }
  // far arm
  {
    const g = newG();
    const s = att([12, 8]);
    const a = P.arm - 2;
    const el = add(s, polar(72 - a, 8));
    const wr = add(el, polar(-35 - a * 1.4, 9));
    gTube(g, [s, el, wr], 5.4, 3.8, M.HIDE_FAR);
    gEll(g, add(wr, polar(-35 - a * 1.4, 1)), 2.4, 1.8, (-35 - a * 1.4) * DEG, M.HIDE_FAR, { z: 2 });
    const c = g.render();
    hand(c, wr, -35 - a * 1.4, true);
    composite(p, c);
  }

  // tail (+ ridge crystals and the three-pronged blade)
  {
    const pts = tailPath(P);
    const gs = newG();
    for (let i = 1; i < pts.length - 2; i += 2) {
      const t = norm(sub(pts[i + 1], pts[i]));
      const dn = dorsal(t);
      const k = i / pts.length;
      const r = lerp(13, 3, k) / 2;
      gShard(gs, add(pts[i], mul(dn, r)), add(dn, mul(t, 0.6)), lerp(7.5, 4, k), lerp(2.4, 1.4, k), M.CRYS, 0, glowAt(P, 0.2 + k * 0.75));
    }
    composite(p, gs.render(0, false));
    const g = newG();
    gTube(g, pts, 13, 3, M.HIDE, { flat: 1.15, biasAt: (_u, _v, _ox, oy) => (oy > 0 ? -TAIL_UNDER * oy : 0) });
    const tip = pts[pts.length - 1];
    const tdir = norm(sub(tip, pts[pts.length - 3]));
    gShard(g, sub(tip, mul(tdir, 1)), tdir, 9, 3, M.CRYS, 6, glowAt(P, 0.97));
    gShard(g, sub(tip, mul(tdir, 2)), rotV(tdir, -0.75), 6, 2, M.CRYS, 5, P.glow);
    gShard(g, sub(tip, mul(tdir, 2)), rotV(tdir, 0.75), 6, 2, M.CRYS, 5, P.glow);
    const c = g.render();
    rimLight(c, p);
    composite(p, c);
  }

  // back crystals (big spines between the wings) + torso
  {
    const gs = newG();
    const axis = norm(sub(chest, hip));
    const dn = dorsal(axis);
    const spikes: [number, number, number][] = [
      [1.1, 9, 8],
      [0.82, 11, 10],
      [0.52, 12, 9],
      [0.22, 11, 6.5],
    ];
    for (const [t, off, l] of spikes) gShard(gs, add(lerpV(hip, chest, t), mul(dn, off - 1)), add(dn, mul(axis, -0.6)), l, l * 0.38, M.CRYS, 0, glowAt(P, 0.1 + Math.abs(t - 0.7) * 0.5));
    composite(p, gs.render(0, false));
  }
  {
    const g = newG();
    gEll(g, hip, 13.5, 11.5, (tAng - P.chestLean) * 0.3, M.HIDE, { flat: 1.45 });
    gEll(g, chest, 11.5, 13, tAng, M.HIDE, { flat: 1.45 });
    gTube(g, [hip, chest, att([2, -9])], 21, 17, M.HIDE, { flat: 1.45, z: 6 });
    const c = g.render();
    // the chest plate: a broad mist plane down the front with ONE steel line (the keel of the fused chest)
    veins(c, P);
    rimLight(c, p);
    composite(p, c);
  }

  // near leg
  {
    const j = add(hip, [3, 4]);
    const knee = ik(j, L.ankleN, 13, 11, -1);
    const gl = newG();
    gTube(gl, [knee, L.ankleN], 7.5, 5.4, M.HIDE, { z: 1, flat: 1.1 });
    gTube(gl, [L.ankleN, add(L.footN, [-1, 0])], 5.4, 4.6, M.HIDE, { z: 2 });
    gEll(gl, L.footN, 4.4, 2.4, 0, M.HIDE, { z: 2 });
    const cl = gl.render();
    footEdges(cl, L.footN, false);
    claws(cl, L.footN, false);
    const g = newG();
    gTube(g, [j, knee], 15.5, 8.5, M.HIDE, { z: 2, flat: 1.25, biasAt: (_u, _v, ox) => Math.min(0, THIGH_TURN * ox * LIGHT.side) });
    composite(cl, g.render(), crease, { top: 0, side: 1, bottom: 2 });
    rimLight(cl, p);
    maskOf(cl, LEG_MASK);
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && LEG_MASK[y * W + x] === 1;
    composite(p, cl, (x, y, bb) => (FAR_MASK[y * W + x] && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) ? PAL.night1 : crease(x, y, bb)), FOLD_LEG);
  }

  // the centre neck + head B (gold crown), then the near neck + head C (prism fins)
  drawNeck(p, P, 1);
  drawHead(p, P, 1);
  drawNeck(p, P, 2);
  drawHead(p, P, 2);

  // near arm
  {
    const g = newG();
    const s = att([8, 10]);
    const el = add(s, polar(62 - P.arm, 8.5));
    const wa = -30 - P.arm * 1.4;
    const wr = add(el, polar(wa, 10));
    gEll(g, add(s, [0.5, 1]), 4, 3.6, 0, M.HIDE, { z: 1, flat: 1.3 });
    gTube(g, [s, el, wr], 6.6, 4.6, M.HIDE, { flat: 1.2 });
    gEll(g, add(wr, polar(wa, 1)), 2.8, 2.2, wa * DEG, M.HIDE, { z: 2, bias: 0.3 });
    const c = g.render();
    rimLight(c, p);
    hand(c, wr, wa, false);
    castShadow(p, c);
    composite(p, c, (x, y, b) => (c.isOpaque(x - LIGHT.side, y) || c.isOpaque(x, y + 1) ? selout(x, y, b) : crease(x, y, b)));
  }

  // the prism core, set in the chest over the neck roots
  drawCore(p, P);

  // near wing (in front)
  composite(p, drawWing(nearWing, false, P));

  cleanCrumbs(p);

  if (P.cracks > 0) cracksOn(p, P);
  if (P.glint > 0) {
    const o = corePoint(P);
    twinkle(p, [o[0] - (LIGHT.side < 0 ? 2 : -2), o[1] - 2], P.glint);
  }
  if (P.drain > 0) drainLight(p, P);
  if (P.shatter > 0) {
    shatterBody(p, P);
    despeckle(p, 2);
  }

  p.outline(PAL.ink);

  // ---------------- light (never outlined)
  if (P.shatter <= 0) {
    for (let i = 0; i < 3; i++) mouthLight(p, P, i);
    if (P.rays > 0) coreRays(p, P);
    if (P.beam > 0) braid(p, P);
  }
}

/** The light gathering in a mouth (closed: a glow at the lips; open: a star in the jaws). */
function mouthLight(p: PixelCanvas, P: Pose, i: number) {
  const k = P.h[i].mouth;
  if (k <= 0.45 || P.h[i].jaw >= 0.5) return;
  const m = rnd(add(mouthPoint(P, i), [1, 0]));
  const put = (dx: number, dy: number, col: number) => p.set(m[0] + dx, m[1] + dy, col);
  if (k > 0.9) {
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]] as const) put(dx, dy, PAL.cyan3);
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) put(dx, dy, PAL.cyan4);
  } else if (k > 0.7) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) put(dx, dy, PAL.cyan3);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) put(dx, dy, k > 0.7 ? PAL.white : PAL.cyan4);
  put(0, 0, PAL.white);
}

/** The core's rays: four short stepped rays (white → cyan4 → cyan3) and the prism diagonals. */
function coreRays(p: PixelCanvas, P: Pose) {
  const o = corePoint(P);
  const k = P.rays;
  const n = Math.round(2 + k * 5);
  const set = (x: number, y: number, col: number) => {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    const cur = p.get(x, y);
    if (cur === PAL.white) return;
    p.set(x, y, col);
  };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    for (let s = 5; s < 5 + n; s++) set(o[0] + dx * s, o[1] + dy * s, s < 5 + n * 0.4 ? PAL.white : s < 5 + n * 0.75 ? PAL.cyan4 : PAL.cyan3);
  if (k > 0.5)
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([dx, dy], q) => {
      for (let s = 4; s < 4 + Math.round(n * 0.6); s++) set(o[0] + dx * s, o[1] + dy * s, PRISM[q]);
    });
}

/**
 * The braid: each mouth's ray (A void3, B gold4, C cyan3 — the prism split three ways) runs to the braid point,
 * the three cross over each other once on the way (a twist of ±1.5 px), and the point blazes white: where the
 * cinematic's one beam leaves.
 */
const RAY_COL: readonly [number, number][] = [
  [PAL.void3, PAL.void4],
  [PAL.gold3, PAL.gold4],
  [PAL.cyan3, PAL.cyan4],
];
function braid(p: PixelCanvas, P: Pose) {
  const bp = braidPoint(P);
  const k = P.beam;
  const set = (x: number, y: number, col: number) => {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return;
    p.set(x, y, col);
  };
  for (let i = 0; i < 3; i++) {
    const m = add(mouthPoint(P, i), [1, 0]);
    const d = sub(bp, m);
    const L = len(d) || 1;
    const nrm: V = [-d[1] / L, d[0] / L];
    const reach = clamp(k * 1.25, 0, 1);
    const steps = Math.ceil(L * reach * 2);
    for (let s = 0; s <= steps; s++) {
      const u = s / (L * 2);
      const tw = Math.sin(u * Math.PI * 2 + i * 2.1) * 1.5 * (1 - u);
      const q = add(add(m, mul(d, u)), mul(nrm, tw));
      const [x, y] = flo(q);
      set(x, y, RAY_COL[i][u > 0.7 ? 1 : 0]);
      if (k > 0.6) set(x, y + 1, RAY_COL[i][0]);
    }
  }
  // the braid point: a white star (a diamond core and four 1-px spikes) — the one beam's origin
  if (k >= 0.6) {
    const r = k > 0.95 ? 3 : 2;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const dd = Math.abs(dx) + Math.abs(dy);
        if (dd > r) continue;
        set(bp[0] + dx, bp[1] + dy, dd <= r - 2 ? PAL.white : dd <= r - 1 ? PAL.cyan4 : PAL.cyan3);
      }
    if (k > 0.95)
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const)
        for (let s = r + 1; s <= r + 3; s++) set(bp[0] + dx * s, bp[1] + dy * s, s === r + 1 ? PAL.cyan4 : PAL.cyan3);
  }
}
