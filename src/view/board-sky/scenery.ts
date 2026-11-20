// Sky Temple — the scenery of the duel board: the sunset sky (and the starry dusk above the frame for the opening's
// descent), six drifting cloud banks, floating islands, the two banner pillars, the prism with its two beams, floating
// crystals and the sandstone board itself (src/art/arena-sky). Everything that can move does: the cloud banks drift on
// slow parallax, the prism bobs and its beams breathe, crystals float, stars twinkle, birds cross the sun now and then.
//
// The art is painted at K = 2 density and drawn at 1/2 scale on the hi-res canvas (HIRES 2, src/view/hires.ts). On a 1×
// canvas (a networked duel that forces this arena on a page booted for the Neon Tower) every texture is box-filtered
// down to 1× once and drawn at scale 1 — softer, but whole.

import Phaser from 'phaser';
import { PixelCanvas } from '../../art/pixel';
import { CLOUD_LAYERS, SKY_X0, paintClouds, paintSky, skyColorAt } from '../../art/arena-sky/backdrop';
import { K, SKY_BOARD2, paintSkyBoard2 } from '../../art/arena-sky/board2';
import { SKY as SK } from '../../art/arena-sky/kit';
import { paintBeams, paintCrystal, paintGlow, paintIsland2, paintPillar2, paintSparkles } from '../../art/arena-sky/props';
import { UPPER_H, paintUpperSky } from '../../art/arena-sky/upper';
import { DEPTH } from '../layout';
import { HIRES } from '../hires';
import { REDUCED_MOTION } from '../v3/motion';

type Img = Phaser.GameObjects.Image;

/** Depths: the whole sky under the stage (PLATFORM 20); the board AT it; the floating crystals just over its walls. */
export const SKY_Z = {
  upper: DEPTH.SKY,
  sky: DEPTH.SKY + 0.1,
  board: DEPTH.PLATFORM,
  crystals: DEPTH.PLATFORM + 0.5,
} as const;

/** Game px per art px of a texture as it is drawn (K-density art on a K× canvas; 1× art on a 1× canvas). */
const ART = HIRES >= K ? 1 / K : 1;

/** 2×2 box filter (a 1× canvas): the mean of the opaque pixels, opaque where at least two were. */
export function halve(src: PixelCanvas): PixelCanvas {
  const w = Math.ceil(src.w / 2);
  const h = Math.ceil(src.h / 2);
  const out = new PixelCanvas(w, h);
  const s = src.data;
  const d = out.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const sx = x * 2 + i;
          const sy = y * 2 + j;
          if (sx >= src.w || sy >= src.h) continue;
          const o = (sy * src.w + sx) * 4;
          if (!s[o + 3]) continue;
          r += s[o];
          g += s[o + 1];
          b += s[o + 2];
          n++;
        }
      if (n < 2) continue;
      const o = (y * w + x) * 4;
      d[o] = Math.round(r / n);
      d[o + 1] = Math.round(g / n);
      d[o + 2] = Math.round(b / n);
      d[o + 3] = 255;
    }
  return out;
}

/** The texture key of a K-density painter for this canvas (made once per game, shared by every scene). */
export function skyTexture(scene: Phaser.Scene, key: string, paint: () => PixelCanvas): string {
  const k = ART === 1 && K > 1 ? `${key}:1x` : key;
  if (!scene.textures.exists(k)) {
    const t0 = performance.now();
    const pc = ART === 1 && K > 1 ? halve(paint()) : paint();
    scene.textures.addCanvas(k, pc.toCanvas());
    const ms = performance.now() - t0;
    if (ms > 60) console.log(`[sky] painted ${k} in ${Math.round(ms)} ms`);
  }
  return k;
}

