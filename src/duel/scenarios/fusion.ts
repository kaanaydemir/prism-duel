// Fusion — Prism Fusion (prism_fusion) + Trinity Crystal Wyrm (3 × crystal_wyrm), the Fusion Deck pile and the set-card inspect.
//   node tools/shot.mjs "?dev=duel&s=fuBoard&look=v3" --fresh --step 1500 --scale 3 --out shots/fusion/board.png
//   node tools/shot.mjs "?dev=duel&s=fuHand&look=v3" --fresh --film 24 --every 160 --cols 6 --out shots/fusion/hand.png
//   node tools/shot.mjs "?dev=duel&s=fuBot&look=v3&mode=vsBot" --film 30 --every 300 --cols 6 --out shots/fusion/bot.png   (no --fresh: a fresh restart is hot-seat)
import type { Scenario, ScenarioApi, Step } from '../scenarios';
import type { Action, PlayerId } from '../../engine/types';

/**
 * The legal Prism Fusion of `p` whose materials hold exactly `hand` materials from the hand (the rest from the field);
 * the first one in the engine's order otherwise.
 */
const fuse =
  (p: PlayerId, fromHand?: number): Step =>
  (D: ScenarioApi) => {
    const legal = D.legal?.() ?? [];
    const acts = legal.filter((a): a is Extract<Action, { type: 'activateSpell' }> => a.type === 'activateSpell' && a.player === p && a.target?.kind === 'fusion');
    if (fromHand === undefined) return acts[0] ?? null;
    const st = (D as unknown as { state?: () => { players: { hand: number[] }[] } }).state?.();
    const hand = st ? st.players[p].hand : [];
    return acts.find((a) => a.target?.kind === 'fusion' && a.target.materials.filter((u) => hand.includes(u)).length === fromHand) ?? acts[0] ?? null;
  };

const PACK: Record<string, Scenario> = {
  // idle board: both Fusion Deck pads (P1 1 card, P2 2), set cards of both sides, a face-down monster each
  fuBoard: {
    desc: 'Fusion: idle board with both Fusion Deck pads (P1 1, P2 2) and set cards (hover your own set card: the inspect shows it)',
    stage: {
      p0: {
        hand: ['prism_fusion', 'crystal_wyrm', 'ember_wolf'],
        monsters: ['crystal_wyrm', { id: 'tide_golem', faceUp: false }],
        spellTraps: ['mirror_barrier', 'prism_fusion'],
        graveyard: ['crystal_wyrm'],
        fusionDeck: ['trinity_crystal_wyrm'],
      },
      p1: {
        monsters: [null, 'storm_hawk', { id: 'stone_sentinel', faceUp: false }],
        spellTraps: [null, 'chasm_trap', null, 'healing_spring'],
        fusionDeck: ['trinity_crystal_wyrm', 'trinity_crystal_wyrm'],
      },
    },
    steps: [],
  },
  // the set-card inspect: hover the own set spell, then the opponent's set trap, then the own Fusion Deck
  fuInspect: {
    desc: 'Fusion: hover your set Prism Fusion (real card, "Set"), the opponent\'s set card (a back), your Fusion Deck (its count)',
    stage: {
      p0: { hand: ['crystal_wyrm'], monsters: [{ id: 'tide_golem', faceUp: false }], spellTraps: ['mirror_barrier', 'prism_fusion'], fusionDeck: ['trinity_crystal_wyrm'] },
      p1: { spellTraps: [null, 'chasm_trap'], fusionDeck: ['trinity_crystal_wyrm'] },
    },
    steps: [{ ui: 'move', at: { zone: [0, 'spellTrap', 1] }, ms: 600 }],
  },
  fuInspectOpp: {
    desc: 'Fusion: hover the opponent\'s set card: only a generic face-down card',
    stage: { p0: { spellTraps: ['mirror_barrier'], fusionDeck: ['trinity_crystal_wyrm'] }, p1: { spellTraps: [null, 'chasm_trap'], fusionDeck: ['trinity_crystal_wyrm'] } },
    steps: [{ ui: 'move', at: { zone: [1, 'spellTrap', 1] }, ms: 600 }],
  },
  fuInspectDeck: {
    desc: 'Fusion: hover your own Fusion Deck: its count and its top card',
    stage: { p0: { fusionDeck: ['trinity_crystal_wyrm'] }, p1: { fusionDeck: ['trinity_crystal_wyrm', 'trinity_crystal_wyrm'] } },
    steps: [{ ui: 'move', at: { fusion: 0 }, ms: 600 }],
  },
  // from the hand: three wyrms + the spell in hand
  fuHand: {
    desc: 'Fusion: Prism Fusion from the hand with 3 Crystal Wyrms in hand → Trinity Crystal Wyrm',
    stage: { p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm', 'ember_wolf'], fusionDeck: ['trinity_crystal_wyrm'] }, p1: { monsters: [null, 'storm_hawk'] } },
    steps: [fuse(0)],
  },
  // field + hand: one wyrm in hand, two on the field (one face-down, one with an equip that breaks)
  fuMixed: {
    desc: 'Fusion: 1 wyrm from the hand + 2 from the field (one set, one equipped) → Trinity Crystal Wyrm in the freed zone',
    stage: {
      p0: {
        hand: ['prism_fusion', 'crystal_wyrm'],
        monsters: ['ember_wolf', 'crystal_wyrm', { id: 'crystal_wyrm', faceUp: false }],
        spellTraps: [null, { id: 'dragon_blade', equippedTo: 1 }],
        fusionDeck: ['trinity_crystal_wyrm'],
      },
      p1: { monsters: [null, 'storm_hawk'] },
    },
    steps: [fuse(0, 1)],
  },
  // player 2 fuses (the mirrored side); hot-seat, the spell played from the hidden hand
  fuHandP2: {
    desc: 'Fusion (P2): Prism Fusion from the hidden hand → Trinity Crystal Wyrm on the far side',
    stage: { active: 1, p1: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] }, p0: { monsters: [null, 'storm_hawk'] } },
    steps: [fuse(1)],
  },
  // the CPU fuses on its own (P2 = bot). Film WITHOUT --fresh with &mode=vsBot
  fuBot: {
    desc: 'Fusion (P2 = computer; with &mode=vsBot, no --fresh): the bot plays Prism Fusion itself, then goes on with its turn',
    stage: { active: 1, p1: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] }, p0: { monsters: [null, 'tide_golem'], fusionDeck: ['trinity_crystal_wyrm'] } },
    steps: [],
  },
};

export default PACK;
