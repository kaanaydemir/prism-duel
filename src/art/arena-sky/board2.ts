// SKY TEMPLE board v4 — painted in code at K× density, in the duel's real arena-v4 grid (layout.ts):
//   x = 320 + u − v,  y = 160 + (u + v) / 2   (game px; u along the lanes, v along the duel axis)
//
// A small height-field renderer: every art pixel looks along the iso view ray for the first surface of
// H(u, v) (floor 0, the raised rim, the duelist tiers), so raised parts really cover what is behind them
// and show their side faces. Under the near edges hang the walls (big lit blocks, gold bands, buttresses,
// sigil niches) and the faceted rock mass with hanging crystals.

import { type Color, PixelCanvas, mix } from '../pixel';
import { SKY, bayer8, clamp01, fbm, noise, tone } from './kit';

export const K = 2;
export const SKY_BOARD2 = { x: 36, y: 10, w: 568 * K, h: 350 * K } as const;

const SLAB_U = 162;
const SLAB_V = 106;
const CH = 18;
/** Rim width (units) and height (game px). */
const RIMW = 13;
const RH = 4;
const BAL_V = 126;
const TIER_H = RH + 3;
const WALL = 40;
const NEG = -1e9;

const COL_U = [-124, -88, -44, 0, 44, 88, 124] as const;
const ROW_V = [-72, -36, 0, 36, 72] as const;
const ZONE_R = 16;

const hx = (s: string): Color => parseInt(s, 16);
const FLOOR = ['4a3138', '5a3b40', '6b4749', '7c5352', '8c5f5e', '986863', 'a47268', 'b07e70', 'bc8c7c', 'c89c8a'].map(hx);
const BLOCK = ['1c1420', '2a1e2a', '3a2a34', '4b3640', '5d434b', '705157', '856062', '9a706a', 'b08273', 'c69a7e', 'dcb58c'].map(hx);
const ROCKW = ['2a1a1e', '3c2526', '523230', '6b4238', '87543f', 'a56a48', 'c38452'].map(hx);
const ROCKV = ['140c1c', '1e1428', '2a1c36', '382645', '473155', '573d66', '684a78'].map(hx);
const GOLD = ['3e2610', '6b4a1e', '93672a', 'bf8a35', 'e2ac45', 'f5c94f', 'fde29a', 'fff4cf'].map(hx);
const WARM = hx('e09a52');
const INK = hx('140c18');
type Owner = 0 | 1;
const NEON: Record<Owner, readonly Color[]> = {
  0: ['0b1a2c', '0f3150', '125a80', '1d8cb3', '3fc8e6', '7fe9f6', 'c8fbff', 'ffffff'].map(hx),
  1: ['26081a', '4d0c26', '82122f', 'b81d3b', 'ea3a4f', 'ff6f78', 'ffb2b6', 'ffffff'].map(hx),
};
const ZONE_FILL = hx('0e1122');
const ZONE_FILL2 = hx('171c36');

/** Duelist tiers: the game draws the duelists' feet at (216, 212) / (424, 108); a top at height TIER_H sits there. */
const TIERS = [
  { u: TIER_H, v: 104 + TIER_H, half: 10, o: 0 as Owner },
  { u: TIER_H, v: -104 + TIER_H, half: 9, o: 1 as Owner },
];