/** Every Sky Temple texture the duel board uses: [key, painter] (the boot / warm-up can paint them ahead of time). */
export function skyTextureList(): [string, () => PixelCanvas][] {
  const list: [string, () => PixelCanvas][] = [
    ['sky2:upper', paintUpperSky],
    ['sky2:sky', paintSky],
    ...CLOUD_LAYERS.map((_, i): [string, () => PixelCanvas] => [`sky2:clouds:${i}`, () => paintClouds(i)]),
    ...ISLANDS.map(([x, y, k, hz], n): [string, () => PixelCanvas] => [`sky2:isl:${n}`, () => paintIsland2(k, hz, skyColorAt(x, Math.min(y + 40, 150)))]),
    ['sky2:sparkles', paintSparkles],
    ['sky2:beams', () => paintBeams(PRISM.x, PRISM.y + 30, { x: 120, y: -40 }, { x: 520, y: -40 })],
    ['sky2:prismglow', () => paintGlow(52, SK.crystalViolet)],
    ['sky2:prism', () => paintCrystal(22, 74, SK.crystalViolet)],
    ['sky2:pillar:0', () => paintPillar2(0)],
    ['sky2:pillar:1', () => paintPillar2(1)],
    ['sky2:pglow:0', () => paintGlow(18, SK.crystalCyan)],
    ['sky2:pglow:1', () => paintGlow(18, SK.crystalPink)],
    ...CRYSTALS.map(([, , r], n): [string, () => PixelCanvas] => [`sky2:fc:${n}`, () => paintCrystal(4 + (n % 3), 16 + (n % 2) * 6, [SK.crystalCyan, SK.crystalViolet, SK.crystalPink][r])]),
    ['sky2:board', paintSkyBoard2],
  ];
  return list;
}

/** Islands: x, y (top centre), kind, haze, depth (far → near) — the arena-sky lane's composition (?dev=skytemple). */
const ISLANDS: readonly (readonly [number, number, number, number, number])[] = [
  [430, 96, 1, 0.55, 0.12],
  [560, 104, 3, 0.5, 0.12],
  [250, 80, 0, 0.42, 0.2],
  [650, 70, 2, 0.35, 0.2],
  [-20, 92, 3, 0.3, 0.3],
  [690, 186, 0, 0.12, 1.6],
  [-40, 196, 2, 0.12, 1.6],
  [-24, 300, 0, 0, 4.95],
  [676, 296, 1, 0, 4.95],
];
const PRISM = { x: 318, y: 2 } as const;
/** Floating crystals round the board: x, y, ramp (cyan / violet / pink). */
const CRYSTALS: readonly (readonly [number, number, number])[] = [
  [96, 196, 0],
  [152, 300, 1],
  [548, 214, 2],
  [600, 300, 0],
  [20, 176, 2],
  [634, 196, 1],
];

interface Floater {
  img: Img;
  x: number;
  y: number;
  /** amplitude (game px) and period (ms) of the bob / sway, phase */
  ax: number;
  ay: number;
  period: number;
  phase: number;
}

interface Twinkle {
  img: Img;
  born: number;
  life: number;
}

interface Bird {
  img: Img;
  x: number;
  y: number;
  vx: number;
  phase: number;
}

/** Half a game px: the finest step on the K× canvas (whole px on a 1× canvas). */
const snap = (v: number): number => (ART < 1 ? Math.round(v * 2) / 2 : Math.round(v));

export class SkyScenery {
  readonly scene: Phaser.Scene;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly floaters: Floater[] = [];
  private readonly twinkles: Twinkle[] = [];
  private readonly birds: Bird[] = [];
  private prismGlow!: Img;
  private beams!: Img;
  private pillarGlow: Img[] = [];
  private nextTwinkle = 400;
  private nextFlock = 2500;
  private rnd = 0x5eed;
  /** The sky's dusk veil (the intro: lights off = dusk, on = the evening sun comes out). */
  private dusk: Phaser.GameObjects.Rectangle;
  /** Multiply tint over sky + board for the field spells (Volcano: ember red; Tidal Bay: cool sea light). */
  readonly tint: Phaser.GameObjects.Rectangle;
  readonly board: Img;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const tex = (key: string): string => {
      const e = skyTextureList().find(([k]) => k === key);
      return skyTexture(scene, key, e ? e[1] : () => new PixelCanvas(1, 1));
    };
    const img = (key: string, x: number, y: number, depth: number, scale = 1): Img => this.add(scene.add.image(x, y, tex(key)).setOrigin(0).setScale(ART * scale).setDepth(depth));

