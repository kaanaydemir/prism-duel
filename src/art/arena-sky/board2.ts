// SKY TEMPLE board v3 — painted in code at K× density, in the duel's real arena-v4 grid (layout.ts):
//   x = 320 + u − v,  y = 160 + (u + v) / 2   (game px; u along the lanes, v along the duel axis)
//
// Matches the approved concept: warm taupe flagstones (small tiles, thin grout), glowing neon zone rims
// with a stepped halo onto the stone, bright gold inlay and a thick gold-capped rim; tall walls of big
// warm-lit blocks with gold string courses and recessed blue / crimson niches holding gold sigils; under
// it all a tall jagged violet rock mass with glowing hanging crystals.

import { type Color, PixelCanvas, mix } from '../pixel';
import { SKY, bayer8, clamp01, fbm, noise, tone } from './kit';

export const K = 2;
export const SKY_BOARD2 = { x: 20, y: 6, w: 600 * K, h: 400 * K } as const;

const SLAB_U = 152;
const SLAB_V = 96;
const CHAMFER = 14;
const RIM = 8;
const BAL_U = 24;
const BAL_V = 124;
/** Wall height (game px). */
const WALL = 34;

const COL_U = [-124, -88, -44, 0, 44, 88, 124] as const;
const ROW_V = [-72, -36, 0, 36, 72] as const;
const ZONE_R = 16;

const h = (s: string): Color => parseInt(s, 16);
/** Floor flagstones: warm taupe (sunset-lit). */
const FLOOR = ['3a282d', '4c3438', '5e4042', '6f4c4c', '815955', '92655e', 'a27268', 'b28174', 'c19182', 'cfa293'].map(h);
/** Wall / rim blocks: grey-brown stone, warm on the lit faces. */
const BLOCK = ['1c1420', '2a1e2a', '3a2a34', '4b3640', '5d434b', '705157', '856062', '9a706a', 'b08273', 'c69a7e', 'dcb58c'].map(h);
/** Underside rock: dark violet with lilac facets. */
const ROCK = ['140c1c', '1e1428', '2a1c36', '382645', '473155', '573d66', '684a78', '7b5a8b', '9070a0'].map(h);

function inSlab(u: number, v: number): boolean {
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (au <= SLAB_U && av <= SLAB_V && au + av <= SLAB_U + SLAB_V - CHAMFER) return true;
  return au <= BAL_U && av <= BAL_V && av > SLAB_V - 2 && au + (av - SLAB_V) <= BAL_U + (BAL_V - SLAB_V) - 8;
}

function inset(u: number, v: number, max: number): number {
  for (let d = 1; d <= max; d++) if (!inSlab(u + d, v) || !inSlab(u - d, v) || !inSlab(u, v + d) || !inSlab(u, v - d)) return d - 1;
  return max;
}

const toUV = (gx: number, gy: number) => {
  const dx = gx - 320;
  const dy = 2 * (gy - 160);
  return { u: (dx + dy) / 2, v: (dy - dx) / 2 };
};
const scr = (du: number, dv: number) => ({ x: du - dv, y: (du + dv) / 2 });

type Owner = 0 | 1;
interface Cell {
  u: number;
  v: number;
  owner: Owner;
  kind: 'zone' | 'field' | 'banish' | 'deck' | 'grave';
}
function cells(): Cell[] {
  const out: Cell[] = [];
  for (const p of [0, 1] as const) {
    const at = (c: number, r: number) => (p === 0 ? { u: COL_U[c], v: ROW_V[r] } : { u: COL_U[6 - c], v: ROW_V[4 - r] });
    for (let i = 0; i < 5; i++) for (const r of [3, 4]) out.push({ ...at(1 + i, r), owner: p, kind: 'zone' });
    out.push({ ...at(0, 3), owner: p, kind: 'field' });
    out.push({ ...at(0, 4), owner: p, kind: 'banish' });
    out.push({ ...at(6, 3), owner: p, kind: 'grave' });
    out.push({ ...at(6, 4), owner: p, kind: 'deck' });
  }
  return out;
}
const NEON: Record<Owner, readonly Color[]> = {
  0: ['0b1a2c', '0f3150', '125a80', '1d8cb3', '3fc8e6', '7fe9f6', 'c8fbff', 'ffffff'].map(h),
  1: ['26081a', '4d0c26', '82122f', 'b81d3b', 'ea3a4f', 'ff6f78', 'ffb2b6', 'ffffff'].map(h),
};
const ZONE_FILL = h('0e1122');
const ZONE_FILL2 = h('151a33');

