// Neon Tower painter: TIDE — the flooded arena of Gelgit Körfezi (tidal_bay) on the graphite stage. BOARD_V4 only.
//
// Pure, deterministic geometry (no Phaser), baked once per page, read by the view layer (src/view/board-nt/tide.ts) that animates
// it every 66 ms:
//
//   top       every stage-top pixel with its board (u, v) coordinates (the caustics are computed in floor space, so they lie on
//             the floor plane and foreshorten with it) and its distance to the stage rim (the foam that laps at the edges)
//   curtains  four wide cascades over the visible near walls (clear of the P1 dais tab and the HUD corners): per column its first
//             and last wall row
//   pools     a churning foam pool at the foot of each curtain, on the hall floor
//   veil      the colour the water gives the slab (a multiply factor, cooler and a little darker toward the deep right-hand
//             end; quantised): the view fades it in with the tide
//
// Distances from an origin (a player's field seal, or the board centre) are iso-euclidean (hypot(dx, 2·dy)): the tide spreads as a
// flat sheet, not along cracks.

import type { PlayerId } from '../../engine/types';
import { BOARD_V4, zoneXY } from '../../view/layout';
import { FACE_H, PLATE_POLY, ntIso } from '../../view/board-nt/layout-nt';
import { PLATFORM_BOX } from './platform';

/** The canvas box of the water rasters (the platform's box: top + walls + the pools at their foot). */
export const TIDE_BOX = { x: PLATFORM_BOX.x, y: PLATFORM_BOX.y, w: PLATFORM_BOX.w, h: PLATFORM_BOX.h } as const;

export interface TideCurtain {
  x0: number;
  w: number;
  /** per column: first wall row and last row */
  top: number[];
  bot: number[];
  /** the foam pool at its foot */
  pool: { cx: number; cy: number; rx: number; ry: number };
  /** where the tide reaches its lip (screen px) */
  lip: { x: number; y: number };
}

export interface TideNet {
  /** stage-top pixels */
  n: number;
  x: Int16Array;
  y: Int16Array;
  u: Float32Array;
  v: Float32Array;
  /** distance to the stage outline in px (≥ 0), capped at 15 */
  rim: Uint8Array;
  curtains: TideCurtain[];
  ms: number;
}

/** The cascades: left column and width on the near walls (screen x). */
const CURTAINS: readonly [number, number][] = [
  [124, 30],
  [258, 34],
  [398, 34],
  [470, 34],
];

let cached: TideNet | null = null;

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

export function buildTideNet(): TideNet {
  if (cached) return cached;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const onTop = makeOnTop();
  const xs: number[] = [];
  const ys: number[] = [];
  const us: number[] = [];
  const vs: number[] = [];
  const rims: number[] = [];
  const { x: bx, y: by, w: bw, h: bh } = TIDE_BOX;
  const mask = new Uint8Array(bw * bh);
  if (BOARD_V4) for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) mask[y * bw + x] = onTop(x + bx, y + by) ? 1 : 0;
  const isTop = (x: number, y: number): boolean => x >= bx && y >= by && x < bx + bw && y < by + bh && mask[(y - by) * bw + (x - bx)] === 1;
  if (BOARD_V4)
    for (let y = by; y < by + bh; y++)
      for (let x = bx; x < bx + bw; x++) {
        if (!isTop(x, y)) continue;
        // distance to the rim: the nearest off-top pixel along the four axes (iso: y counts double)
        let rim = 15;
        for (let r = 1; r <= 15 && rim === 15; r++) {
          const ry = Math.max(1, Math.round(r / 2));
          if (!isTop(x - r, y) || !isTop(x + r, y) || !isTop(x, y - ry) || !isTop(x, y + ry)) rim = r - 1;
        }
        const dx = x + 0.5 - 320;
        const dy = 2 * (y + 0.5 - 160);
        xs.push(x);
        ys.push(y);
        us.push((dx + dy) / 2);
        vs.push((dy - dx) / 2);
        rims.push(rim);
      }
  const curtains: TideCurtain[] = [];
  if (BOARD_V4)
    for (const [x0, w] of CURTAINS) {
      const top: number[] = [];
      const bot: number[] = [];
      for (let c = 0; c < w; c++) {
        let y = by + bh - 1;
        while (y > by && !isTop(x0 + c, y)) y--;
        top.push(y + 1);
        bot.push(y + FACE_H);
      }
      const mid = Math.floor(w / 2);
      const foot = Math.max(...bot) + 2;
      curtains.push({ x0, w, top, bot, pool: { cx: x0 + w / 2, cy: foot, rx: w / 2 + 9, ry: 5.5 }, lip: { x: x0 + mid, y: top[mid] - 1 } });
    }
  cached = {
    n: xs.length,
    x: Int16Array.from(xs),
    y: Int16Array.from(ys),
    u: Float32Array.from(us),
    v: Float32Array.from(vs),
    rim: Uint8Array.from(rims),
    curtains,
    ms: typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 10) / 10 : 0,
  };
  return cached;
}

/** The tide's origin on screen: a player's field seal, or the board centre. */
export function tideOrigin(origin: PlayerId | null): { x: number; y: number } {
  return origin === null ? { x: 320, y: 160 } : zoneXY(origin, 'field', 0);
}

/** Iso distance of a screen point from an origin. */
export function tideDist(o: { x: number; y: number }, x: number, y: number): number {
  return Math.hypot(x - o.x, (y - o.y) * 2);
}

/** The farthest top pixel / curtain foot from `origin` (where the front stops). */
export function tideMaxDist(origin: PlayerId | null): number {
  const net = buildTideNet();
  const o = tideOrigin(origin);
  let m = 0;
  for (let i = 0; i < net.n; i++) m = Math.max(m, tideDist(o, net.x[i], net.y[i]));
  return m;
}

/** The water's colour on the slab, as a multiply factor (RGB 0..1) at a stage pixel: cool, a little deeper toward the right. */
export function tideVeil(x: number, y: number): [number, number, number] {
  const deep = Math.max(0, Math.min(1, (x - 140) / 400));
  void y;
  return [0.62 - deep * 0.12, 0.86 - deep * 0.08, 0.98];
}
