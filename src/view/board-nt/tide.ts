// Neon Tower layer: TIDE — Gelgit Körfezi (tidal_bay) floods the graphite stage (BOARD_V4). Driven by BoardViewNt.setTide.
//
//   surge      setTide(true, true, from): the caster's field seal bursts into a water spout (a wavering column, its crown
//              spraying, a splash ring rolling out), then the tide spreads over the slab from it as a flat sheet — a churning
//              white foam crest, light flaring behind it — the slab cools to the water's colour, and where the sheet meets the
//              near walls it spills over them in four wide cascades that pour down into foaming pools on the hall floor.
//   living     caustics: a web of moving light lines on the floor (three warped wave fields in floor space, their troughs lit,
//              the crossings flaring white), long swell lines gliding across the surface, foam lapping at the rim, rain-drop
//              ripples, sun glints; the cascades stream (bright streaks running down, a bulging white lip, see-through tails),
//              the pools churn and throw spray and mist; the hall takes a cool cast.
//   ebb        setTide(false, true): the sheet draws back into the seal, the cascades stop from the top, the pools settle.
// Rasters repaint on 40-ms steps of the scene clock (25 fps: deterministic under the stepped QA clock, frozen in hit-stop);
// particles move every frame. Reduced motion: still caustics, no particles / ripples.

import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import type { Color } from '../../art/pixel';
import { TIDE_BOX, buildTideNet, tideDist, tideMaxDist, tideOrigin, tideVeil, type TideNet } from '../../art/arena-nt/tide';
import { PixelCanvas } from '../../art/pixel';
import { sfx } from '../../audio/sfx';
import type { PlayerId } from '../../engine/types';
import { TEX, shake } from '../../vfx/core';
import { Raster } from '../../vfx/setpieces';
import { DEPTH } from '../layout';
import { lightFlash, lightPool, type LightHandle } from '../light';
import { REDUCED_MOTION } from '../v3/motion';
import { WIDE_OX } from '../mobile';
import { NT_DEPTH } from './layout-nt';
import { TIDE_STATE } from './tide-state';
import type { NtCtx, NtLayer } from './layer';

type Img = Phaser.GameObjects.Image;

export const TIDE_Z = {
  hall: NT_DEPTH.platform + 1.462,
  veil: NT_DEPTH.platform + 1.464,
  body: NT_DEPTH.platform + 1.466,
  /** the units' reflections lie on the water (above its body, under the surface highlights) */
  reflect: NT_DEPTH.platform + 1.47,
  water: NT_DEPTH.platform + 1.481,
  light: NT_DEPTH.platform + 1.491,
  air: DEPTH.TILE_FX + 4.5,
} as const;

/** The surge spreads over the slab in SURGE_MS (sine-out) after a SPOUT_MS spout; the ebb takes EBB_MS. */
export const SPOUT_MS = 260;
export const SURGE_MS = 1150;
const EBB_MS = 1050;
const STEP_MS = 40;
/** How opaque the water's body is over the slab (the floor shows through it). */
const BODY_ALPHA = 0.58;
const AIR_UP = 60;

/** When the surge reaches a screen point (ms after setTide(true, true, origin)). */
export function tideArrivalMs(origin: PlayerId | null, at: { x: number; y: number }): number {
  const o = tideOrigin(origin);
  const d = tideDist(o, at.x, at.y);
  const most = tideMaxDist(origin);
  if (d >= most) return SPOUT_MS + SURGE_MS;
  return SPOUT_MS + Math.round((Math.asin(d / most) * 2 * SURGE_MS) / Math.PI);
}

// ---------------------------------------------------------------- fast trig + hashes

const LUT_N = 2048;
const SIN = new Float32Array(LUT_N);
for (let i = 0; i < LUT_N; i++) SIN[i] = Math.sin((i / LUT_N) * Math.PI * 2);
const K = LUT_N / (Math.PI * 2);
const fsin = (a: number): number => SIN[(Math.floor(a * K) % LUT_N + LUT_N) % LUT_N];

