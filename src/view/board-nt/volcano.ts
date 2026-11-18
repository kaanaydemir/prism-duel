// Neon Tower layer: VOLCANO — Volkan Arenası on the graphite stage (BOARD_V4). Replaces the calm floor engine's tile-seam lava
// (BoardViewCalm skip.lava) with the torn, living lava network of src/art/arena-nt/volcano.ts.
//
//   eruption   setTheme('volcano', true, from): the stage shakes, the fissures TEAR open from the caster's field seal along the
//              network (graph distance) — a white-hot tip, gold, then the flowing fire tones behind it — sparks burst at every
//              fork the front passes, the pools fill, the falls break the coping and pour down the walls, the puddles flare on
//              the hall floor (each with its own flickering light). A heat surge rolls once over the whole net when it is done.
//   living     waves of bright lava travel outward along every fissure, a slow uneven breathing in the glow, pools churn
//              (drifting crust over gold-white melt) and bubble (dome → ring → pop with spatter, a soft blub), the falls stream
//              (bright streaks running down, the lip bulging gold), puddles ripple, embers rise off the cracks, and every few
//              seconds a FLARE: a stretch of a trunk surges white and spits a fire jet with sparks and a hiss-whoomp.
//   cooling    setTheme('normal', true): the heat drops in steps (fire → ember → charred scars), the falls stop from the top,
//              the lights gutter out, everything is gone in ~1.1 s.
// Rasters are repainted at 15 fps (66-ms steps on the scene clock: deterministic under the stepped QA clock, frozen in
// hit-stop); particles move every frame. Reduced motion: no flow waves / flares / particles, the lava holds a steady glow.

import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import type { Color } from '../../art/pixel';
import { LAVA_BOX, LAVA_RAMP, LK, SCAR_RAMP, buildLavaNet, lavaDist, lavaMaxDist, paintLavaHeat, type LavaNet } from '../../art/arena-nt/volcano';
import { WIDE_OX } from '../mobile';
import type { ArenaTheme } from '../../art/arena';
import { sfx } from '../../audio/sfx';
import type { PlayerId } from '../../engine/types';
import { TEX, shake } from '../../vfx/core';
import { Raster } from '../../vfx/setpieces';
import { DEPTH } from '../layout';
import { lightFlash, lightPool, type LightHandle } from '../light';
import { REDUCED_MOTION } from '../v3/motion';
import { NT_DEPTH } from './layout-nt';
import type { NtCtx, NtLayer } from './layer';

type Img = Phaser.GameObjects.Image;

/** Depths: the lava over the stage veil / glow (21.45 / 21.47), under the zone lines (30); the air (jets, sparks) over the tile fx. */
export const VOLCANO_Z = {
  warm: NT_DEPTH.platform + 1.465,
  heat: NT_DEPTH.platform + 1.475,
  lava: NT_DEPTH.platform + 1.48,
  glow: NT_DEPTH.platform + 1.49,
  air: DEPTH.TILE_FX + 4,
} as const;

/** The spread: the front runs the network in SPREAD_MS (sine-out: fast off the seal, slowing as it reaches the far walls). */
export const SPREAD_MS = 1250;
const STEP_MS = 66;
const COOL_MS = 1100;
const AIR_UP = 34;
/** The warm multiply over hall + stage at full heat (a palette tone: reds kept, blues pulled down). */
const WARM_TINT = PAL.earth4;
const WARM_ALPHA = 0.6;

/** When the front reaches graph distance `d` of a net whose last pixel is at `most` (ms after the eruption). */
export function spreadMsAt(d: number, most: number): number {
  if (d <= 0) return 0;
  if (d >= most) return SPREAD_MS;
  return Math.round((Math.asin(d / most) * 2 * SPREAD_MS) / Math.PI);
}