    // the sky: the dusk above the frame (the opening descends through it), the sunset, a band of ink far below
    img('sky2:upper', SKY_X0, -UPPER_H, SKY_Z.upper);
    img('sky2:sky', SKY_X0, 0, SKY_Z.sky);
    // cloud banks (far → near), each drifting on its own slow sway
    CLOUD_LAYERS.forEach((_, i) => {
      const front = i === CLOUD_LAYERS.length - 1;
      const c = img(`sky2:clouds:${i}`, SKY_X0, 0, front ? 4.9 : 1 + i * 0.1);
      this.floaters.push({ img: c, x: SKY_X0, y: 0, ax: 1.5 + i * 0.9, ay: 0, period: 26000 - i * 2600, phase: i * 1.7 });
    });
    // islands: far ones hazed into the sky, between the cloud banks; each floats a little
    ISLANDS.forEach(([x, y, , , dp], n) => {
      const sc = dp < 0.25 ? 0.45 : dp < 1 ? 0.6 : dp < 2 ? 0.8 : 1;
      const im = this.add(scene.add.image(x, y - 56 * sc, tex(`sky2:isl:${n}`)).setOrigin(0.5, 0).setScale(ART * sc).setDepth(dp));
      this.floaters.push({ img: im, x, y: y - 56 * sc, ax: 0, ay: 0.5 + sc, period: 5200 + n * 610, phase: n * 2.1 });
    });
    img('sky2:sparkles', -80, 0, 1.9);
    // the prism, its halo and its two beams (cyan to the near side, crimson to the far side)
    this.beams = img('sky2:beams', -80, 0, 1.95).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
    this.prismGlow = this.add(scene.add.image(PRISM.x, PRISM.y + 34, tex('sky2:prismglow')).setScale(ART).setDepth(5.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.75));
    const prism = this.add(scene.add.image(PRISM.x, PRISM.y, tex('sky2:prism')).setOrigin(0.5, 0).setScale(ART).setDepth(5.7));
    this.floaters.push({ img: prism, x: PRISM.x, y: PRISM.y, ax: 0, ay: 2, period: 4200, phase: 0 });
    this.floaters.push({ img: this.prismGlow, x: PRISM.x, y: PRISM.y + 34, ax: 0, ay: 2, period: 4200, phase: 0 });
    // the banner pillars and the glow of their crystal crowns
    ([[34, -10, 0], [606, -10, 1]] as const).forEach(([x, y, sd]) => {
      this.add(scene.add.image(x, y, tex(`sky2:pillar:${sd}`)).setOrigin(0.5, 0).setScale(ART).setDepth(5));
      this.pillarGlow.push(this.add(scene.add.image(x, y + 16, tex(`sky2:pglow:${sd}`)).setScale(ART).setDepth(5.1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7)));
    });
    // floating crystals round the board
    CRYSTALS.forEach(([x, y], n) => {
      const c = this.add(scene.add.image(x, y, tex(`sky2:fc:${n}`)).setScale(ART).setDepth(SKY_Z.crystals));
      this.floaters.push({ img: c, x, y, ax: 0, ay: 2 + (n % 3) * 0.5, period: 2600 + n * 370, phase: n * 1.3 });
    });
    // the board
    this.board = img('sky2:board', SKY_BOARD2.x, SKY_BOARD2.y, SKY_Z.board);
    // twinkles + birds: tiny 1× sprites (made once)
    ensureSmallTextures(scene);
    for (let i = 0; i < 8; i++) this.twinkles.push({ img: this.add(scene.add.image(0, 0, 'sky:tw:0').setDepth(1.92).setVisible(false)), born: -1, life: 0 });
    for (let i = 0; i < 4; i++) this.birds.push({ img: this.add(scene.add.image(0, 0, 'sky:bird:0').setDepth(1.93).setVisible(false)), x: 0, y: 0, vx: 0, phase: 0 });
    // veils (over sky and board, under the cards / units / HUD)
    this.tint = this.add(scene.add.rectangle(-200, -UPPER_H - 20, 1040, UPPER_H + 420, 0xffffff).setOrigin(0).setDepth(DEPTH.PLATFORM + 0.9).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false));
    this.dusk = this.add(scene.add.rectangle(-200, -UPPER_H - 20, 1040, UPPER_H + 420, 0x2a1c5a).setOrigin(0).setDepth(DEPTH.PLATFORM + 0.95).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false));
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private rand(): number {
    this.rnd = (this.rnd + 0x6d2b79f5) >>> 0;
    let t = this.rnd;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Lights off: dusk (a violet multiply over the whole arena); on: the evening sun comes back out. */
  setDusk(on: boolean, ms: number): Promise<void> {
    const v = this.dusk;
    this.scene.tweens.killTweensOf(v);
    if (ms <= 0) {
      v.setVisible(on).setAlpha(on ? 1 : 0);
      return Promise.resolve();
    }
    v.setVisible(true);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: v,
        alpha: on ? 1 : 0,
        duration: ms,
        ease: 'Sine.InOut',
        onComplete: () => {
          v.setVisible(on);
          resolve();
        },
      });
    });
  }

  tick(t: number): void {
    const motion = !REDUCED_MOTION;
    for (const f of this.floaters) {
      const k = motion ? Math.sin((t / f.period) * Math.PI * 2 + f.phase) : 0;
      f.img.setPosition(snap(f.x + k * f.ax), snap(f.y + k * f.ay));
    }
    this.beams.setAlpha(0.44 + 0.08 * Math.sin(t / 1900));
    this.prismGlow.setAlpha(0.66 + 0.12 * Math.sin(t / 700));
    this.pillarGlow.forEach((g, i) => g.setAlpha(0.6 + 0.12 * Math.sin(t / 900 + i * 2)));
    if (!motion) return;
    // twinkles: a star swells and fades somewhere in the upper sky
    if (t >= this.nextTwinkle) {
      this.nextTwinkle = t + 260 + this.rand() * 520;
      const tw = this.twinkles.find((q) => q.born < 0);
      if (tw) {
        tw.born = t;
        tw.life = 700 + this.rand() * 500;
        const x = -60 + this.rand() * 760;
        const y = this.rand() < 0.75 ? 4 + this.rand() * 90 : -UPPER_H + this.rand() * (UPPER_H - 10);
        tw.img.setPosition(Math.round(x), Math.round(y)).setTint([SK.crystalCyan[5], SK.crystalPink[5], SK.gold[6], 0xffffff][Math.floor(this.rand() * 4)]).setVisible(true);
      }
    }
    for (const tw of this.twinkles) {
      if (tw.born < 0) continue;
      const k = (t - tw.born) / tw.life;
      if (k >= 1) {
        tw.born = -1;
        tw.img.setVisible(false);
        continue;
      }
      const f = k < 0.25 ? 0 : k < 0.45 ? 1 : k < 0.65 ? 2 : k < 0.85 ? 1 : 0;
      tw.img.setTexture(`sky:tw:${f}`);
    }
    // birds: a small flock crosses the sunset now and then, flapping
    if (t >= this.nextFlock && this.birds.every((b) => !b.img.visible)) {
      this.nextFlock = t + 14000 + this.rand() * 12000;
      const ltr = this.rand() < 0.5;
      const y0 = 30 + this.rand() * 50;
      this.birds.forEach((b, i) => {
        b.x = ltr ? -90 - i * 14 - this.rand() * 8 : 730 + i * 14 + this.rand() * 8;
        b.y = y0 + (i % 2) * 6 + this.rand() * 4;
        b.vx = (ltr ? 1 : -1) * (0.018 + this.rand() * 0.004);
        b.phase = this.rand() * 6;
        b.img.setVisible(true).setFlipX(!ltr);
      });
      this.lastT = t;
    }
    const dt = Math.min(50, t - this.lastT);
    this.lastT = t;
    for (const b of this.birds) {
      if (!b.img.visible) continue;
      b.x += b.vx * dt;
      if (b.x < -120 || b.x > 760) {
        b.img.setVisible(false);
        continue;
      }
      const flap = Math.floor((t / 130 + b.phase) % 3);
      b.img.setTexture(`sky:bird:${flap}`).setPosition(Math.round(b.x), Math.round(b.y + Math.sin(t / 600 + b.phase) * 1.5));
    }
  }
  private lastT = 0;

  destroy(): void {
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
  }
}

