// SKY TEMPLE board v2 — painted in code at K× density, in the duel's real arena-v4 grid (layout.ts):
//   x = 320 + u − v,  y = 160 + (u + v) / 2   (game px; u along the lanes, v along the duel axis)
//
// Look (owner-approved concept): sunset-rosy worn stone tiles, a raised rim with a gold-capped edge, thick
// walls of recessed panels framed in gold with small sigil plaques, a violet rock underside lit lavender
// by the clouds, hanging crystals. Zones are dark recesses with crisp crystal rims (cyan / crimson).

import { type Color, PixelCanvas, mix } from '../pixel';
import { SKY, bayer8, clamp01, fbm, noise, tone } from './kit';

export const K = 2;
export const SKY_BOARD2 = { x: 26, y: 8, w: 588 * K, h: 400 * K } as const;

// ---------------------------------------------------------------- shape (grid units)

const SLAB_U = 152;
const SLAB_V = 96;
const CHAMFER = 14;
/** Raised rim width (units) round the edge. */
const RIM = 9;
/** Duelist balconies on the centre lane, beyond each back row. */
const BAL_U = 24;
const BAL_V = 124;
/** Wall height (game px). */
const WALL = 26;

const COL_U = [-124, -88, -44, 0, 44, 88, 124] as const;
const ROW_V = [-72, -36, 0, 36, 72] as const;
const ZONE_R = 16;

function inSlab(u: number, v: number): boolean {
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (au <= SLAB_U && av <= SLAB_V && au + av <= SLAB_U + SLAB_V - CHAMFER) return true;
  return au <= BAL_U && av <= BAL_V && av > SLAB_V - 2 && au + (av - SLAB_V) <= BAL_U + (BAL_V - SLAB_V) - 8;
}

/** Inset distance (units) from the slab edge, capped at `max` (cheap: probe the 4 grid directions). */
function inset(u: number, v: number, max: number): number {
  for (let d = 1; d <= max; d++) if (!inSlab(u + d, v) || !inSlab(u - d, v) || !inSlab(u, v + d) || !inSlab(u, v - d)) return d - 1;
  return max;
}

const toUV = (gx: number, gy: number) => {
  const dx = gx - 320;
  const dy = 2 * (gy - 160);
  return { u: (dx + dy) / 2, v: (dy - dx) / 2 };
};

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

const RIMC: Record<Owner, readonly Color[]> = { 0: SKY.cyan, 1: SKY.red };
/** Grid offset → screen offset (game px). */
const scr = (du: number, dv: number) => ({ x: du - dv, y: (du + dv) / 2 });

// ---------------------------------------------------------------- top surface

/** Worn stone tiles: 24-unit flags on the grid, per-tile tone, beveled edges, grime and chips. */
function floor(u: number, v: number, ax: number, ay: number, lit: number): Color {
  const T = 24;
  const cu = Math.floor((u + 600) / T);
  const cv = Math.floor((v + 600) / T);
  const fu = (u + 600) / T - cu;
  const fv = (v + 600) / T - cv;
  const tv = noise(cu * 1.7, cv * 2.3, 5);
  let t = 0.72 + (tv - 0.5) * 0.16 + lit;
  // the joint (dark groove) and the bevels (light on the sun side −u/−v, shade on +u/+v)
  if (fu < 0.04 || fv < 0.04) return SKY.stone[1];
  if (fu < 0.1 || fv < 0.1) t += 0.14;
  else if (fu > 0.93 || fv > 0.93) t -= 0.12;
  // weathering: low-frequency stains + fine grit
  t += (fbm(u / 18, v / 18, 3, 11) - 0.5) * 0.22 + (noise(u * 1.3, v * 1.3, 12) - 0.5) * 0.08;
  // a few chips / cracks
  const ck = noise(cu * 5.1, cv * 3.3, 19);
  if (ck > 0.82 && Math.abs(fu - fv * 0.8 - 0.1) < 0.025 && fv > 0.2 && fv < 0.85) t -= 0.25;
  return tone(SKY.stone, clamp01(t), ax, ay, 0.5);
}

