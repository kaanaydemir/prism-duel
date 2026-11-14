// SKY TEMPLE arena — the floating sandstone board, painted in code at 2× density (HIRES, src/view/hires.ts).
//
// The board lives in the game's arena-v4 grid space (u, v) (src/view/layout.ts): a screen point is
//   x = 320 + u − v,   y = 160 + (u + v) / 2      (game pixels)
// so every zone, pad and the two duelist balconies sit exactly where the duel puts its cards / people.
// One texture holds the top, the two lit side walls (gold trim, block courses, vents of light) and the
// rough rock underside with hanging crystal shards; it is drawn at 1/2 scale over the sky.
//
//   paintSkyBoard() → PixelCanvas (SKY_BOARD.w × SKY_BOARD.h at 2×), placed at game (SKY_BOARD.x, SKY_BOARD.y)

import { type Color, PixelCanvas, mix, mulberry32 } from '../pixel';
import { PAL } from '../palette';

/** Art pixels per game pixel. */
export const K = 2;

/** Where the board texture sits (game px) and its size (art px). */
export const SKY_BOARD = { x: 36, y: 12, w: 568 * K, h: 380 * K } as const;

// ---------------------------------------------------------------- shape (grid units)

/** Half extents of the main slab (u along the lanes, v along the duel axis). */
const SLAB_U = 150;
const SLAB_V = 94;
/** Corner chamfer (units cut off each corner along both axes). */
const CHAMFER = 12;
/** Duelist balconies: centre lane, behind each back row (|u| ≤ BAL_U, SLAB_V < |v| ≤ BAL_V). */
const BAL_U = 22;
const BAL_V = 122;
/** Wall height (game px) under the slab top, then the rock underside. */
const WALL = 18;

/** Zone cells (u, v) of the grid (layout.ts V4 tables). */
const COL_U = [-124, -88, -44, 0, 44, 88, 124] as const;
const ROW_V = [-72, -36, 0, 36, 72] as const;
const ZONE_R = 16;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number): number => (BAYER4[(x & 3) + ((y & 3) << 2)] + 0.5) / 16;