/** Floor flags: 11-unit tiles with thin grout, per-tile tone, worn grain. `lit` lifts the tone. */
function floor(u: number, v: number, ax: number, ay: number, lit: number): Color {
  const T = 11;
  const cu = Math.floor((u + 660) / T);
  const cv = Math.floor((v + 660) / T);
  const fu = (u + 660) / T - cu;
  const fv = (v + 660) / T - cv;
  if (fu < 0.07 || fv < 0.07) return FLOOR[2];
  let t = 0.62 + (noise(cu * 1.7, cv * 2.3, 5) - 0.5) * 0.14 + lit;
  if (fu < 0.16 || fv < 0.16) t += 0.08; // the lit near edge of each flag
  else if (fu > 0.9 || fv > 0.9) t -= 0.06;
  t += (fbm(u / 26, v / 26, 3, 11) - 0.5) * 0.2 + (noise(u * 1.6, v * 1.6, 12) - 0.5) * 0.06;
  return tone(FLOOR, clamp01(t), ax, ay, 0.5);
}

/** Gold inlay: each half's frame and the centre line, with a soft stepped glow either side. */
function inlay(u: number, v: number, base: Color, ax: number, ay: number): Color {
  const au = Math.abs(u);
  const av = Math.abs(v);
  const lines: number[] = [];
  if (au <= 141 && av >= 15 && av <= 91) lines.push(Math.abs(av - 15), Math.abs(av - 91), Math.abs(au - 141));
  if (au > 22 && au < 141) lines.push(Math.abs(v));
  if (!lines.length) return base;
  const d = Math.min(...lines);
  if (d < 0.7) return SKY.gold[6];
  if (d < 1.3) return SKY.gold[4];
  if (d < 3 && bayer8(ax, ay) < (3 - d) / 3.4) return mix(base, SKY.gold[4], 0.45);
  return base;
}

/** The centre emblem: a glowing gold star sigil inside a diamond (screen-shaped). */
function emblem(u: number, v: number, ax: number, ay: number): Color | null {
  const s = scr(u, v);
  const d = Math.abs(s.x) / 2 + Math.abs(s.y);
  if (d > 19) return null;
  if (d > 17.4) return d > 18.4 && bayer8(ax, ay) > 0.5 ? null : mix(FLOOR[6], SKY.gold[4], 0.4);
  if (d > 16.4) return SKY.gold[6];
  if (d > 15.4) return SKY.gold[3];
  const ang = Math.atan2(s.y * 2, s.x);
  const ray = Math.abs(Math.cos(ang * 4)) ** 10;
  const r = Math.hypot(s.x / 2, s.y);
  if (r < 2.4) return SKY.gold[7];
  if (r < 13 * ray + 1.2) return tone(SKY.gold, 0.55 + ray * 0.45, ax, ay);
  if (d > 9.5 && d < 10.6) return SKY.gold[4];
  return mix(FLOOR[3], SKY.gold[2], 0.25);
}

/** Distance (units) outside the nearest zone's rim, and that zone, for the floor glow. */
function nearestZone(u: number, v: number, all: Cell[]): { d: number; c: Cell } | null {
  let best: { d: number; c: Cell } | null = null;
  for (const c of all) {
    if (c.kind !== 'zone') continue;
    const d = Math.max(Math.abs(u - c.u), Math.abs(v - c.v)) - ZONE_R;
    if (!best || d < best.d) best = { d, c };
  }
  return best;
}