const h01 = (a: number, b = 0, c = 0): number => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth 2-D value noise 0..1 (crust drift in the pools). */
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h01(xi, yi, s);
  const b = h01(xi + 1, yi, s);
  const c = h01(xi, yi + 1, s);
  const d = h01(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

interface Particle {
  img: Img;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  sway: number;
  age: number;
  life: number;
  ramp: readonly Color[];
}

interface Bubble {
  pool: number;
  x: number;
  y: number;
  born: number;
  big: boolean;
}

interface Flare {
  x: number;
  y: number;
  born: number;
  /** lava indices it heats */
  hot: Int32Array;
  h: number;
}

export interface VolcanoLayer extends NtLayer {
  readonly hot: boolean;
  setTheme(theme: ArenaTheme, animate: boolean, from: PlayerId | null): Promise<void>;
}

const EMBER: readonly Color[] = [PAL.gold4, PAL.fire4, PAL.fire3, PAL.fire3, PAL.fire2, PAL.fire1];
const SPARK: readonly Color[] = [PAL.white, PAL.gold4, PAL.fire4, PAL.fire3, PAL.fire2];
const SPATTER: readonly Color[] = [PAL.gold4, PAL.fire4, PAL.fire3, PAL.fire2, PAL.fire1];
const SMOKE: readonly Color[] = [PAL.stone2, PAL.stone1, PAL.stone1, PAL.stone0];

export function createVolcanoLayer(ctx: NtCtx): VolcanoLayer {
  const scene = ctx.scene;
  let net: LavaNet | null = null;
  let lava: Raster | null = null;
  let glow: Raster | null = null;
  let air: Raster | null = null;
  const parts: Particle[] = [];
  const bubbles: Bubble[] = [];
  const flares: Flare[] = [];
  const lights: (LightHandle | null)[] = [];
  let dist: Float32Array | null = null;
  let most = 1;

  // state
  let on = false;
  let mode: 'off' | 'spread' | 'hot' | 'cool' = 'off';
  let origin: PlayerId | null = null;
  let t = 0;
  let modeAt = 0;
  let front = 0;
  let heat = 0;
  let lastStep = -1;
  let glowDirty = true;
  let surgeAt = -1e9;
  let token = 0;
  let resolveMode: (() => void) | null = null;
  let nextBubble: number[] = [];
  let nextFlare = 0;
  let nextEmber = 0;
  let nextRipple: number[] = [];
  const forkFired = new Set<number>();
  const poolLit = new Set<number>();
  const ripples: { pool: number; born: number }[] = [];
  const motion = !REDUCED_MOTION;

  let heatImg: Img | null = null;
  let warm: Phaser.GameObjects.Rectangle | null = null;
  let hall: LightHandle | null = null;
  const ensure = (): void => {
    if (net) return;
    net = buildLavaNet();
    heatImg = ctx.add(scene.add.image(LAVA_BOX.x, LAVA_BOX.y, ctx.texture('volcano', 'nt:volcano:heat', paintLavaHeat)).setOrigin(0).setDepth(VOLCANO_Z.heat).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    // the whole hall and stage take the lava's colour (multiply, warm): the monsters / cards / zone lines above it keep theirs
    warm = ctx.add(scene.add.rectangle(-WIDE_OX - 16, -40, 640 + WIDE_OX * 2 + 32, 440, WARM_TINT).setOrigin(0).setDepth(VOLCANO_Z.warm).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false));
    lava = new Raster(scene, LAVA_BOX.x, LAVA_BOX.y, LAVA_BOX.w, LAVA_BOX.h, VOLCANO_Z.lava);
    glow = new Raster(scene, LAVA_BOX.x, LAVA_BOX.y, LAVA_BOX.w, LAVA_BOX.h, VOLCANO_Z.glow, Phaser.BlendModes.ADD);
    air = new Raster(scene, LAVA_BOX.x, LAVA_BOX.y - AIR_UP, LAVA_BOX.w, LAVA_BOX.h, VOLCANO_Z.air);
    for (const r of [lava, glow, air]) r.img.setVisible(false);
    for (let i = 0; i < 90; i++) {
      const img = ctx.add(scene.add.image(0, 0, TEX.px1).setOrigin(0).setDepth(VOLCANO_Z.air + 0.01).setVisible(false));
      parts.push({ img, alive: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, sway: 0, age: 0, life: 1, ramp: EMBER });
    }
    nextBubble = net.pools.map((_, k) => 300 + k * 170);
    nextRipple = net.pools.map((_, k) => 200 + k * 230);
  };

  const spawn = (x: number, y: number, vx: number, vy: number, g: number, life: number, ramp: readonly Color[], sway = 0): void => {
    if (!motion) return;
    const p = parts.find((q) => !q.alive);
    if (!p) return;
    Object.assign(p, { alive: true, x, y, vx, vy, g, life, age: 0, ramp, sway });
    p.img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setTint(ramp[0]);
  };

  const pan = (x: number): number => Math.max(-1, Math.min(1, (x - 320) / 320));
  const sound = (name: Parameters<typeof sfx.play>[0], x: number, volume: number): void => {
    try {
      sfx.play(name, { pan: pan(x), volume });
    } catch {
      /* audio never breaks the arena */
    }
  };

  const hideAll = (): void => {
    for (const r of [lava, glow, air]) r?.img.setVisible(false);
    heatImg?.setVisible(false);
    warm?.setVisible(false);
    for (const p of parts) {
      p.alive = false;
      p.img.setVisible(false);
    }
  };

  const clearLights = (ms: number): void => {
    if (hall && hall.alive) void hall.fadeOut(ms * 1.4);
    hall = null;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l && l.alive) void l.fadeOut(ms);
      lights[i] = null;
    }
    poolLit.clear();
  };

  // ---------------------------------------------------------------- painting

  const put = (d: Uint8ClampedArray, w: number, x: number, y: number, c: Color): void => {
    if (x < 0 || y < 0 || x >= w) return;
    const o = (y * w + x) * 4;
    if (o >= d.length) return;
    d[o] = (c >> 16) & 255;
    d[o + 1] = (c >> 8) & 255;
    d[o + 2] = c & 255;
    d[o + 3] = 255;
  };

  /** Steps the lava drops while cooling (0 hot … 9 gone). */
  const coolSteps = (): number => (mode === 'cool' ? Math.floor((1 - heat) * 9) : 0);

  function paintLava(): void {
    const N = net!;
    const L = lava!;
    const D = dist!;
    const w = L.w;
    const data = L.pc.data;
    L.pc.clear();
    const ox = LAVA_BOX.x;
    const oy = LAVA_BOX.y;
    const cs = coolSteps();
    const flowT = motion ? t : 0;
    const spreading = mode === 'spread';
    const surge = t - surgeAt < 200 ? 1 : 0;
    const step = Math.floor(t / STEP_MS);
    // flare heat: index → extra levels
    const extra = new Map<number, number>();
    for (const f of flares) {
      const k = (t - f.born) / 520;
      const add = k < 0.25 ? 3 : k < 0.6 ? 2 : k < 1 ? 1 : 0;
      if (add > 0) for (let j = 0; j < f.hot.length; j++) extra.set(f.hot[j], Math.max(extra.get(f.hot[j]) ?? 0, add));
    }
    const coolFall = mode === 'cool' ? (1 - heat) * 60 : -1;

    // crust (under the lava pixels)
    for (let k = 0; k < N.crustN; k++) {
      const i = N.crustNear[k];
      if (D[i] > front) continue;
      let c: Color;
      if (cs >= 8) continue;
      if (cs >= 4) c = PAL.stone0;
      else c = N.gen[i] === 0 && (N.crustX[k] + N.crustY[k]) % 3 !== 0 ? PAL.fire0 : PAL.earth0;
      put(data, w, N.crustX[k] - ox, N.crustY[k] - oy, c);
    }

    // fissures + falls
    for (let i = 0; i < N.n; i++) {
      const kind = N.kind[i];
      if (kind === LK.pool) continue;
      const d = D[i];
      if (d > front) continue;
      const x = N.x[i];
      const y = N.y[i];
      let lv: number;
      if (kind === LK.fall) {
        const f = N.falls.find((q) => i >= q.i0 && i < q.i1)!;
        const c = N.col[i];
        const ry = y - f.top[c];
        if (coolFall >= 0 && ry < coolFall - 4) continue;
        const edge = c === 0 || c === f.w - 1;
        const s = (((y - flowT * 0.075 + c * 5 + N.seed[i] * 3) % 8) + 8) % 8;
        if (ry < 0) lv = edge ? 4 : 5 + (s < 3 ? 1 : 0);
        else if (edge) lv = s < 2 ? 2 : (x + y + step) % 3 ? 1 : 2;
        else if (c === 1 || c === f.w - 2) lv = s < 2.5 ? 4 : s < 5.5 ? 3 : 2;
        else lv = s < 1.5 ? 6 : s < 3.5 ? 5 : s < 6 ? 4 : 3;
        if (ry > f.bot[c] - f.top[c] - 3 && !edge) lv = Math.max(lv, 5);
      } else {
        const g = N.gen[i];
        const shoulder = kind === LK.shoulder;
        // molten cross-section: deep red lips, an orange core, the rift's double core a step hotter
        lv = N.rift[i] ? 4 : g === 0 ? 3 : g === 1 ? 3 : 2;
        if (shoulder) lv = g === 0 ? 1 : (x + y) % 2 ? 1 : 0;
        if (motion) {
          const wv = Math.sin(d * 0.13 - flowT * 0.0052 + N.seed[i] * 0.7);
          if (wv > 0.9) lv += shoulder ? 2 : 2;
          else if (wv > 0.62) lv += 1;
          else if (wv < -0.7 && !shoulder) lv -= 1;
          if (h01(i, step, 7) < 0.025) lv += 1;
        }
      }
      if (spreading) {
        const age = front - d;
        if (age < 3) lv = 6;
        else if (age < 8) lv = Math.max(lv, 5);
        else if (age < 18) lv = Math.max(lv, 4);
      }
      lv += surge + (extra.get(i) ?? 0) - cs;
      if (lv < 0) {
        if (lv < -3 || kind === LK.fall) continue;
        put(data, w, x - ox, y - oy, SCAR_RAMP[lv + 3]);
        continue;
      }
      put(data, w, x - ox, y - oy, LAVA_RAMP[Math.min(6, lv)]);
    }

    // pools + puddles: gold-white melt, drifting crust plates, a hot rim
    N.pools.forEach((p, k) => {
      for (let j = 0; j < p.px.length; j++) {
        const i = p.px[j];
        if (D[i] > front) continue;
        const x = N.x[i];
        const y = N.y[i];
        const r = Math.hypot((x + 0.5 - p.cx) / p.rx, (y + 0.5 - p.cy) / p.ry);
        let lv = r < 0.42 ? 6 : r < 0.68 ? 5 : r < 0.88 ? 4 : 3;
        if (motion) {
          const n = vnoise((x + flowT * 0.0016 * (k % 2 ? 1 : -1)) * 0.55, (y - flowT * 0.0011) * 1.1, 31 + k);
          if (r < 0.92 && n > 0.66) lv = 1;
          else if (r < 0.92 && n > 0.58) lv = 2;
        }
        if (spreading && front - D[i] < 10) lv = 6;
        lv += surge - cs;
        if (lv < 0) {
          if (lv < -3) continue;
          put(data, w, x - ox, y - oy, SCAR_RAMP[lv + 3]);
          continue;
        }
        put(data, w, x - ox, y - oy, LAVA_RAMP[Math.min(6, lv)]);
      }
    });

    // bubbles (dome → ring → pop)
    if (cs < 3)
      for (const b of bubbles) {
        const a = t - b.born;
        const bx = b.x - ox;
        const by = b.y - oy;
        if (a < 110) put(data, w, bx, by, PAL.white);
        else if (a < 230) {
          put(data, w, bx, by, PAL.fire3);
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]] as const) put(data, w, bx + dx, by + dy, PAL.gold4);
        } else if (a < 340) {
          put(data, w, bx, by, PAL.fire2);
          for (const [dx, dy] of [[-2, 0], [2, 0], [-1, -1], [1, -1], [0, -1], [-1, 1], [1, 1]] as const) put(data, w, bx + dx, by + dy, PAL.gold4);
        } else if (a < 430) for (const [dx, dy] of [[-3, 0], [3, 0], [-2, -1], [2, -1], [-2, 1], [2, 1]] as const) put(data, w, bx + dx, by + dy, PAL.fire4);
      }

    // puddle ripples on the hall floor (outside the puddle)
    for (const rp of ripples) {
      const p = N.pools[rp.pool];
      const k = (t - rp.born) / 700;
      if (k >= 1) continue;
      const rx = p.rx + 1 + k * 6;
      const ry = p.ry + 0.5 + k * 3;
      const c = k < 0.35 ? PAL.fire3 : k < 0.7 ? PAL.fire2 : PAL.fire1;
      for (let a = 0; a < 40; a++) {
        if ((a + Math.floor(k * 6)) % 3 === 0) continue;
        const th = (a / 40) * Math.PI * 2;
        const x = Math.round(p.cx + Math.cos(th) * rx);
        const y = Math.round(p.cy + Math.sin(th) * ry);
        put(data, w, x - ox, y - oy, c);
      }
    }
    L.end();
  }

  function paintGlow(gain: number): void {
    const N = net!;
    const G = glow!;
    const D = dist!;
    const data = G.pc.data;
    G.pc.clear();
    const w = G.w;
    for (let k = 0; k < N.glowN; k++) {
      const i = N.glowNear[k];
      if (D[i] > front) continue;
      const o = ((N.glowY[k] - LAVA_BOX.y) * w + (N.glowX[k] - LAVA_BOX.x)) * 4;
      data[o] = Math.min(255, N.glowRGB[k * 3] * gain);
      data[o + 1] = Math.min(255, N.glowRGB[k * 3 + 1] * gain);
      data[o + 2] = Math.min(255, N.glowRGB[k * 3 + 2] * gain);
      data[o + 3] = 255;
    }
    G.end();
  }

  let airWasEmpty = false;
  function paintAir(): void {
    const A = air!;
    // nothing in the air and nothing left from the last paint: no clear / upload (the common case between flares)
    if (!flares.length) {
      if (airWasEmpty) return;
      airWasEmpty = true;
    } else airWasEmpty = false;
    const data = A.pc.data;
    A.pc.clear();
    const w = A.w;
    const ox = LAVA_BOX.x;
    const oy = LAVA_BOX.y - AIR_UP;
    for (const f of flares) {
      const fr = Math.floor((t - f.born) / 65);
      const HS = [3, 7, 11, 14, 15, 13, 10, 7, 4, 2];
      if (fr < 0 || fr >= HS.length) continue;
      const h = Math.round(HS[fr] * f.h);
      const sway = fr % 3 === 0 ? 0 : fr % 3 === 1 ? 1 : -1;
      // a three-column tongue: hot core, flickering sides, the tip breaking into sparks
      for (let j = 0; j < h; j++) {
        const k = j / Math.max(1, h);
        const x = f.x + (k > 0.55 ? sway : 0);
        const y = f.y - 1 - j;
        const core = k < 0.3 ? PAL.white : k < 0.55 ? PAL.gold4 : k < 0.8 ? PAL.fire4 : PAL.fire3;
        put(data, w, x - ox, y - oy, core);
        if (k < 0.7) {
          const side = k < 0.35 ? PAL.fire4 : PAL.fire3;
          put(data, w, x - 1 - ox, y - oy, (j + fr) % 4 === 0 ? PAL.fire2 : side);
          put(data, w, x + 1 - ox, y - oy, (j + fr) % 3 === 0 ? PAL.fire2 : side);
        }
        if (k < 0.25 && fr < 6) {
          put(data, w, x - 2 - ox, y - oy, PAL.fire2);
          put(data, w, x + 2 - ox, y - oy, PAL.fire2);
        }
      }
      if (h > 4 && (fr & 1)) put(data, w, f.x + sway * 2 - ox, f.y - h - 2 - oy, PAL.fire3);
    }
    A.end();
  }

  // ---------------------------------------------------------------- life

  function spreadEvents(): void {
    const N = net!;
    const D = dist!;
    // sparks at the forks the front passes, a crack tick now and then
    for (const f of N.forks) {
      if (forkFired.has(f.i) || D[f.i] > front) continue;
      forkFired.add(f.i);
      const n = 3 + Math.floor(h01(f.i, 3) * 3);
      for (let k = 0; k < n; k++) spawn(f.x, f.y - 1, (h01(f.i, k, 1) - 0.5) * 70, -30 - h01(f.i, k, 2) * 50, 140, 280 + h01(f.i, k, 4) * 200, SPARK);
      if (forkFired.size % 3 === 1) sound('lavaTear', f.x, 0.5);
    }
    // the pools / puddles light as the lava reaches them
    N.pools.forEach((p, k) => {
      if (poolLit.has(k) || D[p.i0] > front + 2) return;
      poolLit.add(k);
      lights[k] = lightPool(scene, p.cx, p.cy, {
        color: PAL.fire3,
        spill: PAL.fire1,
        radius: p.puddle ? 30 : 18,
        floorY: p.cy,
        intensity: p.puddle ? 0.95 : 0.7,
        anim: 'flicker',
        fadeIn: 260,
      });
      if (p.puddle) {
        sound('lavaSplash', p.cx, 0.55);
        for (let j = 0; j < 6; j++) spawn(p.cx + (h01(k, j) - 0.5) * p.rx * 2, p.cy - 1, (h01(k, j, 2) - 0.5) * 50, -40 - h01(k, j, 3) * 40, 170, 360, SPATTER);
      }
    });
  }

  function life(): void {
    const N = net!;
    const D = dist!;
    if (!motion || (mode !== 'hot' && mode !== 'spread')) return;
    // bubbles
    N.pools.forEach((p, k) => {
      if (t < nextBubble[k] || D[p.i0] > front) return;
      nextBubble[k] = t + (p.puddle ? 500 : 700) + h01(k, Math.floor(t)) * (p.puddle ? 700 : 1300);
      const a = h01(k, Math.floor(t), 5) * Math.PI * 2;
      const r = Math.sqrt(h01(k, Math.floor(t), 6)) * 0.5;
      bubbles.push({ pool: k, x: Math.round(p.cx + Math.cos(a) * p.rx * r), y: Math.round(p.cy + Math.sin(a) * p.ry * r), born: t, big: h01(k, Math.floor(t), 9) < 0.3 });
    });
    for (let j = bubbles.length - 1; j >= 0; j--) {
      const b = bubbles[j];
      if (t - b.born >= 340 && t - b.born - 340 < STEP_MS && !(b as { popped?: boolean }).popped) {
        (b as { popped?: boolean }).popped = true;
        const n = b.big ? 5 : 3;
        for (let k = 0; k < n; k++) spawn(b.x, b.y - 1, (h01(b.x, b.born, k) - 0.5) * 46, -34 - h01(b.y, b.born, k) * 40, 170, 300 + h01(k, b.born) * 160, SPATTER);
        if (b.big) sound('lavaBubble', b.x, 0.32);
      }
      if (t - b.born > 440) bubbles.splice(j, 1);
    }
    // puddle ripples + a wisp of smoke off the puddles
    N.pools.forEach((p, k) => {
      if (!p.puddle || t < nextRipple[k] || D[p.i0] > front) return;
      nextRipple[k] = t + 520 + h01(k, Math.floor(t), 2) * 300;
      ripples.push({ pool: k, born: t });
      if (h01(k, Math.floor(t), 4) < 0.4) spawn(p.cx + (h01(k, Math.floor(t)) - 0.5) * p.rx, p.cy - 2, 0, -12, -2, 1300, SMOKE, 3);
    });
    for (let j = ripples.length - 1; j >= 0; j--) if (t - ripples[j].born > 720) ripples.splice(j, 1);
    // flares
    if (mode === 'hot' && t >= nextFlare && N.flareAt.length) {
      nextFlare = t + 1900 + h01(Math.floor(t), 11) * 2600;
      const i = N.flareAt[Math.floor(h01(Math.floor(t), 12) * N.flareAt.length)];
      const fx = N.x[i];
      const fy = N.y[i];
      const hot: number[] = [];
      for (let j = 0; j < N.n; j++) if (N.kind[j] !== LK.fall && Math.hypot(N.x[j] - fx, (N.y[j] - fy) * 2) < 16) hot.push(j);
      flares.push({ x: fx, y: fy, born: t, hot: Int32Array.from(hot), h: 0.8 + h01(i, 3) * 0.5 });
      void lightFlash(scene, fx, fy - 6, PAL.fire4, 26, 520, { floorY: fy, intensity: 0.9 });
      sound('lavaFlare', fx, 0.55);
      for (let k = 0; k < 7; k++) spawn(fx, fy - 8, (h01(i, k, Math.floor(t)) - 0.5) * 60, -60 - h01(k, i) * 50, 150, 380 + h01(k, i, 2) * 260, SPARK);
    }
    for (let j = flares.length - 1; j >= 0; j--) if (t - flares[j].born > 700) flares.splice(j, 1);
  }

  function embers(dt: number): void {
    const N = net!;
    const D = dist!;
    if (!motion || (mode !== 'hot' && mode !== 'spread')) return;
    nextEmber -= dt;
    while (nextEmber <= 0) {
      nextEmber += 55;
      for (let tries = 0; tries < 4; tries++) {
        const i = Math.floor(h01(Math.floor(t), tries, 21) * N.n);
        if (D[i] > front || N.kind[i] === LK.shoulder) continue;
        if (N.kind[i] !== LK.pool && N.gen[i] > 1) continue;
        spawn(N.x[i], N.y[i] - 1, (h01(i, Math.floor(t)) - 0.5) * 6, -16 - h01(i, 2, Math.floor(t)) * 18, -3, 900 + h01(i, 5) * 900, EMBER, 4 + h01(i, 7) * 6);
        break;
      }
    }
  }

  function moveParticles(dt: number): void {
    const s = dt / 1000;
    for (const p of parts) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        p.img.setVisible(false);
        continue;
      }
      p.vy += p.g * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      const k = p.age / p.life;
      const sx = p.sway ? Math.sin(p.age / 260 + p.life) * p.sway * k : 0;
      p.img.setPosition(Math.round(p.x + sx), Math.round(p.y)).setTint(p.ramp[Math.min(p.ramp.length - 1, Math.floor(k * p.ramp.length))]);
    }
  }

  // ---------------------------------------------------------------- frame

  function frame(dt: number): void {
    if (!net || mode === 'off') return;
    const age = t - modeAt;
    if (mode === 'spread') {
      const k = Math.min(1, age / SPREAD_MS);
      front = most * Math.sin((k * Math.PI) / 2) + (k >= 1 ? 4 : 0);
      if (k >= 1) {
        mode = 'hot';
        modeAt = t;
        surgeAt = t;
        front = Infinity;
        glowDirty = true;
        nextFlare = t + 1400;
        resolveMode?.();
        resolveMode = null;
      }
      spreadEvents();
    } else if (mode === 'cool') {
      heat = Math.max(0, 1 - age / COOL_MS);
      if (heat <= 0) {
        mode = 'off';
        hideAll();
        bubbles.length = 0;
        flares.length = 0;
        ripples.length = 0;
        resolveMode?.();
        resolveMode = null;
        return;
      }
    }
    embers(dt);
    moveParticles(dt);
    // the stage's heat wash and the hall's warm cast follow the spread / the cooling in stepped notches
    const lvl = mode === 'spread' ? Math.min(1, (t - modeAt) / (SPREAD_MS * 0.75)) : mode === 'cool' ? heat : 1;
    const notch = Math.round(lvl * 6) / 6;
    const breathe = motion ? Math.round(Math.sin(t / 1700) * 2) * 0.04 : 0;
    heatImg?.setVisible(notch > 0).setAlpha(Math.min(1, notch * (0.92 + breathe)));
    warm?.setVisible(notch > 0).setAlpha(notch * WARM_ALPHA);
    const st = Math.floor(t / STEP_MS);
    if (st === lastStep) return;
    lastStep = st;
    life();
    paintLava();
    // the glow follows the front while spreading / cooling, then holds; its level breathes in uneven stepped notches
    if (mode === 'spread' || mode === 'cool' || glowDirty) {
      paintGlow(mode === 'cool' ? heat * heat : 1);
      glowDirty = false;
    }
    const breath = motion ? Math.sin(t / 1300) * 0.6 + Math.sin(t / 530 + 1) * 0.4 : 0;
    const surge = t - surgeAt < 260 ? 0.35 : 0;
    const flareGlow = flares.some((f) => t - f.born < 300) ? 0.12 : 0;
    glow!.img.setAlpha(Math.min(1, 0.78 + Math.round(breath * 3) * 0.05 + surge + flareGlow));
    paintAir();
  }

  // ---------------------------------------------------------------- the theme

  function setTheme(theme: ArenaTheme, animate: boolean, from: PlayerId | null): Promise<void> {
    const my = ++token;
    resolveMode?.();
    resolveMode = null;
    if (theme === 'volcano') {
      ensure();
      const keepHot = on && mode !== 'cool';
      on = true;
      if (origin !== from || !dist) {
        origin = from;
        dist = lavaDist(from);
        most = lavaMaxDist(from);
      }
      for (const r of [lava!, glow!, air!]) r.img.setVisible(true);
      heat = 1;
      glowDirty = true;
      lastStep = -1;
      if (!animate || keepHot) {
        mode = 'hot';
        front = Infinity;
        modeAt = t;
        nextFlare = t + 1600;
        // the lights of every pool at once (a restart / a volcano replacing a volcano)
        net!.pools.forEach((p, k) => {
          if (poolLit.has(k)) return;
          poolLit.add(k);
          lights[k] = lightPool(scene, p.cx, p.cy, { color: PAL.fire3, spill: PAL.fire1, radius: p.puddle ? 30 : 18, floorY: p.cy, intensity: p.puddle ? 0.95 : 0.7, anim: 'flicker', fadeIn: animate ? 200 : 0 });
        });
        if (animate) surgeAt = t;
        return Promise.resolve();
      }
      clearLights(0);
      forkFired.clear();
      mode = 'spread';
      modeAt = t;
      front = 0;
      void shake(scene, 1100, 2);
      sound('lavaTear', 320, 0.8);
      return new Promise<void>((r) => (resolveMode = () => my === token && r()));
    }
    // normal
    if (!on) return Promise.resolve();
    on = false;
    if (!animate || !net) {
      mode = 'off';
      hideAll();
      clearLights(0);
      return Promise.resolve();
    }
    if (front === Infinity || mode === 'hot') front = Infinity;
    mode = 'cool';
    modeAt = t;
    heat = 1;
    clearLights(500);
    // the last of it smokes off the falls and pools
    net.pools.forEach((p, k) => {
      for (let j = 0; j < (p.puddle ? 4 : 2); j++) spawn(p.cx + (h01(k, j) - 0.5) * p.rx * 2, p.cy - 1, (h01(k, j, 1) - 0.5) * 8, -14 - h01(k, j, 2) * 8, -2, 1100 + h01(k, j, 3) * 500, SMOKE, 3);
    });
    return new Promise<void>((r) => (resolveMode = () => my === token && r()));
  }

  return {
    name: 'volcano',
    owner: 'C',
    get hot() {
      return on;
    },
    setTheme,
    tick(dt) {
      t += dt;
      frame(dt);
    },
    destroy() {
      resolveMode?.();
      resolveMode = null;
      clearLights(0);
      lava?.destroy();
      glow?.destroy();
      air?.destroy();
      lava = glow = air = null;
      net = null;
    },
  };
}

/** Testing / QA: the ms at which the front reaches a monster zone of `player`, for a volcano erupting from `origin`'s seal. */
export function lavaArrivalMs(origin: PlayerId, at: { x: number; y: number }, reach = 22): number {
  const N = buildLavaNet();
  const D = lavaDist(origin);
  let m = Infinity;
  for (let i = 0; i < N.n; i++) {
    if (Math.abs(N.x[i] - at.x) / reach + Math.abs(N.y[i] - at.y) / (reach / 2) > 1) continue;
    m = Math.min(m, D[i]);
  }
  if (!Number.isFinite(m)) {
    // no lava inside the zone: the nearest pixel
    for (let i = 0; i < N.n; i++) m = Math.min(m, D[i] + Math.hypot(N.x[i] - at.x, (N.y[i] - at.y) * 2) * 0.5);
  }
  return spreadMsAt(m, lavaMaxDist(origin));
}
