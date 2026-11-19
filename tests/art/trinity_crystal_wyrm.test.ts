// Trinity Crystal Wyrm (v3 art, the fusion ace): every anim exists with marks and holds, validateArt (ace tier, beam)
// reports no errors, a frame is deterministic, P2 is a relight of the same silhouette, the feet band never moves in
// idle / guard / transitions (HA-9), every frame keeps a 2-px margin, the colour budget holds, the frame budget fits
// KK-13, the summon is the reveal (cocoon drop → land → heads rise one by one), the death shatters to nothing, the
// attack's muzzle is the braid point in front of the three mouths, and the card picture paints within the kit budgets.

import { describe, expect, it } from 'vitest';
import art from '../../src/art/monsters-v3/trinity_crystal_wyrm';
import card from '../../src/art/cardart-v3/trinity_crystal_wyrm';
import { artStats, renderArt } from '../../src/art/cardart-v3/_kit';
import { drawFrame, validateArt } from '../../src/art/rigkit';
import type { AnyMonsterAnim } from '../../src/art/types';
import { SUMMON_BEATS, SUMMON_LAND, framePose, trinityMarks } from '../../src/art/monsters-v3/trinity_crystal_wyrm-anims';

const ALL: readonly AnyMonsterAnim[] = ['idle', 'guard', 'attack', 'roar', 'hit', 'toGuard', 'fromGuard', 'hitHeavy', 'hitMagic', 'summon', 'death', 'revive'];
type Spec = { frames: number; holds?: number[]; marks?: Record<string, number> };
const spec = (a: AnyMonsterAnim): Spec => (art.anims as Record<string, Spec>)[a] ?? (art.extraAnims as Record<string, Spec>)[a];

