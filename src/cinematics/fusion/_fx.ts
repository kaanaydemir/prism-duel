// Prism Fusion → Trinity Crystal Wyrm: the pixel set pieces of the fusion cinematic (./trinity.ts; storyboard
// docs/v3/FUSION_STORYBOARD.md). Everything here is drawn in whole pixels into two full-screen rasters (one in the
// air over the units, one on the floor under them) or as Images of a monster's own frame (the light-forms); the soft
// light layer (view/light) carries the glow. Colours only from PAL / RAMPS.
//
//   Layer          a full-screen Raster redrawn every frame from a list of painters (each returns false when done)
//   paintPrism     the crystal prism: a spinning triangular prism with pyramid tips, a rainbow fringe on one edge
//   formTexture    a monster frame turned into its light-form (value bands → white / cyan, a white rim)
//   LightForm      that light-form as an Image: born white, flies on whole pixels, sheds afterimages, pours away
//   Comet          a strand head with its trail (the helix): positions pushed every frame, drawn with a colour ramp
//   painters       beam, rays (the rainbow split), floor fan, sigil, shock rings, star, pillar, ray bursts

import Phaser from 'phaser';
import type { PlayerId } from '../../engine/types';
import type { MonsterId } from '../../data/cards';
import { PAL, RAMPS, type Ramp } from '../../art/palette';
import { monsterArt } from '../../art/monsters';
import { monsterFrame } from '../../art/textures';
import type { PixelCanvas } from '../../art/pixel';
import type { AnyMonsterAnim } from '../../art/types';
import { DEPTH, GAME_H, GAME_W, type XY } from '../../view/layout';
import { Raster, onFrame, bayer } from '../../vfx/setpieces';

export const TAU = Math.PI * 2;

/** The three strands (the heads' colours, as the Trinity's attack braid): A magenta, B gold, C teal. */
export const STRAND: readonly Ramp[] = [RAMPS.mag, RAMPS.gold, RAMPS.teal];
/** The rainbow (the prism's split), red → violet. */
export const RAINBOW: readonly number[] = [PAL.crim3, PAL.fire3, PAL.gold4, PAL.leaf3, PAL.cyan3, PAL.void3];
export const RAINBOW_HI: readonly number[] = [PAL.crim4, PAL.fire4, PAL.gold4, PAL.leaf4, PAL.cyan4, PAL.void4];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
export const ease = (t: number): number => t * t * (3 - 2 * t);
export const outCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const inCubic = (t: number): number => t * t * t;

// ================================================================ the layer

export type Painter = (g: Raster, el: number, dt: number) => boolean | void;

/** A full-screen raster redrawn every frame from its painters (nothing drawn: cleared once and left idle). */
export class Layer {
  readonly g: Raster;
  private painters: { fn: Painter; t0: number }[] = [];
  private el = 0;
  private dirty = true;
  private stop: () => void;
  private dead = false;

  constructor(scene: Phaser.Scene, depth: number, blend: number = Phaser.BlendModes.NORMAL) {
    this.g = new Raster(scene, 0, 0, GAME_W, GAME_H, depth, blend);
    this.stop = onFrame(scene, (dt) => {
      if (this.dead) return false;
      this.el += dt;
      if (!this.painters.length) {
        if (this.dirty) {
          this.g.draw(() => undefined);
          this.dirty = false;
        }
        return true;
      }
      this.dirty = true;
      this.g.begin();
      for (const p of [...this.painters]) {
        let keep: boolean | void = true;
        try {
          keep = p.fn(this.g, this.el - p.t0, dt);
        } catch (e) {
          console.error('[fusion] painter', e);
          keep = false;
        }
        if (keep === false) this.painters.splice(this.painters.indexOf(p), 1);
      }
      this.g.end();
      return true;
    });
  }

  /** Add a painter (el = ms since it was added). Returns its remover. */
  add(fn: Painter): () => void {
    const p = { fn, t0: this.el };
    this.painters.push(p);
    return () => {
      const i = this.painters.indexOf(p);
      if (i >= 0) this.painters.splice(i, 1);
    };
  }

  get busy(): boolean {
    return this.painters.length > 0;
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.painters = [];
    this.stop();
    this.g.destroy();
  }
}

// ================================================================ the prism

/**
 * The crystal prism centred on (cx, cy): a triangular prism standing upright with pyramid tips, spinning by `a`
 * (rad), `size` 0..1 (grows in whole-pixel steps), `hot` 0..1 (the faces whiten), a rainbow fringe on its right edge.
 */
