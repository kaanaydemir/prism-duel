// SKY TEMPLE arena — everything round the board, painted in code at 2× density (K art px per game px).
//
//   paintSkyBackdrop()  the sunset (stepped, dithered bands), stars, the low sun + god-rays, the cloud sea
//   paintIsland(i)      a floating island: rock cone, grass cap, a tiny white temple, a waterfall
//   paintPillar(side)   a sandstone pillar with a crystal crown and a long banner (0 cyan / 1 crimson)
//   paintPrism()        the floating prism and the two beams it splits the sun into
//   paintCloudBank(i)   a foreground cloud bank (drawn over the bottom corners)
//
// Layout (game px; the frame is 640×360, wide phones show up to 80 px more each side): SKY_LAYOUT.

import { type Color, PixelCanvas, mix, mulberry32 } from '../pixel';
import { PAL } from '../palette';
import { K } from './board';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number): number => (BAYER4[(x & 3) + ((y & 3) << 2)] + 0.5) / 16;

/** The backdrop covers the widest phone frame: game x −80 … 720. */
export const SKY_X0 = -80;
export const SKY_W = 800;
export const SKY_H = 360;

/** Where the pieces sit (game px). */
export const SKY_LAYOUT = {
  sun: { x: 462, y: 112, r: 30 },
  horizon: 128,
  prism: { x: 214, y: 22 },
  pillars: [
    { x: 46, y: 26 },
    { x: 560, y: 26 },
  ],
  islands: [
    { x: 92, y: 60, i: 0 },
    { x: 520, y: 70, i: 2 },
    { x: 616, y: 150, i: 3 },
    { x: -40, y: 170, i: 1 },
  ],
} as const;

// ---------------------------------------------------------------- sky

/** Sunset bands from the zenith down to the horizon (index 0 = top). */
const BANDS: readonly Color[] = [PAL.void0, PAL.void1, PAL.void2, PAL.mag1, PAL.mag2, mix(PAL.mag2, PAL.fire2, 0.5), PAL.fire2, PAL.fire3, PAL.fire4, PAL.gold4];

function bandAt(t: number, ax: number, ay: number): Color {
  // t: 0 top … 1 horizon; stepped with a 4×4 dither between neighbouring bands
  const f = Math.max(0, Math.min(0.999, t)) * (BANDS.length - 1);
  const i = Math.floor(f);
  const frac = f - i;
  // ordered dither over the upper part of each step: soft but still pixel-crisp
  return frac > 0.35 && bayer(ax >> 1, ay >> 1) < (frac - 0.35) / 0.65 ? BANDS[Math.min(BANDS.length - 1, i + 1)] : BANDS[i];
}

/** One cloud row of the sea: puffs along a baseline, painted back to front. */
interface CloudRow {
  y: number;
  rMin: number;
  rMax: number;
  step: number;
  seed: number;
  /** lit crest, sunny side, body, shade, deep base. */
  tones: readonly [Color, Color, Color, Color, Color];
}

/** Far (small, sun-warmed) → near (big, pale lavender). */
const CLOUD_ROWS: readonly CloudRow[] = [
  { y: 136, rMin: 5, rMax: 11, step: 9, seed: 11, tones: [PAL.gold4, PAL.fire4, mix(PAL.fire3, PAL.mag3, 0.5), PAL.mag2, PAL.mag1] },
  { y: 160, rMin: 9, rMax: 17, step: 14, seed: 23, tones: [PAL.gold4, PAL.mag4, PAL.mag3, mix(PAL.mag2, PAL.void3, 0.5), PAL.void2] },
  { y: 196, rMin: 14, rMax: 26, step: 21, seed: 37, tones: [PAL.white, PAL.mag4, mix(PAL.mag3, PAL.void4, 0.5), PAL.void3, PAL.void2] },
  { y: 244, rMin: 20, rMax: 34, step: 28, seed: 51, tones: [PAL.white, mix(PAL.mag4, PAL.white, 0.5), mix(PAL.void4, PAL.mist, 0.5), mix(PAL.void3, PAL.mist, 0.4), PAL.void3] },
  { y: 300, rMin: 26, rMax: 42, step: 34, seed: 67, tones: [PAL.white, PAL.white, mix(PAL.mist, PAL.white, 0.5), PAL.mist, mix(PAL.void3, PAL.mist, 0.5)] },
  { y: 352, rMin: 30, rMax: 48, step: 40, seed: 83, tones: [PAL.white, PAL.white, PAL.white, mix(PAL.mist, PAL.white, 0.5), PAL.mist] },
];

