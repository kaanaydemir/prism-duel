// Prism Fusion (prism_fusion) → Trinity Crystal Wyrm (trinity_crystal_wyrm) — the fusion cinematic's own sound set
// (?look=v3; src/cinematics/fusion/trinity.ts, storyboard docs/v3/FUSION_STORYBOARD.md). src/audio/sounds.ts spreads
// V3_FUSION_RECIPES and SfxName gains FusionSfxName.
//
// Identity: the crystal wyrm's glass (free-free bar modes, the wyrm's E-ring) grown into a CHORD — the three heads are
// the three notes of E major (C = E, B = G#, A = B: low / middle / high) and every beat of the fusion is built on that
// triad: the prism's activation arpeggio spells it, the rainbow split spreads it across the stereo field, the gathering
// choir sings it, the helix spins it, the collapse swallows it into a sub drop and SILENCE, the birth hits it whole,
// each head roars on its own note and the triple roar stacks the three. No other card uses this chord or the choir.
//
//   opening  fusionPrism     the spell's energy crystallizes into the prism over the zone (a rising glass arpeggio)
//            fusionSplit     the white beam hits the prism and fans out as a rainbow (a beam zing that splits into six
//                            glass notes, panned L → R)
//   gather   fusionGather    sustained: the choir swells under the gathering (stopped at the collapse)
//            fusionCall      one material answers: its card lifts, the wyrm spirit leaves it (a glass cry + whoosh;
//                            the cinematic pitches it per material)
//            fusionHelix     sustained: three tones orbiting faster and faster, a rising whirl (stopped at the collapse)
//            fusionDeckDraw  the Fusion Deck gives up its card (a soft violet shimmer)
//   core     fusionCollapse  the inhale: a reversed glass swell pulling down into a sub drop, then dead silence
//            fusionBurst     the blinding point: sub boom, glass explosion, the whole chord struck, a long bright tail
//   birth    trinityLand     the cocoon lands (heavier, deeper than the wyrm's landing)
//            trinityFlare    the glass lights from inside (a bright chord swell, the core's pulse)
//            trinityUnfold   the wings unfold (glass sheets sliding, a rainbow arpeggio up)
//            trinityRoarA    head A (far, blade crown): the high, sharp voice — its glass on B5
//            trinityRoarB    head B (centre, gold crown): the regal middle voice, a brassy throat — G#5
//            trinityRoarC    head C (near, prism fins): the deep voice, a chest you feel — E5
//            trinityTriple   the triple roar: all three throats + the E-major glass chord + sub, a rainbow ring whoosh
//            trinityCutin    the cut-in's own sting (a prism glint and the chord stab; the generic cut-in sounds fade)
//            fusionSparkle   the tail: the last glass sparkles falling through the light
// Levels follow the slice (pre-chain linear amplitudes); big beats duck ≥ 0.55, small ≤ 0.35 (SE-7).

import type { Recipe } from '../sounds';
import { Voice, midiHz, perc, type Pt } from '../synth';
import { crack, glassBell, glassRain, glassReverse, growl, puff, scaled, sweep, thump } from './kit';

/** E major across the octaves (MIDI): the fusion's chord. */
const E3 = 52;
const GS3 = 56;
const B3 = 59;
const E4 = 64;
const E5 = 76;
const GS5 = 80;
const B5 = 83;
const E6 = 88;
/** the glass rain notes (the wyrm's glass, folded onto the chord) */
const PRISM = [E6, 92, 95, 100, 104] as const;
/** the rainbow's six notes (low → high, panned L → R) */
const RAINBOW_NOTES = [E5, GS5, B5, E6, 92, 95] as const;

/** Play `fn` k times louder (a gain stage in front of the voice's output; the voice keeps its sources / end). */
function gained(v: Voice, k: number, fn: (w: Voice) => void): void {
  const g = v.ctx.createGain();
  g.gain.value = k;
  g.connect(v.out);
  const w = new Voice(v.ctx, g, v.t0, v.pm, v.rnd);
  fn(w);
  v.end = Math.max(v.end, w.end);
  v.sources.push(...w.sources);
  if (w.stereo) v.stereo = true;
}