export function paintPrism(g: Raster, cx: number, cy: number, a: number, size: number, hot = 0): void {
  if (size <= 0.02) return;
  const R = Math.max(1, Math.round(6 * size));
  const hh = Math.max(1, Math.round(8 * size));
  const tip = Math.max(1, Math.round(6 * size));
  if (R <= 1) {
    g.rect(cx - 1, cy - hh, 2, hh * 2, PAL.white);
    return;
  }
  const v = [0, 1, 2].map((i) => {
    const f = a + (i * TAU) / 3;
    return { x: cx + Math.cos(f) * R, e: Math.sin(f) * R * 0.35, f };
  });
  const top = { x: cx, y: cy - hh - tip };
  const bot = { x: cx, y: cy + hh + tip };
  // faces, back to front
  const faces = [0, 1, 2]
    .map((i) => {
      const j = (i + 1) % 3;
      const mid = a + ((i + 0.5) * TAU) / 3;
      return { i, j, z: Math.sin(mid), mid };
    })
    .filter((f) => f.z > -0.15)
    .sort((p, q) => p.z - q.z);
  const tones = hot > 0.6 ? [PAL.cyan4, PAL.white, PAL.white, PAL.white] : hot > 0.25 ? [PAL.cyan3, PAL.cyan4, PAL.white, PAL.white] : [PAL.cyan2, PAL.cyan3, PAL.cyan4, PAL.white];
  for (const f of faces) {
    const A = v[f.i];
    const B = v[f.j];
    // key light from the upper left / front: the face turned that way is the brightest
    const lit = 0.5 + 0.5 * Math.cos(f.mid - Math.PI * 0.62);
    const k = Math.min(3, Math.floor(lit * 3.2 + (f.z > 0.7 ? 0.4 : 0)));
    const c = tones[k];
    g.poly(
      [
        { x: A.x, y: cy - hh + A.e },
        { x: B.x, y: cy - hh + B.e },
        { x: B.x, y: cy + hh + B.e },
        { x: A.x, y: cy + hh + A.e },
      ],
      c,
    );
    g.poly([top, { x: A.x, y: cy - hh + A.e }, { x: B.x, y: cy - hh + B.e }], tones[Math.min(3, k + 1)]);
    g.poly([bot, { x: A.x, y: cy + hh + A.e }, { x: B.x, y: cy + hh + B.e }], tones[Math.max(0, k - 1)]);
  }
  // the edges facing us: white glints; the silhouette: a dark cyan rim
  for (const p of v) {
    if (Math.sin(p.f) > 0.2) g.line(p.x, cy - hh + p.e, p.x, cy + hh + p.e, PAL.white);
  }
  // the rainbow fringe down the rightmost edge (the light leaving the prism already split)
  const right = v.reduce((m, p) => (p.x > m.x ? p : m), v[0]);
  const rx = Math.round(right.x) + 1;
  const y0 = Math.round(cy - hh + right.e);
  const n = Math.max(2, hh * 2);
  for (let k = 0; k < n; k++) g.px(rx, y0 + k, RAINBOW[Math.min(5, Math.floor((k / n) * 6))]);
  g.px(top.x, top.y, PAL.white);
  if (hot > 0.4) {
    g.px(top.x, top.y - 1, PAL.white);
    g.px(bot.x, bot.y + 1, PAL.cyan4);
  }
}

// ================================================================ light-forms

const formKeys = new Map<string, string>();

/** A monster frame as its light-form: value bands → white / cyan4 / cyan3 / cyan2, every rim pixel white. */
export function formTexture(scene: Phaser.Scene, id: MonsterId, anim: AnyMonsterAnim, frame: number): { key: string; w: number; h: number; ax: number; ay: number } | null {
  const art = monsterArt(id);
  const key = `fu:form:${id}:${anim}:${frame}`;
  const out = { key, w: art.w, h: art.h, ax: art.anchorX, ay: art.anchorY };
  if (scene.textures.exists(key)) return out;
  let src: PixelCanvas;
  try {
    src = monsterFrame(id, anim, frame);
  } catch (e) {
    console.warn('[fusion] form frame', e);
    return null;
  }
  const W = src.w;
  const H = src.h;
  const tex = scene.textures.createCanvas(key, W, H);
  if (!tex) return null;
  const img = tex.context.createImageData(W, H);
  const d = src.data;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
  const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const tones = [rgb(PAL.cyan2), rgb(PAL.cyan3), rgb(PAL.cyan4), rgb(PAL.white)];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] === 0) continue;
      const rim = !op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1);
      const l = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 255;
      const c = rim ? tones[3] : tones[l > 0.7 ? 3 : l > 0.45 ? 2 : l > 0.22 ? 1 : 0];
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  tex.context.putImageData(img, 0, 0);
  tex.refresh();
  formKeys.set(key, key);
  return out;
}

