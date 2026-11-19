// Fusion: Prism Fusion (prism_fusion) and the first Fusion Monster, Trinity Crystal Wyrm (3 × crystal_wyrm), the Fusion Deck.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, type Action, type GameEvent, type GameState, type PlayerId, type Uid } from '../../src/engine';
import { chooseAction } from '../../src/engine/bot';
import { CARDS, isFusionMonster } from '../../src/data/cards';
import { FUSION_DECK_MAX, addBlocker, deckStats, presetById, repairDeck, splitDeck, validateDeck, expandedDeck, autoFillDeck } from '../../src/data/decks';
import { checkInvariants, isListed, play, scenario, uidOf } from './helpers';

type Act = Extract<Action, { type: 'activateSpell' }>;

function fusionActs(s: GameState, p: PlayerId = 0): Act[] {
  return legalActions(s).filter((a): a is Act => a.type === 'activateSpell' && a.target?.kind === 'fusion' && a.player === p);
}

function wyrms(s: GameState, p: PlayerId = 0): Uid[] {
  return Object.values(s.cards).filter((c) => c.cardId === 'crystal_wyrm' && c.owner === p).map((c) => c.uid);
}

function fuse(s: GameState, materials: Uid[], p: PlayerId = 0): { state: GameState; events: GameEvent[] } {
  const key = [...materials].sort((a, b) => a - b).join(',');
  const a = fusionActs(s, p).find((x) => x.target?.kind === 'fusion' && x.target.materials.join(',') === key);
  expect(a, `a fusion with materials ${key}`).toBeTruthy();
  return play(s, a!);
}

describe('card data', () => {
  it('Trinity Crystal Wyrm: LIGHT Dragon Lv12 4500/3800, no effect, materials 3 × crystal_wyrm; Prism Fusion is a Normal Spell', () => {
    const t = CARDS.trinity_crystal_wyrm;
    expect(t.kind).toBe('monster');
    if (t.kind !== 'monster') return;
    expect([t.attribute, t.race, t.level, t.atk, t.def, t.effect]).toEqual(['LIGHT', 'Dragon', 12, 4500, 3800, 'none']);
    expect(t.fusion?.materials).toEqual(['crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm']);
    expect(t.flavor.length).toBeGreaterThan(10);
    expect(isFusionMonster('trinity_crystal_wyrm')).toBe(true);
    expect(isFusionMonster('crystal_wyrm')).toBe(false);
    const f = CARDS.prism_fusion;
    expect(f.kind === 'spell' && f.spellType === 'normal' && f.effect === 'fusionSummon').toBe(true);
  });
});