/** A sung "aah" (the choir): detuned saws on `notes` through three vowel formants, vibrato, under one envelope. */
function choir(v: Voice, t: number, notes: readonly number[], env: readonly Pt[], o: { open?: number; to?: AudioNode } = {}): void {
  const end = env[env.length - 1][0];
  const sum = v.amp(1, { t, to: o.to });
  const open = o.open ?? 1;
  const f1 = v.filt(
    'bandpass',
    [
      [0, 520],
      [end * 0.7, 720 * open, 'e'],
      [end, 680, 'e'],
    ],
    4,
    { t, to: sum },
  );
  const f2 = v.filt(
    'bandpass',
    [
      [0, 980],
      [end * 0.7, 1150 * open, 'e'],
      [end, 1100, 'e'],
    ],
    5,
    { t, to: sum },
  );
  const f3 = v.filt('bandpass', 2600, 6, { t, to: sum });
  const bank = v.amp(1, { t, to: f1 });
  bank.connect(f2);
  bank.connect(f3);
  notes.forEach((m, i) => {
    for (const det of [-9, 0, 8]) {
      const o2 = v.tone('sawtooth', midiHz(m), {
        t,
        g: scaled(env, 0.5 / (1 + i * 0.25)),
        to: bank,
        detune: det + i * 2,
      });
      v.lfo(o2.osc.detune, 5.2 + i * 0.3 + det * 0.01, 14, { t, d: end });
    }
  });
}

/** A struck chord of glass bars (each note one glassBell), `spread` seconds between the notes. */
function glassChord(v: Voice, t: number, notes: readonly number[], g: number, dec: number, spread = 0.012, modes = 3): void {
  notes.forEach((m, i) => glassBell(v, midiHz(m), t + i * spread, g * (1 - i * 0.08), dec, { modes }));
}

/** A crystal throat: the creature growl tuned for one head plus its glass note ringing with it. */
function head(
  v: Voice,
  t: number,
  o: {
    d: number;
    f: [number, number, number, number, number];
    formants: [number, number, number];
    g: number;
    grit: number;
    rasp: number;
    glass: number;
    chest: number;
  },
): void {
  growl(v, t, {
    d: o.d,
    f: o.f,
    formants: o.formants,
    g: o.g,
    grit: o.grit,
    rasp: o.rasp,
  });
  // the body resonates on the head's own note (bar partials swelling with the roar)
  const f = midiHz(o.glass);
  const s = v.tone('sine', f, {
    t,
    g: [
      [0, 0],
      [0.3, 0.05],
      [o.d * 0.7, 0.04],
      [o.d + 0.4, 0.0001, 'e'],
    ],
  });
  v.lfo(s.osc.detune, 5.5, 14, { t, d: o.d + 0.4 });
  v.tone('sine', f * 2.756, {
    t,
    g: [
      [0, 0],
      [0.35, 0.018],
      [o.d * 0.8, 0.0001, 'e'],
    ],
  });
  // chest: felt more than heard
  v.tone(
    'sine',
    [
      [0, o.chest],
      [0.25, o.chest * 1.18, 'e'],
      [o.d, o.chest * 0.8, 'e'],
    ],
    {
      t,
      g: [
        [0, 0],
        [0.08, 0.2],
        [o.d * 0.6, 0.14],
        [o.d, 0.0001, 'e'],
      ],
    },
  );
}