const h01 = (a: number, b = 0, c = 0): number => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h01(xi, yi, s);
  const b = h01(xi + 1, yi, s);
  const c = h01(xi, yi + 1, s);
  const d = h01(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const rgbOf = (c: Color): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** ADD light levels of the caustics (premultiplied). */
const LIGHT = {
  hot: rgbOf(PAL.teal4).map((v) => Math.round(v * 0.22)) as [number, number, number],
  mid: rgbOf(PAL.cyan3).map((v) => Math.round(v * 0.13)) as [number, number, number],
  low: rgbOf(PAL.teal2).map((v) => Math.round(v * 0.07)) as [number, number, number],
  flare: rgbOf(PAL.cyan4).map((v) => Math.round(v * 0.3)) as [number, number, number],
  swell: rgbOf(PAL.cyan1).map((v) => Math.round(v * 0.3)) as [number, number, number],
  crest: rgbOf(PAL.cyan4).map((v) => Math.round(v * 0.7)) as [number, number, number],
};

interface Particle {
  img: Img;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  sway: number;
  age: number;
  life: number;
  ramp: readonly Color[];
}

const SPRAY: readonly Color[] = [PAL.white, PAL.cyan4, PAL.teal4, PAL.teal3, PAL.cyan2];
const MIST: readonly Color[] = [PAL.teal4, PAL.cyan4, PAL.stone4, PAL.stone3];
const BUBBLE: readonly Color[] = [PAL.cyan4, PAL.teal4, PAL.teal3];

export interface TideLayer extends NtLayer {
  readonly on: boolean;
  setTide(on: boolean, animate: boolean, from: PlayerId | null): Promise<void>;
}

export function createTideLayer(ctx: NtCtx): TideLayer {
  const scene = ctx.scene;
  const motion = !REDUCED_MOTION;
  let net: TideNet | null = null;
  let water: Raster | null = null;
  let light: Raster | null = null;
  let air: Raster | null = null;
  let veil: Img | null = null;
  let body: Img | null = null;
  let hall: Phaser.GameObjects.Rectangle | null = null;
  const parts: Particle[] = [];
  const lights: (LightHandle | null)[] = [];
  let dist: Float32Array | null = null;
  let curtainD: number[] = [];
  /** per top pixel: the water's own colour (bands + depth patches); screen → top index; the wave strokes */
  let bodyCol: Int32Array | null = null;
  let topAt: Int32Array | null = null;
  let strokes: { x: number; y: number; len: number; period: number; phase: number; drift: number; white: boolean }[] | null = null;
  let most = 1;
  let origin: PlayerId | null = null;
  let o = { x: 320, y: 160 };

  let on = false;
  let mode: 'off' | 'surge' | 'on' | 'ebb' = 'off';
  let t = 0;
  let modeAt = 0;
  let front = 0;
  let lastStep = -1;
  let token = 0;
  let resolveMode: (() => void) | null = null;
  const ripples: { x: number; y: number; born: number; big: boolean }[] = [];
  let nextRipple = 0;
  let nextSpray = 0;
  let nextDrop = 0;
  const curtainLit = new Set<number>();

  const ensure = (): void => {
    if (net) return;
    net = buildTideNet();
    const N = net;
    water = new Raster(scene, TIDE_BOX.x, TIDE_BOX.y, TIDE_BOX.w, TIDE_BOX.h, TIDE_Z.water);
    light = new Raster(scene, TIDE_BOX.x, TIDE_BOX.y, TIDE_BOX.w, TIDE_BOX.h, TIDE_Z.light, Phaser.BlendModes.ADD);
    air = new Raster(scene, TIDE_BOX.x, TIDE_BOX.y - AIR_UP, TIDE_BOX.w, TIDE_BOX.h, TIDE_Z.air);
    // the water's colour on the slab (multiply, quantised to 1/24 steps)
    const key = ctx.texture('tide', 'nt:tide:veil', () => {
      const pc = new PixelCanvas(TIDE_BOX.w, TIDE_BOX.h);
      for (let i = 0; i < N.n; i++) {
        const f = tideVeil(N.x[i], N.y[i]);
        const q = (v: number) => Math.round(Math.round(v * 24) / 24 * 255);
        pc.set(N.x[i] - TIDE_BOX.x, N.y[i] - TIDE_BOX.y, (q(f[0]) << 16) | (q(f[1]) << 8) | q(f[2]));
      }
      return pc;
    });
    veil = ctx.add(scene.add.image(TIDE_BOX.x, TIDE_BOX.y, key).setOrigin(0).setDepth(TIDE_Z.veil).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false));
    // the body of the water (normal blend, faded with the tide): shallow and lighter at the rim, deep blue-teal in the middle of the
    // lanes, the bands stepped through an ordered dither (no smooth alpha inside the texture)
    const bodyKey = ctx.texture('tide', 'nt:tide:body', () => {
      const pc = new PixelCanvas(TIDE_BOX.w, TIDE_BOX.h);
      const RAMP = [PAL.cyan2, PAL.cyan2, PAL.cyan1, PAL.cyan1, PAL.cyan0, PAL.night2] as const;
      const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let i = 0; i < N.n; i++) {
        const x = N.x[i];
        const y = N.y[i];
        const shore = Math.min(1, N.rim[i] / 12);
        const lane = 1 - Math.min(1, Math.abs(N.v[i]) / 120);
        const right = Math.max(0, Math.min(1, (x - 160) / 380));
        const deep = Math.min(1, shore * (0.45 + 0.3 * lane + 0.25 * right));
        const f = deep * (RAMP.length - 1);
        const k = Math.floor(f + BAYER[(y & 3) * 4 + (x & 3)] / 16);
        pc.set(x - TIDE_BOX.x, y - TIDE_BOX.y, RAMP[Math.max(0, Math.min(RAMP.length - 1, k))]);
      }
      return pc;
    });
    body = ctx.add(scene.add.image(TIDE_BOX.x, TIDE_BOX.y, bodyKey).setOrigin(0).setDepth(TIDE_Z.body).setVisible(false));
    // the opaque water: shallows (lighter, green-teal) along the shore, the body, darker depth patches — stepped through checkers
    bodyCol = new Int32Array(N.n);
    topAt = new Int32Array(TIDE_BOX.w * TIDE_BOX.h).fill(-1);
    for (let i = 0; i < N.n; i++) {
      const x = N.x[i];
      const y = N.y[i];
      topAt[(y - TIDE_BOX.y) * TIDE_BOX.w + (x - TIDE_BOX.x)] = i;
      const rim = N.rim[i];
      const chk = (x + y) % 2 === 0;
      const deep = vnoise(N.u[i] * 0.028, N.v[i] * 0.045, 5) * 0.75 + vnoise(N.u[i] * 0.07, N.v[i] * 0.1, 6) * 0.25;
      let c: Color;
      if (rim <= 8) c = PAL.cyan2;
      else if (rim <= 10) c = chk ? PAL.cyan2 : PAL.cyan1;
      else if (deep > 0.7) c = PAL.cyan0;
      else if (deep > 0.62) c = chk ? PAL.cyan1 : PAL.cyan0;
      else if (deep < 0.3) c = PAL.cyan2;
      else if (deep < 0.38) c = chk ? PAL.cyan2 : PAL.cyan1;
      else c = PAL.cyan1;
      // a few green-teal shallows patches near the shore
      if (rim <= 8 && vnoise(N.u[i] * 0.05, N.v[i] * 0.05, 8) > 0.6) c = chk || rim <= 5 ? PAL.teal2 : PAL.cyan2;
      bodyCol[i] = c;
    }
    // the wave strokes: spread over the open water (never at the shore), each with its own rhythm
    strokes = [];
    let seed = 1;
    const r = (): number => h01(seed++, 77);
    for (let tries = 0; tries < 4000 && strokes.length < 130; tries++) {
      const i = Math.floor(r() * N.n);
      if (N.rim[i] < 8) continue;
      if (strokes.some((q) => Math.abs(q.x - N.x[i]) < 16 && Math.abs(q.y - N.y[i]) < 5)) continue;
      strokes.push({ x: N.x[i], y: N.y[i], len: 9 + Math.floor(r() * 9), period: 2400 + r() * 2400, phase: r() * 5000, drift: 0.002 + r() * 0.002, white: r() < 0.35 });
    }
    hall = ctx.add(scene.add.rectangle(-WIDE_OX - 16, -40, 640 + WIDE_OX * 2 + 32, 440, PAL.cyan4).setOrigin(0).setDepth(TIDE_Z.hall).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false));
    for (const r of [water, light, air]) r.img.setVisible(false);
    for (let i = 0; i < 110; i++) {
      const img = ctx.add(scene.add.image(0, 0, TEX.px1).setOrigin(0).setDepth(TIDE_Z.air + 0.01).setVisible(false));
      parts.push({ img, alive: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, sway: 0, age: 0, life: 1, ramp: SPRAY });
    }
  };

  const spawn = (x: number, y: number, vx: number, vy: number, g: number, life: number, ramp: readonly Color[], sway = 0): void => {
    if (!motion) return;
    const p = parts.find((q) => !q.alive);
    if (!p) return;
    Object.assign(p, { alive: true, x, y, vx, vy, g, life, age: 0, ramp, sway });
    p.img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setTint(ramp[0]);
  };

  const pan = (x: number): number => Math.max(-1, Math.min(1, (x - 320) / 320));
  const sound = (name: Parameters<typeof sfx.play>[0], x: number, volume: number): void => {
    try {
      sfx.play(name, { pan: pan(x), volume });
    } catch {
      /* audio never breaks the arena */
    }
  };

  const hideAll = (): void => {
    for (const r of [water, light, air]) r?.img.setVisible(false);
    veil?.setVisible(false);
    body?.setVisible(false);
    hall?.setVisible(false);
    TIDE_STATE.level = 0;
    for (const p of parts) {
      p.alive = false;
      p.img.setVisible(false);
    }
    ripples.length = 0;
  };
  const clearLights = (ms: number): void => {
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l && l.alive) void l.fadeOut(ms);
      lights[i] = null;
    }
    curtainLit.clear();
  };

  const setOrigin = (from: PlayerId | null): void => {
    origin = from;
    o = tideOrigin(from);
    const N = net!;
    dist = new Float32Array(N.n);
    for (let i = 0; i < N.n; i++) dist[i] = tideDist(o, N.x[i], N.y[i]);
    most = tideMaxDist(from);
    curtainD = N.curtains.map((c) => tideDist(o, c.lip.x, c.lip.y));
  };

  // ---------------------------------------------------------------- painting

  const put = (d: Uint8ClampedArray, w: number, h: number, x: number, y: number, c: Color): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = (y * w + x) * 4;
    d[k] = (c >> 16) & 255;
    d[k + 1] = (c >> 8) & 255;
    d[k + 2] = c & 255;
    d[k + 3] = 255;
  };
  const add = (d: Uint8ClampedArray, w: number, h: number, x: number, y: number, c: readonly number[], k = 1): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const q = (y * w + x) * 4;
    d[q] = Math.min(255, d[q] + c[0] * k);
    d[q + 1] = Math.min(255, d[q + 1] + c[1] * k);
    d[q + 2] = Math.min(255, d[q + 2] + c[2] * k);
    d[q + 3] = 255;
  };

  /** Is the sheet over top pixel `i` now (and how far behind the front)? */
  const behind = (i: number): number => front - dist![i];

  function paintWaterAndLight(step: number): void {
    const N = net!;
    const W = water!;
    const L = light!;
    const wd = W.pc.data;
    const ld = L.pc.data;
    W.pc.clear();
    L.pc.clear();
    const bw = W.w;
    const bh = W.h;
    const ox = TIDE_BOX.x;
    const oy = TIDE_BOX.y;
    const tt = motion ? t : 0;
    const surging = mode === 'surge';
    const ebbing = mode === 'ebb';
    const glint = Math.floor(t / 90);
    // ---- the water (owner 2026-11-18: classic stylised pixel water — opaque flat bands, lapping shore foam, curved wave strokes)
    const bc = bodyCol!;
    for (let i = 0; i < N.n; i++) {
      const b = behind(i);
      if (b < 0) continue;
      const x = N.x[i];
      const y = N.y[i];
      const lx = x - ox;
      const ly = y - oy;
      // the front: a churning foam crest and a flare of light behind it
      if (surging || ebbing) {
        if (b < 4) {
          const n = vnoise(x * 0.35, y * 0.7 + tt * 0.01, 3);
          put(wd, bw, bh, lx, ly, n > 0.55 ? PAL.white : n > 0.3 ? PAL.cyan4 : PAL.cyan3);
          continue;
        }
        if (b < 8) {
          put(wd, bw, bh, lx, ly, (x + y + step) % 3 ? PAL.cyan3 : PAL.cyan4);
          continue;
        }
      }
      // the shore: foam laps in and out along the rim (a white line, a light edge), a second broken foam line further in
      const rim = N.rim[i];
      if (rim <= 9) {
        const lap = 2 + 1.6 * fsin(tt * 0.0022 + N.u[i] * 0.07 + N.v[i] * 0.035) + 0.8 * fsin(tt * 0.0031 - N.u[i] * 0.11);
        if (rim < lap - 0.5) {
          put(wd, bw, bh, lx, ly, PAL.white);
          continue;
        }
        if (rim < lap + 0.6) {
          put(wd, bw, bh, lx, ly, PAL.cyan4);
          continue;
        }
        const line2 = Math.round(lap + 3.5);
        if ((rim === line2 || (rim === line2 + 1 && (x + y) % 2 === 0)) && vnoise(x * 0.22 + tt * 0.0012, y * 0.5, 9) > 0.32) {
          put(wd, bw, bh, lx, ly, (x + Math.floor(tt / 160)) % 9 === 0 ? PAL.white : PAL.cyan3);
          continue;
        }
      }
      put(wd, bw, bh, lx, ly, bc[i]);
      // tiny sparkles on the open water
      if (motion && rim > 6 && h01(i, glint, 11) < 0.0009) {
        put(wd, bw, bh, lx, ly, PAL.white);
        if (h01(i, glint, 12) < 0.5) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) put(wd, bw, bh, lx + dx, ly + dy, PAL.cyan3);
      }
    }
    // ---- the wave strokes: short arched highlights that swell in, hold and fade, drifting slowly (each with a dark trough under it)
    if (strokes) {
      const at = topAt!;
      const wet = (x: number, y: number): boolean => {
        const xx = x - ox;
        const yy = y - oy;
        if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) return false;
        const i = at[yy * bw + xx];
        return i >= 0 && N.rim[i] > 4 && behind(i) > 10;
      };
      for (const st of strokes) {
        const ph = (((tt + st.phase) % st.period) + st.period) % st.period / st.period;
        const env = Math.sin(ph * Math.PI);
        if (env < 0.12) continue;
        const h = Math.max(1, Math.round((st.len / 2) * Math.min(1, env * 1.25)));
        const cx = Math.round(st.x + ((tt * st.drift) % 24));
        const cy = st.y;
        for (let k = -h; k <= h; k++) {
          const x = cx + k;
          const arch = Math.abs(k) <= h * 0.45 ? 1 : 0;
          const y = cy - arch;
          if (!wet(x, y)) continue;
          const core = Math.abs(k) <= h * 0.35;
          put(wd, bw, bh, x - ox, y - oy, core && env > 0.7 && st.white ? PAL.white : core ? PAL.cyan4 : Math.abs(k) < h ? PAL.cyan3 : PAL.cyan2);
          // the trough: a darker line under the middle of the stroke
          if (env > 0.45 && Math.abs(k) < h - 1 && wet(x, y + 1)) put(wd, bw, bh, x - ox, y + 1 - oy, PAL.cyan0);
        }
      }
    }
    // ---- rain-drop ripples
    for (const r of ripples) {
      const k = (t - r.born) / (r.big ? 900 : 650);
      if (k >= 1) continue;
      const rx = 1 + k * (r.big ? 12 : 8);
      const ry = rx / 2;
      const tone = k < 0.3 ? PAL.cyan4 : k < 0.65 ? PAL.teal4 : PAL.teal3;
      const n = Math.max(8, Math.round(rx * 5));
      for (let a = 0; a < n; a++) {
        if (k > 0.6 && a % 2) continue;
        const th = (a / n) * Math.PI * 2;
        put(wd, bw, bh, Math.round(r.x + Math.cos(th) * rx) - ox, Math.round(r.y + Math.sin(th) * ry) - oy, tone);
      }
      if (k < 0.15) put(wd, bw, bh, r.x - ox, r.y - oy, PAL.white);
    }
    // ---- the cascades + their pools
    N.curtains.forEach((cu, k) => {
      const reach = (front - curtainD[k]) * 1.25; // how far down the wall the water has run
      if (reach <= 0) return;
      const cut = ebbing ? (1 - Math.max(0, front) / Math.max(1, most)) * 70 - 8 : -99; // the ebb stops it from the top
      const hc = h01(k, 5) * 9;
      for (let c = 0; c < cu.w; c++) {
        const x = cu.x0 + c;
        const edge = c === 0 || c === cu.w - 1;
        const edge2 = c === 1 || c === cu.w - 2;
        const lipBulge = Math.round(fsin(c * 0.6 + tt * 0.006) * 0.8);
        for (let y = cu.top[c] - 2 + lipBulge; y <= cu.bot[c]; y++) {
          const ry = y - cu.top[c];
          if (ry > reach) break;
          if (ry < cut) continue;
          let tone: Color | null;
          if (ry < 1) tone = edge ? PAL.teal3 : (c + step) % 3 ? PAL.white : PAL.cyan4;
          else {
            // stylised: flat bands across the whole fall, bowed a little (the sheet curves over the lip), sliding down
            const bow = Math.sin((c / Math.max(1, cu.w - 1)) * Math.PI) * 2.5;
            const ph = (((y - tt * 0.065 - bow + hc) % 10) + 10) % 10;
            if (edge) tone = PAL.cyan0;
            else if (edge2) tone = ph < 2 ? PAL.cyan2 : PAL.cyan1;
            else tone = ph < 1.5 ? PAL.cyan4 : ph < 3.5 ? PAL.cyan3 : ph < 6.5 ? PAL.cyan2 : PAL.cyan1;
            // the head of a cascade still falling: a bright foamy front
            if (reach < cu.bot[c] - cu.top[c] && ry > reach - 3) tone = (x + step) % 2 ? PAL.white : PAL.cyan4;
          }
          if (tone !== null) put(wd, bw, bh, x - ox, y - oy, tone);
          if (!edge && ry > 0 && tone !== null && (tone === PAL.white || tone === PAL.cyan4)) add(ld, bw, bh, x - ox, y - oy, LIGHT.low);
        }
      }
      // the foam pool at the foot (once the water has reached it)
      if (reach >= FACE_FULL && !(ebbing && front < curtainD[k] * 0.5)) {
        const p = cu.pool;
        for (let y = Math.floor(p.cy - p.ry - 1); y <= p.cy + p.ry + 1; y++)
          for (let x = Math.floor(p.cx - p.rx - 1); x <= p.cx + p.rx + 1; x++) {
            const r = Math.hypot((x + 0.5 - p.cx) / p.rx, (y + 0.5 - p.cy) / p.ry);
            if (r > 1) continue;
            const n = vnoise((x + tt * 0.006) * 0.45, (y - tt * 0.004) * 0.9, 13 + k);
            const tone = r > 0.86 ? ((x + y + step) % 2 ? PAL.teal2 : PAL.teal3) : n > 0.62 ? PAL.white : n > 0.42 ? PAL.cyan4 : n > 0.25 ? PAL.teal3 : PAL.teal2;
            put(wd, bw, bh, x - ox, y - oy, tone);
            if (n > 0.5) add(ld, bw, bh, x - ox, y - oy, LIGHT.mid);
          }
      }
    });
    W.end();
    L.end();
  }

  /** The spout at the seal while the surge starts (air raster) + its splash ring. */
  function paintAir(): void {
    const A = air!;
    const d = A.pc.data;
    A.pc.clear();
    const bw = A.w;
    const bh = A.h;
    const ox = TIDE_BOX.x;
    const oy = TIDE_BOX.y - AIR_UP;
    if (mode === 'surge') {
      const a = t - modeAt;
      const fr = Math.floor(t / 33);
      if (a < 820) {
        const peak = 52;
        const hgt = a < 180 ? peak * (1 - (1 - a / 180) ** 3) * 1.06 : a < 420 ? peak * (1.0 + fsin(a / 30) * 0.05) : peak * Math.max(0, 1 - ((a - 420) / 400) ** 1.4);
        const thin = a < 420 ? 1 : Math.max(0.3, 1 - (a - 420) / 450);
        const top = Math.round(o.y - hgt);
        for (let y = Math.round(o.y); y >= top; y--) {
          const k = (o.y - y) / Math.max(1, hgt);
          const half = Math.max(1, Math.round((8 - k * 4.5) * thin));
          const wob = Math.round(fsin(y * 0.4 + fr * 0.8) * (0.5 + k * 1.8));
          for (let dx = -half - 1; dx <= half + 1; dx++) {
            const e = Math.abs(dx) / (half + 1);
            let tone: Color;
            if (e > 0.95) tone = (y + fr) % 2 ? PAL.teal2 : PAL.cyan2;
            else if (e > 0.72) tone = PAL.teal3;
            else if (e > 0.45) tone = PAL.cyan4;
            else tone = PAL.white;
            if (e <= 0.72 && ((o.y - y) + fr * 3 + dx * 5) % 9 === 0) tone = PAL.teal3;
            put(d, bw, bh, Math.round(o.x) + dx + wob - ox, y - oy, tone);
          }
        }
        // the crown: spray tongues
        if (hgt > 6)
          for (let j = 0; j < 7; j++) {
            const tx = Math.round(o.x) + Math.round((j - 3) * 2.8) + (fr % 2);
            const th = 2 + ((fr * 5 + j * 7) % 7);
            for (let q = 0; q < th; q++) if ((q + j + fr) % 3) put(d, bw, bh, tx - ox, top - q - oy, q < th * 0.5 ? PAL.white : PAL.cyan4);
          }
      }
      // the splash ring rolling out over the floor
      if (a > 120 && a < 760) {
        const k = (a - 120) / 640;
        const rx = 10 + k * 46;
        const tone = k < 0.3 ? PAL.white : k < 0.6 ? PAL.cyan4 : PAL.teal3;
        for (let q = 0; q < 90; q++) {
          if (k > 0.55 && (q + fr) % 3 === 0) continue;
          const th = (q / 90) * Math.PI * 2;
          const x = Math.round(o.x + Math.cos(th) * rx);
          const y = Math.round(o.y + Math.sin(th) * rx * 0.5);
          put(d, bw, bh, x - ox, y - oy, tone);
          if (k < 0.5) put(d, bw, bh, x - ox, y - 1 - oy, PAL.teal4);
        }
      }
    }
    A.end();
  }

  // ---------------------------------------------------------------- life

  function life(): void {
    const N = net!;
    if (!motion) return;
    const wet = mode === 'on' || mode === 'surge';
    // rain-drop ripples
    if (wet && t >= nextRipple) {
      nextRipple = t + 140 + h01(Math.floor(t), 3) * 260;
      const i = Math.floor(h01(Math.floor(t), 4) * N.n);
      if (behind(i) > 10 && N.rim[i] > 3) ripples.push({ x: N.x[i], y: N.y[i], born: t, big: h01(i, 9) < 0.25 });
    }
    for (let j = ripples.length - 1; j >= 0; j--) if (t - ripples[j].born > 950) ripples.splice(j, 1);
    // spray + mist off the pools, drops off the lips
    if (t >= nextSpray) {
      nextSpray = t + 45;
      N.curtains.forEach((cu, k) => {
        const reach = (front - curtainD[k]) * 1.25;
        if (reach < FACE_FULL || mode === 'ebb') return;
        const p = cu.pool;
        const r = h01(k, Math.floor(t), 1);
        spawn(p.cx + (r - 0.5) * p.rx * 1.6, p.cy - 1, (h01(k, Math.floor(t), 2) - 0.5) * 40, -30 - h01(k, Math.floor(t), 3) * 50, 190, 380 + r * 260, SPRAY);
        if (h01(k, Math.floor(t), 5) < 0.3) spawn(p.cx + (r - 0.5) * p.rx * 2, p.cy - 3, (h01(k, 6, Math.floor(t)) - 0.5) * 8, -8 - r * 8, -2, 1400 + r * 700, MIST, 4);
      });
    }
    if (wet && t >= nextDrop) {
      nextDrop = t + 120;
      const k = Math.floor(h01(Math.floor(t), 21) * N.curtains.length);
      const cu = N.curtains[k];
      if (cu && front - curtainD[k] > 30) {
        const c = Math.floor(h01(Math.floor(t), 22) * cu.w);
        spawn(cu.x0 + c, cu.top[c] - 1, (h01(Math.floor(t), 23) - 0.3) * 18, -10 - h01(Math.floor(t), 24) * 16, 260, 420, SPRAY);
      }
    }
  }

  function moveParticles(dt: number): void {
    const s = dt / 1000;
    for (const p of parts) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        p.img.setVisible(false);
        continue;
      }
      p.vy += p.g * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      const k = p.age / p.life;
      const sx = p.sway ? Math.sin(p.age / 300 + p.life) * p.sway * k : 0;
      p.img.setPosition(Math.round(p.x + sx), Math.round(p.y)).setTint(p.ramp[Math.min(p.ramp.length - 1, Math.floor(k * p.ramp.length))]);
    }
  }

  // ---------------------------------------------------------------- frame

  function frame(dt: number): void {
    if (!net || mode === 'off') return;
    const age = t - modeAt;
    let level = 1;
    if (mode === 'surge') {
      const k = Math.max(0, Math.min(1, (age - SPOUT_MS) / SURGE_MS));
      front = age < SPOUT_MS ? -1 : most * Math.sin((k * Math.PI) / 2) + (k >= 1 ? 80 : 0);
      level = k;
      // the cascades light the hall floor as they arrive, with a splash
      net.curtains.forEach((cu, i) => {
        if (curtainLit.has(i) || (front - curtainD[i]) * 1.25 < FACE_FULL) return;
        curtainLit.add(i);
        lights[i] = lightPool(scene, cu.pool.cx, cu.pool.cy, { color: PAL.cyan3, spill: PAL.teal1, radius: 26, floorY: cu.pool.cy, intensity: 0.8, anim: 'caustic', fadeIn: 260 });
        sound('tideSplash', cu.pool.cx, 0.5);
        for (let j = 0; j < 8; j++) spawn(cu.pool.cx + (h01(i, j) - 0.5) * cu.pool.rx * 2, cu.pool.cy - 1, (h01(i, j, 2) - 0.5) * 60, -50 - h01(i, j, 3) * 50, 200, 420, SPRAY);
      });
      if (age >= SPOUT_MS + SURGE_MS + 260) {
        mode = 'on';
        modeAt = t;
        front = most + 80;
        resolveMode?.();
        resolveMode = null;
      }
    } else if (mode === 'ebb') {
      const k = Math.min(1, age / EBB_MS);
      front = (most + 80) * (1 - Math.sin((k * Math.PI) / 2) ** 0.8) - 6;
      level = 1 - k;
      if (k >= 1) {
        mode = 'off';
        hideAll();
        resolveMode?.();
        resolveMode = null;
        return;
      }
    }
    const notch = Math.round(Math.max(0, Math.min(1, level)) * 8) / 8;
    // the stylised water is opaque (drawn in the water raster under the front): the old translucent veil / body stay off
    veil!.setVisible(false);
    body!.setVisible(false);
    void BODY_ALPHA;
    TIDE_STATE.level = notch;
    TIDE_STATE.t = t;
    hall!.setVisible(notch > 0).setAlpha(notch * 0.3);
    moveParticles(dt);
    const st = Math.floor(t / STEP_MS);
    if (st === lastStep) return;
    lastStep = st;
    life();
    paintWaterAndLight(st);
    paintAir();
  }

  // ---------------------------------------------------------------- the switch

  function setTide(want: boolean, animate: boolean, from: PlayerId | null): Promise<void> {
    const my = ++token;
    resolveMode?.();
    resolveMode = null;
    if (want) {
      ensure();
      const already = on && mode !== 'ebb';
      on = true;
      if (origin !== from || !dist) setOrigin(from);
      for (const r of [water!, light!, air!]) r.img.setVisible(true);
      lastStep = -1;
      if (!animate || already) {
        mode = 'on';
        modeAt = t;
        front = most + 80;
        net!.curtains.forEach((cu, i) => {
          if (curtainLit.has(i)) return;
          curtainLit.add(i);
          lights[i] = lightPool(scene, cu.pool.cx, cu.pool.cy, { color: PAL.cyan3, spill: PAL.teal1, radius: 26, floorY: cu.pool.cy, intensity: 0.8, anim: 'caustic', fadeIn: animate ? 200 : 0 });
        });
        return Promise.resolve();
      }
      clearLights(0);
      mode = 'surge';
      modeAt = t;
      front = -1;
      void shake(scene, 700, 1);
      void lightFlash(scene, o.x, o.y - 14, PAL.cyan4, 70, 700, { floorY: o.y, intensity: 1.3, ring: true });
      sound('tideSurge', o.x, 0.95);
      // the spout's spray
      for (let j = 0; j < 18; j++) {
        const side = j % 2 ? 1 : -1;
        const delay = 120 + j * 14;
        scene.time.delayedCall(delay, () => mode === 'surge' && spawn(o.x + side * h01(j, 1) * 5, o.y - 30 - h01(j, 2) * 20, side * (20 + h01(j, 3) * 60), -50 - h01(j, 4) * 70, 260, 520 + h01(j, 5) * 300, SPRAY));
      }
      return new Promise<void>((r) => (resolveMode = () => my === token && r()));
    }
    if (!on) return Promise.resolve();
    on = false;
    if (!animate || !net) {
      mode = 'off';
      hideAll();
      clearLights(0);
      return Promise.resolve();
    }
    mode = 'ebb';
    modeAt = t;
    front = most + 80;
    clearLights(700);
    sound('tideEbb', o.x, 0.8);
    return new Promise<void>((r) => (resolveMode = () => my === token && r()));
  }

  return {
    name: 'tide',
    owner: 'C',
    get on() {
      return on;
    },
    setTide,
    tick(dt) {
      t += dt;
      frame(dt);
    },
    destroy() {
      resolveMode?.();
      resolveMode = null;
      clearLights(0);
      water?.destroy();
      light?.destroy();
      air?.destroy();
      water = light = air = null;
      net = null;
    },
  };
}

/** A cascade counts as having reached the hall floor once it has run this far down its wall. */
const FACE_FULL = 44;