/** Paint one cumulus row onto p: puffs (discs) with stepped sun-lit shading, merged into a continuous bank. */
function paintCloudRow(p: PixelCanvas, row: CloudRow, sunX: number): void {
  const rnd = mulberry32(row.seed);
  const W = p.w;
  const puffs: { x: number; y: number; r: number }[] = [];
  for (let gx = SKY_X0 - 40; gx < SKY_X0 + SKY_W + 40; gx += row.step * (0.7 + rnd() * 0.6)) {
    const r = row.rMin + rnd() * (row.rMax - row.rMin);
    puffs.push({ x: gx, y: row.y - r * 0.35 + rnd() * r * 0.3, r });
    // a smaller crown puff on top now and then
    if (rnd() < 0.45) puffs.push({ x: gx + (rnd() - 0.5) * r, y: row.y - r * 0.9, r: r * (0.45 + rnd() * 0.25) });
  }
  const [crest, sunny, body, shade, deep] = row.tones;
  // the bank under the row: one continuous body of cloud (a shade lip, then the deep base)
  for (let ay = Math.floor(row.y * K); ay < p.h; ay++)
    for (let ax = 0; ax < W; ax++) p.set(ax, ay, ay < (row.y + 3) * K ? shade : deep);
  for (const pf of puffs) {
    const x0 = Math.floor((pf.x - pf.r - SKY_X0) * K);
    const x1 = Math.ceil((pf.x + pf.r - SKY_X0) * K);
    const y0 = Math.floor((pf.y - pf.r) * K);
    for (let ax = Math.max(0, x0); ax < Math.min(W, x1); ax++) {
      const gx = SKY_X0 + ax / K;
      for (let ay = Math.max(0, y0); ay < p.h; ay++) {
        const gy = ay / K;
        const nx = (gx - pf.x) / pf.r;
        const ny = (gy - pf.y) / pf.r;
        const r2 = nx * nx + ny * ny;
        if (r2 > 1) continue;
        let c: Color;
        if (ny > 0.55 && gy > row.y - 2) continue; // the bottom of a puff melts into the bank
        if (r2 > 0.9 && ny > 0.1) c = deep; // a dark rim on the under-curve
        else if (ny > 0.45) c = shade;
        else {
          // light from the upper right (the sun side lights a bit more)
          const sunSide = gx > sunX ? 0.12 : -0.05;
          const l = -ny * 0.75 + nx * 0.35 + sunSide;
          const rim = nx * nx + ny * ny > 0.86 && ny < -0.2;
          if ((rim && l > 0.25) || l > 0.45) c = crest;
          else if (l > 0.12) c = sunny;
          else if (l > -0.3) c = bayer(ax >> 1, ay >> 1) < (l + 0.3) * 1.6 ? sunny : body;
          else if (l > -0.62) c = body;
          else c = shade;
        }
        p.set(ax, ay, c);
      }
    }
  }
}