function insetOf(u: number, v: number): number {
  const au = Math.abs(u);
  const av = Math.abs(v);
  return Math.min(SLAB_U - au, SLAB_V - av, (SLAB_U + SLAB_V - CH - au - av) * 0.7071);
}
/** Inset inside the two balconies (beyond the back rims on the centre lane); < 0 outside. */
function balInset(u: number, v: number): number {
  const au = Math.abs(u - 4);
  const av = Math.abs(v);
  if (av < SLAB_V - 2) return -1;
  return Math.min(19 - au, BAL_V - av, (33 - au - (av - SLAB_V)) * 0.7071);
}
function tierAt(u: number, v: number): (typeof TIERS)[number] | null {
  for (const t of TIERS) if (Math.max(Math.abs(u - t.u), Math.abs(v - t.v)) <= t.half) return t;
  return null;
}
/** The height field (game px). */
function Hf(u: number, v: number): number {
  if (tierAt(u, v)) return TIER_H;
  const ins = insetOf(u, v);
  if (ins >= 0) return ins < RIMW ? RH : 0;
  return balInset(u, v) >= 0 ? RH : NEG;
}
/** Which way a vertical face at (u, v), height h, looks: 'R' (+u, down-right), 'L' (+v, down-left), 'C' (both). */
function faceDir(u: number, v: number, h: number): 'L' | 'R' | 'C' {
  const a = Hf(u + 1.6, v) < h;
  const b = Hf(u, v + 1.6) < h;
  return a && !b ? 'R' : b && !a ? 'L' : 'C';
}

const scr = (du: number, dv: number) => ({ x: du - dv, y: (du + dv) / 2 });
const mod = (a: number, n: number): number => ((a % n) + n) % n;

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
const CELLS = cells();

// ---------------------------------------------------------------- materials

/** One stone block of a course: fa / fk = position inside the block (0..1 along / down), id = its hash. */
function blockColor(ramp: readonly Color[], base: number, fa: number, fk: number, id: number, jointA: number, jointK: number, ax: number, ay: number, grain: number): Color {
  if (fa > 1 - jointA || fk > 1 - jointK) return ramp[0]; // joints (right / bottom of each block)
  let t = base + (id - 0.5) * 0.16 + grain;
  if (fk < jointK * 1.3) return mix(tone(ramp, clamp01(t + 0.14), ax, ay), WARM, 0.3); // sun-warmed top edge
  if (fa < jointA * 1.4) t += 0.1; // lit leading edge
  if (fk > 1 - jointK * 2.6) t -= 0.12; // shaded foot
  return tone(ramp, clamp01(t), ax, ay, 0.5);
}

function goldBand(f: number, ax: number, ay: number): Color {
  // f: 0 top … 1 bottom of the band
  return f < 0.3 ? (bayer8(ax * 3, ay) < 0.2 ? GOLD[7] : GOLD[6]) : f < 0.7 ? GOLD[4] : GOLD[2];
}

function floorTile(u: number, v: number, ax: number, ay: number, lit: number): Color {
  const T = 11;
  const cu = Math.floor((u + 660) / T);
  const cv = Math.floor((v + 660) / T);
  const fu = (u + 660) / T - cu;
  const fv = (v + 660) / T - cv;
  if (fu < 0.08 || fv < 0.08) return FLOOR[0];
  let t = 0.52 + (noise(cu * 1.7, cv * 2.3, 5) - 0.5) * 0.3 + lit;
  if (fu < 0.17 || fv < 0.17) t += 0.1;
  else if (fu > 0.9 || fv > 0.9) t -= 0.07;
  t += (fbm(u / 26, v / 26, 3, 11) - 0.5) * 0.18 + (noise(u * 1.6, v * 1.6, 12) - 0.5) * 0.05;
  return tone(FLOOR, clamp01(t), ax, ay, 0.5);
}

function inlay(u: number, v: number, base: Color, ax: number, ay: number): Color {
  const au = Math.abs(u);
  const av = Math.abs(v);
  let d = 99;
  if (au <= 143 && av >= 15 && av <= 91) d = Math.min(Math.abs(av - 15), Math.abs(av - 91), Math.abs(au - 143));
  if (au > 24 && au < 143) d = Math.min(d, Math.abs(v));
  if (d < 0.6) return GOLD[7];
  if (d < 1.4) return GOLD[5];
  if (d < 2) return GOLD[2];
  if (d < 4.5 && bayer8(ax, ay) < (4.5 - d) / 4) return mix(base, GOLD[5], 0.4);
  return base;
}

