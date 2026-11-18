// Neon Tower painter: VOLCANO — the molten arena of Volkan Arenası (volcano_arena) on the graphite stage. BOARD_V4 only.
//
// Pure, deterministic geometry (no Phaser): ONE lava network baked once per page, read by the view layer
// (src/view/board-nt/volcano.ts) that animates it. The network replaces the calm arena's tile-seam grid (which read as a flat
// orange waffle on the slab): it is a torn, organic set of fissures lying ON the floor plane (walked in board units, projected
// 2:1, so they foreshorten like the stage), routed AROUND the zones so the neon outlines stay readable:
//
//   rift      the main fissure down the neutral lane between the two monster rows (3 px: hot double core + shoulders)
//   trunks    bursts out of both field seals (either player may cast) and cross-tears off the rift between the zones
//   hairlines thin dim branches off the trunks
//   pools     small molten pools where trunks fork (convection crust, bubbles: the view's)
//   falls     where a trunk reaches a near edge it breaks the coping and pours down the wall into a glowing puddle on the hall floor
//   crust     the charred 1-px lip beside the fissures (dark ember tones: the stone looks burnt, not painted)
//   glow      the soft stepped spill round all of it (ADD, premultiplied fire tones, Bayer-quantised: the light layer, not the pixels)
//
// Every lava pixel has a graph distance along the network from an origin (a player's field seal, or the board centre): the
// view reveals by it, so the lava visibly RUNS along the cracks and over the edges. Colours only from src/art/palette.ts.

import { PAL } from '../palette';
import { PixelCanvas as PixelCanvasImpl, mulberry32 } from '../pixel';
import type { PlayerId } from '../../engine/types';
import { BOARD_V4, zoneXY, type XY } from '../../view/layout';
import { calmZones } from '../../view/board-calm/art';
import { FACE_H, PLATE_POLY, ntIso } from '../../view/board-nt/layout-nt';
import { PLATFORM_BOX } from './platform';

/** The canvas box of the lava rasters (the platform's box: top + walls + the puddles at their foot). */
export const LAVA_BOX = { x: PLATFORM_BOX.x, y: PLATFORM_BOX.y, w: PLATFORM_BOX.w, h: PLATFORM_BOX.h } as const;

/** Lava pixel kinds. */
export const LK = { core: 0, shoulder: 1, pool: 2, fall: 3 } as const;

export interface LavaPool {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** a puddle on the hall floor at a fall's foot (else a pool on the stage) */
  puddle: boolean;
  /** its pixels (lava indices; fissure pixels inside it included) */
  px: Int32Array;
  /** the lava index the pool fills from (its distance) */
  i0: number;
}

export interface LavaFall {
  /** left column, width */
  x: number;
  w: number;
  /** per column: first wall row (the lip is the 2 rows above it), last row */
  top: number[];
  bot: number[];
  i0: number;
  i1: number;
  /** the puddle at its foot (index into pools) */
  puddle: number;
}

export interface LavaNet {
  /** lava pixels (screen px) */
  n: number;
  x: Int16Array;
  y: Int16Array;
  kind: Uint8Array;
  /** 0 rift / trunk, 1 branch, 2 hairline (strength) */
  gen: Uint8Array;
  /** 1 on the lane rift's double core */
  rift: Uint8Array;
  /** per-pixel phase seed 0..1 (flicker, crust) */
  seed: Float32Array;
  /** fall pixels: column inside the fall (0 = left edge) — else 0 */
  col: Uint8Array;
  /** charred lip: screen px + the lava pixel it borders */
  crustN: number;
  crustX: Int16Array;
  crustY: Int16Array;
  crustNear: Int32Array;
  /** glow (ADD): screen px, premultiplied RGB at full heat, the lava pixel it comes from (+ its distance offset) */
  glowN: number;
  glowX: Int16Array;
  glowY: Int16Array;
  glowRGB: Uint8Array;
  glowNear: Int32Array;
  pools: LavaPool[];
  falls: LavaFall[];
  /** fork points (screen px + lava index): sparks fly as the front passes */
  forks: { x: number; y: number; i: number }[];
  /** flare candidates: rift / trunk pixels away from every zone */
  flareAt: Int32Array;
  ms: number;
}

// ---------------------------------------------------------------- geometry helpers