/** Thin gold inlay framing each player's half, and the centre line, broken by the emblem. */
function inlay(u: number, v: number): Color | null {
  const au = Math.abs(u);
  const av = Math.abs(v);
  const on = (d: number) => Math.abs(d) < 0.75;
  if (au <= 140 && av >= 16 && av <= 90 && (on(au - 140) || on(av - 16) || on(av - 90))) return av > 89.4 || au > 139.4 ? SKY.gold[2] : SKY.gold[4];
  if (on(v) && au > 30 && au < 140) return SKY.gold[3];
  return null;
}

/** The centre emblem: a gold eight-point sigil in a screen-diamond ring. */
function emblem(u: number, v: number, ax: number, ay: number): Color | null {
  const s = scr(u, v);
  const d = Math.abs(s.x) / 2 + Math.abs(s.y);
  if (d > 17) return null;
  if (d > 16) return SKY.ink;
  if (d > 14.5) return SKY.gold[5];
  if (d > 13.5) return SKY.gold[2];
  const ang = Math.atan2(s.y * 2, s.x);
  const ray = Math.abs(Math.cos(ang * 4)) ** 8;
  const r = Math.hypot(s.x / 2, s.y);
  if (r < 11 * ray + 1.5 && r < 12) return r < 2.2 ? SKY.gold[7] : tone(SKY.gold, 0.55 + ray * 0.4, ax, ay);
  if (d > 9 && d < 10) return SKY.gold[2];
  return null;
}

/** A slot (zone or pad) at (u, v), or null outside it. */
function slot(u: number, v: number, c: Cell, ax: number, ay: number): Color | null {
  const du = u - c.u;
  const dv = v - c.v;
  const d = Math.max(Math.abs(du), Math.abs(dv));
  const R = RIMC[c.owner];
  if (c.kind === 'zone') {
    if (d > ZONE_R) return null;
    if (d > ZONE_R - 0.7) return SKY.ink;
    if (d > ZONE_R - 1.4) return R[6]; // bright core line
    if (d > ZONE_R - 2.4) return R[4];
    if (d > ZONE_R - 3.2) return R[2];
    if (d > ZONE_R - 3.9) return SKY.ink;
    // recess floor: deep and calm, a faint lit lip on the far (−u/−v) inner edges, a whisper of the rim glow
    const inner = ZONE_R - 3.9;
    if (du < -inner + 1.6 || dv < -inner + 1.6) return SKY.stone[1];
    const glow = Math.max(0, 1 - (inner - d) / 3);
    return glow > 0.4 && bayer8(ax, ay) < glow * 0.35 ? mix(SKY.stone[0], R[1], 0.6) : SKY.stone[0];
  }
  // pads: raised octagonal plinths with a gold rim and a glyph
  const s = scr(du, dv);
  const oct = Math.max(Math.abs(s.x) / 2 + Math.abs(s.y), (Math.abs(s.x) / 2) * 1.0 + 0, Math.abs(s.y) * 1.25);
  const r = 12.5;
  if (oct > r) return null;
  if (oct > r - 0.8) return SKY.ink;
  if (oct > r - 1.8) return s.y < 0 ? SKY.gold[5] : SKY.gold[3];
  if (oct > r - 2.5) return SKY.gold[1];
  const ax2 = Math.abs(s.x);
  const ay2 = Math.abs(s.y);
  let base = tone(SKY.stone, 0.6 - s.y * 0.02, ax, ay);
  if (c.kind === 'field') {
    const ring = ax2 / 2 + ay2;
    if (ring < 7 && ring > 5.6) base = R[4];
    if (ring < 2.2) base = R[5];
    if (ring > 2.2 && ring < 5.6 && (Math.abs(s.y) < 0.6 || ax2 < 1.2)) base = R[3];
  } else if (c.kind === 'banish') {
    const ring = Math.hypot(s.x / 2, s.y);
    if (ring < 6.5 && ring > 5.3) base = R[4];
    if (ring < 3.4 && ring > 2.2) base = R[3];
  } else if (c.kind === 'grave') {
    const stone = (ax2 < 4.4 && s.y > -2.5 && s.y < 6) || (s.y <= -2.5 && (s.x * s.x) / 19.4 + ((s.y + 2.5) * (s.y + 2.5)) / 9 < 1);
    if (stone) base = (ax2 < 0.8 && s.y > -4 && s.y < 3) || (Math.abs(s.y + 0.8) < 0.6 && ax2 < 2.8) ? R[5] : R[2];
  } else if (c.kind === 'deck') {
    const ring = ax2 / 2 + ay2;
    if (ring < 8 && ring > 6.8) base = R[3];
  }
  return base;
}

