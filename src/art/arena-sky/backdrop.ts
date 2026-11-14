// Sky Temple — the sky and the cloud sea (v2), painted in code at K× density.
//
//   paintSky()          the sunset: a 20-tone stepped gradient, the sun's halo and disc, soft god-rays, stars
//   paintClouds(i)      cloud layer i (0 far … CLOUD_LAYERS.length−1 front), transparent where clear sky shows:
//                       fBm billows, self-shadowed toward the sun (peach crests, lavender undersides),
//                       far layers hazed into the sky colour. Separate layers so each can drift (parallax).
//
// Both cover the widest phone frame: game x SKY_X0 … SKY_X0 + SKY_W.

import { type Color, PixelCanvas, mix } from '../pixel';
import { K } from './board';
import { SKY, bayer8, clamp01, fbm, smooth, tone } from './kit';

export const SKY_X0 = -80;
export const SKY_W = 800;
export const SKY_H = 360;
export const HORIZON = 150;
export const SUN = { x: 470, y: 104, r: 26 } as const;

/** Sky t (0 zenith … 1 horizon) at a game point, warmed round the sun. */
function skyT(gx: number, gy: number): number {
  const base = Math.pow(clamp01(gy / HORIZON), 0.9);
  const d = Math.hypot(gx - SUN.x, (gy - SUN.y) * 1.25);
  const halo = Math.max(0, 1 - d / 210) ** 2 * 0.32;
  return clamp01(base + halo);
}

export function skyColorAt(gx: number, gy: number): Color {
  const r = SKY.sky;
  return r[Math.round(skyT(gx, gy) * (r.length - 1))];
}

export function paintSky(): PixelCanvas {
  const W = SKY_W * K;
  const H = SKY_H * K;
  const p = new PixelCanvas(W, H);
  for (let ay = 0; ay < H; ay++) {
    const gy = ay / K;
    for (let ax = 0; ax < W; ax++) {
      const gx = SKY_X0 + ax / K;
      let t = skyT(gx, gy);
      // god-rays: faint wedges fanning from the sun, stronger near it
      const dx = gx - SUN.x;
      const dy = gy - SUN.y;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const fan = Math.max(0, Math.cos(ang * 23 + 1.1)) ** 10 * Math.max(0, 1 - dist / 300) * smooth(SUN.r, SUN.r + 30, dist);
      t = clamp01(t + fan * 0.09);
      let c = tone(SKY.sky, t, ax, ay, 0.8);
      // the sun: halo rings, then the disc
      if (dist < SUN.r + 14) {
        const s = clamp01(1 - (dist - SUN.r) / 14);
        if (dist < SUN.r) c = tone(SKY.sun, 0.55 + (1 - dist / SUN.r) * 0.45, ax, ay, 0.6);
        else c = mix(c, SKY.sun[1], s * 0.75);
      }
      // stars in the violet top, a few twinkle crosses
      if (gy < 64) {
        const hsh = Math.sin(ax * 12.9898 + ay * 78.233) * 43758.5453;
        const r = hsh - Math.floor(hsh);
        if (r > 0.99935) c = SKY.cloud[15];
        else if (r > 0.9988 && bayer8(ax, ay) < 0.5) c = SKY.cloud[11];
      }
      p.set(ax, ay, c);
    }
  }
  return p;
}

interface CloudLayer {
  /** Baseline (game y): the bank is solid below it. */
  base: number;
  /** Puff radius range (game px) and spacing along the row. */
  rMin: number;
  rMax: number;
  step: number;
  seed: number;
  /** 0 = full contrast, 1 = melted into the sky colour. */
  haze: number;
  /** Shift of the light range (− darker, + lighter). */
  lift: number;
}

export const CLOUD_LAYERS: readonly CloudLayer[] = [
  { base: 150, rMin: 5, rMax: 10, step: 9, seed: 101, haze: 0.5, lift: 0.14 },
  { base: 172, rMin: 7, rMax: 13, step: 11, seed: 202, haze: 0.36, lift: 0.08 },
  { base: 200, rMin: 9, rMax: 17, step: 14, seed: 303, haze: 0.22, lift: 0.03 },
  { base: 236, rMin: 11, rMax: 21, step: 17, seed: 404, haze: 0.12, lift: 0 },
  { base: 282, rMin: 13, rMax: 25, step: 20, seed: 505, haze: 0.05, lift: -0.02 },
  { base: 336, rMin: 16, rMax: 30, step: 24, seed: 606, haze: 0, lift: -0.04 },
]

interface Puff {
  x: number;
  y: number;
  r: number;
}