const toScreen = (u: number, v: number): XY => ({ x: 320 + u - v, y: 160 + (u + v) / 2 });
const toUV = (x: number, y: number): { u: number; v: number } => {
  const dx = x - 320;
  const dy = 2 * (y - 160);
  return { u: (dx + dy) / 2, v: (dy - dx) / 2 };
};

function makeOnTop(): (x: number, y: number) => boolean {
  const poly = PLATE_POLY.map(([c, r]) => ntIso(c, r));
  return (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    let k = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) k = !k;
    }
    return k;
  };
}

const W = 640;
const H = 360;

/** The fall columns (screen x of the left column) on the visible near walls; chosen clear of the dais tab and the HUD corners. */
const FALL_X = [148, 288, 436, 498] as const;
const FALL_W = [7, 8, 8, 7] as const;

// ---------------------------------------------------------------- the build

let cached: LavaNet | null = null;

export function buildLavaNet(): LavaNet {
  if (cached) return cached;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const rnd = mulberry32(0x1a7a);
  const onTop = makeOnTop();
  const inset = (x: number, y: number): boolean => onTop(x, y) && onTop(x - 5, y) && onTop(x + 5, y) && onTop(x, y - 4) && onTop(x, y + 4);

  // the zones as board-unit boxes (the fissures route round them)
  const zones = calmZones().map((z) => {
    const c = zoneXY(z.player, z.spot, z.index);
    const uv = toUV(c.x, c.y);
    const h = z.spot === 'monster' || z.spot === 'spellTrap' ? 17 : 14;
    return { ...uv, h, spot: z.spot };
  });
  const inZone = (u: number, v: number, pad = 0): boolean => zones.some((z) => Math.abs(u - z.u) < z.h + pad && Math.abs(v - z.v) < z.h + pad);

  // the pixel grid: -1 none, else gen (lower = stronger); role 0 core / 1 shoulder
  const gridGen = new Int8Array(W * H).fill(-1);
  const gridRole = new Uint8Array(W * H);
  const riftMask = new Uint8Array(W * H);
  const plot = (x: number, y: number, gen: number, role: 0 | 1): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    const g = gridGen[i];
    if (g === -1 || gen < g || (gen === g && role < gridRole[i])) {
      gridGen[i] = gen;
      gridRole[i] = role;
    }
  };
  const isLava = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && gridGen[y * W + x] >= 0;
  const line = (ax: number, ay: number, bx: number, by: number, gen: number, rift: boolean): void => {
    let x = ax;
    let y = ay;
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      plot(x, y, gen, 0);
      if (rift) {
        plot(x, y + 1, gen, 0);
        plot(x, y - 1, gen, 1);
        plot(x, y + 2, gen, 1);
        riftMask[y * W + x] = riftMask[(y + 1) * W + x] = 1;
      } else if (gen === 0) {
        plot(x, y + 1, gen, 1);
        plot(x, y - 1, gen, 1);
      } else if (gen === 1) plot(x, y + 1, gen, 1);
      if (x === bx && y === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  };

  interface Walker {
    u: number;
    v: number;
    a: number;
    len: number;
    gen: number;
    avoid: boolean;
    rift?: boolean;
    /** pull the heading toward this board point (falls: back into the network) */
    steer?: { u: number; v: number } | null;
    /** stop when it lands on lava laid by another walker (after this many units) */
    joinAfter?: number;
  }
  const STEP = 3;
  const queue: Walker[] = [];
  const walk = (w0: Walker): void => {
    let { u, v, a } = w0;
    let p = toScreen(u, v);
    let px = Math.round(p.x);
    let py = Math.round(p.y);
    let gone = 0;
    let kink = 4 + rnd() * 8;
    const base = a;
    while (gone < w0.len) {
      a += (rnd() - 0.5) * 0.22;
      kink -= STEP;
      if (kink <= 0) {
        a += (rnd() - 0.5) * 1.15;
        kink = 5 + rnd() * 11;
      }
      // the rift keeps to the lane, trunks drift back toward their heading (cracks wander, not curl)
      if (w0.rift) a = a * 0.8 + (base - Math.sign(Math.cos(base)) * v * 0.045) * 0.2;
      else a = a * 0.93 + base * 0.07;
      if (w0.steer) {
        const want = Math.atan2(w0.steer.v - v, w0.steer.u - u);
        let d = want - a;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        a += d * 0.35;
      }
      let nu = u + Math.cos(a) * STEP;
      let nv = v + Math.sin(a) * STEP;
      if (w0.avoid && inZone(nu, nv)) {
        let ok = false;
        for (const da of [0.7, -0.7, 1.3, -1.3, 1.9, -1.9]) {
          const b = a + da;
          const tu = u + Math.cos(b) * STEP;
          const tv = v + Math.sin(b) * STEP;
          if (!inZone(tu, tv)) {
            a = b;
            nu = tu;
            nv = tv;
            ok = true;
            break;
          }
        }
        if (!ok) return;
      }
      p = toScreen(nu, nv);
      const qx = Math.round(p.x);
      const qy = Math.round(p.y);
      if (!inset(qx, qy)) return;
      const joined = w0.joinAfter !== undefined && gone > w0.joinAfter && isLava(qx, qy);
      line(px, py, qx, qy, w0.gen, !!w0.rift);
      u = nu;
      v = nv;
      px = qx;
      py = qy;
      gone += STEP;
      if (joined) return;
      const bp = w0.gen === 0 ? 0.055 : w0.gen === 1 ? 0.03 : 0;
      if (rnd() < bp)
        queue.push({ u, v, a: a + (rnd() < 0.5 ? -1 : 1) * (0.55 + rnd() * 0.7), len: Math.max(12, (w0.len - gone) * 0.5 + 8), gen: w0.gen + 1, avoid: true, joinAfter: 9 });
    }
  };

  if (BOARD_V4) {
    // 1. the rift down the neutral lane, end to end (two halves from the centre, so it is continuous through the emblem)
    walk({ u: 0, v: 0, a: 0, len: 150, gen: 0, avoid: false, rift: true });
    walk({ u: 0, v: 0, a: Math.PI, len: 150, gen: 0, avoid: false, rift: true });
    // 2. cross-tears off the rift, between the monster / spell zones, toward both players
    for (const side of [-1, 1]) {
      for (const u of [-112, -50, 50, 112]) {
        const ju = u + (rnd() - 0.5) * 14;
        queue.push({ u: ju, v: side * 3, a: side * (Math.PI / 2) + (rnd() - 0.5) * 0.5, len: 62 + rnd() * 40, gen: rnd() < 0.5 ? 0 : 1, avoid: true, joinAfter: 14 });
      }
    }
    // 3. both field seals burst (either player may cast; the reveal starts at the caster's)
    for (const p of [0, 1] as PlayerId[]) {
      const c = zoneXY(p, 'field', 0);
      const s = toUV(c.x, c.y);
      const n = 5;
      const a0 = rnd() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * Math.PI * 2) / n + (rnd() - 0.5) * 0.5;
        queue.push({ u: s.u + Math.cos(a) * 15, v: s.v + Math.sin(a) * 15, a, len: 34 + rnd() * 60, gen: k < 2 ? 0 : 1, avoid: true, joinAfter: 20 });
      }
    }
    for (let guard = 0; queue.length && guard < 400; guard++) walk(queue.shift()!);
  }

  // 4. the falls: from each fall column a trunk tears back into the network, the coping above the wall breaks
  const fallDefs: { x: number; w: number; top: number[] }[] = [];
  if (BOARD_V4)
    FALL_X.forEach((fx, k) => {
      const w = FALL_W[k];
      const top: number[] = [];
      for (let c = 0; c < w; c++) {
        let y = H - 1;
        while (y > 0 && !onTop(fx + c, y)) y--;
        top.push(y + 1);
      }
      fallDefs.push({ x: fx, w, top });
      const mid = Math.round(fx + w / 2);
      let ys = H - 1;
      while (ys > 0 && !onTop(mid, ys)) ys--;
      // lip pixels crossing the coping, then a steered trunk back to the lane
      for (let y = ys - 7; y <= ys; y++) for (let c = 1; c < w - 1; c++) plot(fx + c, y, 0, c === 1 || c === w - 2 ? 1 : 0);
      const st = toUV(mid, ys - 8);
      walk({ u: st.u, v: st.v, a: Math.atan2(-st.v, 0.0001) + (rnd() - 0.5) * 0.3, len: 160, gen: 0, avoid: true, steer: { u: st.u * 0.85, v: 0 }, joinAfter: 4 });
    });

  // ---------------------------------------------------------------- collect the lava pixels
  const lx: number[] = [];
  const ly: number[] = [];
  const lk: number[] = [];
  const lg: number[] = [];
  const lc: number[] = [];
  const idx = new Int32Array(W * H).fill(-1);
  const push = (x: number, y: number, kind: number, gen: number, col = 0): number => {
    const i = y * W + x;
    if (idx[i] >= 0) return idx[i];
    idx[i] = lx.length;
    lx.push(x);
    ly.push(y);
    lk.push(kind);
    lg.push(gen);
    lc.push(col);
    return idx[i];
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const g = gridGen[y * W + x];
      if (g >= 0) push(x, y, gridRole[y * W + x] === 0 ? LK.core : LK.shoulder, g);
    }

  // forks: rift / trunk core pixels with 3+ separate lava runs round them
  const forks: LavaNet['forks'] = [];
  const RING: [number, number][] = [
    [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [2, -1], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [-1, 2], [-2, 2], [-2, 1], [-2, 0], [-2, -1],
  ];
  for (let i = 0; i < lx.length; i++) {
    if (lk[i] !== LK.core || lg[i] > 1) continue;
    let runs = 0;
    let prev = isLava(lx[i] + RING[15][0], ly[i] + RING[15][1]);
    for (const [dx, dy] of RING) {
      const on = isLava(lx[i] + dx, ly[i] + dy);
      if (on && !prev) runs++;
      prev = on;
    }
    if (runs >= 3 && !forks.some((f) => Math.abs(f.x - lx[i]) + Math.abs(f.y - ly[i]) < 14)) forks.push({ x: lx[i], y: ly[i], i });
  }

  // pools at a few forks (away from the zones and each other), the puddles at the falls' feet
  const pools: LavaPool[] = [];
  const poolAt = (cx: number, cy: number, rx: number, ry: number, puddle: boolean): number => {
    const own: number[] = [];
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (q > 1) continue;
        if (!puddle && !onTop(x, y)) continue;
        const i = y * W + x;
        if (idx[i] >= 0) {
          // a fissure / fall pixel inside the pool becomes pool
          lk[idx[i]] = LK.pool;
          own.push(idx[i]);
          continue;
        }
        own.push(push(x, y, LK.pool, 0));
      }
    pools.push({ cx, cy, rx, ry, puddle, px: Int32Array.from(own), i0: own[0] ?? 0 });
    return pools.length - 1;
  };
  const poolForks = forks
    .map((f) => ({ f, uv: toUV(f.x, f.y) }))
    .filter((q) => !inZone(q.uv.u, q.uv.v, 7) && inset(q.f.x, q.f.y) && inset(q.f.x - 4, q.f.y) && inset(q.f.x + 4, q.f.y))
    .sort((a, b) => Math.abs(a.uv.v) - Math.abs(b.uv.v));
  const chosen: { x: number; y: number }[] = [];
  for (const q of poolForks) {
    if (chosen.length >= 6) break;
    if (chosen.some((c) => Math.hypot(c.x - q.f.x, (c.y - q.f.y) * 2) < 70)) continue;
    chosen.push({ x: q.f.x, y: q.f.y });
  }
  chosen.forEach((c, k) => poolAt(c.x + 0.5, c.y + 0.5, 6.5 + (k % 3), 3.2 + (k % 3) * 0.5, false));

  // falls: the stream pixels down the wall, then the puddle on the floor
  const falls: LavaFall[] = [];
  for (const fd of fallDefs) {
    const i0 = lx.length;
    const bot: number[] = [];
    for (let c = 0; c < fd.w; c++) {
      const b = fd.top[c] + FACE_H - 1;
      bot.push(b);
      for (let y = fd.top[c] - 1; y <= b; y++) push(fd.x + c, y, LK.fall, 0, c);
    }
    const i1 = lx.length;
    const foot = Math.max(...bot) + 2;
    const puddle = poolAt(fd.x + fd.w / 2, foot, fd.w + 7.5, 4.2, true);
    falls.push({ x: fd.x, w: fd.w, top: fd.top, bot, i0, i1, puddle });
  }

  const n = lx.length;
  const net: LavaNet = {
    n,
    x: Int16Array.from(lx),
    y: Int16Array.from(ly),
    kind: Uint8Array.from(lk),
    gen: Uint8Array.from(lg),
    rift: Uint8Array.from(lx.map((x, i) => riftMask[ly[i] * W + x])),
    seed: Float32Array.from(lx.map((x, i) => (Math.sin(x * 12.9898 + ly[i] * 78.233) * 43758.5453) % 1).map((s) => Math.abs(s))),
    col: Uint8Array.from(lc),
    crustN: 0,
    crustX: new Int16Array(0),
    crustY: new Int16Array(0),
    crustNear: new Int32Array(0),
    glowN: 0,
    glowX: new Int16Array(0),
    glowY: new Int16Array(0),
    glowRGB: new Uint8Array(0),
    glowNear: new Int32Array(0),
    pools,
    falls,
    forks: forks.filter((f) => idx[f.y * W + f.x] >= 0).map((f) => ({ ...f, i: idx[f.y * W + f.x] })),
    flareAt: new Int32Array(0),
    ms: 0,
  };

  // the charred lip: stage pixels next to a fissure / pool (not the falls: the wall keeps its metal)
  const cx: number[] = [];
  const cy: number[] = [];
  const cn: number[] = [];
  const crustSeen = new Uint8Array(W * H);
  for (let i = 0; i < n; i++) {
    if (net.kind[i] === LK.fall) continue;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const x = net.x[i] + dx;
      const y = net.y[i] + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      if (idx[j] >= 0 || crustSeen[j] || !onTop(x, y)) continue;
      crustSeen[j] = 1;
      cx.push(x);
      cy.push(y);
      cn.push(i);
    }
  }
  net.crustN = cx.length;
  net.crustX = Int16Array.from(cx);
  net.crustY = Int16Array.from(cy);
  net.crustNear = Int32Array.from(cn);

  // the glow: a stepped elliptical spill round every lava pixel (max over sources), premultiplied fire light
  const bx0 = LAVA_BOX.x;
  const by0 = LAVA_BOX.y;
  const BW = LAVA_BOX.w;
  const BH = LAVA_BOX.h;
  const gVal = new Float32Array(BW * BH);
  const gNear = new Int32Array(BW * BH).fill(-1);
  const puddlePx = new Set<number>();
  for (const p of pools) if (p.puddle) for (const i of p.px) puddlePx.add(i);
  const FALL_OFF = [1, 0.62, 0.42, 0.28, 0.18, 0.11, 0.065, 0.035];
  for (let i = 0; i < n; i++) {
    const k = net.kind[i];
    const strength = k === LK.pool ? (puddlePx.has(i) ? 1.25 : 1.15) : k === LK.fall ? 0.95 : net.gen[i] === 0 ? 0.9 : net.gen[i] === 1 ? 0.65 : 0.4;
    const R = k === LK.pool ? 7 : k === LK.fall ? 5 : net.gen[i] === 0 ? 6 : 4;
    const x0 = net.x[i];
    const y0 = net.y[i];
    for (let dy = -Math.ceil(R / 2); dy <= Math.ceil(R / 2); dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy * 2);
        if (d > R) continue;
        const x = x0 + dx - bx0;
        const y = y0 + dy - by0;
        if (x < 0 || y < 0 || x >= BW || y >= BH) continue;
        const v = strength * FALL_OFF[Math.min(FALL_OFF.length - 1, Math.floor((d / R) * FALL_OFF.length))];
        const o = y * BW + x;
        if (v > gVal[o]) {
          gVal[o] = v;
          gNear[o] = i;
        }
      }
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const HOT = [0xff, 0x8a, 0x1e]; // PAL.fire3
  const DEEP = [0x8a, 0x1c, 0x09]; // PAL.fire1
  const gx: number[] = [];
  const gy: number[] = [];
  const grgb: number[] = [];
  const gn: number[] = [];
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const o = y * BW + x;
      const v = gVal[o];
      if (v < 0.02 || gNear[o] < 0) continue;
      // 8 stepped levels, the step chosen by an ordered dither (no smooth alpha: the spill reads as banded light)
      const lv = Math.min(8, Math.floor(v * 8 + BAYER[(y & 3) * 4 + (x & 3)] / 16));
      if (lv <= 0) continue;
      const k = (lv / 8) * 0.62;
      const mix = Math.min(1, v * 1.15); // hot near the source, deep red at the rim
      gx.push(x + bx0);
      gy.push(y + by0);
      for (let ch = 0; ch < 3; ch++) grgb.push(Math.round((HOT[ch] * mix + DEEP[ch] * (1 - mix)) * k));
      gn.push(gNear[o]);
    }
  net.glowN = gx.length;
  net.glowX = Int16Array.from(gx);
  net.glowY = Int16Array.from(gy);
  net.glowRGB = Uint8Array.from(grgb);
  net.glowNear = Int32Array.from(gn);

  // flare spots: rift / trunk core pixels clear of the zones (a jet never fires through a card)
  const fl: number[] = [];
  for (let i = 0; i < n; i++) {
    if (net.kind[i] !== LK.core || net.gen[i] !== 0) continue;
    const uv = toUV(net.x[i], net.y[i]);
    if (inZone(uv.u, uv.v, 6)) continue;
    if (!inset(net.x[i], net.y[i])) continue;
    fl.push(i);
  }
  net.flareAt = Int32Array.from(fl.filter((_, k) => k % 3 === 0));
  net.ms = typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 10) / 10 : 0;
  cached = net;
  return net;
}