describe('Prism Fusion', () => {
  it('from the hand: 3 wyrms in hand + the spell; materials to the GY, the wyrm arrives in the first free zone; events in order', () => {
    const s = scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] } });
    const acts = fusionActs(s);
    expect(acts).toHaveLength(1);
    const spell = uidOf(s, 'prism_fusion');
    const tri = uidOf(s, 'trinity_crystal_wyrm');
    const r = play(s, acts[0]);
    const ps = r.state.players[0];
    expect(ps.hand).toEqual([]);
    expect(ps.fusionDeck ?? []).toEqual([]);
    expect(ps.monsters[0]?.uid).toBe(tri);
    expect(ps.monsters[0]?.faceUp && ps.monsters[0]?.position === 'attack').toBe(true);
    expect(ps.graveyard.map((u) => r.state.cards[u].cardId).sort()).toEqual(['crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm', 'prism_fusion']);
    const types = r.events.map((e) => e.type);
    const fi = types.indexOf('fusionSummon');
    expect(types.slice(fi - 1, fi + 6)).toEqual(['activate', 'fusionSummon', 'toGraveyard', 'toGraveyard', 'toGraveyard', 'summon', 'toGraveyard']);
    const fe = r.events[fi] as Extract<GameEvent, { type: 'fusionSummon' }>;
    expect(fe).toMatchObject({ player: 0, spellUid: spell, spellCardId: 'prism_fusion', uid: tri, cardId: 'trinity_crystal_wyrm', zone: 0 });
    expect(fe.materials.every((m) => m.from === 'hand' && m.zone === null && m.cardId === 'crystal_wyrm')).toBe(true);
    const sum = r.events[fi + 4] as Extract<GameEvent, { type: 'summon' }>;
    expect(sum).toMatchObject({ method: 'special', from: 'fusionDeck', sourceUid: spell, uid: tri, zone: 0 });
  });

  it('from the field (face-down too): the materials leave their zones; the wyrm takes the lowest freed zone; equips go by rule', () => {
    const s = scenario({
      p0: {
        hand: ['prism_fusion'],
        monsters: ['stone_sentinel', 'crystal_wyrm', { id: 'crystal_wyrm', faceUp: false }, 'crystal_wyrm'],
        spellTraps: [{ id: 'dragon_blade', equippedTo: 1 }],
        fusionDeck: ['trinity_crystal_wyrm'],
      },
      zones: 5,
    });
    const r = fuse(s, wyrms(s));
    const ps = r.state.players[0];
    expect(r.state.cards[ps.monsters[1]!.uid].cardId).toBe('trinity_crystal_wyrm');
    expect(ps.monsters[0] && r.state.cards[ps.monsters[0].uid].cardId).toBe('stone_sentinel');
    expect(ps.monsters[2]).toBeNull();
    expect(ps.monsters[3]).toBeNull();
    expect(ps.spellTraps[0]).toBeNull(); // dragon_blade lost its host
    const fe = r.events.find((e) => e.type === 'fusionSummon') as Extract<GameEvent, { type: 'fusionSummon' }>;
    expect(fe.materials.map((m) => [m.from, m.zone, m.faceUp])).toEqual([
      ['monster', 1, true],
      ['monster', 2, false],
      ['monster', 3, true],
    ]);
    expect(r.events.some((e) => e.type === 'destroy' && e.cardId === 'dragon_blade' && e.reason === 'rule')).toBe(true);
  });

  it('mixed hand + field; every combination is offered when more than three wyrms are available', () => {
    const s = scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm'], monsters: ['crystal_wyrm', 'crystal_wyrm', 'ember_wolf'], fusionDeck: ['trinity_crystal_wyrm'] } });
    expect(fusionActs(s)).toHaveLength(4); // C(4, 3)
    const hand = s.players[0].hand.filter((u) => s.cards[u].cardId === 'crystal_wyrm');
    const field = s.players[0].monsters[1]!.uid;
    const r = fuse(s, [...hand, field]);
    const ps = r.state.players[0];
    expect(r.state.cards[ps.monsters[1]!.uid].cardId).toBe('trinity_crystal_wyrm');
    expect(r.state.cards[ps.monsters[0]!.uid].cardId).toBe('crystal_wyrm');
    const fe = r.events.find((e) => e.type === 'fusionSummon') as Extract<GameEvent, { type: 'fusionSummon' }>;
    expect(fe.materials.map((m) => m.from)).toEqual(['hand', 'hand', 'monster']);
  });

  it('materials go to the GY (not banished, not tributed: no tribute events)', () => {
    const s = scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm'], monsters: ['crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] } });
    const r = fuse(s, wyrms(s));
    expect(r.events.some((e) => e.type === 'tribute')).toBe(false);
    for (const u of wyrms(s)) expect(r.state.players[0].graveyard).toContain(u);
    expect(r.state.players[0].banished ?? []).toEqual([]);
  });

  it('is a Special Summon: the Normal Summon of the turn is still available afterwards', () => {
    const s = scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm', 'ember_wolf'], fusionDeck: ['trinity_crystal_wyrm'] } });
    const r = fuse(s, wyrms(s));
    expect(r.state.players[0].normalSummonUsed).toBe(false);
    const wolf = uidOf(r.state, 'ember_wolf');
    expect(isListed(r.state, { type: 'normalSummon', player: 0, uid: wolf, zone: 1, tributes: [] })).toBe(true);
    // and the other way round: after a Normal Summon the fusion is still legal
    const s2 = scenario({ p0: { hand: ['ember_wolf', 'prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] } });
    const r2 = play(s2, { type: 'normalSummon', player: 0, uid: uidOf(s2, 'ember_wolf'), zone: 0, tributes: [] });
    expect(fusionActs(r2.state)).toHaveLength(1);
  });

  it('the Fusion Monster cannot be Normal Summoned / Set (even if it were in the hand)', () => {
    const s = scenario({ p0: { hand: ['trinity_crystal_wyrm'], monsters: ['stone_sentinel', 'stone_sentinel', 'stone_sentinel'] } });
    const uid = uidOf(s, 'trinity_crystal_wyrm');
    expect(legalActions(s).some((a) => (a.type === 'normalSummon' || a.type === 'setMonster') && a.uid === uid)).toBe(false);
    expect(() => apply(s, { type: 'normalSummon', player: 0, uid, zone: 0, tributes: [s.players[0].monsters[0]!.uid, s.players[0].monsters[1]!.uid] })).toThrow();
  });

  it('is not offered without the materials, without the Fusion Monster, or without a zone to land in', () => {
    expect(fusionActs(scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] } }))).toHaveLength(0);
    expect(fusionActs(scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'] } }))).toHaveLength(0);
    // full field and all materials in the hand: nowhere to go
    const full = scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], monsters: ['stone_sentinel', 'stone_sentinel', 'stone_sentinel'], fusionDeck: ['trinity_crystal_wyrm'] } });
    expect(fusionActs(full)).toHaveLength(0);
    // a borrowed (puppet_string) wyrm is not the activator's to send
    const s = scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'puppet_string'], fusionDeck: ['trinity_crystal_wyrm'] }, p1: { monsters: ['crystal_wyrm'] } });
    const r = play(s, { type: 'activateSpell', player: 0, uid: uidOf(s, 'puppet_string'), target: { kind: 'monster', ref: { player: 1, zone: 'monster', index: 0 } } });
    expect(fusionActs(r.state)).toHaveLength(0);
  });

  it('a set Prism Fusion can be activated from the field', () => {
    const s = scenario({ p0: { hand: ['crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], spellTraps: ['prism_fusion'], fusionDeck: ['trinity_crystal_wyrm'] } });
    const r = play(s, fusionActs(s)[0]);
    expect(r.state.players[0].spellTraps[0]).toBeNull();
    expect(r.state.players[0].monsters[0] && r.state.cards[r.state.players[0].monsters[0].uid].cardId).toBe('trinity_crystal_wyrm');
  });

  it('toppling_tower may answer the Fusion Summon (a Special Summon, ATK >= 1800); chasm_trap may not', () => {
    const s = scenario({
      p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] },
      p1: { spellTraps: ['chasm_trap', 'toppling_tower'] },
    });
    const r = play(s, fusionActs(s)[0]);
    expect(r.state.pending?.kind).toBe('trapResponse');
    if (r.state.pending?.kind !== 'trapResponse') return;
    expect(r.state.pending.options).toEqual([uidOf(s, 'toppling_tower')]);
  });
});

