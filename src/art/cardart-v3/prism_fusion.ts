// Prism Fusion (prism_fusion) — v3 card art (style sheet docs/v3/KART_RESIMLERI.md, contract ./_types.ts).
// "A prism splitting light into a swirl": one white beam comes in from the upper left and strikes a standing crystal
// PRISM; out of its right face the light fans into the spectrum, and the coloured bands wind into a single spiral — the
// fusion vortex — whose white heart is the focus. Distinct from every other spell: no portal, no sigil, no figure; the
// only stock element is the SPELL sky.
//   backdrop  the kit's SPELL sky (night0 / night1) WITHOUT its stock portal (shape: false): the vortex's own stepped
//             violet light (void1 outer, void2 inner disc) stands in for it — ONE light shape, centred on the vortex.
//   subject   the prism: an upright triangular crystal (ink outline), its lit left face white / mist, the shaded right
//             face steel / night4, a mist ridge between them, a 1-px refraction streak inside; a small night3 plinth.
//   light     the incoming beam (white core, mist edge), the fan of spectral rays out of the right face, the spiral
//             (crim · fire · gold · leaf · cyan · void bands, big; four bands small), sparks round the white heart.
// Living art: 4 frames × 130 ms — the spiral turns one step per frame (the bands crawl inward), the heart's sparks
// twinkle, the beam's mist edge flickers one pixel (≤ 2 px motion).

import { PAL } from '../palette';
import type { PixelCanvas } from '../pixel';
import { ink, paintBackdrop } from './_kit';
import type { ArtLayers, CardArtV3 } from './_types';

const FRAMES = 4;
const TAU = Math.PI * 2;

interface Geo {
  k: 1 | 2;
  /** prism: apex and the two base corners */
  apex: readonly [number, number];
  baseL: readonly [number, number];
  baseR: readonly [number, number];
  /** where the beam enters (left face) and the light leaves (right face) */
  inAt: readonly [number, number];
  outAt: readonly [number, number];
  /** the beam's start (off the window, upper left) */
  beam0: readonly [number, number];
  /** vortex centre and outer radius */
  c: readonly [number, number];
  r: number;
  bands: readonly number[];
}

const SPECTRUM_BIG = [PAL.crim3, PAL.fire3, PAL.gold3, PAL.leaf3, PAL.cyan3, PAL.void3] as const;
const SPECTRUM_SMALL = [PAL.crim3, PAL.gold3, PAL.cyan3, PAL.void3] as const;

const BIG: Geo = {
  k: 2,
  apex: [25, 14],
  baseL: [11, 52],
  baseR: [39, 52],
  inAt: [19, 31],
  outAt: [33, 36],
  beam0: [-2, 8],
  c: [61, 34],
  r: 21,
  bands: SPECTRUM_BIG,
};

const SMALL: Geo = {
  k: 1,
  apex: [12, 6],
  baseL: [5, 26],
  baseR: [19, 26],
  inAt: [9, 15],
  outAt: [16, 18],
  beam0: [-1, 3],
  c: [30, 17],
  r: 11,
  bands: SPECTRUM_SMALL,
};

/** Integer line (Bresenham), calling `put` on every pixel. */
function line(x0: number, y0: number, x1: number, y1: number, put: (x: number, y: number, t: number) => void): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const n = Math.max(dx, -dy) || 1;
  let i = 0;
  for (;;) {
    put(x0, y0, i / n);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    i++;
  }
}

/** Is (x, y) inside the triangle (pixel centres)? */
function inTri(x: number, y: number, a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  const s = (p: readonly [number, number], q: readonly [number, number]) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** The vortex's stepped light (backdrop): a void1 disc, a void2 disc inside (squashed a little: it lies in the air). */
function paintVortexLight(p: PixelCanvas, g: Geo): void {
  const [cx, cy] = g.c;
  const steps: [number, number][] = [
    [g.r + 3 * g.k, PAL.void1],
    [g.r - 3 * g.k, PAL.void2],
  ];
  for (const [r, col] of steps)
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx;
        const dy = (y + 0.5 - cy) * 1.15;
        if (dx * dx + dy * dy <= r * r) p.set(x, y, col);
      }
}

function paintPrism(s: PixelCanvas, light: PixelCanvas, g: Geo): void {
  const { apex, baseL, baseR } = g;
  // the ridge: from the apex down to a point a little right of the base's middle (the prism is turned toward us)
  const ridgeX = Math.round(baseL[0] + (baseR[0] - baseL[0]) * 0.58);
  const ridge = (y: number) => apex[0] + ((ridgeX - apex[0]) * (y - apex[1])) / (baseL[1] - apex[1]);
  for (let y = apex[1]; y <= baseL[1]; y++)
    for (let x = baseL[0]; x <= baseR[0]; x++) {
      if (!inTri(x, y, apex, baseL, baseR)) continue;
      const rx = ridge(y + 0.5);
      let c: number;
      if (Math.abs(x + 0.5 - rx) < 0.75 * g.k) c = PAL.mist; // the ridge
      else if (x + 0.5 < rx) c = x + 0.5 < rx - (rx - baseL[0]) * 0.55 ? PAL.white : PAL.mist; // lit left face (white edge band)
      else c = x + 0.5 > rx + (baseR[0] - rx) * 0.6 ? PAL.night4 : PAL.steel; // the shaded right face
      if (y >= baseL[1] - (g.k - 1)) c = PAL.night4; // the base's shade row
      s.set(x, y, c);
    }
  // a small plinth under it
  for (let y = baseL[1] + 1; y <= baseL[1] + 2 * g.k; y++) for (let x = baseL[0] - g.k; x <= baseR[0] + g.k; x++) s.set(x, y, y === baseL[1] + 1 ? PAL.night4 : PAL.night3);
  ink(s);
  // the refraction streak inside the glass: from the entry point to the exit point (light layer, mist)
  line(g.inAt[0] + g.k, g.inAt[1], g.outAt[0] - g.k, g.outAt[1], (x, y) => {
    if (s.get(x, y) !== PAL.ink) light.set(x, y, PAL.cyan4);
  });
}