export const V3_FUSION_RECIPES = {
  /** Opening: the spell's orb crystallizes into the prism over the zone — a glass arpeggio up the chord, a shimmer. */
  fusionPrism: {
    cap: 1,
    gap: 0.2,
    verb: 0.6,
    duck: 0.35,
    play(v0) {
      gained(v0, 1.3, (v) => {
        // the orb's arrival click and the crystal growing round it
        crack(v, 0, 0.2, { hp: 5200, n: 2, gap: 0.008, dec: 0.006 });
        [E5, GS5, B5, E6, 92].forEach((m, i) => glassBell(v, midiHz(m), 0.02 + i * 0.055, 0.075 - i * 0.008, 1.1 + i * 0.1, { modes: 3 }));
        // a beating pair under the top note (a crystal, not a bell)
        v.tone('sine', midiHz(E6) * 1.004, {
          t: 0.24,
          g: [
            [0, 0],
            [0.08, 0.02],
            [1.3, 0.0001, 'e'],
          ],
        });
        glassReverse(v, midiHz(B5), 0, 0.06, 0.2);
        v.noise('white', {
          g: [
            [0, 0],
            [0.25, 0.04],
            [0.9, 0.0001, 'e'],
          ],
          to: v.filt('highpass', 7000),
        });
        glassRain(v, {
          t: 0.15,
          d: 0.8,
          n: 12,
          g: 0.03,
          notes: PRISM,
          curve: 1.2,
          dec: [0.08, 0.3],
          spread: 0.7,
        });
      });
    },
  },
  /** Opening: the white beam hits the prism and fans out into a rainbow — a zing that splits into six panned notes. */
  fusionSplit: {
    cap: 1,
    gap: 0.2,
    verb: 0.55,
    duck: 0.45,
    play(v0) {
      gained(v0, 1.3, (v) => {
        // the beam: a bright sine zing rising onto the prism, a hiss along it
        v.tone(
          'sine',
          [
            [0, 1400],
            [0.12, 2640, 'e'],
          ],
          {
            g: [
              [0, 0],
              [0.02, 0.07],
              [0.14, 0.05],
              [0.2, 0.0001, 'e'],
            ],
          },
        );
        v.tone(
          'triangle',
          [
            [0, 700],
            [0.12, 1320, 'e'],
          ],
          {
            g: [
              [0, 0],
              [0.02, 0.05],
              [0.18, 0.0001, 'e'],
            ],
          },
        );
        sweep(v, 0, 0.18, [3000, 7000, 5000], 0.05, { q: 3 });
        // the split: six glass notes, one per colour, fanned across the stereo field
        RAINBOW_NOTES.forEach((m, i) => {
          const pan = v.panner(-0.8 + (1.6 * i) / (RAINBOW_NOTES.length - 1));
          glassBell(v, midiHz(m), 0.13 + i * 0.022, 0.06, 1.2, {
            modes: 3,
            to: pan,
          });
          v.tone('sine', midiHz(m) * 1.003, {
            t: 0.13 + i * 0.022,
            g: [
              [0, 0],
              [0.05, 0.012],
              [1.2, 0.0001, 'e'],
            ],
            to: pan,
          });
        });
        // the fan of light pouring down: a wide airy sweep left → right
        sweep(v, 0.14, 0.7, [2400, 6000, 3200], 0.07, {
          kind: 'pink',
          q: 1.4,
          pan: [-0.7, 0.7],
          peakAt: 0.3,
        });
        thump(v, 0.13, 180, 70, 0.14, 0.2);
      });
    },
  },
  /** Gathering (sustained, ≈ 2.6 s; stopped at the collapse): the choir on the chord, rising and opening. */
  fusionGather: {
    cap: 1,
    gap: 0.3,
    verb: 0.65,
    duck: 0.5,
    play(v) {
      const D = 2.6;
      const env: Pt[] = [
        [0, 0],
        [0.6, 0.05],
        [1.6, 0.1],
        [D - 0.15, 0.14],
        [D, 0.0001, 'e'],
      ];
      choir(v, 0, [E3, B3, E4, GS3 + 12], env, { open: 1.15 });
      // the synth bed under the voices: a slow-opening saw pad on the root
      const lp = v.filt(
        'lowpass',
        [
          [0, 300],
          [D, 2400, 'e'],
        ],
        1.2,
      );
      for (const det of [-6, 6])
        v.tone('sawtooth', midiHz(E3 - 12), {
          g: scaled(env, 0.35),
          to: lp,
          detune: det,
        });
      // the wyrm glass waking: sparse glass, denser as it rises
      glassRain(v, {
        t: 0.3,
        d: D - 0.4,
        n: 22,
        g: 0.035,
        notes: PRISM,
        curve: 0.55,
        dec: [0.06, 0.2],
        spread: 0.8,
        fade: 0,
      });
      // a pitch riser on top (an octave over 2.6 s)
      v.tone(
        'sine',
        [
          [0, midiHz(B5)],
          [D, midiHz(B5 + 12), 'e'],
        ],
        {
          g: [
            [0, 0],
            [1, 0.006],
            [D - 0.1, 0.03],
            [D, 0.0001, 'e'],
          ],
        },
      );
    },
  },
  /** Gathering: one material answers — the card lifts, the wyrm's spirit leaves it: a glass cry and a whoosh. */
  fusionCall: {
    cap: 3,
    gap: 0.06,
    verb: 0.45,
    duck: 0.3,
    play(v0) {
      gained(v0, 2, (v) => {
        // the whoosh of the rising spirit
        sweep(v, 0, 0.42, [700, 3200, 1500], 0.11, {
          kind: 'pink',
          q: 1.6,
          peakAt: 0.55,
        });
        // the cry: a gliding glass voice (the wyrm's call, high and thin)
        const cry = v.filt(
          'bandpass',
          [
            [0, 1200],
            [0.2, 2200, 'e'],
            [0.5, 1500, 'e'],
          ],
          3,
        );
        v.tone(
          'sawtooth',
          [
            [0, midiHz(B5 - 12)],
            [0.12, midiHz(E6 - 12), 'e'],
            [0.5, midiHz(B5 - 12), 'e'],
          ],
          {
            g: [
              [0, 0],
              [0.05, 0.05],
              [0.3, 0.035],
              [0.55, 0.0001, 'e'],
            ],
            to: cry,
          },
        );
        glassBell(v, midiHz(E6), 0.02, 0.05, 0.6, { modes: 3 });
        glassBell(v, midiHz(B5), 0.05, 0.035, 0.5, { modes: 2 });
        crack(v, 0, 0.12, { hp: 5000, n: 1, dec: 0.005 });
      });
    },
  },
  /** Helix (sustained, ≈ 1.2 s; stopped at the collapse): three tones orbiting ever faster, rising into the knot. */
  fusionHelix: {
    cap: 1,
    gap: 0.3,
    verb: 0.45,
    duck: 0.55,
    play(v) {
      const D = 1.2;
      const notes = [E4, GS3 + 12, B3 + 12] as const;
      notes.forEach((m, i) => {
        // each strand pans round the head (phase-shifted), its tremolo spinning up
        const pan = v.panner(0);
        const pp = pan as unknown as { pan?: AudioParam };
        if (pp.pan)
          v.lfo(
            pp.pan,
            [
              [0, 2],
              [D, 11, 'e'],
            ],
            0.8,
            { d: D },
          );
        const o = v.tone(
          'triangle',
          [
            [0, midiHz(m)],
            [D, midiHz(m + 7), 'e'],
          ],
          {
            g: [
              [0, 0],
              [0.15, 0.05],
              [D - 0.05, 0.08],
              [D, 0.0001, 'e'],
            ],
            to: pan,
          },
        );
        v.lfo(
          o.amp.gain,
          [
            [0, 3 + i],
            [D, 16 + i * 2, 'e'],
          ],
          0.03,
          { d: D },
        );
      });
      // the whirl: filtered noise spinning up
      const bp = v.filt(
        'bandpass',
        [
          [0, 600],
          [D, 4200, 'e'],
        ],
        5,
      );
      const wh = v.noise('pink', {
        g: [
          [0, 0],
          [0.2, 0.05],
          [D - 0.05, 0.1],
          [D, 0.0001, 'e'],
        ],
        to: bp,
      });
      v.lfo(
        wh.amp.gain,
        [
          [0, 4],
          [D, 22, 'e'],
        ],
        0.05,
        { d: D },
      );
      // glass ticks accelerating (each a strand passing the prism)
      let t = 0.05;
      let gap = 0.16;
      let i = 0;
      while (t < D - 0.04) {
        glassBell(v, midiHz([E6, 92, 95][i % 3]), t, 0.03 + 0.02 * (t / D), 0.12, { modes: 2 });
        t += gap;
        gap = Math.max(0.03, gap * 0.86);
        i++;
      }
    },
  },
  /** Helix: the Fusion Deck gives up its card — a soft violet shimmer rising into the vortex. */
  fusionDeckDraw: {
    cap: 1,
    gap: 0.2,
    verb: 0.5,
    duck: 0.25,
    play(v0) {
      gained(v0, 1.7, (v) => {
        sweep(v, 0, 0.35, [900, 2800, 2000], 0.06, { kind: 'pink', q: 2 });
        glassReverse(v, midiHz(GS5), 0, 0.05, 0.28);
        glassBell(v, midiHz(GS5 + 12), 0.28, 0.04, 0.5, { modes: 2 });
        v.tone(
          'sine',
          [
            [0, midiHz(E5 - 12)],
            [0.35, midiHz(B5 - 12), 'e'],
          ],
          {
            g: [
              [0, 0],
              [0.1, 0.03],
              [0.4, 0.0001, 'e'],
            ],
          },
        );
      });
    },
  },
  /** Core: the inhale — a reversed glass swell pulling down into a sub drop, then dead silence (≈ 0.34 s). */
  fusionCollapse: {
    cap: 1,
    gap: 0.3,
    verb: 0.15,
    duck: 0.7,
    play(v) {
      const D = 0.32;
      // everything sucked inward: the chord reversed, ending dead on the point
      for (const m of [E5, GS5, B5]) glassReverse(v, midiHz(m), 0, 0.05, D);
      v.noise('white', {
        g: [
          [0, 0.0001],
          [D * 0.8, 0.07, 'e'],
          [D, 0.0001, 'e'],
        ],
        to: v.filt(
          'bandpass',
          [
            [0, 6000],
            [D, 900, 'e'],
          ],
          2,
        ),
      });
      // the sub drop: falling into the floor
      v.tone(
        'sine',
        [
          [0, 90],
          [D, 28, 'e'],
        ],
        {
          g: [
            [0, 0],
            [0.05, 0.3],
            [D - 0.02, 0.36],
            [D + 0.01, 0.0001, 'e'],
          ],
        },
      );
      v.tone(
        'triangle',
        [
          [0, 180],
          [D, 50, 'e'],
        ],
        {
          g: [
            [0, 0],
            [0.05, 0.06],
            [D, 0.0001, 'e'],
          ],
        },
      );
    },
  },
  /** Core: the blinding point — the biggest hit of the game's fusion: sub boom, glass explosion, the chord struck whole. */
  fusionBurst: {
    cap: 1,
    gap: 0.3,
    verb: 0.7,
    duck: 0.85,
    play(v0) {
      gained(v0, 1.6, (v) => {
        // transient: a glass crack and a white burst of air
        crack(v, 0, 0.5, { hp: 3000, n: 3, gap: 0.007, dec: 0.01 });
        v.noise('white', {
          g: perc(0.22, 0.25, 0.001),
          to: v.filt(
            'highpass',
            [
              [0, 1800],
              [0.25, 6000, 'e'],
            ],
            0.8,
          ),
        });
        // body + sub: a deep boom with a long settle
        thump(v, 0, 120, 26, 0.62, 0.9, { drive: 2.2 });
        thump(v, 0.005, 300, 70, 0.22, 0.3);
        puff(v, 0.01, 0.3, 0.7, 900, { kind: 'brown' });
        // the whole chord struck (low → high, near together) and held ringing
        glassChord(v, 0.004, [E5, GS5, B5, E6], 0.09, 2.2, 0.006, 4);
        v.tone('triangle', midiHz(E3), {
          t: 0.01,
          g: [
            [0, 0],
            [0.04, 0.09],
            [1.2, 0.04],
            [2.4, 0.0001, 'e'],
          ],
        });
        v.tone('triangle', midiHz(B3), {
          t: 0.01,
          g: [
            [0, 0],
            [0.05, 0.06],
            [1.2, 0.03],
            [2.4, 0.0001, 'e'],
          ],
        });
        v.tone('sine', midiHz(GS3 + 12), {
          t: 0.01,
          g: [
            [0, 0],
            [0.06, 0.05],
            [1.4, 0.02],
            [2.4, 0.0001, 'e'],
          ],
        });
        // the glass explosion: a front-loaded shard rain spread wide
        glassRain(v, {
          t: 0.01,
          d: 1.4,
          n: 40,
          g: 0.06,
          notes: PRISM,
          curve: 2.2,
          dec: [0.04, 0.22],
          spread: 0.95,
        });
        // air rushing out with the ring
        sweep(v, 0.02, 0.9, [5000, 2400, 900], 0.1, {
          kind: 'pink',
          q: 1,
          pan: [-0.5, 0.5],
          peakAt: 0.08,
        });
      });
    },
  },
  /** Birth f2: the cocoon lands — a heavier, deeper crystal body than the wyrm, the floor ringing. */
  trinityLand: {
    cap: 1,
    gap: 0.2,
    verb: 0.4,
    duck: 0.5,
    play(v) {
      thump(v, 0, 110, 30, 0.6, 0.55, { drive: 2.2 });
      v.tone(
        'triangle',
        [
          [0, 200],
          [0.09, 70, 'e'],
        ],
        { g: perc(0.2, 0.12, 0.001) },
      );
      puff(v, 0.006, 0.36, 0.38, 1400, { kind: 'pink' });
      crack(v, 0, 0.36, { hp: 3800, n: 2, gap: 0.007, dec: 0.007 });
      glassBell(v, midiHz(E5), 0.002, 0.08, 0.9, { modes: 4, att: 0.0005 });
      glassBell(v, midiHz(E6), 0.005, 0.05, 0.6, { modes: 3, att: 0.0005 });
      glassBell(v, midiHz(E5 - 12), 0.01, 0.06, 1.1, { modes: 3 });
      glassRain(v, {
        t: 0.02,
        d: 0.4,
        n: 9,
        g: 0.035,
        notes: PRISM,
        curve: 1.6,
        dec: [0.05, 0.18],
      });
    },
  },
  /** Birth f3: the glass lights from inside — a bright chord swelling with the core's pulse. */
  trinityFlare: {
    cap: 1,
    gap: 0.2,
    verb: 0.6,
    duck: 0.4,
    play(v) {
      for (const m of [E5, GS5, B5, E6]) glassReverse(v, midiHz(m), 0, 0.04, 0.12);
      glassChord(v, 0.12, [GS5, B5, E6, 92], 0.06, 1.3, 0.015, 3);
      // the core's heartbeat: two soft low pulses
      thump(v, 0.12, 70, 40, 0.2, 0.25);
      thump(v, 0.36, 70, 40, 0.12, 0.25);
      v.noise('white', {
        t: 0.1,
        g: [
          [0, 0],
          [0.04, 0.05],
          [0.7, 0.0001, 'e'],
        ],
        to: v.filt('highpass', 6500),
      });
    },
  },
  /** Birth f4–5: the wings unfold — glass sheets sliding open, an airy whoosh, a rainbow arpeggio up. */
  trinityUnfold: {
    cap: 1,
    gap: 0.2,
    verb: 0.5,
    duck: 0.4,
    play(v0) {
      gained(v0, 1.7, (v) => {
        sweep(v, 0, 0.45, [500, 2600, 1400], 0.14, {
          kind: 'pink',
          q: 1.3,
          pan: [-0.4, 0.4],
          peakAt: 0.4,
        });
        // two sheets of glass scraping open (high bandpassed noise with a wandering centre)
        for (const [t, f] of [
          [0, 3400],
          [0.06, 4100],
        ] as const) {
          const bp = v.filt(
            'bandpass',
            [
              [0, f],
              [0.3, f * 1.5, 'e'],
            ],
            6,
            { t },
          );
          v.noise('white', {
            t,
            g: [
              [0, 0],
              [0.05, 0.04],
              [0.3, 0.0001, 'e'],
            ],
            to: bp,
          });
        }
        RAINBOW_NOTES.forEach((m, i) =>
          glassBell(v, midiHz(m), 0.12 + i * 0.04, 0.04, 0.8, {
            modes: 2,
            to: v.panner(-0.6 + i * 0.24),
          }),
        );
        puff(v, 0.3, 0.12, 0.3, 700);
      });
    },
  },
  /** Head A rises and roars (far, blade crown): the high, sharp SHRIEK — a thin raspy scream gliding up, its glass on B5. */
  trinityRoarA: {
    cap: 1,
    gap: 0.15,
    verb: 0.55,
    duck: 0.55,
    play(v) {
      head(v, 0, { d: 0.62, f: [150, 260, 230, 190, 140], formants: [700, 1700, 3400], g: 0.42, grit: 7, rasp: 62, glass: B5, chest: 90 });
      // the shriek: a bright bandpassed saw gliding up and breaking off (the blade crown's edge)
      const bp = v.filt(
        'bandpass',
        [
          [0, 1400],
          [0.12, 2600, 'e'],
          [0.55, 1900, 'e'],
        ],
        5,
      );
      for (const det of [-14, 0, 13])
        v.tone(
          'sawtooth',
          [
            [0, midiHz(B5 - 12)],
            [0.1, midiHz(E6 - 12), 'e'],
            [0.4, midiHz(B5 - 12) * 1.04, 'e'],
            [0.6, midiHz(B5 - 12) * 0.9, 'e'],
          ],
          {
            g: [
              [0, 0],
              [0.04, 0.07],
              [0.35, 0.05],
              [0.62, 0.0001, 'e'],
            ],
            to: bp,
            detune: det,
          },
        );
      v.noise('white', {
        g: [
          [0, 0],
          [0.03, 0.06],
          [0.5, 0.0001, 'e'],
        ],
        to: v.filt('bandpass', 4200, 2),
      });
      crack(v, 0.01, 0.16, { hp: 6000, n: 3, gap: 0.009, dec: 0.006 });
      glassBell(v, midiHz(B5 + 12), 0.02, 0.05, 0.6, { modes: 3 });
      glassRain(v, { t: 0.15, d: 0.5, n: 10, g: 0.03, notes: [B5 + 12, 100, 107], curve: 1.3, dec: [0.04, 0.14] });
    },
  },
  /** Head B rises and roars (centre, gold crown): the REGAL call — a brass fanfare fifth over a mid growl, its glass on G#5. */
  trinityRoarB: {
    cap: 1,
    gap: 0.15,
    verb: 0.6,
    duck: 0.55,
    play(v) {
      head(v, 0, { d: 0.85, f: [70, 118, 110, 96, 70], formants: [420, 880, 2300], g: 0.42, grit: 3.2, rasp: 30, glass: GS5, chest: 52 });
      // the gold crown's brass: a horn call (root → fifth → octave) in front of the growl
      const lp = v.filt(
        'lowpass',
        [
          [0, 500],
          [0.06, 3200, 'e'],
          [0.8, 1100, 'e'],
        ],
        1.4,
      );
      for (const [m, t, g] of [
        [GS3, 0, 0.07],
        [GS3 + 7, 0.09, 0.06],
        [GS3 + 12, 0.18, 0.055],
      ] as const)
        for (const det of [-7, 7])
          v.tone('sawtooth', midiHz(m), {
            t,
            g: [
              [0, 0],
              [0.03, g],
              [0.5 - t * 0.5, g * 0.7],
              [0.85 - t, 0.0001, 'e'],
            ],
            to: lp,
            detune: det,
          });
      v.tone('square', midiHz(GS3 - 12), {
        g: [
          [0, 0],
          [0.05, 0.05],
          [0.6, 0.03],
          [0.85, 0.0001, 'e'],
        ],
        to: v.filt('lowpass', 700, 1),
      });
      glassBell(v, midiHz(GS5), 0.18, 0.05, 1, { modes: 3 });
      glassRain(v, { t: 0.2, d: 0.6, n: 8, g: 0.03, notes: [GS5, 92, 99], curve: 1.3, dec: [0.06, 0.2] });
    },
  },
  /** Head C rises and roars (near, prism fins): the DEEP bellow — a slow sub growl you feel, a rumble, the fins humming on E5. */
  trinityRoarC: {
    cap: 1,
    gap: 0.15,
    verb: 0.45,
    duck: 0.6,
    play(v) {
      head(v, 0, { d: 1.05, f: [36, 64, 58, 46, 30], formants: [240, 520, 1350], g: 0.78, grit: 3, rasp: 17, glass: E5, chest: 32 });
      thump(v, 0.02, 80, 28, 0.3, 0.6, { drive: 1.8 });
      // the rumble under it (stone and glass shaking)
      v.noise('brown', {
        g: [
          [0, 0],
          [0.15, 0.22],
          [0.8, 0.12],
          [1.1, 0.0001, 'e'],
        ],
        to: v.filt('lowpass', 220, 1),
      });
      // the prism fins humming: a slow beating glass pair
      v.tone('sine', midiHz(E6), {
        t: 0.1,
        g: [
          [0, 0],
          [0.25, 0.03],
          [1, 0.0001, 'e'],
        ],
      });
      v.tone('sine', midiHz(E6) * 1.008, {
        t: 0.1,
        g: [
          [0, 0],
          [0.25, 0.025],
          [1, 0.0001, 'e'],
        ],
      });
      glassRain(v, { t: 0.3, d: 0.7, n: 7, g: 0.028, notes: [E5, E6, 95], curve: 1.3, dec: [0.08, 0.25] });
    },
  },
  /** The triple roar (f12): three throats on the chord, the E-major glass ringing, a sub, the rainbow ring whooshing out. */
  trinityTriple: {
    cap: 1,
    gap: 0.3,
    verb: 0.6,
    duck: 0.85,
    play(v) {
      const D = 1.5;
      growl(v, 0, {
        d: D,
        f: [44, 84, 78, 62, 40],
        formants: [310, 720, 1850],
        g: 0.5,
        grit: 4,
        rasp: 30,
      });
      growl(v, 0.02, {
        d: D,
        f: [66, 122, 112, 92, 62],
        formants: [400, 900, 2200],
        g: 0.4,
        grit: 4.4,
        rasp: 36,
      });
      growl(v, 0.04, {
        d: D - 0.1,
        f: [92, 168, 150, 120, 86],
        formants: [480, 1150, 2700],
        g: 0.34,
        grit: 5.5,
        rasp: 44,
      });
      // the chord in the bodies, swelling
      for (const [m, g] of [
        [E5, 0.05],
        [GS5, 0.04],
        [B5, 0.035],
        [E6, 0.025],
      ] as const) {
        const s = v.tone('sine', midiHz(m), {
          g: [
            [0, 0],
            [0.3, g],
            [1.2, g * 0.8],
            [2.2, 0.0001, 'e'],
          ],
        });
        v.lfo(s.osc.detune, 5.5, 10, { d: 2.2 });
      }
      // the sub and the impact of the reared body
      thump(v, 0, 80, 28, 0.42, 0.8, { drive: 1.8 });
      crack(v, 0, 0.22, { hp: 3500, n: 2, gap: 0.009, dec: 0.008 });
      // the rainbow ring rushing out across the arena
      sweep(v, 0.05, 1.0, [1200, 4800, 1800], 0.09, {
        kind: 'pink',
        q: 1.2,
        pan: [-0.8, 0.8],
        peakAt: 0.25,
      });
      glassRain(v, {
        t: 0.3,
        d: 1.5,
        n: 26,
        g: 0.04,
        notes: PRISM,
        curve: 1.3,
        dec: [0.1, 0.4],
        fade: 0.85,
        spread: 0.85,
      });
      v.noise('white', {
        t: 0.3,
        g: [
          [0, 0],
          [0.5, 0.04],
          [1.6, 0.0001, 'e'],
        ],
        to: v.filt('highpass', 7500),
      });
    },
  },
  /** The cut-in's own sting: a prism glint and the chord stab with the name. */
  trinityCutin: {
    cap: 1,
    gap: 0.3,
    verb: 0.55,
    duck: 0.6,
    play(v) {
      sweep(v, 0, 0.22, [800, 4200, 2600], 0.09, {
        kind: 'pink',
        q: 1.5,
        pan: [-0.6, 0.3],
      });
      glassBell(v, midiHz(100), 0.05, 0.05, 0.5, { modes: 2 });
      // the stab (on the slam): the chord as bright brass + glass
      const lp = v.filt(
        'lowpass',
        [
          [0, 600],
          [0.42, 600],
          [0.46, 4200, 'e'],
          [1.1, 1200, 'e'],
        ],
        1.2,
      );
      for (const m of [E3, B3, GS3 + 12, E4 + 12])
        for (const det of [-7, 7])
          v.tone('sawtooth', midiHz(m), {
            t: 0.4,
            g: [
              [0, 0],
              [0.02, 0.035],
              [0.4, 0.025],
              [0.8, 0.0001, 'e'],
            ],
            to: lp,
            detune: det,
          });
      glassChord(v, 0.41, [E5, GS5, B5, E6], 0.06, 1.1, 0.008, 3);
      thump(v, 0.4, 140, 45, 0.3, 0.3, { drive: 1.5 });
      crack(v, 0.4, 0.2, { hp: 4500, n: 2, gap: 0.006 });
    },
  },
  /** The tail: the last glass sparkles falling through the light, thinning out. */
  fusionSparkle: {
    cap: 1,
    gap: 0.3,
    verb: 0.7,
    duck: 0.15,
    play(v0) {
      gained(v0, 1.4, (v) => {
        glassRain(v, {
          d: 1.6,
          n: 20,
          g: 0.035,
          notes: PRISM,
          curve: 1.6,
          dec: [0.12, 0.45],
          fade: 0.9,
          spread: 0.85,
        });
        v.tone('sine', midiHz(E6), {
          g: [
            [0, 0],
            [0.2, 0.012],
            [1.6, 0.0001, 'e'],
          ],
        });
        v.noise('white', {
          g: [
            [0, 0],
            [0.3, 0.02],
            [1.5, 0.0001, 'e'],
          ],
          to: v.filt('highpass', 8000),
        });
      });
    },
  },
} satisfies Record<string, Recipe>;

export type FusionSfxName = keyof typeof V3_FUSION_RECIPES;

/** The sustained ones (started with sfx.start; their handle fades them on the beat that ends them). */
export const FUSION_SUSTAINED: readonly FusionSfxName[] = ['fusionGather', 'fusionHelix'];