describe('the Fusion Deck', () => {
  it('a bounced Fusion Monster goes back to its owner\'s Fusion Deck (homecoming), not the hand', () => {
    const s = scenario({
      phase: 'battle',
      p0: { monsters: ['trinity_crystal_wyrm'] },
      p1: { spellTraps: ['homecoming'] },
    });
    const tri = uidOf(s, 'trinity_crystal_wyrm');
    const r1 = play(s, { type: 'attack', player: 0, attackerZone: 0, targetZone: null });
    expect(r1.state.pending?.kind).toBe('trapResponse');
    const r = play(r1.state, { type: 'respond', player: 1, uid: uidOf(s, 'homecoming') });
    expect(r.state.players[0].hand).not.toContain(tri);
    expect(r.state.players[0].fusionDeck).toEqual([tri]);
    expect(r.state.players[0].monsters[0]).toBeNull();
    expect(r.events.some((e) => e.type === 'toFusionDeck' && e.uid === tri && e.from === 'monster' && e.zone === 0)).toBe(true);
    expect(r.events.some((e) => e.type === 'toHand')).toBe(false);
  });

  it('cycle_of_graves shuffles a Fusion Monster back into the Fusion Deck, not the main deck', () => {
    const s = scenario({ p0: { hand: ['cycle_of_graves'], graveyard: ['ember_wolf', 'trinity_crystal_wyrm', 'tide_golem'] } });
    const tri = uidOf(s, 'trinity_crystal_wyrm');
    const r = play(s, { type: 'activateSpell', player: 0, uid: uidOf(s, 'cycle_of_graves') });
    expect(r.state.players[0].fusionDeck).toEqual([tri]);
    expect(r.state.players[0].deck).not.toContain(tri);
    expect(r.state.players[0].hand).not.toContain(tri);
  });

  it('newGame: Fusion Monsters in a deck list go to the Fusion Deck (never drawn); main uids are unchanged', () => {
    const main = Array.from({ length: 20 }, () => 'stone_sentinel' as const);
    const plain = newGame({ seed: 3, decks: [main, main], noShuffle: true, firstPlayer: 0 }).state;
    const g = newGame({ seed: 3, decks: [[...main, 'trinity_crystal_wyrm'], main], fusionDecks: [[], ['trinity_crystal_wyrm']], noShuffle: true, firstPlayer: 0 }).state;
    checkInvariants(g);
    expect(g.players[0].fusionDeck).toHaveLength(1);
    expect(g.players[1].fusionDeck).toHaveLength(1);
    expect(g.players[0].deck).toEqual(plain.players[0].deck);
    expect(g.players[1].hand).toEqual(plain.players[1].hand);
    expect(g.players[0].fusionDeck!.every((u) => g.cards[u].cardId === 'trinity_crystal_wyrm')).toBe(true);
  });
});