function slot(u: number, v: number, c: Cell, ax: number, ay: number): Color | null {
  const du = u - c.u;
  const dv = v - c.v;
  const d = Math.max(Math.abs(du), Math.abs(dv));
  const N = NEON[c.owner];
  if (c.kind === 'zone') {
    if (d > ZONE_R) return null;
    if (d > ZONE_R - 0.8) return N[5]; // outer bright edge
    if (d > ZONE_R - 1.6) return N[7]; // white-hot core
    if (d > ZONE_R - 2.4) return N[5];
    if (d > ZONE_R - 3.2) return N[3];
    if (d > ZONE_R - 4.2) return N[1]; // the glow falling into the recess
    // the recess: deep navy, the faint inner glow dithered near the rim
    const g = clamp01(1 - (ZONE_R - 4.2 - d) / 3);
    if (g > 0 && bayer8(ax, ay) < g * 0.5) return N[0];
    return du + dv < -ZONE_R ? ZONE_FILL2 : ZONE_FILL;
  }
  // pads: raised octagonal stone plinths with a gold rim, the owner's glyph glowing
  const s = scr(du, dv);
  const oct = Math.max(Math.abs(s.x) / 2 + Math.abs(s.y), Math.abs(s.y) * 1.3, Math.abs(s.x) / 2 * 1.08);
  const r = 13;
  if (oct > r) return null;
  if (oct > r - 0.8) return SKY.ink;
  if (oct > r - 2) return s.y < 0 ? SKY.gold[6] : SKY.gold[4];
  if (oct > r - 2.8) return SKY.gold[1];
  const ax2 = Math.abs(s.x);
  const ay2 = Math.abs(s.y);
  let base = tone(BLOCK, 0.62 - s.y * 0.015, ax, ay);
  if (c.kind === 'field') {
    const ring = ax2 / 2 + ay2;
    if (ring < 7.2 && ring > 5.8) base = N[5];
    else if (ring < 2.4) base = N[6];
    else if (ring < 5.8 && (ay2 < 0.6 || ax2 < 1.2)) base = N[4];
  } else if (c.kind === 'banish') {
    const ring = Math.hypot(s.x / 2, s.y);
    if (ring < 6.6 && ring > 5.4) base = N[5];
    else if (ring < 3.4 && ring > 2.2) base = N[4];
    else if (ring < 1.2) base = N[6];
  } else if (c.kind === 'grave') {
    const stone = (ax2 < 4.6 && s.y > -2.5 && s.y < 6) || (s.y <= -2.5 && (s.x * s.x) / 21 + ((s.y + 2.5) * (s.y + 2.5)) / 9.6 < 1);
    if (stone) base = (ax2 < 0.8 && s.y > -4.2 && s.y < 3.2) || (Math.abs(s.y + 0.8) < 0.6 && ax2 < 3) ? N[6] : tone(BLOCK, 0.82, ax, ay);
  } else if (c.kind === 'deck') {
    const ring = ax2 / 2 + ay2;
    if (ring < 8.2 && ring > 7) base = N[4];
    else if (ring < 3) base = N[5];
  }
  return base;
}