/**
 * A wyrm's light-form: an Image of its form texture, anchored on the art's anchor (mirrored for `flip`), moved on
 * whole pixels. trail() stamps a fading afterimage in the strand's colour.
 */
export class LightForm {
  readonly img: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private readonly ghosts: Phaser.GameObjects.Image[] = [];
  private readonly w: number;
  private readonly ax: number;
  private readonly ay: number;
  private readonly h: number;

  constructor(scene: Phaser.Scene, f: { key: string; w: number; h: number; ax: number; ay: number }, at: XY, flip: boolean, depth: number) {
    this.scene = scene;
    this.w = f.w;
    this.h = f.h;
    this.ax = f.ax;
    this.ay = f.ay;
    this.img = scene.add.image(Math.round(at.x), Math.round(at.y), f.key).setDepth(depth);
    this.face(flip);
  }

  face(flip: boolean): void {
    if (!this.img.active) return;
    this.img.setFlipX(flip);
    this.img.setOrigin((flip ? this.w - this.ax : this.ax) / this.w, this.ay / this.h);
  }

  /** The body's middle (≈ 45 % up the frame from the anchor). */
  centre(): XY {
    return { x: this.img.x, y: Math.round(this.img.y - this.ay * 0.45) };
  }

  moveTo(x: number, y: number): void {
    if (this.img.active) this.img.setPosition(Math.round(x), Math.round(y));
  }

  /** A fading afterimage in `color` where the form is now (stepped alpha, then gone). */
  trail(color: number, alpha = 0.5): void {
    if (!this.img.active) return;
    const g = this.scene.add
      .image(this.img.x, this.img.y, this.img.texture.key)
      .setOrigin(this.img.originX, this.img.originY)
      .setFlipX(this.img.flipX)
      .setDepth(this.img.depth - 0.5)
      .setTintFill(color)
      .setAlpha(alpha);
    this.ghosts.push(g);
    let n = 0;
    onFrame(this.scene, (dt) => {
      if (!g.active) return false;
      n += dt;
      const a = n < 45 ? alpha : n < 90 ? alpha * 0.55 : n < 140 ? alpha * 0.25 : 0;
      if (a <= 0) {
        g.destroy();
        return false;
      }
      g.setAlpha(a);
      return true;
    });
  }

  destroy(): void {
    for (const g of this.ghosts) if (g.active) g.destroy();
    if (this.img.active) this.img.destroy();
  }
}

// ================================================================ comets (the helix strands)

export class Comet {
  pts: XY[] = [];
  head: XY;
  /** trail length (points kept) */
  len = 10;
  lit = 1;
  constructor(
    readonly ramp: Ramp,
    at: XY,
  ) {
    this.head = { ...at };
  }
  push(p: XY): void {
    this.head = { x: p.x, y: p.y };
    const last = this.pts[this.pts.length - 1];
    if (!last || Math.round(last.x) !== Math.round(p.x) || Math.round(last.y) !== Math.round(p.y)) this.pts.push({ x: p.x, y: p.y });
    while (this.pts.length > this.len) this.pts.shift();
  }
  paint(g: Raster): void {
    if (this.lit <= 0) return;
    const n = this.pts.length;
    for (let i = 1; i < n; i++) {
      const a = this.pts[i - 1];
      const b = this.pts[i];
      const u = i / n; // 0 old → 1 new
      const c = u > 0.86 ? PAL.white : u > 0.6 ? this.ramp[4] : u > 0.35 ? this.ramp[3] : this.ramp[2];
      const lv = this.lit * (u > 0.35 ? 1 : 0.35 + u * 1.8);
      g.line(a.x, a.y, b.x, b.y, c, lv, u > 0.7 ? 2 : 1);
    }
    const h = this.head;
    g.rect(Math.round(h.x) - 1, Math.round(h.y) - 1, 3, 3, this.ramp[4], this.lit);
    g.px(h.x, h.y, PAL.white);
    g.px(h.x - 2, h.y, this.ramp[3], this.lit);
    g.px(h.x + 2, h.y, this.ramp[3], this.lit);
    g.px(h.x, h.y - 2, this.ramp[3], this.lit);
    g.px(h.x, h.y + 2, this.ramp[3], this.lit);
  }
}