// ---------------------------------------------------------------- distances (graph distance along the network)

const distCache = new Map<string, Float32Array>();

/** Graph distance (px along the lava) of every lava pixel from `origin` (a player's field seal; null = the board centre). */
export function lavaDist(origin: PlayerId | null): Float32Array {
  const key = origin === null ? 'c' : String(origin);
  const hit = distCache.get(key);
  if (hit) return hit;
  const net = buildLavaNet();
  const o = origin === null ? { x: 320, y: 160 } : zoneXY(origin, 'field', 0);
  const dist = new Float32Array(net.n).fill(Infinity);
  const at = new Int32Array(W * H).fill(-1);
  for (let i = 0; i < net.n; i++) at[net.y[i] * W + net.x[i]] = i;
  // seeds: every lava pixel within 12 px (iso) of the origin, by that distance; else the nearest one
  const q: number[] = [];
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < net.n; i++) {
    const d = Math.hypot(net.x[i] - o.x, (net.y[i] - o.y) * 2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
    if (d <= 12) {
      dist[i] = d * 0.5;
      q.push(i);
    }
  }
  if (!q.length && best >= 0) {
    dist[best] = 0;
    q.push(best);
  }
  // Dijkstra-lite: a bucketed BFS on integer-ish costs (8-neighbour, diagonal 1.4)
  q.sort((a, b) => dist[a] - dist[b]);
  const heap: number[] = [...q];
  const NB: [number, number, number][] = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4], [-1, 1, 1.4], [1, -1, 1.4], [-1, -1, 1.4],
  ];
  // simple binary heap on dist
  const up = (k: number): void => {
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (dist[heap[p]] <= dist[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const down = (k: number): void => {
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
      if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]];
      k = m;
    }
  };
  for (let k = heap.length - 1; k >= 0; k--) down(k);
  const done = new Uint8Array(net.n);
  while (heap.length) {
    const i = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      down(0);
    }
    if (done[i]) continue;
    done[i] = 1;
    for (const [dx, dy, c] of NB) {
      const x = net.x[i] + dx;
      const y = net.y[i] + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = at[y * W + x];
      if (j < 0 || done[j]) continue;
      const nd = dist[i] + c;
      if (nd < dist[j]) {
        dist[j] = nd;
        heap.push(j);
        up(heap.length - 1);
      }
    }
  }
  // an island the walkers left (should not happen): it lights last
  let max = 0;
  for (let i = 0; i < net.n; i++) if (Number.isFinite(dist[i])) max = Math.max(max, dist[i]);
  for (let i = 0; i < net.n; i++) if (!Number.isFinite(dist[i])) dist[i] = max + Math.hypot(net.x[i] - o.x, net.y[i] - o.y) * 0.25;
  distCache.set(key, dist);
  return dist;
}