/** Cumulus clusters along the layer's baseline: a base row of puffs with smaller ones stacked on top. */
function puffsOf(L: CloudLayer): Puff[] {
  let a = L.seed >>> 0;
  const rnd = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Puff[] = [];
  for (let x = SKY_X0 - 60; x < SKY_X0 + SKY_W + 60; x += L.step * (0.75 + rnd() * 0.5)) {
    const r = L.rMin + rnd() * (L.rMax - L.rMin);
    out.push({ x, y: L.base - r * 0.15, r });
    // towers: 1–3 smaller puffs climbing, leaning toward the sun
    let tx = x;
    let ty = L.base - r * 0.15;
    let tr = r;
    const n = rnd() < 0.35 ? 0 : 1 + Math.floor(rnd() * 2.6);
    for (let k = 0; k < n; k++) {
      tr *= 0.62 + rnd() * 0.18;
      tx += (rnd() - 0.35) * tr * 0.9;
      ty -= tr * (1.05 + rnd() * 0.4);
      out.push({ x: tx, y: ty, r: tr });
    }
  }
  return out;
}

/**
 * The front-most puff surface at a game point: puffs are flattened domes (wider than tall), warped by
 * noise at the edges; returns the dome height h (0 at the rim … 1 at the top) and its 3-D normal.
 */
function makeSurface(L: CloudLayer): (gx: number, gy: number) => { h: number; nx: number; ny: number; nz: number } | null {
  const puffs = puffsOf(L);
  const out = { h: 0, nx: 0, ny: 0, nz: 1 };
  return (gx, gy) => {
    let best = -1;
    let bx = 0;
    let by = 0;
    let bz = 0;
    let bScore = -1e9;
    const warp = (fbm(gx / (L.rMin * 0.9), gy / (L.rMin * 0.9), 3, L.seed) - 0.5) * 0.42;
    for (const p of puffs) {
      const rx = p.r * 1.35;
      const ry = p.r;
      if (Math.abs(gx - p.x) > rx + 6 || Math.abs(gy - p.y) > ry + 6) continue;
      const u = (gx - p.x) / rx;
      const v = (gy - p.y) / ry;
      const q = u * u + v * v;
      const lim = 1 + warp;
      if (q > lim) continue;
      const z = Math.sqrt(Math.max(0, lim - q));
      // the nearer puff wins: lower (bigger y) puffs sit in front of the ones stacked above them
      const score = z * ry + p.y * 0.35;
      if (score > bScore) {
        bScore = score;
        best = z;
        bx = u;
        by = v;
        bz = z;
      }
    }
    if (best < 0) {
      if (gy <= L.base) return null;
      out.h = 0.2;
      out.nx = 0;
      out.ny = 0.35;
      out.nz = 0.94;
      return out;
    }
    const n = Math.hypot(bx, by, bz) || 1;
    out.h = best;
    out.nx = bx / n;
    out.ny = by / n;
    out.nz = bz / n;
    return out;
  };
}

export function paintClouds(i: number): PixelCanvas {
  const L = CLOUD_LAYERS[i];
  const surf = makeSurface(L);
  const W = SKY_W * K;
  const H = SKY_H * K;
  const p = new PixelCanvas(W, H);
  const top = Math.max(0, Math.floor((L.base - L.rMax * 3.6) * K));
  // the sun: upper right and a little behind (rim light), plus a lavender sky fill from above
  const sx = 0.55;
  const sy = -0.55;
  const sz = 0.35;
  const sl = Math.hypot(sx, sy, sz);
  for (let ay = top; ay < H; ay++) {
    const gy = ay / K;
    for (let ax = 0; ax < W; ax++) {
      const gx = SKY_X0 + ax / K;
      const s = surf(gx, gy);
      if (!s) continue;
      const lambert = Math.max(0, (s.nx * sx + s.ny * sy + s.nz * sz) / sl);
      const fill = Math.max(0, -s.ny) * 0.18 + 0.12;
      const grain = (fbm(gx / 6, gy / 6, 2, L.seed + 9) - 0.5) * 0.08;
      let light = 0.1 + lambert * 0.62 + fill + grain + L.lift;
      // the sun-side rim: thin bright edge where the dome turns away from the viewer toward the light
      if (s.h < 0.32 && s.nx > 0.15 && s.ny < 0.1) light += 0.16;
      // shadowed undersides and the bank's base
      if (s.ny > 0.35) light -= 0.1;
      if (gy > L.base + 6) light = Math.min(light, 0.36 + L.lift);
      light += smooth(-60, 260, gx - SUN.x + 220) * 0.08;
      // keep the sea in the pink-lavender mids: only sun-facing crests reach the palest tones
      let c = tone(SKY.cloud, clamp01(0.06 + light * 0.84), ax, ay, 0.6);
      if (L.haze > 0) c = mix(c, skyColorAt(gx, Math.min(gy, HORIZON + 10)), L.haze);
      p.set(ax, ay, c);
    }
  }
  return p;
}