function emblem(u: number, v: number, ax: number, ay: number): Color | null {
  const s = scr(u, v);
  const d = Math.abs(s.x) / 2 + Math.abs(s.y);
  if (d > 20) return null;
  if (d > 18.2) return null;
  if (d > 17) return GOLD[6];
  if (d > 16) return GOLD[3];
  const ang = Math.atan2(s.y * 2, s.x);
  const ray = Math.abs(Math.cos(ang * 4)) ** 10;
  const r = Math.hypot(s.x / 2, s.y);
  if (r < 2.6) return GOLD[7];
  if (r < 13 * ray + 1.3) return tone(GOLD, 0.6 + ray * 0.4, ax, ay);
  if (d > 9.6 && d < 10.8) return GOLD[5];
  return mix(FLOOR[2], GOLD[2], 0.35);
}

function slot(u: number, v: number, c: Cell, ax: number, ay: number): Color | null {
  const du = u - c.u;
  const dv = v - c.v;
  const d = Math.max(Math.abs(du), Math.abs(dv));
  const N = NEON[c.owner];
  if (c.kind === 'zone') {
    if (d > ZONE_R) return null;
    if (d > ZONE_R - 0.8) return N[5];
    if (d > ZONE_R - 1.7) return N[7];
    if (d > ZONE_R - 2.5) return N[5];
    if (d > ZONE_R - 3.3) return N[3];
    if (d > ZONE_R - 4.2) return N[1];
    const g = clamp01(1 - (ZONE_R - 4.2 - d) / 3.5);
    if (g > 0 && bayer8(ax, ay) < g * 0.55) return N[1];
    return du + dv < -ZONE_R * 0.9 ? ZONE_FILL2 : ZONE_FILL;
  }
  // pads: octagonal stone plinths (a gold rim, the owner's glyph), a short lit side toward the viewer
  const s = scr(du, dv);
  const oct = (x: number, y: number) => Math.max(Math.abs(x) / 2 + Math.abs(y), Math.abs(y) * 1.32, (Math.abs(x) / 2) * 1.1);
  const r = 13;
  const top = oct(s.x, s.y + 1.5); // the top face, lifted 1.5 px
  if (top > r) {
    if (oct(s.x, s.y) <= r) return s.y > 0 ? BLOCK[2] : null; // the side under the top
    return null;
  }
  if (top > r - 0.9) return INK;
  if (top > r - 2.1) return s.y < 0 ? GOLD[6] : GOLD[4];
  if (top > r - 2.9) return GOLD[1];
  const sy = s.y + 1.5;
  const ax2 = Math.abs(s.x);
  const ay2 = Math.abs(sy);
  let base = tone(BLOCK, 0.6 - sy * 0.012 + (noise(u * 1.2, v * 1.2, 23) - 0.5) * 0.08, ax, ay);
  const ring = Math.hypot(s.x / 2, sy);
  if (c.kind === 'field') {
    const dm = ax2 / 2 + ay2;
    if (dm < 7.2 && dm > 5.8) base = N[5];
    else if (dm < 2.4) base = N[6];
    else if (dm < 5.8 && (ay2 < 0.6 || ax2 < 1.2)) base = N[4];
  } else if (c.kind === 'banish') {
    if (ring < 6.6 && ring > 5.4) base = N[5];
    else if (ring < 3.4 && ring > 2.2) base = N[4];
    else if (ring < 1.2) base = N[6];
  } else if (c.kind === 'grave') {
    const stone = (ax2 < 4.6 && sy > -2.5 && sy < 6) || (sy <= -2.5 && (s.x * s.x) / 21 + ((sy + 2.5) * (sy + 2.5)) / 9.6 < 1);
    if (stone) base = (ax2 < 0.8 && sy > -4.2 && sy < 3.2) || (Math.abs(sy + 0.8) < 0.6 && ax2 < 3) ? N[6] : tone(BLOCK, 0.84, ax, ay);
  } else {
    if (ring < 7 && ring > 5.8) base = N[4];
    else if (ring < 2.4) base = N[5];
  }
  return base;
}