// ================================================================ painters

/** A beam of light from a to b: a white core, cyan edges, a flicker; `lv` its level, `w` its half width. */
export function paintBeam(g: Raster, a: XY, b: XY, lv: number, w = 1, el = 0): void {
  if (lv <= 0.02) return;
  const fl = 0.85 + 0.15 * Math.sin(el * 0.05);
  if (w >= 2) g.line(a.x, a.y, b.x, b.y, PAL.cyan2, lv * 0.5 * fl, w * 2 + 1);
  g.line(a.x, a.y, b.x, b.y, PAL.cyan4, lv * fl, w + 1);
  g.line(a.x, a.y, b.x, b.y, PAL.white, lv);
}

/**
 * A ray of the split: from the prism to its target, `grow` 0..1 how far it has reached, `lv` its level; bright
 * dashes run down it (the light flowing toward the material).
 */
export function paintRay(g: Raster, a: XY, b: XY, color: number, hi: number, grow: number, lv: number, el: number): void {
  if (grow <= 0 || lv <= 0.02) return;
  const e = { x: a.x + (b.x - a.x) * grow, y: a.y + (b.y - a.y) * grow };
  g.line(a.x, a.y, e.x, e.y, color, lv * 0.75);
  const L = Math.hypot(e.x - a.x, e.y - a.y);
  const step = 9;
  const off = (el * 0.09) % step;
  for (let d = off; d < L; d += step) {
    const k = d / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    g.dpx(x, y, hi, lv);
    g.dpx(x + Math.sign(b.x - a.x), y + Math.sign(b.y - a.y), hi, lv * 0.7);
  }
  if (grow < 1) {
    g.rect(Math.round(e.x) - 1, Math.round(e.y) - 1, 3, 3, hi, lv);
    g.px(e.x, e.y, PAL.white);
  }
}

/** The rainbow fan lying on the floor from `at` toward angle `dir` (rad, screen), spread `spread`, length `len`. */
export function paintFloorFan(g: Raster, at: XY, dir: number, spread: number, len: number, lv: number, el: number): void {
  if (lv <= 0.02) return;
  for (let i = 0; i < 6; i++) {
    const a = dir - spread / 2 + (spread * (i + 0.5)) / 6;
    const ca = Math.cos(a);
    const sa = Math.sin(a) * 0.5;
    const n = Math.round(len);
    for (let d = 6; d < n; d++) {
      const fade = 1 - d / n;
      const shimmer = 0.75 + 0.25 * Math.sin(el * 0.012 + d * 0.25 + i);
      const x = at.x + ca * d;
      const y = at.y + sa * d;
      g.dpx(x, y, RAINBOW[i], lv * fade * shimmer * 0.9);
      if (d % 3 === 0) g.dpx(x, y + 1, RAINBOW[i], lv * fade * 0.35);
    }
  }
}

/**
 * The fusion sigil on the floor round `at`: a circle inking itself in (`p` 0..1), an inner triangle turning with
 * `spin` (rad), three nodes in the strands' colours at its corners, `lv` its level.
 */
export function paintSigil(g: Raster, at: XY, r: number, p: number, spin: number, lv: number, hot = 0): void {
  if (lv <= 0.02 || p <= 0) return;
  const a0 = -Math.PI / 2;
  const c1 = hot > 0.5 ? PAL.white : PAL.cyan3;
  g.ring(at.x, at.y, r, r / 2, c1, lv, a0, a0 + TAU * p);
  g.ring(at.x, at.y, r - 3, r / 2 - 1.5, PAL.cyan2, lv * 0.6, a0 - TAU * p, a0);
  if (p < 0.4) return;
  const k = seg(p, 0.4, 1);
  const pts = [0, 1, 2].map((i) => {
    const f = spin + (i * TAU) / 3;
    return { x: at.x + Math.cos(f) * (r - 3), y: at.y + Math.sin(f) * (r / 2 - 1.5) };
  });
  for (let i = 0; i < 3; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 3];
    g.line(a.x, a.y, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, PAL.gold3, lv * 0.85);
  }
  pts.forEach((q, i) => {
    g.rect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3, STRAND[i][3], lv);
    g.px(q.x, q.y, PAL.white);
  });
  // ticks round the rim
  for (let i = 0; i < 12; i++) {
    const f = -spin * 0.5 + (i / 12) * TAU;
    if (i / 12 > p) continue;
    g.dpx(at.x + Math.cos(f) * (r + 3), at.y + Math.sin(f) * (r / 2 + 1.5), i % 3 === 0 ? PAL.white : PAL.cyan3, lv);
  }
}