/** The largest distance (the last pixel the lava reaches) from `origin`. */
export function lavaMaxDist(origin: PlayerId | null): number {
  const d = lavaDist(origin);
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, d[i]);
  return m;
}

/** The smallest distance of any lava pixel inside the diamond of the zone at screen (cx, cy) (or its 10-px ring if none inside). */
export function lavaDistNear(origin: PlayerId | null, cx: number, cy: number, reach = 22): number {
  const net = buildLavaNet();
  const d = lavaDist(origin);
  let m = Infinity;
  for (let i = 0; i < net.n; i++) {
    if (Math.abs(net.x[i] - cx) / reach + Math.abs(net.y[i] - cy) / (reach / 2) > 1) continue;
    m = Math.min(m, d[i]);
  }
  return m;
}

/** A point on the stage's lava (a fissure or pool, not a fall): for embers / ash spawned by other modules. */
export function lavaPoint(rnd: () => number): XY {
  const net = buildLavaNet();
  for (let k = 0; k < 8; k++) {
    const i = Math.floor(rnd() * net.n);
    if (net.kind[i] !== LK.fall) return { x: net.x[i], y: net.y[i] };
  }
  return { x: 320, y: 160 };
}

/** The ramp the view steps the lava through (index 0 coolest … 6 white-hot) and the cooled scar tones. */
export const LAVA_RAMP = [PAL.fire0, PAL.fire1, PAL.fire2, PAL.fire3, PAL.fire4, PAL.gold4, PAL.white] as const;
export const SCAR_RAMP = [PAL.stone0, PAL.earth0, PAL.fire0] as const;