function nearestZoneOut(u: number, v: number): { d: number; o: Owner } | null {
  let best: { d: number; o: Owner } | null = null;
  for (const c of CELLS) {
    if (c.kind !== 'zone') continue;
    const d = Math.max(Math.abs(u - c.u), Math.abs(v - c.v)) - ZONE_R;
    if (d < 3.6 && (!best || d < best.d)) best = { d, o: c.owner };
  }
  return best;
}

function floorAt(u: number, v: number, ax: number, ay: number): Color {
  for (const c of CELLS) {
    if (Math.abs(u - c.u) > 18 || Math.abs(v - c.v) > 18) continue;
    const sc = slot(u, v, c, ax, ay);
    if (sc !== null) return sc;
  }
  const em = emblem(u, v, ax, ay);
  if (em !== null) return em;
  // light: a warm pool round the emblem; shade under the far rims (the sun is behind them)
  const ins = insetOf(u, v) - RIMW;
  const farShade = Math.min(u + SLAB_U - RIMW, v + SLAB_V - RIMW);
  let lit = Math.max(0, 1 - Math.hypot(u, v) / 60) * 0.1;
  if (farShade < 7) lit -= (1 - farShade / 7) * 0.26;
  else if (ins < 2) lit -= 0.06;
  let f = floorTile(u, v, ax, ay, lit);
  const sd = Math.abs(scr(u, v).x) / 2 + Math.abs(scr(u, v).y);
  if (sd < 26 && bayer8(ax, ay) < (26 - sd) / 22) f = mix(f, GOLD[5], 0.3);
  const nz = nearestZoneOut(u, v);
  if (nz) {
    const k = 1 - nz.d / 3.6;
    if (bayer8(ax, ay) < k * 1.1) f = mix(f, NEON[nz.o][4], 0.25 + k * 0.35);
  }
  return inlay(u, v, f, ax, ay);
}

function rimTop(u: number, v: number, ax: number, ay: number): Color {
  const ins = insetOf(u, v);
  const far = u + v < 0;
  if (ins < 0) {
    // balcony floor
    const b = balInset(u, v);
    if (b < 1.6) return far ? GOLD[6] : GOLD[5];
    if (b < 2.4) return GOLD[2];
    return blockColor(BLOCK, 0.62, mod(u + 600, 19) / 19, mod(v + 600, 13) / 13, noise(Math.floor((u + 600) / 19), Math.floor((v + 600) / 13), 37), 0.05, 0.07, ax, ay, 0);
  }
  if (ins < 2.6) return goldBand(far ? 0.2 : ins / 2.6, ax, ay);
  if (ins < 3.4) return GOLD[1];
  if (ins > RIMW - 0.8) return GOLD[2];
  if (ins > RIMW - 2.2) return far ? GOLD[4] : GOLD[6];
  // big blocks along the edge
  const au = Math.abs(u);
  const av = Math.abs(v);
  const du = SLAB_U - au;
  const dv = SLAB_V - av;
  const along = du < dv ? v : dv < du ? u : u - v;
  const L = 30;
  const blk = Math.floor((along + 600) / L);
  const fa = (along + 600) / L - blk;
  const fk = (ins - 3.4) / (RIMW - 5.6);
  const g = (fbm(u / 9, v / 9, 2, 33) - 0.5) * 0.12;
  if (fa > 0.955) return BLOCK[1];
  let t = 0.66 + (noise(blk * 3.1, du < dv ? 1 : 2, 31) - 0.5) * 0.14 + g + (far ? 0.05 : 0);
  if (fa < 0.06) t += 0.12;
  if (fk < 0.16) t += far ? -0.1 : 0.12;
  if (fk > 0.84) t += far ? 0.12 : -0.1;
  return tone(BLOCK, clamp01(t), ax, ay);
}