describe('trinity_crystal_wyrm', () => {
  it('has every anim with holds and the fusion counts', () => {
    for (const a of ALL) {
      const s = spec(a);
      expect(s, a).toBeTruthy();
      expect(s.holds?.length, a).toBe(s.frames);
    }
    expect(spec('idle').frames).toBe(20);
    expect(spec('attack').frames).toBe(14);
    expect(spec('summon').frames).toBe(16);
    expect(spec('attack').marks).toMatchObject({ charge: 1, release: 7, impact: 7, contact: 8, recover: 11 });
    expect(spec('summon').marks?.land).toBe(SUMMON_LAND);
    expect(spec('death').marks).toMatchObject({ impact: 0, contact: 0, dissolve: 4 });
    expect(spec('death').holds!.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(900);
    expect(art.p2).toBe('relight');
    expect(art.hover).toBe(0);
    expect(art.weight).toBe('heavy');
    // KK-13: ≤ 140 frames, ≤ 7 MB uncropped per side (ace)
    const frames = ALL.reduce((n, a) => n + spec(a).frames, 0);
    expect(frames).toBeLessThanOrEqual(140);
    expect(art.w * art.h * 4 * frames).toBeLessThanOrEqual(7e6);
    // bigger than the Crystal Wyrm's 116×104
    expect(art.w).toBeGreaterThan(116);
    expect(art.h).toBeGreaterThan(104);
  });

  it('validateArt (ace tier, beam) has no errors', () => {
    expect(validateArt(art, { tier: 'ace', attack: 'beam' }).filter((f) => f.severity === 'error').map((f) => `${f.rule} ${f.anim} ${f.message}`)).toEqual([]);
  });

  it('draws deterministically and P2 keeps the silhouette', () => {
    const a = drawFrame(art, 'idle', 0, 'left');
    const b = drawFrame(art, 'idle', 0, 'left');
    expect(a.data.every((v: number, i: number) => v === b.data[i])).toBe(true);
    const r = drawFrame(art, 'idle', 0, 'right');
    let diff = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.isOpaque(x, y) !== r.isOpaque(x, y)) diff++;
    expect(diff).toBe(0);
  });

  it('keeps a 2-px margin on every frame (both lights) and the colour budget', () => {
    for (const light of ['left', 'right'] as const)
      for (const a of ALL)
        for (let f = 0; f < spec(a).frames; f++) {
          const p = drawFrame(art, a, f, light);
          const b = p.bounds();
          if (!b) continue;
          expect(b.x, `${a} f${f} ${light}`).toBeGreaterThanOrEqual(2);
          expect(b.y, `${a} f${f} ${light}`).toBeGreaterThanOrEqual(2);
          expect(art.w - (b.x + b.w), `${a} f${f} ${light}`).toBeGreaterThanOrEqual(2);
          expect(art.h - (b.y + b.h), `${a} f${f} ${light}`).toBeGreaterThanOrEqual(2);
          if (light === 'left' && (f === 0 || a === 'attack')) {
            const cols = new Set<number>();
            for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.isOpaque(x, y)) cols.add(p.get(x, y)!);
            expect(cols.size, `${a} f${f} colours`).toBeLessThanOrEqual(32);
          }
        }
  }, 120_000);

  it('keeps the feet band fixed in idle, guard and the transitions (HA-9)', () => {
    const band = (anim: AnyMonsterAnim, f: number) => {
      const p = drawFrame(art, anim, f, 'left');
      const b = p.bounds()!;
      const bottom = b.y + b.h - 1;
      let x0 = Infinity;
      let x1 = -1;
      for (let y = bottom - 5; y <= bottom; y++) for (let x = 0; x < p.w; x++) if (p.isOpaque(x, y)) ((x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)));
      return `${bottom} ${x0}..${x1}`;
    };
    const ref = band('idle', 0);
    expect(ref.startsWith(`${art.anchorY} `)).toBe(true);
    for (const a of ['idle', 'guard', 'toGuard', 'fromGuard'] as const) for (let f = 0; f < spec(a).frames; f++) expect(band(a, f), `${a} f${f}`).toBe(ref);
  }, 60_000);

  it('the three heads move out of phase in the idle', () => {
    const at = (f: number) => trinityMarks('idle', f).heads.map((h) => h[1]);
    const ys = Array.from({ length: 20 }, (_, f) => at(f));
    // no two heads share the same vertical motion over the loop
    for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) expect(ys.map((v) => v[i] - v[j]).some((d) => d !== ys[0][i] - ys[0][j]), `${i}/${j}`).toBe(true);
  });

  it('summon is the reveal: cocoon drop → land → the heads rise and roar one by one → triple roar', () => {
    expect(framePose('summon', 0).lift).toBeLessThan(0);
    expect(framePose('summon', 0).guard).toBe(true);
    expect(framePose('summon', SUMMON_LAND).lift).toBe(0);
    SUMMON_BEATS.roar.forEach((f, i) => {
      expect(framePose('summon', f).h[i].jaw, `head ${i} roars at f${f}`).toBe(1);
      // the heads after it are still hidden (lowered)
      for (let j = i + 1; j < 3; j++) expect(framePose('summon', f).h[j].dy, `head ${j} hidden at f${f}`).toBeGreaterThan(0);
    });
    for (let i = 0; i < 3; i++) expect(framePose('summon', SUMMON_BEATS.triple).h[i].jaw).toBe(1);
  });

  it('attack: the muzzle is the braid point in front of the three mouths; death shatters to nothing', () => {
    const m = trinityMarks('attack', 8);
    for (const q of m.mouths) expect(m.braid[0]).toBeGreaterThan(q[0]);
    expect(art.muzzle).toEqual({ x: m.braid[0], y: m.braid[1] });
    expect(framePose('death', 4).shatter).toBeGreaterThan(0);
    const last = drawFrame(art, 'death', spec('death').frames - 1, 'left').bounds();
    expect(last === null || last.h <= 16).toBe(true);
  });

  it('card picture: 4 living frames, both sizes inside the kit budgets', () => {
    expect(card.frames).toBe(4);
    const r = renderArt(card, 0);
    expect(r.auto).toBe(false);
    const big = artStats(r.big, r.bigPx, card.focus, true);
    const small = artStats(r.small, r.smallPx, card.focusSmall, true);
    for (const st of [big, small]) {
      expect(st.offPalette).toBe(0);
      expect(st.colors).toBeLessThanOrEqual(20);
      expect(st.backdropColors).toBeLessThanOrEqual(6);
      expect(st.isolated).toBeLessThanOrEqual(0.1);
      expect(st.focusOk).toBe(true);
    }
  });
});
