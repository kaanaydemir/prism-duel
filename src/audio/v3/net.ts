// Online play's own sounds (src/scenes/net/LobbyScene.ts, src/net/overlay.ts). src/audio/sounds.ts spreads
// NET_RECIPES and SfxName gains NetSfxName.
//
// Identity: a "signal" — two voices, one per device (a cyan high voice and a crimson low one, the players'
// colours), that call and answer each other. Short, dry, UI-level (≤ 0.35 peak), never ducking the duel.
//
//   netKey      a keypad press: a soft glass tick whose pitch climbs with each typed character (pitch opt)
//   netCode     the room code appears: a quick rising four-note "dial" arpeggio, letters flipping into place
//   netPing     waiting in the room: one sonar-like ping with a faint echo (the lobby plays it every few seconds)
//   netLink     the friend is in: call (high) and answer (low) lock into a fifth, then a bright shimmer
//   netLost     the connection dropped: the answer voice slides down and breaks into static
//   netBack     the connection is back: the lost slide reversed, ending on the linked fifth

import type { Recipe } from '../sounds';
import { ahr, midiHz, perc } from '../synth';

const HI = 81; // A5 — the caller (cyan side)
const LO = 74; // D5 — the answer (crimson side): a fifth below

export const NET_RECIPES = {
  netKey: {
    cap: 4,
    gap: 0.02,
    verb: 0.06,
    vary: 0.03,
    play(v) {
      const lp = v.filt('lowpass', 7000);
      v.tone('triangle', [[0, midiHz(HI + 7)], [0.03, midiHz(HI + 5), 'e']], { g: perc(0.12, 0.05), to: lp });
      v.noise('white', { g: perc(0.05, 0.012), to: v.filt('bandpass', 5200, 3) });
    },
  },
  netCode: {
    cap: 1,
    verb: 0.18,
    play(v) {
      const lp = v.filt('lowpass', 6500);
      [LO, LO + 4, HI, HI + 5].forEach((m, i) => {
        v.tone('square', midiHz(m), { t: i * 0.06, g: ahr(0.05, 0.003, 0.03, 0.05), to: lp });
        v.noise('white', { t: i * 0.06, g: perc(0.04, 0.01), to: v.filt('bandpass', 3000 + i * 600, 2.5) });
      });
      v.bell(midiHz(HI + 12), { t: 0.24, g: 0.06, dec: 0.5, ratio: 2, index: 1.2 });
    },
  },
  netPing: {
    cap: 1,
    verb: 0.35,
    play(v) {
      const e = v.echo(0.22, 0.32, { wet: 0.45, tone: 2600 });
      // the dry ping, plus a send into the echo
      v.tone('sine', [[0, midiHz(HI + 12)], [0.25, midiHz(HI + 11), 'e']], { g: perc(0.07, 0.28) });
      v.tone('sine', [[0, midiHz(HI + 12)], [0.25, midiHz(HI + 11), 'e']], { g: perc(0.05, 0.28), to: e });
      v.tone('sine', midiHz(HI + 24), { g: perc(0.02, 0.08) });
    },
  },
  netLink: {
    cap: 1,
    verb: 0.25,
    play(v) {
      const lp = v.filt('lowpass', 7500);
      // call ... answer ... both together
      v.tone('p25', midiHz(HI), { g: ahr(0.11, 0.004, 0.06, 0.06), to: lp });
      v.tone('p25', midiHz(LO), { t: 0.12, g: ahr(0.11, 0.004, 0.06, 0.06), to: lp });
      v.tone('triangle', midiHz(HI), { t: 0.26, g: ahr(0.08, 0.006, 0.16, 0.22), to: lp });
      v.tone('triangle', midiHz(LO), { t: 0.26, g: ahr(0.08, 0.006, 0.16, 0.22), to: lp });
      v.tone('sine', midiHz(LO - 12), { t: 0.26, g: ahr(0.04, 0.01, 0.12, 0.25) });
      v.bell(midiHz(HI + 12), { t: 0.3, g: 0.07, dec: 0.7, ratio: 2, index: 1 });
      v.noise('white', { t: 0.26, g: [[0, 0], [0.04, 0.03], [0.45, 0.0001, 'e']], to: v.filt('highpass', 7000) });
    },
  },
  netLost: {
    cap: 1,
    verb: 0.15,
    play(v) {
      const lp = v.filt('lowpass', [[0, 5000], [0.5, 900, 'e']]);
      v.tone('square', [[0, midiHz(LO)], [0.45, midiHz(LO - 14), 'e']], { g: ahr(0.07, 0.005, 0.25, 0.2), to: lp });
      v.tone('square', [[0, midiHz(LO) * 1.012], [0.45, midiHz(LO - 15), 'e']], { g: ahr(0.05, 0.005, 0.25, 0.2), to: lp });
      v.crackle({ t: 0.18, d: 0.4, n: 26, g: 0.06, f: 2600, q: 1.2 });
    },
  },
  netBack: {
    cap: 1,
    verb: 0.2,
    play(v) {
      const lp = v.filt('lowpass', [[0, 1200], [0.3, 6500, 'e']]);
      v.tone('square', [[0, midiHz(LO - 12)], [0.28, midiHz(LO), 'e']], { g: ahr(0.06, 0.01, 0.2, 0.08), to: lp });
      v.tone('triangle', midiHz(HI), { t: 0.3, g: ahr(0.1, 0.005, 0.12, 0.2), to: lp });
      v.tone('triangle', midiHz(LO), { t: 0.3, g: ahr(0.1, 0.005, 0.12, 0.2), to: lp });
      v.bell(midiHz(HI + 12), { t: 0.32, g: 0.05, dec: 0.5, ratio: 2, index: 1 });
    },
  },
} satisfies Record<string, Recipe>;

export type NetSfxName = keyof typeof NET_RECIPES;