describe('deck builder rules for the Fusion Deck', () => {
  const main40 = [
    ...Array.from({ length: 3 }, () => 'crystal_wyrm' as const),
    ...Array.from({ length: 3 }, () => 'ember_wolf' as const),
    ...Array.from({ length: 3 }, () => 'tide_golem' as const),
    ...Array.from({ length: 3 }, () => 'storm_hawk' as const),
    ...Array.from({ length: 3 }, () => 'lumen_sprite' as const),
    ...Array.from({ length: 3 }, () => 'volt_lizard' as const),
    ...Array.from({ length: 3 }, () => 'coral_serpent' as const),
    ...Array.from({ length: 3 }, () => 'stone_sentinel' as const),
    ...Array.from({ length: 3 }, () => 'prism_fusion' as const),
    ...Array.from({ length: 3 }, () => 'judgment_bolt' as const),
    ...Array.from({ length: 3 }, () => 'healing_spring' as const),
    ...Array.from({ length: 3 }, () => 'soul_recall' as const),
    ...Array.from({ length: 3 }, () => 'mirror_barrier' as const),
    'chasm_trap',
  ];
  it('Fusion Monsters do not count toward the 40..80 main deck; 0..5 of them are legal; a 6th is refused', () => {
    expect(main40).toHaveLength(40);
    expect(validateDeck(main40).ok).toBe(true);
    const with3 = [...main40, 'trinity_crystal_wyrm', 'trinity_crystal_wyrm', 'trinity_crystal_wyrm'];
    const st = deckStats(with3);
    expect(st.size).toBe(40);
    expect(st.fusion).toBe(3);
    expect(st.monsters).toBe(24);
    expect(validateDeck(with3).ok).toBe(true);
    // the Fusion Deck alone never makes a 39-card main deck legal
    expect(validateDeck([...main40.slice(1), 'trinity_crystal_wyrm']).issues.map((i) => i.code)).toContain('size');
    // copy limit 3 and the 5-card cap (a second Fusion Monster id does not exist yet: the copy limit trips first)
    expect(addBlocker(with3, 'trinity_crystal_wyrm')).toMatch(/Max 3/);
    expect(addBlocker([...main40, 'trinity_crystal_wyrm'], 'trinity_crystal_wyrm')).toBeNull();
    expect(FUSION_DECK_MAX).toBe(5);
    // a full 80-card main deck still takes a Fusion Monster
    const full = [...main40, ...main40];
    expect(addBlocker(full, 'trinity_crystal_wyrm')).toBeNull();
  });

  it('crystal_wyrm may be run at 3 copies (not single-copy)', () => {
    expect(addBlocker(['crystal_wyrm', 'crystal_wyrm'], 'crystal_wyrm')).toBeNull();
    expect(addBlocker(['crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], 'crystal_wyrm')).toMatch(/Max 3/);
  });

  it('repairDeck keeps the Fusion Deck apart from the main deck size (copy limit 3 still holds)', () => {
    const r = repairDeck([...main40, ...Array.from({ length: 4 }, () => 'trinity_crystal_wyrm')]);
    expect(splitDeck(r.cards).main).toEqual(main40);
    expect(splitDeck(r.cards).fusion).toHaveLength(3);
    expect(r.repeats).toBe(1);
  });

  it('presets with crystal_wyrm + Prism Fusion run 3 wyrms and bring Trinity in the Fusion Deck; samplers keep 40 main cards', () => {
    for (const id of ['isik', 'dengeli']) {
      const p = presetById(id)!;
      const { main, fusion } = splitDeck(p.cards);
      expect(main).toHaveLength(40);
      expect(main.filter((x) => x === 'crystal_wyrm')).toHaveLength(3);
      expect(main).toContain('prism_fusion');
      expect(fusion).toEqual(['trinity_crystal_wyrm']);
      expect(validateDeck(p.cards).ok).toBe(true);
    }
    for (let seed = 0; seed < 20; seed++) {
      const d = expandedDeck(seed, 0);
      const { main, fusion } = splitDeck(d);
      expect(main).toHaveLength(40);
      expect(fusion.length > 0).toBe(main.includes('crystal_wyrm'));
      const filled = autoFillDeck([], seed);
      expect(splitDeck(filled).fusion).toEqual([]);
      expect(filled).toHaveLength(40);
    }
  });
});

describe('the bot', () => {
  it('fuses when it holds the spell, the materials and the Fusion Monster', () => {
    const s = scenario({ p0: { hand: ['prism_fusion', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] } });
    const a = chooseAction(s, 1);
    expect(a.type === 'activateSpell' && a.target?.kind === 'fusion').toBe(true);
  });
  it('does not throw away three strong wyrms already on the field', () => {
    const s = scenario({ p0: { hand: ['prism_fusion'], monsters: ['crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm'], fusionDeck: ['trinity_crystal_wyrm'] } });
    const a = chooseAction(s, 1);
    expect(a.type === 'activateSpell' && a.target?.kind === 'fusion').toBe(false);
  });
});