function tierTop(u: number, v: number, t: (typeof TIERS)[number], ax: number, ay: number): Color {
  const d = Math.max(Math.abs(u - t.u), Math.abs(v - t.v));
  const N = NEON[t.o];
  if (d > t.half - 0.9) return N[6];
  if (d > t.half - 2) return N[4];
  if (d > t.half - 2.8) return N[1];
  if (d < t.half - 4.2 && d > t.half - 5.4) return N[4];
  if (d < 1.4) return N[6];
  return tone(BLOCK, 0.52 + (noise(u * 1.3, v * 1.3, 61) - 0.5) * 0.1, ax, ay);
}

function sideColor(u: number, v: number, h: number, Hp: number, ax: number, ay: number): Color {
  const face = faceDir(u, v, h);
  const lit = face === 'R' ? 0.12 : face === 'L' ? -0.04 : 0.04;
  if (Hp === TIER_H && h >= RH) {
    const t = tierAt(u, v)!;
    const z = h - RH; // 0..3
    if (z > 2.4) return NEON[t.o][7];
    if (z > 1.2) return NEON[t.o][5];
    return NEON[t.o][face === 'R' ? 4 : 3];
  }
  const outer = Hf(u + 2.2, v + 2.2) < 0;
  if (outer) {
    if (h > RH - 1.6) return goldBand((RH - h) / 1.6, ax, ay);
    return tone(BLOCK, 0.62 + lit, ax, ay);
  }
  // the rim's inner face (seen over the floor on the far sides)
  if (h > RH - 1) return GOLD[3];
  return tone(BLOCK, 0.26 + lit * 0.5, ax, ay);
}

function wallColor(d: number, along: number, face: 'L' | 'R' | 'C', owner: Owner, ax: number, ay: number): Color {
  const lit = face === 'R' ? 0.1 : face === 'L' ? -0.05 : 0.03;
  if (d < 2.6) return goldBand(d / 2.6, ax, ay);
  if (d >= WALL - 0.8) return INK;
  if (d >= WALL - 3.4) return goldBand((d - (WALL - 3.4)) / 2.6, ax, ay);
  if (d > 20.4 && d < 22.2) return d < 21 ? GOLD[5] : d < 21.6 ? GOLD[3] : GOLD[1];
  const grain = (fbm(along / 7, d / 5, 2, 47) - 0.5) * 0.1;
  // buttresses: a proud pier every 72 units
  const B = 72;
  const ba = mod(along + 618, B);
  if (ba < 15) {
    if (ba > 14.2) return INK;
    if (ba < 1.2) return mix(BLOCK[10], WARM, 0.4);
    if (d < 6) return goldBand((d - 2.6) / 3.4, ax, ay); // the pier's gold capital
    const crs = Math.floor((d - 2.6) / 8.7);
    const fk = (d - 2.6) / 8.7 - crs;
    return blockColor(BLOCK, 0.76 + lit, 0.5, fk, noise(crs * 2.3, Math.floor((along + 618) / B), 43), 0, 0.1, ax, ay, grain);
  }
  if (ba < 18.5) return tone(BLOCK, 0.22 + lit * 0.5, ax, ay); // the pier's cast shadow
  if (d < 20) {
    // two courses of big blocks
    const ch = 8.7;
    const crs = Math.floor((d - 2.6) / ch);
    const fk = (d - 2.6) / ch - crs;
    const L = 30;
    const off = crs % 2 ? L / 2 : 0;
    const blk = Math.floor((along + 600 + off) / L);
    const fa = (along + 600 + off) / L - blk;
    return blockColor(BLOCK, 0.6 + lit, fa, fk, noise(blk * 2.7, crs * 1.9 + (face === 'L' ? 7 : 0), 41) * 1.6 - 0.3, 0.045, 0.13, ax, ay, grain);
  }
  // the lower band: a sigil niche between the piers, smaller blocks round it
  const nd0 = 24.5;
  const nd1 = WALL - 5;
  if (ba > 33 && ba < 57 && d > nd0 && d < nd1) {
    const ea = Math.min(ba - 33, 57 - ba) * 0.5;
    const ek = Math.min(d - nd0, nd1 - d);
    const e = Math.min(ea, ek);
    if (e < 0.7) return GOLD[6];
    if (e < 1.3) return GOLD[3];
    if (e < 2.1) return INK;
    const N = NEON[owner];
    let c = tone(N, 0.3 - (d - nd0) * 0.012 + (d - nd0 < 3.4 ? -0.1 : 0), ax, ay);
    const px = (ba - 45) / 1.5;
    const py = d - (nd0 + nd1) / 2;
    const pr = Math.abs(px) + Math.abs(py);
    if (pr < 3.9 && pr > 2.9) c = GOLD[6];
    else if (pr < 1.5) c = GOLD[7];
    return c;
  }
  const ch = 6.6;
  const crs = Math.floor((d - 23) / ch);
  const fk = (d - 23) / ch - crs;
  const L = 22;
  const off = crs % 2 ? L / 2 : 0;
  const blk = Math.floor((along + 600 + off) / L);
  const fa = (along + 600 + off) / L - blk;
  return blockColor(BLOCK, 0.5 + lit, fa, fk, noise(blk * 2.7, crs * 1.9 + 11, 49) * 1.6 - 0.3, 0.06, 0.15, ax, ay, grain);
}

