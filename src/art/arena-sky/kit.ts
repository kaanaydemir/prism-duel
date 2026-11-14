// Sky Temple painting kit: the arena's own ramps (sampled from the owner-approved concept, sunset-lit),
// value noise / fBm for volume and texture, and stepped tone mapping with ordered dithering so every
// gradient stays pixel-crisp. Arena-only colours live here (additive to PAL; the rest of the game is
// untouched).

import type { Color } from '../pixel';

const h = (s: string): Color => parseInt(s, 16);
const ramp = (...hex: string[]): readonly Color[] => hex.map(h);

/** Ramps run dark → light. */
export const SKY = {
  /** zenith violet → pink → orange → the golden horizon */
  sky: ramp('2a1d55', '3a2668', '4a2f7a', '5c3889', '6f3f93', '864698', '9d4b9a', 'b4529a', 'c95793', 'dd5a86', 'e9617a', 'f0716b', 'f2835c', 'f69655', 'faa954', 'fcbc58', 'fdcd63', 'fddd77', 'fdeb93', 'fcf4a8'),
  sun: ramp('fdde75', 'fdeb93', 'fcf4a8', 'fff9d6', 'ffffff'),
  /** cloud shadow (lavender-blue) → body → peach-lit crest */
  cloud: ramp('2b2140', '3a2c55', '4a3a68', '5c4a7c', '6f5c92', '8370aa', '9683be', 'a68ec4', 'b89bcb', 'c9a6cd', 'd8afca', 'e6b8c6', 'f1c4c3', 'f9d4c9', 'fde3d6', 'fff0e6'),
  /** board top stone: sunset-rosy grey-brown */
  stone: ramp('2a1c26', '3a2733', '4c323f', '5e3d47', '6f4a50', '815659', '93625f', 'a46f66', 'b47e72', 'c49283', 'd6a896'),
  /** board walls: violet-brown, warm lit */
  wall: ramp('1a101d', '261a2c', '332238', '442d40', '553848', '68434f', '7e5053', '955f55', 'ab6f54', 'c4895e', 'dcaf7e'),
  /** rock undersides: violet, bounce-lit lavender by the clouds below */
  rock: ramp('1e1428', '2b1e31', '3a2840', '49334e', '5a3f60', '6d4c74', '82598a', '9672a6', 'ad89bb', 'c7a2cc', 'dcbbd8'),
  gold: ramp('3e2610', '6b4a1e', '93672a', 'bf8a35', 'e2ac45', 'f5c94f', 'fde29a', 'fff4cf'),
  cyan: ramp('0b2233', '0e3b4a', '146070', '1f8a9c', '3fc6d8', '78e6ee', 'bff8fb', 'f0ffff'),
  red: ramp('2a0716', '470e24', '76132f', 'a81d3c', 'd8344d', 'ff6070', 'ff9ca4', 'ffd5d8'),
  grass: ramp('1f2a1e', '2c3f28', '3b5530', '4f6f38', '668b42', '84a650', 'a6bf68'),
  marble: ramp('5a4f68', '7d7088', 'a197aa', 'c4b8c4', 'e2d6d2', 'f6eee6', 'ffffff'),
  water: ramp('5a6d9a', '7f96c0', 'a6c0dd', 'cde0ee', 'eef6fb', 'ffffff'),
  crystalCyan: ramp('132a5c', '1d4f8a', '2f7cc0', '58aee6', '8fd6f6', 'c8f0ff', 'ffffff'),
  crystalPink: ramp('3c0f33', '6e1d55', 'a2307a', 'd84e9e', 'f585c0', 'ffc0e0', 'ffffff'),
  crystalViolet: ramp('1f1752', '35288a', '5643bf', '7f6ae0', 'aa98f4', 'd8ceff', 'ffffff'),
  ink: h('140c18'),
} as const;

// ---------------------------------------------------------------- dithering + tones

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
/** 8×8 ordered-dither threshold (0..1) of an art pixel. */
export const bayer8 = (x: number, y: number): number => (BAYER8[(x & 7) + ((y & 7) << 3)] + 0.5) / 64;

/** A ramp colour for t ∈ 0..1: stepped, with an ordered dither in the gap between neighbouring steps. */
export function tone(r: readonly Color[], t: number, x: number, y: number, soft = 0.5): Color {
  const n = r.length - 1;
  const f = Math.max(0, Math.min(0.9999, t)) * n;
  const i = Math.floor(f);
  const fr = f - i;
  // only the middle `soft` part of each step is dithered; the rest stays flat (clean bands)
  const lo = 0.5 - soft / 2;
  if (fr <= lo) return r[i];
  if (fr >= 1 - lo) return r[Math.min(n, i + 1)];
  return bayer8(x, y) < (fr - lo) / soft ? r[Math.min(n, i + 1)] : r[i];
}

// ---------------------------------------------------------------- noise

function hash2(x: number, y: number, s: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
export function noise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise (octaves of value noise), 0..1. */
export function fbm(x: number, y: number, oct = 4, s = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    sum += noise(x * f, y * f, s + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