// ---------------------------------------------------------------- paint

export function paintSkyBoard2(): PixelCanvas {
  const W = SKY_BOARD2.w;
  const H = SKY_BOARD2.h;
  const p = new PixelCanvas(W, H);
  const all = cells();
  const top = new Uint8Array(W * H);
  // 1. the top
  for (let ay = 0; ay < H; ay++)
    for (let ax = 0; ax < W; ax++) {
      const g = toUV(SKY_BOARD2.x + (ax + 0.5) / K, SKY_BOARD2.y + (ay + 0.5) / K);
      if (!inSlab(g.u, g.v)) continue;
      top[ay * W + ax] = 1;
      const ins = inset(g.u, g.v, RIM + 2);
      // sun from the far right: the −u side of a raised edge is lit
      let c: Color;
      if (ins < 1) c = SKY.ink;
      else if (ins < 2.2) c = !inSlab(g.u - 2.2, g.v) || !inSlab(g.u, g.v - 2.2) ? SKY.gold[6] : SKY.gold[4]; // gold cap
      else if (ins < 3) c = SKY.gold[1];
      else if (ins < RIM) {
        // the rim's top: big stone blocks along the edge
        const along = Math.abs(g.u) > SLAB_U - RIM - 2 ? g.v : g.u;
        const blk = Math.floor((along + 600) / 30);
        const fa = (along + 600) / 30 - blk;
        let t = 0.72 + (noise(blk * 3.1, 2, 31) - 0.5) * 0.14 + (fbm(g.u / 10, g.v / 10, 2, 33) - 0.5) * 0.16;
        if (fa < 0.035) t = 0.12;
        c = tone(SKY.stone, clamp01(t), ax, ay);
      } else if (ins < RIM + 1) c = SKY.stone[1]; // the rim's inner drop
      else {
        c = null as unknown as Color;
        for (const cell of all) {
          if (Math.abs(g.u - cell.u) > 18 || Math.abs(g.v - cell.v) > 18) continue;
          const sc = slot(g.u, g.v, cell, ax, ay);
          if (sc !== null) {
            c = sc;
            break;
          }
        }
        if (c === null) c = emblem(g.u, g.v, ax, ay) ?? inlay(g.u, g.v) ?? floor(g.u, g.v, ax, ay, ins < RIM + 3 ? -0.12 : 0);
      }
      p.set(ax, ay, c);
    }
  // 2. walls + underside, per column under the lowest top pixel of each run
  const WK = WALL * K;
  for (let ax = 0; ax < W; ax++)
    for (let ay = 0; ay < H; ay++) {
      if (!top[ay * W + ax] || (ay + 1 < H && top[(ay + 1) * W + ax])) continue;
      const g = toUV(SKY_BOARD2.x + (ax + 0.5) / K, SKY_BOARD2.y + (ay + 0.5) / K);
      const eu = inSlab(g.u + 1.5, g.v);
      const ev = inSlab(g.u, g.v + 1.5);
      const face: 'L' | 'R' = !ev && eu ? 'L' : !eu && ev ? 'R' : g.u > g.v ? 'R' : 'L';
      const along = face === 'R' ? g.v : g.u; // the coordinate running along this face
      const lit = face === 'R' ? 0.2 : 0; // the right faces look toward the sun
      const P = 40; // panel width (units)
      const pi = Math.floor((along + 600) / P);
      const pa = (along + 600) / P - pi;
      for (let k = 1; k <= WK && ay + k < H; k++) {
        const y = ay + k;
        if (top[y * W + ax]) break;
        const kk = k / K; // game px down the wall
        let c: Color;
        if (kk <= 1) c = SKY.gold[3]; // the gold lip under the cap
        else if (kk <= 3) c = tone(SKY.wall, 0.6 + lit, ax, y); // a stone band
        else if (kk >= WALL - 3) c = kk >= WALL - 1 ? SKY.ink : tone(SKY.wall, 0.35 + lit, ax, y); // the plinth band
        else {
          // panels: a gold-framed recess with a plaque, pilasters between them
          const inPanel = pa > 0.12 && pa < 0.88 && kk > 5 && kk < WALL - 5;
          if (pa < 0.1 || pa > 0.9) {
            // pilaster: a lit column of stacked blocks
            const bk = Math.floor(kk / 5);
            c = (kk % 5) < 0.6 ? SKY.wall[1] : tone(SKY.wall, 0.62 + lit + (bk % 2) * 0.04, ax, y);
          } else if (!inPanel) c = tone(SKY.wall, 0.5 + lit + (fbm(along / 9, kk / 6, 2, 41) - 0.5) * 0.12, ax, y);
          else {
            const edgeA = Math.min(pa - 0.12, 0.88 - pa) * P;
            const edgeK = Math.min(kk - 5, WALL - 5 - kk);
            const e = Math.min(edgeA * 0.5, edgeK);
            if (e < 0.6) c = SKY.gold[kk < 6 ? 5 : 3]; // gold frame
            else if (e < 1.4) c = SKY.wall[1]; // the recess's shadowed inner edge
            else {
              c = tone(SKY.wall, 0.34 + lit + (fbm(along / 7, kk / 5, 2, 47) - 0.5) * 0.12, ax, y);
              // the plaque: a small gold-ringed sigil in the panel's middle
              const px = (pa - 0.5) * P;
              const py = kk - WALL / 2;
              const pr = Math.abs(px) / 1.3 + Math.abs(py);
              if (pi % 2 === 0 && pr < 4.2) c = pr > 3.2 ? SKY.gold[4] : pr < 1.3 ? RIMC[g.u + g.v > 0 ? 0 : 1][5] : SKY.gold[1];
            }
          }
        }
        p.set(ax, y, c);
      }
      // the rock underside: a craggy inverted mountain, strata, lavender bounce light at the bottom
      const cu = Math.abs(g.u) / SLAB_U;
      const cv = Math.abs(g.v) / SLAB_V;
      const core = Math.max(0, 1 - Math.max(cu, cv));
      const depth = (16 + 130 * core ** 0.65 + 14 * (fbm(ax / 22, 3, 3, 51) - 0.5) + 8 * Math.sin(ax * 0.09)) * K;
      for (let k = WK + 1; k <= WK + depth && ay + k < H; k++) {
        const y = ay + k;
        if (top[y * W + ax]) break;
        const f = (k - WK) / depth;
        const strata = fbm(ax / 40, (k - WK) / 7, 3, 53);
        let t = 0.42 - f * 0.18 + (face === 'R' ? 0.1 : 0) + (strata - 0.5) * 0.3;
        // bounce from the clouds lights the lowest part lavender
        t += Math.max(0, f - 0.62) * 0.9;
        let c = tone(SKY.rock, clamp01(t), ax, y);
        if (k >= WK + depth - 1.5) c = SKY.ink;
        p.set(ax, y, c);
      }
    }
  // 3. hanging crystals + loose rocks under the underside
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const crys = [SKY.crystalCyan, SKY.crystalViolet, SKY.crystalPink];
  for (let i = 0; i < 18; i++) {
    const ax = Math.floor(140 + rnd() * (W - 280));
    let y = -1;
    for (let yy = H - 1; yy >= 0; yy--)
      if (p.get(ax, yy) !== null) {
        y = yy;
        break;
      }
    if (y < 0) continue;
    const len = Math.floor((12 + rnd() * 26) * K);
    const wid = Math.floor((3 + rnd() * 4) * K);
    const r = crys[i % 3];
    for (let k = 0; k < len; k++) {
      const half = Math.max(0, Math.round(wid * (1 - k / len) ** 0.9));
      for (let dx = -half; dx <= half; dx++) {
        let c: Color;
        if (Math.abs(dx) === half) c = SKY.ink;
        else if (dx < -half / 3) c = r[5];
        else if (dx < 1) c = r[4 - (k > len * 0.7 ? 1 : 0)];
        else c = r[2];
        if (dx === -Math.floor(half / 2) && k % 9 < 3) c = r[6];
        p.set(ax + dx, y + k - 3, c);
      }
    }
  }
  return p;
}