/** Concentric rainbow rings lying on the floor (the shock of the fusion / the triple roar). */
export function paintShockRings(g: Raster, at: XY, r: number, lv: number, colors: readonly number[] = RAINBOW_HI, gap = 3): void {
  if (lv <= 0.02 || r < 1) return;
  g.ring(at.x, at.y, r, r / 2, PAL.white, lv);
  colors.forEach((c, i) => {
    const rr = r - (i + 1) * gap;
    if (rr > 2) g.ring(at.x, at.y, rr, rr / 2, c, lv * (1 - i * 0.1));
  });
}

/** A star of light at `at` (cross rays + short diagonals), `L` the long ray. */
export function paintStar(g: Raster, at: XY, L: number, lv: number, ramp: Ramp = RAMPS.cyan): void {
  if (lv <= 0.02 || L < 1) return;
  const x = Math.round(at.x);
  const y = Math.round(at.y);
  const rays: [number, number, number][] = [
    [1, 0, L],
    [-1, 0, L],
    [0, -1, L * 0.7],
    [0, 1, L * 0.7],
    [1, 1, L * 0.3],
    [-1, 1, L * 0.3],
    [1, -1, L * 0.3],
    [-1, -1, L * 0.3],
  ];
  for (const [dx, dy, l] of rays) {
    const n = Math.round(l);
    for (let d = 1; d <= n; d++) {
      const u = d / n;
      const c = u < 0.3 ? PAL.white : u < 0.6 ? ramp[4] : ramp[3];
      g.dpx(x + dx * d, y + dy * d, c, lv * (1 - u * 0.6));
    }
  }
  const core = Math.max(1, Math.round(L / 14));
  g.rect(x - core, y - core, core * 2 + 1, core * 2 + 1, PAL.white, lv);
}

/** A column of light from (x, yTop) down to (x, yBot), `hw` half width. */
export function paintPillar(g: Raster, x: number, yTop: number, yBot: number, hw: number, lv: number, el: number): void {
  if (lv <= 0.02 || hw <= 0) return;
  for (let y = Math.floor(yTop); y <= yBot; y++) {
    const w = hw * (0.85 + 0.15 * Math.sin(el * 0.03 + y * 0.3));
    g.rect(x - w - 2, y, 2, 1, PAL.cyan2, lv * 0.5);
    g.rect(x + w, y, 2, 1, PAL.cyan2, lv * 0.5);
    g.rect(x - w, y, w * 2, 1, PAL.cyan4, lv);
    g.rect(x - Math.max(1, w * 0.4), y, Math.max(2, w * 0.8), 1, PAL.white, lv);
  }
}

/** A burst of `n` short rays round `at` (a roaring mouth, the core), length `L`, from `r0`. */
export function paintRays(g: Raster, at: XY, n: number, r0: number, L: number, lv: number, colors: readonly number[], spin = 0): void {
  if (lv <= 0.02 || L <= 0) return;
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const c = colors[i % colors.length];
    const m = Math.round(L);
    for (let d = 0; d < m; d++) {
      const u = d / m;
      g.dpx(at.x + ca * (r0 + d), at.y + sa * (r0 + d), u < 0.25 ? PAL.white : c, lv * (1 - u * 0.7));
    }
  }
}

/** The light inside the dim: a dithered disc of `color` (rarely used: the light layer carries most glow). */
export function paintHalo(g: Raster, at: XY, r: number, color: number, lv: number): void {
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      const k = lv * (1 - d) * (1 - d);
      if (bayer(at.x + x, at.y + y) < k) g.px(at.x + x, at.y + y, color);
    }
}

/** Depth bands the cinematic uses. */
export const FU_DEPTH = {
  floor: DEPTH.TILE_FX + 3,
  air: DEPTH.FX + 30,
  form: DEPTH.FX + 20,
} as const;

/** A unit-less "who" helper: +1 player 1, −1 player 2 (the side the board faces). */
export function sideOf(p: PlayerId): 1 | -1 {
  return p === 0 ? 1 : -1;
}