/** Faceted rock: flat-shaded Voronoi facets, sun-warm near the wall, violet toward the tips. */
function rockColor(gx: number, gy: number, f: number, face: 'L' | 'R' | 'C', ax: number, ay: number): Color {
  const x = gx / 9;
  const y = gy / 15;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  let side = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const px = cx + noise(cx, cy, 71);
      const py = cy + noise(cx, cy, 72);
      const dd = Math.hypot(x - px, y - py);
      if (dd < f1) {
        f2 = f1;
        f1 = dd;
        id = noise(cx, cy, 73);
        side = x - px;
      } else if (dd < f2) f2 = dd;
    }
  const edge = f2 - f1;
  let t = 0.5 + (id - 0.5) * 0.55 + (face === 'R' ? 0.08 : -0.02) - f * 0.28 + (side < 0 ? -0.06 : 0.06);
  if (edge < 0.07) t -= 0.22;
  else if (edge < 0.16 && side > 0) t += 0.14;
  const warm = tone(ROCKW, clamp01(t), ax, ay, 0.4);
  const cold = tone(ROCKV, clamp01(t + 0.08), ax, ay, 0.4);
  const k = clamp01((f - 0.08) / 0.5);
  return k <= 0 ? warm : k >= 1 ? cold : bayer8(ax, ay) < k ? cold : warm;
}

// ---------------------------------------------------------------- paint