export function paintSkyBackdrop(): PixelCanvas {
  const W = SKY_W * K;
  const H = SKY_H * K;
  const p = new PixelCanvas(W, H);
  const sun = SKY_LAYOUT.sun;
  const hz = SKY_LAYOUT.horizon;
  for (let ay = 0; ay < H; ay++) {
    const gy = ay / K;
    for (let ax = 0; ax < W; ax++) {
      const gx = SKY_X0 + ax / K;
      let c = bandAt(gy / hz, ax, ay);
      // god-rays: soft wedges round the sun, one band brighter, dithered
      const dx = gx - sun.x;
      const dy = gy - sun.y;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const ray = Math.cos(ang * 11 + 0.6) > 0.82 && dist > sun.r + 6 && dist < 230 && gy < hz;
      if (ray && bayer(ax >> 1, ay >> 1) < 0.32 * (1 - dist / 230)) c = bandAt(Math.min(1, gy / hz + 0.12), ax, ay);
      // the sun: stepped rings
      if (dist < sun.r + 10) {
        if (dist < sun.r) c = dist < sun.r - 6 ? PAL.white : PAL.gold4;
        else if (dist < sun.r + 4) c = PAL.gold3;
        else if (bayer(ax, ay) < 0.5) c = PAL.fire4;
      }
      // stars in the violet top
      if (gy < 70) {
        const h = Math.sin(ax * 12.9898 + ay * 78.233) * 43758.5453;
        const r = h - Math.floor(h);
        if (r > 0.9993) c = PAL.white;
        else if (r > 0.9986) c = PAL.void4;
      }
      p.set(ax, ay, c);
    }
  }
  // the cloud sea: five cumulus rows, far (small, sun-warmed) to near (big, pale)
  for (const row of CLOUD_ROWS) paintCloudRow(p, row, sun.x);
  return p;
}

// ---------------------------------------------------------------- islands

/** A floating island (art canvas ~ 90×80 game px): grass cap, rock cone, a small white temple, a waterfall. */
export function paintIsland(i: number): PixelCanvas {
  const rnd = mulberry32(0x15a + i * 97);
  const w = [84, 64, 96, 72][i % 4];
  const p = new PixelCanvas((w + 8) * K, 96 * K);
  const cx = (w / 2 + 4) * K;
  const capY = 34 * K;
  const half = (w / 2) * K;
  // rock cone: per column, depth shrinking to the edges, jagged
  for (let ax = cx - half; ax <= cx + half; ax++) {
    const f = Math.abs(ax - cx) / half;
    const depth = (46 * (1 - f) ** 1.2 + 4 + rnd() * 3) * K;
    for (let k = 0; k < depth; k++) {
      const y = capY + 4 * K + k;
      const ff = k / depth;
      const lit = ax > cx; // the sun is to the right
      let c: Color = ff < 0.25 ? (lit ? PAL.earth3 : PAL.earth2) : ff < 0.6 ? (lit ? PAL.earth2 : PAL.earth1) : ff < 0.9 ? PAL.earth1 : PAL.earth0;
      if (Math.floor((k + Math.sin(ax * 0.2) * 3) / 7) % 4 === 0 && ff < 0.85) c = mix(c, PAL.earth0, 0.35);
      if (k >= depth - 1) c = PAL.ink;
      p.set(ax, y, c);
    }
  }
  // grass cap: an ellipse lid, lit on the right
  for (let ay = capY - 3 * K; ay <= capY + 5 * K; ay++)
    for (let ax = cx - half - 2; ax <= cx + half + 2; ax++) {
      const e = ((ax - cx) / (half + 2)) ** 2 + ((ay - capY) / (5 * K)) ** 2;
      if (e > 1) continue;
      let c: Color = ay < capY ? (ax > cx ? PAL.leaf3 : PAL.leaf2) : PAL.leaf1;
      if (e > 0.86) c = PAL.leaf0;
      p.set(ax, ay, c);
    }
  // a tiny temple: steps, four columns, a pediment (white stone, warm-lit right side)
  const tw = (w * 0.42) | 0;
  const tx = cx - (tw / 2) * K;
  const ty = capY - 16 * K;
  const stone = (x: number, y: number, lit: boolean) => p.set(x, y, lit ? PAL.white : PAL.stone4);
  for (let ax = tx; ax < tx + tw * K; ax++) {
    for (let ay = capY - 3 * K; ay < capY; ay++) stone(ax, ay, ax > cx);
    for (let ay = ty - 4 * K; ay < ty; ay++) {
      const rel = (ax - tx) / (tw * K);
      if (ay - (ty - 4 * K) > Math.abs(rel - 0.5) * 8 * K - 0.5) stone(ax, ay, ax > cx);
    }
    for (let ay = ty; ay < ty + K; ay++) p.set(ax, ay, PAL.stone3);
  }
  for (let c = 0; c < 4; c++) {
    const colX = tx + Math.round(((c + 0.5) / 4) * tw * K) - K;
    for (let ay = ty + K; ay < capY - 3 * K; ay++) for (let dx = 0; dx < 2 * K; dx++) stone(colX + dx, ay, dx >= K);
  }
  // a waterfall off the right lip, falling into the clouds
  if (i % 2 === 0) {
    const fx = cx + half - 6 * K;
    for (let ay = capY; ay < p.h; ay++)
      for (let dx = 0; dx < 3 * K; dx++) {
        const c = (ay + dx * 3) % 6 < 3 ? PAL.water4 : PAL.white;
        if (p.get(fx + dx, ay) === null || ay < capY + 4 * K) p.set(fx + dx, ay, c);
      }
  }
  return p;
}

