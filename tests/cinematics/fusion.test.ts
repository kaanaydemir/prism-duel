// The fusion cinematic (Prism Fusion → Trinity Crystal Wyrm; docs/v3/FUSION_STORYBOARD.md): its hooks outrank the
// placeholder, its sound set plays cleanly through the real synth Voice (on a recording fake context), the helix strand
// keeps its trail bounded, and the Trinity's v3 cut-in portrait draws its three heads. Levels / clipping are measured
// on real WebAudio: npx vite-node tools/sfx-render.ts -- --match '^(fusion|trinity)'.

import { afterAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as { __NEON_LOOK?: string }).__NEON_LOOK = 'v3';
});
vi.mock('phaser', async () => (await import('../presentation/_phaser-stub')).phaserStub());

import { FUSION_SUSTAINED, V3_FUSION_RECIPES, type FusionSfxName } from '../../src/audio/v3/fusion';
import { RECIPES, type Recipe } from '../../src/audio/sounds';
import { Voice } from '../../src/audio/synth';

afterAll(() => {
  delete (globalThis as { __NEON_LOOK?: string }).__NEON_LOOK;
});

// ---------------------------------------------------------------- a recording fake context (as tests/audio/a5-sounds)

class FakeParam {
  value = 0;
  readonly events: [string, number, number][] = [];
  private ok(v: number, t: number, op: string): void {
    if (!Number.isFinite(v)) throw new Error(`${op}: non-finite value ${v}`);
    if (!Number.isFinite(t) || t < 0) throw new Error(`${op}: bad time ${t}`);
    this.events.push([op, v, t]);
  }
  setValueAtTime(v: number, t: number): this {
    this.ok(v, t, 'set');
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.ok(v, t, 'lin');
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    if (v === 0) throw new RangeError('exponential ramp to 0');
    this.ok(v, t, 'exp');
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    this.ok(v, t, 'target');
    return this;
  }
  setValueCurveAtTime(curve: ArrayLike<number>, t: number): this {
    for (let i = 0; i < curve.length; i++) this.ok(curve[i], t, 'curve');
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}
class FakeNode {
  connect<T>(to: T): T {
    if (!to) throw new Error('connect to nothing');
    return to;
  }
  disconnect(): void {}
}
(globalThis as { AudioParam?: unknown }).AudioParam = FakeParam;

function fakeCtx(srcs: { start: number; stop: number }[]): BaseAudioContext {
  const P = () => new FakeParam();
  const src = <T extends object>(extra: T) => {
    const rec = { start: NaN, stop: NaN };
    srcs.push(rec);
    return Object.assign(new FakeNode(), extra, {
      start(t = 0) {
        if (!Number.isFinite(t) || t < 0) throw new Error(`start at ${t}`);
        rec.start = t;
      },
      stop(t = 0) {
        if (!Number.isFinite(t) || t < rec.start) throw new Error(`stop at ${t}`);
        rec.stop = t;
      },
    });
  };
  return {
    sampleRate: 8000,
    currentTime: 0,
    destination: new FakeNode(),
    createGain: () => Object.assign(new FakeNode(), { gain: P() }),
    createOscillator: () => src({ frequency: P(), detune: P(), type: 'sine', setPeriodicWave() {} }),
    createBufferSource: () => src({ buffer: null, loop: false, playbackRate: P(), detune: P() }),
    createBiquadFilter: () => Object.assign(new FakeNode(), { type: 'lowpass', frequency: P(), Q: P(), gain: P(), detune: P() }),
    createWaveShaper: () => Object.assign(new FakeNode(), { curve: null, oversample: 'none' }),
    createStereoPanner: () => Object.assign(new FakeNode(), { pan: P() }),
    createDelay: () => Object.assign(new FakeNode(), { delayTime: P() }),
    createPeriodicWave: () => ({}),
    createBuffer: (ch: number, len: number, sr: number) => ({ numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: () => new Float32Array(len) }),
  } as unknown as BaseAudioContext;
}

function playOnce(r: Recipe, pm = 1): { srcs: { start: number; stop: number }[]; voice: Voice } {
  const srcs: { start: number; stop: number }[] = [];
  const ctx = fakeCtx(srcs);
  let s = 7;
  const voice = new Voice(ctx, ctx.destination, 0.5, pm, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  r.play(voice);
  return { srcs, voice };
}

const NAMES = Object.keys(V3_FUSION_RECIPES) as FusionSfxName[];
const R = V3_FUSION_RECIPES as Record<FusionSfxName, Recipe>;

describe('fusion sounds (src/audio/v3/fusion.ts)', () => {
  it('the storyboard set: every beat has its own sound, registered in the game table', () => {
    for (const n of [
      'fusionPrism',
      'fusionSplit',
      'fusionGather',
      'fusionCall',
      'fusionHelix',
      'fusionDeckDraw',
      'fusionCollapse',
      'fusionBurst',
      'trinityLand',
      'trinityFlare',
      'trinityUnfold',
      'trinityRoarA',
      'trinityRoarB',
      'trinityRoarC',
      'trinityTriple',
      'trinityCutin',
      'fusionSparkle',
    ])
      expect(NAMES, n).toContain(n);
    for (const n of NAMES) expect((RECIPES as Record<string, Recipe>)[n], n).toBe(R[n]);
  });

  it('every recipe schedules only finite values / times, at three pitches; sources start before they stop', () => {
    for (const n of NAMES)
      for (const pm of [1, 0.8, 1.5]) {
        const { srcs } = playOnce(R[n], pm);
        expect(srcs.length, n).toBeGreaterThan(0);
        for (const s of srcs) expect(s.stop, n).toBeGreaterThan(s.start);
      }
  });

  it('lengths: the sustained gather / helix outlast their beats; the collapse is short (it ends in silence)', () => {
    expect([...FUSION_SUSTAINED].sort()).toEqual(['fusionGather', 'fusionHelix']);
    expect(playOnce(R.fusionGather).voice.end).toBeGreaterThanOrEqual(2.4);
    expect(playOnce(R.fusionHelix).voice.end).toBeGreaterThanOrEqual(1.1);
    expect(playOnce(R.fusionCollapse).voice.end).toBeLessThanOrEqual(0.4);
    for (const n of NAMES) expect(playOnce(R[n]).voice.end, n).toBeLessThanOrEqual(3);
  });

  it('the big beats duck the music hardest; the three heads are three different recipes', () => {
    for (const n of ['fusionBurst', 'trinityTriple'] as const) expect(R[n].duck, n).toBeGreaterThanOrEqual(0.8);
    expect(R.fusionSparkle.duck).toBeLessThanOrEqual(0.3);
    const a = playOnce(R.trinityRoarA).srcs.length;
    const b = playOnce(R.trinityRoarB).srcs.length;
    const c = playOnce(R.trinityRoarC).srcs.length;
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('fusion hooks (src/cinematics/fusion/trinity.ts)', () => {
  it('the cinematic outranks the placeholder for the fusion, its summon and the spell activation', async () => {
    await import('../../src/cinematics/fusion/placeholder');
    await import('../../src/cinematics/fusion/trinity');
    const { buildChain } = await import('../../src/cinematics/_core/registry');
    const fusion = buildChain('fusionSummon', [
      ['trinity_crystal_wyrm', 'fusion'],
      ['prism_fusion', 'fusionSpell'],
    ]);
    expect(fusion[0].name).toBe('fusion:trinity_crystal_wyrm:fusion');
    expect(fusion.map((l) => l.name)).toContain('fusionSummon'); // the placeholder stays below (v1 / fallback)
    expect(buildChain('activate', [['prism_fusion', 'activate']])[0].name).toBe('fusion:prism_fusion:activate');
    expect(buildChain('summon', [['trinity_crystal_wyrm', 'summon']])[0].name).toBe('fusion:trinity_crystal_wyrm:summon');
  }, 60000);
});

describe('fusion set pieces (src/cinematics/fusion/_fx.ts)', () => {
  it('a strand keeps a bounded trail of whole-pixel-distinct points', async () => {
    const { Comet, STRAND } = await import('../../src/cinematics/fusion/_fx');
    const c = new Comet(STRAND[0], { x: 0, y: 0 });
    c.len = 10;
    for (let i = 0; i < 50; i++) {
      c.push({ x: i, y: 0 });
      c.push({ x: i + 0.2, y: 0.1 }); // the same pixel: not a new point
    }
    expect(c.pts.length).toBe(10);
    expect(c.head).toEqual({ x: 49.2, y: 0.1 });
    expect(STRAND).toHaveLength(3);
  });
});

describe('Trinity cut-in portrait (src/art/cutins-v3/trinity_crystal_wyrm.ts)', () => {
  it('a hand-made v3 portrait: 8 frames, 200 × 144, the three heads in their strand colours', async () => {
    const { cutinArt, hasCutin } = await import('../../src/art/cutins/index');
    const { PixelCanvas } = await import('../../src/art/pixel');
    const { PAL } = await import('../../src/art/palette');
    expect(hasCutin('trinity_crystal_wyrm')).toBe(true);
    const a = cutinArt('trinity_crystal_wyrm');
    expect([a.w, a.h, a.frames, a.holds?.length, a.p2]).toEqual([200, 144, 8, 8, 'relight']);
    const p = new PixelCanvas(a.w, a.h);
    a.draw(p, a.frames - 1);
    const seen = new Set<number>();
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const c = p.get(x, y);
      if (c !== null) seen.add(c);
    }
    for (const c of [PAL.mag3, PAL.gold3, PAL.cyan3, PAL.white]) expect(seen.has(c), c.toString(16)).toBe(true);
  }, 60000);
});