/** Twinkle frames (a 4-point star growing) and the bird's three flap frames — white, tinted at run time; 1× pixels. */
function ensureSmallTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('sky:bird:2')) return;
  const tw = [1, 2, 3];
  tw.forEach((r, f) => {
    const p = new PixelCanvas(7, 7);
    for (let k = -r; k <= r; k++) {
      p.set(3 + k, 3, 0xffffff);
      p.set(3, 3 + k, 0xffffff);
    }
    if (r === 3) {
      p.set(2, 2, 0xc8c8d8);
      p.set(4, 2, 0xc8c8d8);
      p.set(2, 4, 0xc8c8d8);
      p.set(4, 4, 0xc8c8d8);
    }
    scene.textures.addCanvas(`sky:tw:${f}`, p.toCanvas());
  });
  const INK = 0x3a2648;
  const birds = [
    // wings up, level, down
    ['x...x', '.x.x.', '..x..'],
    ['.....', 'xx.xx', '..x..'],
    ['.....', '..x..', 'x.x.x', '.x.x.'],
  ];
  birds.forEach((rows, f) => {
    const p = new PixelCanvas(5, 4);
    rows.forEach((r, y) => [...r].forEach((ch, x) => ch === 'x' && p.set(x, y, INK)));
    scene.textures.addCanvas(`sky:bird:${f}`, p.toCanvas());
  });
}