// ---------------------------------------------------------------- pillars

/** A tall sandstone pillar (game ~26×190 px) with a crystal crown and a long banner. */
export function paintPillar(side: 0 | 1): PixelCanvas {
  const W = 40 * K;
  const H = 210 * K;
  const p = new PixelCanvas(W, H);
  const crystal = side === 0 ? [PAL.cyan1, PAL.cyan2, PAL.cyan3, PAL.cyan4] : [PAL.crim1, PAL.crim2, PAL.crim3, PAL.crim4];
  const banner = side === 0 ? [PAL.cyan0, PAL.cyan1, PAL.cyan2] : [PAL.crim0, PAL.crim1, PAL.crim2];
  const x0 = 7 * K;
  const pw = 26 * K;
  const top = 30 * K;
  // shaft: blocks, lit right
  for (let ay = top; ay < H; ay++)
    for (let ax = x0; ax < x0 + pw; ax++) {
      const rx = (ax - x0) / pw;
      const course = Math.floor((ay - top) / (10 * K));
      const joint = (ay - top) % (10 * K) < 1 || (Math.floor(((ax - x0) / pw) * 2 + (course % 2) * 0.5) !== Math.floor(((ax - x0 - 1) / pw) * 2 + (course % 2) * 0.5));
      let c: Color = rx > 0.62 ? PAL.earth3 : rx > 0.25 ? PAL.earth2 : PAL.earth1;
      if (rx > 0.85) c = PAL.earth4;
      if (joint) c = PAL.earth0;
      if (ax === x0 || ax === x0 + pw - 1) c = PAL.ink;
      p.set(ax, ay, c);
    }
  // capital + base: wider gold-trimmed slabs
  for (const [y, h] of [
    [top - 6 * K, 6 * K],
    [H - 10 * K, 10 * K],
  ] as const)
    for (let ay = y; ay < y + h; ay++)
      for (let ax = x0 - 3 * K; ax < x0 + pw + 3 * K; ax++) {
        const edge = ay === y || ay === y + h - 1 || ax === x0 - 3 * K || ax === x0 + pw + 3 * K - 1;
        p.set(ax, ay, edge ? PAL.ink : ay - y < K ? PAL.gold3 : ax > x0 + pw / 2 ? PAL.earth3 : PAL.earth2);
      }
  // crystal crown: a tall faceted gem
  const gx = x0 + pw / 2;
  for (let ay = 0; ay < top - 6 * K; ay++) {
    const t = ay / (top - 6 * K);
    const half = Math.round((t < 0.6 ? t / 0.6 : (1 - t) / 0.4) * 7 * K);
    for (let dx = -half; dx <= half; dx++) {
      const c = Math.abs(dx) === half ? PAL.ink : dx < -half / 3 ? crystal[3] : dx < half / 3 ? crystal[2] : crystal[1];
      p.set(gx + dx, ay, c);
    }
  }
  // banner: hangs from a gold rod under the capital, swallow-tail end, a gold diamond sigil
  const by = top + 4 * K;
  const bh = 96 * K;
  const bx0 = x0 - 2 * K;
  const bw = pw + 4 * K;
  for (let ax = bx0 - 2 * K; ax < bx0 + bw + 2 * K; ax++) for (let ay = by - K; ay < by + K; ay++) p.set(ax, ay, PAL.gold3);
  for (let ay = by + K; ay < by + bh; ay++) {
    const rel = (ay - by) / bh;
    for (let ax = bx0; ax < bx0 + bw; ax++) {
      const rx = (ax - bx0) / bw;
      if (rel > 0.88 && Math.abs(rx - 0.5) < (rel - 0.88) * 4.2) continue; // swallow tail
      const edge = ax === bx0 || ax === bx0 + bw - 1;
      const fold = Math.sin(rx * 6.2) > 0.4;
      let c: Color = edge ? PAL.ink : rx < 0.12 || rx > 0.88 ? PAL.gold2 : fold ? banner[2] : banner[1];
      const sx = (ax - (bx0 + bw / 2)) / K;
      const sy = (ay - (by + bh * 0.42)) / K;
      const dd = Math.abs(sx) / 1 + Math.abs(sy) / 1.4;
      if (dd < 9 && dd > 7.5) c = PAL.gold3;
      if (dd < 3) c = PAL.gold4;
      p.set(ax, ay, c);
    }
  }
  return p;
}