export function paintSkyBoard2(): PixelCanvas {
  const W = SKY_BOARD2.w;
  const H = SKY_BOARD2.h;
  const p = new PixelCanvas(W, H);
  const mask = new Uint8Array(W * H);
  const hu = new Float32Array(W * H);
  const hv = new Float32Array(W * H);
  const hh = new Float32Array(W * H);
  const HMAX = TIER_H;
  // 1. tops and side faces (view-ray search, nearest first)
  for (let ay = 0; ay < H; ay++) {
    const gy = SKY_BOARD2.y + (ay + 0.5) / K;
    for (let ax = 0; ax < W; ax++) {
      const gx = SKY_BOARD2.x + (ax + 0.5) / K;
      const dx = gx - 320;
      const dy0 = 2 * (gy - 160);
      if (insetOf((dx + dy0) / 2, (dy0 - dx) / 2) < -34) continue;
      for (let h = HMAX; h >= 0; h -= 0.5) {
        const dy = dy0 + 2 * h;
        const u = (dx + dy) / 2;
        const v = (dy - dx) / 2;
        const Hp = Hf(u, v);
        if (Hp < h) continue;
        let c: Color;
        if (Hp - h < 0.5) {
          if (Hp === TIER_H) c = tierTop(u, v, tierAt(u, v)!, ax, ay);
          else if (Hp === RH) c = rimTop(u, v, ax, ay);
          else c = floorAt(u, v, ax, ay);
        } else c = sideColor(u, v, h, Hp, ax, ay);
        const i = ay * W + ax;
        mask[i] = 1;
        hu[i] = u;
        hv[i] = v;
        hh[i] = h;
        p.set(ax, ay, c);
        break;
      }
    }
  }
  // 2. walls and the rock mass under the near edges
  for (let ax = 0; ax < W; ax++) {
    const gx = SKY_BOARD2.x + (ax + 0.5) / K;
    const core = Math.max(0, 1 - Math.abs(gx - 320) / 300);
    const n1 = noise(gx / 11, 1, 57);
    const n2 = noise(gx / 4.5, 2, 58);
    const spike = Math.max(0, 1 - Math.abs(n1 - 0.5) * 3.2) * 0.75 + n2 * 0.3;
    const depth = 8 + 150 * core ** 1.3 * (0.3 + spike * 0.75);
    for (let ay = 0; ay < H; ay++) {
      const i = ay * W + ax;
      if (!mask[i] || (ay + 1 < H && mask[i + W])) continue;
      const u = hu[i];
      const v = hv[i];
      const h0 = hh[i];
      const face = faceDir(u, v, -1);
      const along = face === 'R' ? v : face === 'L' ? u : (u - v) * 0.7071;
      const owner: Owner = face === 'L' || v > 0 ? 0 : 1;
      for (let k = 1; ay + k < H; k++) {
        const y = ay + k;
        if (mask[y * W + ax]) break;
        const d = k / K - h0;
        let c: Color;
        if (d <= WALL) c = wallColor(Math.max(0, d), along, face, owner, ax, y);
        else {
          const rd = d - WALL;
          if (rd > depth) break;
          c = rd > depth - 0.8 ? INK : rockColor(gx, SKY_BOARD2.y + y / K, rd / depth, face, ax, y);
        }
        p.set(ax, y, c);
      }
    }
  }
  // 3. hanging crystals (each with a dithered halo)
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const crys = [SKY.crystalCyan, SKY.crystalViolet, SKY.crystalPink];
  for (let n = 0; n < 16; n++) {
    const ax = Math.floor(W * 0.2 + rnd() * W * 0.6);
    let y = -1;
    for (let yy = H - 1; yy >= 0; yy--)
      if (p.get(ax, yy) !== null) {
        y = yy;
        break;
      }
    if (y < H * 0.5 || y > H - 30) continue;
    const len = Math.floor((12 + rnd() * 20) * K);
    const wid = Math.floor((3 + rnd() * 3) * K);
    const r = crys[n % 3];
    for (let gy = -wid * 2; gy < len + wid * 2; gy++)
      for (let gx = -wid * 3; gx <= wid * 3; gx++) {
        const dd = Math.hypot(gx / (wid * 3), (gy - len / 2) / (len / 2 + wid * 2));
        if (dd > 1 || p.get(ax + gx, y + gy) !== null) continue;
        if (bayer8(ax + gx, y + gy) < (1 - dd) * 0.55) p.set(ax + gx, y + gy, r[2]);
      }
    for (let k = 0; k < len; k++) {
      const half = Math.max(0, Math.round(wid * (1 - k / len) ** 0.9));
      for (let dx = -half; dx <= half; dx++) {
        let c: Color;
        if (Math.abs(dx) === half) c = INK;
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