function paintBeam(light: PixelCanvas, s: PixelCanvas, g: Geo, f: number): void {
  const [x0, y0] = g.beam0;
  const [x1, y1] = g.inAt;
  line(x0, y0, x1, y1, (x, y) => {
    if (s.isOpaque(x, y) && s.get(x, y) !== PAL.ink) return;
    light.set(x, y, PAL.white);
    if (g.k === 2) {
      light.set(x, y + 1, PAL.white);
      // the mist edge flickers between the two sides (living art)
      if (!s.isOpaque(x, y - 1)) light.set(x, y - 1, f % 2 ? PAL.mist : PAL.cyan4);
      if (!s.isOpaque(x, y + 2) && f % 2 === 0) light.set(x, y + 2, PAL.mist);
    }
  });
}

/** The ribbon's lit step of each band tone (the crawling glints of the living art). */
const GLINT: Readonly<Record<number, number>> = {
  [PAL.crim3]: PAL.crim4,
  [PAL.fire3]: PAL.fire4,
  [PAL.gold3]: PAL.gold4,
  [PAL.leaf3]: PAL.leaf4,
  [PAL.cyan3]: PAL.cyan4,
  [PAL.void3]: PAL.void4,
};

/**
 * Band b's point at t (0 = the prism's exit face, 1 = the heart): ONE spectral ribbon that leaves the prism, fans open
 * (the bands part along the radius) and winds 1.25 turns clockwise into the vortex, tapering into the heart.
 */
function ribbonAt(g: Geo, b: number, t: number): [number, number] {
  const n = g.bands.length;
  const [cx, cy] = g.c;
  const a0 = Math.atan2((g.outAt[1] - cy) / 0.87, g.outAt[0] - cx);
  const r0 = Math.hypot(g.outAt[0] - cx, (g.outAt[1] - cy) / 0.87);
  const a = a0 + t * 1.25 * TAU;
  const spread = Math.min(1, 0.25 + t / 0.12) * (1 - t) ** 0.6;
  const r = r0 * (1 - t) ** 0.9 + (b - (n - 1) / 2) * g.k * spread;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.87];
}

function paintSpectrum(light: PixelCanvas, s: PixelCanvas, g: Geo, f: number): void {
  // the ribbon, band by band (outer bands first), solid k×k pixels; glints crawl along it frame by frame
  g.bands.forEach((col, b) => {
    const steps = Math.round(g.r * 14);
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 0.86;
      const [x, y] = ribbonAt(g, b, t);
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (s.isOpaque(ix, iy)) continue;
      const glint = Math.floor(t * 36) % 6 === (f * 3 + b) % 6 && t > 0.08;
      const c = glint ? (GLINT[col] ?? col) : col;
      for (let dy = 0; dy < g.k; dy++) for (let dx = 0; dx < g.k; dx++) if (!s.isOpaque(ix + dx, iy + dy)) light.set(ix + dx, iy + dy, c);
    }
  });
  // 3. the white heart and its sparks (twinkling)
  const [cx, cy] = [Math.round(g.c[0]), Math.round(g.c[1])];
  const K = g.k;
  for (let dy = -K; dy <= K; dy++) for (let dx = -K; dx <= K; dx++) if (Math.abs(dx) + Math.abs(dy) <= K) light.set(cx + dx, cy + dy, PAL.white);
  const arm = K === 2 ? 4 + (f % 2) : 2;
  for (let i = K + 1; i <= arm; i++) {
    light.set(cx + i, cy, i === arm ? PAL.void4 : PAL.white);
    light.set(cx - i, cy, i === arm ? PAL.void4 : PAL.white);
    if (i <= arm - 1) {
      light.set(cx, cy + i, PAL.void4);
      light.set(cx, cy - i, PAL.void4);
    }
  }
  if (K === 2) {
    const sp: [number, number][] = [
      [-13, -15],
      [16, -12],
      [14, 15],
      [-15, 13],
    ];
    sp.forEach(([dx, dy], i) => {
      const on = (i + f) % 4 !== 0;
      if (!on) return;
      light.set(cx + dx, cy + dy, PAL.white);
      light.set(cx + dx + 1, cy + dy, PAL.void4);
      light.set(cx + dx - 1, cy + dy, PAL.void4);
    });
  } else if (f % 2 === 0) {
    light.set(cx + 8, cy - 7, PAL.white);
    light.set(cx - 8, cy + 7, PAL.void4);
  }
}

function paint(l: ArtLayers, f: number, g: Geo): void {
  paintBackdrop(l.backdrop, 'SPELL', { focus: [BIG.c[0], BIG.c[1]], shape: false, horizon: 999 });
  paintVortexLight(l.backdrop, g);
  paintPrism(l.subject, l.light, g);
  paintSpectrum(l.light, l.subject, g, f);
  paintBeam(l.light, l.subject, g, f);
}

const art: CardArtV3 = {
  id: 'prism_fusion',
  focus: [BIG.c[0], BIG.c[1]],
  frames: FRAMES,
  holdMs: 130,
  big: (l, f) => paint(l, f, BIG),
  small: (l, f) => paint(l, f, SMALL),
};

export default art;