export function paintSkyBoard2(): PixelCanvas {
  const W = SKY_BOARD2.w;
  const H = SKY_BOARD2.h;
  const p = new PixelCanvas(W, H);
  const all = cells();
  const top = new Uint8Array(W * H);
  // 1. the top surface
  for (let ay = 0; ay < H; ay++)
    for (let ax = 0; ax < W; ax++) {
      const g = toUV(SKY_BOARD2.x + (ax + 0.5) / K, SKY_BOARD2.y + (ay + 0.5) / K);
      if (!inSlab(g.u, g.v)) continue;
      top[ay * W + ax] = 1;
      const ins = inset(g.u, g.v, RIM + 2);
      const litEdge = !inSlab(g.u - ins - 1.2, g.v) || !inSlab(g.u, g.v - ins - 1.2); // the far (sun-side) rim
      let c: Color;
      if (ins < 0.8) c = SKY.ink;
      else if (ins < 2) c = litEdge ? SKY.gold[7] : SKY.gold[5]; // gold cap
      else if (ins < 3.2) c = litEdge ? SKY.gold[5] : SKY.gold[3];
      else if (ins < 4) c = SKY.gold[1];
      else if (ins < RIM) {
        // the raised rim: long blocks along the edge
        const along = Math.abs(g.u) > SLAB_U - RIM - 2 ? g.v : g.u;
        const blk = Math.floor((along + 600) / 26);
        const fa = (along + 600) / 26 - blk;
        let t = 0.66 + (noise(blk * 3.1, 2, 31) - 0.5) * 0.12 + (fbm(g.u / 10, g.v / 10, 2, 33) - 0.5) * 0.12 + (litEdge ? 0.12 : 0);
        if (fa < 0.04) t = 0.2;
        c = tone(BLOCK, clamp01(t), ax, ay);
      } else if (ins < RIM + 1.2) c = SKY.gold[2]; // a gold line where the rim steps down
      else {
        let found: Color | null = null;
        for (const cell of all) {
          if (Math.abs(g.u - cell.u) > 18 || Math.abs(g.v - cell.v) > 18) continue;
          found = slot(g.u, g.v, cell, ax, ay);
          if (found !== null) break;
        }
        if (found === null) {
          found = emblem(g.u, g.v, ax, ay);
          if (found === null) {
            let f = floor(g.u, g.v, ax, ay, ins < RIM + 4 ? -0.1 : 0);
            // neon spill from the nearest zone onto the stone (stepped, dithered)
            const nz = nearestZone(g.u, g.v, all);
            if (nz && nz.d < 5) {
              const k = 1 - nz.d / 5;
              if (bayer8(ax, ay) < k * k * 1.1) f = mix(f, NEON[nz.c.owner][4], 0.28 + k * 0.25);
            }
            found = inlay(g.u, g.v, f, ax, ay);
          }
        }
        c = found;
      }
      p.set(ax, ay, c);
    }
  // 2. walls + underside
  const WK = WALL * K;
  for (let ax = 0; ax < W; ax++)
    for (let ay = 0; ay < H; ay++) {
      if (!top[ay * W + ax] || (ay + 1 < H && top[(ay + 1) * W + ax])) continue;
      const g = toUV(SKY_BOARD2.x + (ax + 0.5) / K, SKY_BOARD2.y + (ay + 0.5) / K);
      const eu = inSlab(g.u + 1.5, g.v);
      const ev = inSlab(g.u, g.v + 1.5);
      const face: 'L' | 'R' = !ev && eu ? 'L' : !eu && ev ? 'R' : g.u > g.v ? 'R' : 'L';
      const along = face === 'R' ? g.v : g.u;
      const lit = face === 'R' ? 0.16 : 0; // the right faces look toward the sunset
      const owner: Owner = g.u + g.v > 0 ? 0 : 1;
      const BL = 22; // block length (units)
      for (let k = 1; k <= WK && ay + k < H; k++) {
        const y = ay + k;
        if (top[y * W + ax]) break;
        const kk = k / K;
        let c: Color;
        if (kk <= 1.5) c = SKY.gold[kk < 0.8 ? 6 : 4]; // the gold lip under the cap
        else if (kk <= 2.5) c = SKY.gold[1];
        else if (Math.abs(kk - 13) < 1) c = kk < 13 ? SKY.gold[5] : SKY.gold[2]; // a gold string course
        else if (kk >= WALL - 2) c = kk >= WALL - 0.6 ? SKY.ink : SKY.gold[3];
        else {
          const crs = Math.floor((kk - 2.5) / 5.3);
          const ck = (kk - 2.5) - crs * 5.3;
          const off = crs % 2 ? BL / 2 : 0;
          const blk = Math.floor((along + 600 + off) / BL);
          const fa = (along + 600 + off) / BL - blk;
          // niches: every third block of the lower band is a recessed panel with a sigil
          const niche = kk > 15 && kk < WALL - 4 && Math.floor((along + 600) / (BL * 1.5)) % 3 === 1;
          if (niche) {
            const nb = Math.floor((along + 600) / (BL * 1.5));
            const na = (along + 600) / (BL * 1.5) - nb;
            const ek = Math.min(kk - 15, WALL - 4 - kk);
            const ea = Math.min(na, 1 - na) * BL * 1.5;
            const e = Math.min(ek, ea * 0.5);
            if (e < 0.7) c = SKY.gold[e < 0.35 ? 6 : 3];
            else if (e < 1.5) c = BLOCK[1];
            else {
              c = tone(NEON[owner], 0.22 + (1 - ek / 8) * 0.12, ax, y);
              const px = (na - 0.5) * BL * 1.5;
              const py = kk - (15 + WALL - 4) / 2;
              const pr = Math.abs(px) / 1.4 + Math.abs(py);
              if (pr < 4.6 && pr > 3.6) c = SKY.gold[5];
              else if (pr < 2 && (Math.abs(px) < 0.7 || Math.abs(py) < 0.6)) c = SKY.gold[6];
            }
          } else {
            let t = 0.5 + lit + (noise(blk * 2.7, crs * 1.9, face === 'L' ? 41 : 43) - 0.5) * 0.16 + (fbm(along / 8, kk / 5, 2, 47) - 0.5) * 0.12;
            if (ck < 0.8) t += 0.16; // lit top of each block
            else if (ck > 4.4) t -= 0.12;
            if (fa < 0.04 || ck < 0.25) t = 0.12; // joints
            c = tone(BLOCK, clamp01(t), ax, y);
          }
        }
        p.set(ax, y, c);
      }
      // the rock mass: tall, jagged stalactites, dark violet with lilac facets
      // an inverted mountain: deepest under the board's middle (screen x 320), tapering to the sides,
      // broken into stalactites
      const gx = SKY_BOARD2.x + ax / K;
      const core = Math.max(0, 1 - Math.abs(gx - 320) / 300);
      const spikes = Math.abs(noise(ax / (7 * K), 1, 57) - 0.5) * 2;
      const depth = (6 + 150 * core ** 1.4 * (0.45 + spikes * 0.7) + 12 * (fbm(ax / 40, 3, 3, 51) - 0.5)) * K;
      for (let k = WK + 1; k <= WK + depth && ay + k < H; k++) {
        const y = ay + k;
        if (top[y * W + ax]) break;
        const f = (k - WK) / depth;
        // faceted rock: flat planes (quantised noise), each lit by which way it leans
        const fq = Math.floor(fbm(ax / (14 * K), y / (9 * K), 2, 53) * 6) / 6;
        let t = 0.46 - f * 0.3 + (face === 'R' ? 0.1 : -0.02) + (fq - 0.5) * 0.5;
        const ridge = Math.floor(fbm((ax + 1) / (14 * K), y / (9 * K), 2, 53) * 6) / 6 !== fq;
        if (ridge) t += 0.18; // plane edges catch the light
        let c = tone(ROCK, clamp01(t), ax, y);
        if (k >= WK + depth - 1.5) c = SKY.ink;
        p.set(ax, y, c);
      }
    }
  // 3. hanging crystals (glowing)
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const crys = [SKY.crystalCyan, SKY.crystalViolet, SKY.crystalPink];
  for (let i = 0; i < 22; i++) {
    const ax = Math.floor(160 + rnd() * (W - 320));
    let y = -1;
    for (let yy = H - 1; yy >= 0; yy--)
      if (p.get(ax, yy) !== null) {
        y = yy;
        break;
      }
    if (y < 0 || y < H * 0.45) continue;
    const len = Math.floor((10 + rnd() * 24) * K);
    const wid = Math.floor((3 + rnd() * 4) * K);
    const r = crys[i % 3];
    // glow
    for (let gy = -wid * 2; gy < len + wid * 2; gy++)
      for (let gx = -wid * 3; gx <= wid * 3; gx++) {
        const dd = Math.hypot(gx / (wid * 3), (gy - len / 2) / (len / 2 + wid * 2));
        if (dd > 1 || p.get(ax + gx, y + gy) !== null) continue;
        if (bayer8(ax + gx, y + gy) < (1 - dd) * 0.5) p.set(ax + gx, y + gy, r[2]);
      }
    for (let k = 0; k < len; k++) {
      const half = Math.max(0, Math.round(wid * (1 - k / len) ** 0.9));
      for (let dx = -half; dx <= half; dx++) {
        let c: Color;
        if (Math.abs(dx) === half) c = SKY.ink;
        else if (dx < -half / 3) c = r[5];
        else if (dx < 1) c = r[4];
        else c = r[3];
        if (dx === -Math.floor(half / 2) && k % 9 < 3) c = r[6];
        p.set(ax + dx, y + k - 3, c);
      }
    }
  }
  return p;
}