/**
 * The heat the lava throws over the whole stage (ADD, LAVA_BOX-sized, premultiplied): a broad, stepped wash of deep fire light
 * that follows the density of the network (blurred over ~30 px), strongest round the rift and the pools, plus a floor of warmth
 * everywhere on the top and the walls. Static: the view only fades its alpha with the heat.
 */
export function paintLavaHeat(): PixelCanvasImpl {
  const net = buildLavaNet();
  const onTop = makeOnTop();
  const BW = LAVA_BOX.w;
  const BH = LAVA_BOX.h;
  const CELL = 6;
  const gw = Math.ceil(BW / CELL);
  const gh = Math.ceil(BH / CELL);
  let grid = new Float32Array(gw * gh);
  for (let i = 0; i < net.n; i++) {
    const gx = Math.floor((net.x[i] - LAVA_BOX.x) / CELL);
    const gy = Math.floor((net.y[i] - LAVA_BOX.y) / CELL);
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
    grid[gy * gw + gx] += net.kind[i] === LK.pool ? 2 : net.kind[i] === LK.fall ? 0.6 : net.gen[i] === 0 ? 1 : 0.5;
  }
  // three box blurs (≈ a gaussian), wider along x (the iso floor)
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            s += grid[yy * gw + xx];
            c++;
          }
        out[y * gw + x] = s / c;
      }
    grid = out;
  }
  let max = 0;
  for (const v of grid) max = Math.max(max, v);
  const pc = new PixelCanvasImpl(BW, BH);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const sample = (x: number, y: number): number => {
    const fx = x / CELL - 0.5;
    const fy = y / CELL - 0.5;
    const x0 = Math.max(0, Math.min(gw - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(gh - 1, Math.floor(fy)));
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const a = grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx;
    const b = grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx;
    return (a * (1 - ty) + b * ty) / (max || 1);
  };
  const DEEP = [0x8a, 0x1c, 0x09];
  const HOT = [0xd8, 0x3f, 0x0e];
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const sx = x + LAVA_BOX.x;
      const sy = y + LAVA_BOX.y;
      const top = onTop(sx, sy);
      // the walls: under the top's lower outline, FACE_H tall
      let wall = false;
      if (!top) {
        for (let k = 1; k <= FACE_H; k++)
          if (onTop(sx, sy - k)) {
            wall = true;
            break;
          }
      }
      if (!top && !wall) continue;
      const v = Math.min(1, sample(x, y) * 1.25);
      const base = top ? 0.16 : 0.1;
      const lvl = base + v * (top ? 0.42 : 0.3);
      // fine steps (1/20): the ordered dither only breaks the band edges, it never reads as a texture
      const q = Math.floor(lvl * 20 + BAYER[(y & 3) * 4 + (x & 3)] / 16);
      if (q <= 0) continue;
      const k = q / 20;
      const o = (y * BW + x) * 4;
      for (let ch = 0; ch < 3; ch++) pc.data[o + ch] = Math.round((HOT[ch] * v + DEEP[ch] * (1 - v)) * k);
      pc.data[o + 3] = 255;
    }
  return pc;
}