// ---------------------------------------------------------------- prism

/** The floating prism (a faceted octahedron) — the beams are separate (paintPrismBeams). */
export function paintPrism(): PixelCanvas {
  const R = 18 * K;
  const p = new PixelCanvas(2 * R + 4, Math.round(2.6 * R) + 4);
  const cx = R + 2;
  const cy = Math.round(1.3 * R) + 2;
  for (let ay = 0; ay < p.h; ay++)
    for (let ax = 0; ax < p.w; ax++) {
      const dx = ax - cx;
      const dy = ay - cy;
      const d = Math.abs(dx) / R + Math.abs(dy) / (1.3 * R);
      if (d > 1) continue;
      let c: Color;
      if (d > 1 - 1.5 / R) c = PAL.ink;
      else if (dy < 0) c = dx < -R / 3 ? PAL.white : dx < R / 4 ? PAL.cyan4 : PAL.void4;
      else c = dx < -R / 3 ? PAL.cyan3 : dx < R / 4 ? PAL.void3 : PAL.mag3;
      if (Math.abs(dx) < 1 && d < 0.95) c = PAL.white; // the centre ridge
      p.set(ax, ay, c);
    }
  return p;
}

/** The two beams from the prism down to each side (game-space canvas over the frame, ADD-blended). */
export function paintPrismBeams(): PixelCanvas {
  const W = 640 * K;
  const H = 240 * K;
  const p = new PixelCanvas(W, H);
  const o = { x: (SKY_LAYOUT.prism.x + 0) * K, y: (SKY_LAYOUT.prism.y + 30) * K };
  const beams = [
    { to: { x: 150 * K, y: 230 * K }, c: [PAL.cyan1, PAL.cyan2, PAL.cyan3] },
    { to: { x: 500 * K, y: 230 * K }, c: [PAL.crim1, PAL.crim2, PAL.crim3] },
  ];
  for (const b of beams) {
    const len = Math.hypot(b.to.x - o.x, b.to.y - o.y);
    const ux = (b.to.x - o.x) / len;
    const uy = (b.to.y - o.y) / len;
    for (let t = 0; t < len; t++) {
      const wide = 2 + (t / len) * 18 * K;
      for (let s = -wide; s <= wide; s++) {
        const x = Math.round(o.x + ux * t - uy * s);
        const y = Math.round(o.y + uy * t + ux * s);
        const f = Math.abs(s) / wide;
        if (bayer(x, y) > 0.55 * (1 - t / len)) continue; // fades with distance, dithered
        p.set(x, y, f < 0.25 ? b.c[2] : f < 0.6 ? b.c[1] : b.c[0]);
      }
    }
  }
  return p;
}