/** Hash of an integer cell → 0..1 (stable variation per block). */
function hash(a: number, b: number, s = 0): number {
  let h = Math.imul(a * 374761393 + b * 668265263 + s * 2147483647, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return (Math.imul(h, 1103515245) >>> 0) / 4294967296;
}

function inSlab(u: number, v: number): boolean {
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (au <= SLAB_U && av <= SLAB_V && au + av <= SLAB_U + SLAB_V - CHAMFER) return true;
  return au <= BAL_U && av <= BAL_V && av > SLAB_V - 1 && au + (av - SLAB_V) <= BAL_U + (BAL_V - SLAB_V) - 6;
}

/** Game point (gx, gy) → grid (u, v). */
function toUV(gx: number, gy: number): { u: number; v: number } {
  const dx = gx - 320;
  const dy = 2 * (gy - 160);
  return { u: (dx + dy) / 2, v: (dy - dx) / 2 };
}

type Owner = 0 | 1 | -1;
interface Cell {
  /** Centre in (u, v). */
  u: number;
  v: number;
  owner: Owner;
  kind: 'zone' | 'pad' | 'deck' | 'grave';
}

/** Every slot painted into the top: 5 + 5 zones per player, their field / graveyard / deck / banish pads. */
function cells(): Cell[] {
  const out: Cell[] = [];
  for (const p of [0, 1] as const) {
    const flip = (c: number, r: number) => (p === 0 ? { c, r } : { c: 6 - c, r: 4 - r });
    for (let i = 0; i < 5; i++) {
      for (const r of [3, 4]) {
        const f = flip(1 + i, r);
        out.push({ u: COL_U[f.c], v: ROW_V[f.r], owner: p, kind: 'zone' });
      }
    }
    const field = flip(0, 3);
    const banish = flip(0, 4);
    const grave = flip(6, 3);
    const deck = flip(6, 4);
    out.push({ u: COL_U[field.c], v: ROW_V[field.r], owner: p, kind: 'pad' });
    out.push({ u: COL_U[banish.c], v: ROW_V[banish.r], owner: p, kind: 'pad' });
    out.push({ u: COL_U[grave.c], v: ROW_V[grave.r], owner: p, kind: 'grave' });
    out.push({ u: COL_U[deck.c], v: ROW_V[deck.r], owner: p, kind: 'deck' });
  }
  return out;
}

// ---------------------------------------------------------------- palette

const SAND = [PAL.earth1, PAL.earth2, PAL.earth3, mix(PAL.earth3, PAL.earth4, 0.5), PAL.earth4] as const;
const SAND_SHADE = [PAL.earth0, PAL.earth1, PAL.earth2, PAL.earth3] as const;
const MORTAR = PAL.earth1;
const RIM: Record<0 | 1, readonly [Color, Color, Color, Color]> = {
  0: [PAL.cyan0, PAL.cyan2, PAL.cyan3, PAL.cyan4],
  1: [PAL.crim0, PAL.crim2, PAL.crim3, PAL.crim4],
};

// ---------------------------------------------------------------- top

/** Sandstone block colour at (u, v) (running bond, 22-unit blocks, per-block tone, worn bevels). */
function sandstone(u: number, v: number, ax: number, ay: number): Color {
  const B = 22;
  const row = Math.floor((v + 400) / B);
  const off = row % 2 ? B / 2 : 0;
  const col = Math.floor((u + 400 + off) / B);
  const fu = (u + 400 + off) / B - col; // 0..1 inside the block, along u
  const fv = (v + 400) / B - row;
  const t = hash(col, row);
  // mortar joints: 1 art px wide (≈ 0.7 units)
  if (fu < 0.035 || fv < 0.035) return MORTAR;
  // light from the far-right (the sunset): edges facing −u/−v are lit, +u/+v edges shaded
  let tone = t < 0.25 ? 1 : t < 0.8 ? 2 : 3;
  if (fu < 0.1 || fv < 0.1) tone = Math.min(4, tone + 1);
  else if (fu > 0.92 || fv > 0.92) tone = Math.max(0, tone - 1);
  // worn speckles and a few hairline cracks per block (dithered, stable)
  const n = hash(Math.floor(u * 1.4), Math.floor(v * 1.4), 7);
  if (n > 0.965) tone = Math.max(0, tone - 1);
  else if (n < 0.02 && bayer(ax, ay) < 0.5) tone = Math.min(4, tone + 1);
  if (t > 0.95) {
    const crack = Math.abs(fu - fv * 0.7 - 0.2 + (hash(col, row, 3) - 0.5) * 0.3);
    if (crack < 0.012 && fv > 0.25 && fv < 0.8) return SAND_SHADE[0];
  }
  return SAND[tone];
}

/** Gold inlay: a frame round each player's zone block and the neutral lane's centre line. */
function inlay(u: number, v: number): Color | null {
  const au = Math.abs(u);
  const av = Math.abs(v);
  const line = (d: number, w = 0.8) => Math.abs(d) < w;
  // player frames: |u| ≤ 142, 14 ≤ |v| ≤ 90
  if (au <= 142 && av >= 14 && av <= 90 && (line(au - 142) || line(av - 14) || line(av - 90))) return av > 89 || au > 141 ? PAL.gold2 : PAL.gold3;
  // the lane's centre line, broken by the emblem
  if (line(v) && au > 26 && au < 142) return PAL.gold2;
  return null;
}

/** Grid offset (du, dv) → screen offset (game px): a square in (u, v) is a diamond on screen. */
function scr(du: number, dv: number): { x: number; y: number } {
  return { x: du - dv, y: (du + dv) / 2 };
}

/** The centre emblem: a gold prism diamond (screen-shaped) with a four-point star. */
function emblem(u: number, v: number): Color | null {
  const s = scr(u, v);
  const d = Math.abs(s.x) / 2 + Math.abs(s.y); // screen diamond, 2:1
  if (d > 15) return null;
  if (d > 14) return PAL.ink;
  if (d > 12.5) return PAL.gold3;
  if (d > 11.5) return PAL.gold1;
  // the star: thin cross on the screen axes, brightest in the middle
  if ((Math.abs(s.y) < 0.6 && Math.abs(s.x) < 18) || (Math.abs(s.x) < 1.1 && Math.abs(s.y) < 9)) return d < 4 ? PAL.white : PAL.gold4;
  if (d < 3.2) return PAL.gold4;
  if (d < 7 && d > 6) return PAL.gold2;
  return d < 6 ? PAL.gold1 : PAL.earth1;
}

/** A slot at (u, v), or null outside it: zones are crystal-rimmed recesses, pads raised discs / plinths. */
function slot(u: number, v: number, c: Cell): Color | null {
  const du = u - c.u;
  const dv = v - c.v;
  const d = Math.max(Math.abs(du), Math.abs(dv));
  const rim = RIM[c.owner as 0 | 1];
  if (c.kind === 'zone') {
    if (d > ZONE_R) return null;
    if (d > ZONE_R - 0.8) return PAL.ink;
    if (d > ZONE_R - 2.2) return rim[2]; // bright crystal line (2 art px)
    if (d > ZONE_R - 3.3) return rim[1];
    // dark recess, a faint inner bevel on the lit edges
    if (du < -ZONE_R + 4.6 || dv < -ZONE_R + 4.6) return PAL.night2;
    return PAL.night1;
  }
  const r = c.kind === 'pad' ? 15 : 14;
  if (d > r) return null;
  if (d > r - 0.8) return PAL.ink;
  if (d > r - 2.2) return PAL.gold2;
  if (d > r - 3.2) return PAL.gold3;
  // pad faces: raised sandstone with an owner-tinted glyph drawn in screen space
  const s = scr(du, dv);
  const ax = Math.abs(s.x);
  const ay = Math.abs(s.y);
  if (c.kind === 'pad') {
    const ring = ax / 2 + ay; // small screen diamond ring
    if (ring < 6.2 && ring > 4.8) return rim[2];
    if (ring < 2) return rim[3];
  }
  if (c.kind === 'grave') {
    // a tombstone: a rounded slab with a cross
    const inStone = (ax < 4.2 && s.y > -3 && s.y < 5.5) || (s.y <= -3 && s.x * s.x / 18 + (s.y + 3) * (s.y + 3) / 9 < 1);
    if (inStone) return (ax < 0.7 && s.y > -4 && s.y < 3) || (Math.abs(s.y + 1) < 0.6 && ax < 2.6) ? rim[2] : rim[1];
  }
  if (c.kind === 'deck' && ax / 2 + ay < 7.4 && ax / 2 + ay > 6.2) return rim[1];
  return du + dv < 0 ? SAND[3] : SAND[2];
}

// ---------------------------------------------------------------- walls + underside

/** Distance (units) from (u, v) to the slab edge along +v (the left face) and +u (the right face). */
function faceOf(u: number, v: number): 'L' | 'R' | 'C' {
  const eu = inSlab(u + 1.5, v);
  const ev = inSlab(u, v + 1.5);
  if (!ev && eu) return 'L';
  if (!eu && ev) return 'R';
  return 'C';
}

const WALL_L = [PAL.earth0, PAL.earth1, PAL.earth2, mix(PAL.earth2, PAL.earth3, 0.5)] as const;
const WALL_R = [PAL.earth1, PAL.earth2, PAL.earth3, PAL.earth4] as const;
const ROCK = [PAL.night0, PAL.stone0, mix(PAL.stone0, PAL.earth0, 0.5), PAL.earth0, PAL.earth1] as const;

export function paintSkyBoard(): PixelCanvas {
  const W = SKY_BOARD.w;
  const H = SKY_BOARD.h;
  const p = new PixelCanvas(W, H);
  const all = cells();
  const rnd = mulberry32(0x5c1e);
  // the top surface per art pixel; remember which columns hold board so walls can hang under them
  const topY = new Int32Array(W).fill(-1); // lowest top pixel per column (for the underside)
  const top = new Uint8Array(W * H);
  for (let ay = 0; ay < H; ay++) {
    for (let ax = 0; ax < W; ax++) {
      const g = toUV(SKY_BOARD.x + (ax + 0.5) / K, SKY_BOARD.y + (ay + 0.5) / K);
      if (!inSlab(g.u, g.v)) continue;
      top[ay * W + ax] = 1;
      topY[ax] = ay;
      // edge outline + gold trim along the outer rim of the top
      const edge = !inSlab(g.u + 0.8, g.v) || !inSlab(g.u, g.v + 0.8) || !inSlab(g.u - 0.8, g.v) || !inSlab(g.u, g.v - 0.8);
      if (edge) {
        p.set(ax, ay, PAL.ink);
        continue;
      }
      const trim = !inSlab(g.u + 3, g.v) || !inSlab(g.u, g.v + 3) || !inSlab(g.u - 3, g.v) || !inSlab(g.u, g.v - 3);
      if (trim) {
        const lit = !inSlab(g.u - 3, g.v) || !inSlab(g.u, g.v - 3);
        p.set(ax, ay, lit ? PAL.gold3 : PAL.gold2);
        continue;
      }
      let c: Color | null = null;
      for (const cell of all) {
        if (Math.abs(g.u - cell.u) > 17 || Math.abs(g.v - cell.v) > 17) continue;
        c = slot(g.u, g.v, cell);
        if (c !== null) break;
      }
      if (c === null) c = emblem(g.u, g.v) ?? inlay(g.u, g.v) ?? sandstone(g.u, g.v, ax, ay);
      p.set(ax, ay, c);
    }
  }
  // walls: under every top pixel whose lower neighbour is off the top, extrude WALL px down
  const WK = WALL * K;
  for (let ax = 0; ax < W; ax++) {
    for (let ay = 0; ay < H; ay++) {
      if (!top[ay * W + ax] || (ay + 1 < H && top[(ay + 1) * W + ax])) continue;
      const g = toUV(SKY_BOARD.x + (ax + 0.5) / K, SKY_BOARD.y + (ay + 0.5) / K);
      const face = faceOf(g.u, g.v);
      const ramp = face === 'L' ? WALL_L : face === 'R' ? WALL_R : WALL_L;
      // the coordinate along the face: u for the left face (it runs along u), v for the right
      const along = face === 'R' ? g.v : g.u;
      for (let k = 1; k <= WK && ay + k < H; k++) {
        const y = ay + k;
        if (top[y * W + ax]) break;
        let c: Color;
        if (k <= 2) c = PAL.gold3; // the gold trim lip under the edge
        else if (k <= 3) c = PAL.gold1;
        else if (k >= WK - 1) c = PAL.ink;
        else {
          // block courses (6 game px), running bond along the face
          const kk = (k - 4) / K;
          const course = Math.floor(kk / 6);
          const fk = kk / 6 - course;
          const L = 16;
          const off = course % 2 ? L / 2 : 0;
          const blk = Math.floor((along + 400 + off) / L);
          const fa = (along + 400 + off) / L - blk;
          if (fk < 0.09 || fa < 0.05) c = ramp[0];
          else {
            const t = hash(blk, course, face === 'L' ? 1 : 2);
            let tone = t < 0.3 ? 1 : 2;
            if (fk < 0.25) tone += 1; // lit top of each block
            c = ramp[Math.min(3, tone)];
            // light vents: a glowing slit in every 5th block of the middle course
            if (course === 1 && blk % 5 === 2 && fa > 0.3 && fa < 0.7 && fk > 0.35 && fk < 0.75) {
              const owner = (g.u + g.v) > 0 ? 0 : 1;
              c = Math.floor(kk * K) % 2 ? RIM[owner][1] : RIM[owner][2];
            }
          }
        }
        p.set(ax, y, c);
      }
      // the rock underside: a jagged inverted cone, deepest under the middle
      const cu = Math.abs(g.u) / SLAB_U;
      const cv = Math.abs(g.v) / SLAB_V;
      const depth = (14 + 70 * Math.max(0, 1 - Math.max(cu, cv)) ** 0.8 + 8 * Math.sin(ax * 0.07) + 6 * Math.sin(ax * 0.23 + 1)) * K;
      for (let k = WK + 1; k <= WK + depth && ay + k < H; k++) {
        const y = ay + k;
        if (top[y * W + ax]) break;
        const f = (k - WK) / depth;
        // strata bands, lit on the right face, dark toward the tip
        const strata = Math.floor((k + Math.sin(ax * 0.05) * 6) / 9) % 3;
        let tone = (face === 'R' ? 3 : 2) - Math.floor(f * 3) + (strata === 0 ? 1 : 0);
        tone = Math.max(0, Math.min(4, tone));
        let c: Color = ROCK[tone];
        if (k >= WK + depth - 1.5) c = PAL.ink;
        p.set(ax, y, c);
      }
    }
  }
  // hanging crystal shards under the rock (stable positions)
  for (let i = 0; i < 26; i++) {
    const ax = Math.floor(80 + rnd() * (W - 160));
    let y = -1;
    for (let yy = H - 1; yy >= 0; yy--) {
      const c = p.get(ax, yy);
      if (c !== null) {
        y = yy;
        break;
      }
    }
    if (y < 0) continue;
    const len = Math.floor((10 + rnd() * 26) * K);
    const wid = Math.floor((2 + rnd() * 3) * K);
    const cr = [
      [PAL.cyan1, PAL.cyan2, PAL.cyan3, PAL.cyan4],
      [PAL.void1, PAL.void2, PAL.void3, PAL.void4],
      [PAL.water1, PAL.water2, PAL.water3, PAL.water4],
    ][i % 3];
    for (let k = 0; k < len; k++) {
      const half = Math.max(0, Math.round(wid * (1 - k / len)));
      for (let dx = -half; dx <= half; dx++) {
        const edge = Math.abs(dx) === half;
        const c = edge ? PAL.ink : dx < 0 ? cr[3] : dx === 0 ? cr[2] : cr[1];
        p.set(ax + dx, y + k - 2, c);
      }
    }
  }
  void topY;
  return p;
}
