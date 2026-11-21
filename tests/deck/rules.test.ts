import { describe, expect, it } from 'vitest';
import { ALL_CARDS, COLLECTIBLE_CARDS, CARDS, DEFAULT_DECK, SEAL_IDS, isMonster, type CardId } from '../../src/data/cards';
import {
  DECK_MAX, DECK_MIN, DECK_SIZE, DECK_STORE_MAX, EXPANDED_POOL, FUSION_DECK_MAX, MAX_COPIES, PRESET_DEFS, RETIRED_SUBSTITUTES, addBlocker, autoFillDeck, buildPreset, classicDeck, copiesOf, deckStats, expandedDeck, isSealCard, maxCopies, missingPins, presetById, presetDecks, repairDeck, validateDeck, splitDeck,
} from '../../src/data/decks';
import { newGame } from '../../src/engine';
import { isRetired } from '../../src/data/cards';
import { visibleIds } from '../../src/scenes/deck/pool';

const monsters = COLLECTIBLE_CARDS.filter(isMonster).filter((m) => !m.fusion); // Fusion Monsters live in the Fusion Deck
const high = monsters.filter((m) => m.level >= 7).map((m) => m.id);
const low = monsters.filter((m) => m.level < 7 && !SEAL_IDS.includes(m.id as never)).map((m) => m.id);
const back = COLLECTIBLE_CARDS.filter((c) => !isMonster(c)).map((c) => c.id);

/** n copies of each id, in order, up to `size` cards. */
const spread = (ids: string[], size: number, per = 2): string[] => {
  const out: string[] = [];
  for (let k = 0; k < per; k++) for (const id of ids) if (out.length < size) out.push(id);
  return out;
};

describe('deck rules (official deck construction: 40..60 cards, 3 copies, seals 1, no ratio rules)', () => {
  it('constants', () => {
    expect(DECK_MIN).toBe(40);
    expect(DECK_MAX).toBe(60);
    expect(FUSION_DECK_MAX).toBe(15);
    expect(DECK_SIZE).toBe(40);
    expect(MAX_COPIES).toBe(3);
    expect(maxCopies('seal_head')).toBe(1);
    expect(maxCopies('crystal_wyrm')).toBe(3);
  });

  it('accepts the classic deck (the original 20 doubled)', () => {
    const c = classicDeck();
    expect(c).toHaveLength(40);
    expect(c).toEqual([...DEFAULT_DECK, ...DEFAULT_DECK]);
    expect(validateDeck(c).ok).toBe(true);
    expect(DEFAULT_DECK).toHaveLength(20); // the engine default stays the original 20
  });

  it('size bounds: 39 and 61 fail, 40 and 60 pass', () => {
    const ok = (n: number) => validateDeck(spread([...low, ...back], n, 3));
    expect(ok(39).issues.map((i) => i.code)).toContain('size');
    expect(ok(40).ok).toBe(true);
    expect(ok(60).ok).toBe(true);
    const over = ok(61);
    expect(over.stats.size).toBe(61);
    expect(over.ok).toBe(false);
    expect(over.issues.map((i) => i.code)).toEqual(['size']);
    expect(over.issues[0].text).toBe('Deck can hold at most 60 cards: 1 too many');
    expect(ok(80).issues[0].text).toBe('Deck can hold at most 60 cards: 20 too many');
  });

  it('copy limit: 3 copies pass, a 4th fails; each seal at most 1', () => {
    expect(deckStats(spread(low, 12, 3)).over).toEqual([]);
    const four = validateDeck([...spread([...low, ...back], 36, 1), low[0], low[0], low[0], low[0]]);
    expect(four.issues.some((i) => i.code === 'copies')).toBe(true);
    expect(four.issues.find((i) => i.code === 'copies')!.text).toMatch(/Too many copies/);
    const seals = validateDeck([...spread([...low, ...back], 38, 1), 'seal_head', 'seal_head']);
    expect(seals.stats.over).toContain('seal_head');
    expect(addBlocker(['seal_head'], 'seal_head')).toMatch(/max 1/);
    expect(addBlocker(['seal_head'], 'seal_arm_r')).toBeNull();
    expect(addBlocker([low[0], low[0], low[0]], low[0])).toMatch(/max 3/i);
    expect(addBlocker([low[0], low[0]], low[0])).toBeNull();
  });

  it('no ratio rules: a deck with no monsters is legal, and so is any share of monsters', () => {
    const noMon = spread(back, 40, 3);
    expect(noMon).toHaveLength(40);
    expect(deckStats(noMon).monsters).toBe(0);
    expect(validateDeck(noMon)).toMatchObject({ ok: true, issues: [] });
    const allMon = spread(low, 40, 3);
    expect(allMon).toHaveLength(40);
    expect(validateDeck(allMon).ok).toBe(true);
    // one monster among 59 spells / traps, at the 60-card limit
    expect(validateDeck([low[0], ...spread(back, 59, 3)]).ok).toBe(true);
  });

  it('no Level 7+ cap: every Lv 7+ monster at 3 copies is legal and is never refused by the builder', () => {
    expect(high.length).toBeGreaterThan(0);
    const tribute = spread(high, high.length * 3, 3);
    // as many Lv 7+ monsters as the pool holds (3 copies each), topped up to 40 only when the pool is that small
    const deck = [...tribute.slice(0, 60), ...spread(low, Math.max(0, 40 - tribute.length), 3)];
    expect(deckStats(deck).high).toBe(Math.min(60, tribute.length));
    expect(validateDeck(deck)).toMatchObject({ ok: true, issues: [] });
    let d: string[] = [];
    for (const id of high) for (let k = 0; k < 3; k++) {
      if (d.length >= DECK_MAX) break;
      expect(addBlocker(d, id), `${id} copy ${k + 1}`).toBeNull();
      d = [...d, id];
    }
  });

  it('the Fusion Deck holds 0..15 cards: 15 pass, a 16th is reported (ids repeated: the pool has too few Fusion Monsters)', () => {
    const fusionIds = COLLECTIBLE_CARDS.filter((c) => isMonster(c) && c.fusion).map((c) => c.id);
    expect(fusionIds.length).toBeGreaterThan(0);
    const main = spread([...low, ...back], 40, 3);
    const fus = (n: number) => Array.from({ length: n }, (_, i) => fusionIds[i % fusionIds.length]);
    const at15 = validateDeck([...main, ...fus(15)]);
    expect(at15.stats).toMatchObject({ size: 40, fusion: 15 });
    expect(at15.issues.map((i) => i.code)).not.toContain('fusion');
    expect(at15.issues.map((i) => i.code)).not.toContain('size');
    const at16 = validateDeck([...main, ...fus(16)]);
    expect(at16.issues.find((i) => i.code === 'fusion')!.text).toBe('Fusion Deck can hold at most 15 cards: 1 too many');
    // a Fusion Monster follows the normal 3-copy limit
    expect(validateDeck([...main, ...fus(Math.min(15, fusionIds.length * 3))]).ok).toBe(true);
    expect(maxCopies(fusionIds[0])).toBe(3);
    expect(addBlocker([...main, fusionIds[0], fusionIds[0], fusionIds[0]], fusionIds[0])).toMatch(/Max 3/);
    // repairDeck (saved lists) cuts the Fusion Deck at 15, counted apart from the main deck
    if (fusionIds.length >= 6) expect(splitDeck(repairDeck([...main, ...fus(18)]).cards).fusion).toHaveLength(15);
  });

  it('reports unknown ids and counts kinds / curve', () => {
    const r = validateDeck([...spread(low, 39, 2), 'no_such_card']);
    expect(r.issues.some((i) => i.code === 'unknown')).toBe(true);
    const s = deckStats(classicDeck());
    expect(s.monsters + s.spells + s.traps).toBe(s.size);
    expect(s.curve.reduce((a, b) => a + b, 0)).toBe(s.monsters);
    expect(copiesOf(classicDeck(), DEFAULT_DECK[0])).toBe(2);
  });

  it('addBlocker: full deck and empty deck', () => {
    expect(addBlocker([], low[0])).toBeNull();
    const full = spread([...low, ...back], 60, 3);
    const free = (d: string[]) => (low.find((x) => copiesOf(d, x) < 3) ?? back.find((x) => copiesOf(d, x) < 3)!) as CardId;
    expect(addBlocker(full, free(full))).toBe('Deck is full (60/60)');
    expect(addBlocker(full.slice(0, 59), free(full.slice(0, 59)))).toBeNull();
    // an older 72-card save: the reason says how many cards must go
    const old = spread([...low, ...back], 72, 3);
    expect(addBlocker(old, free(old))).toBe('Deck can hold at most 60 cards: 12 too many');
  });

  it('knows the five seals', () => {
    for (const id of SEAL_IDS) expect(isSealCard(id)).toBe(true);
    expect(isSealCard('crystal_wyrm')).toBe(false);
  });

  it('repairs a deck: drops unknown ids and copies over the limit, never cuts a 61..80-card save, never throws', () => {
    const r = repairDeck(['crystal_wyrm', 'gone_card', 'crystal_wyrm', 42, null, 'ember_wolf', 'seal_head', 'seal_head']);
    expect(r.cards).toEqual(['crystal_wyrm', 'crystal_wyrm', 'ember_wolf', 'seal_head']);
    expect(r.missing).toBe(3);
    expect(r.repeats).toBe(1);
    const four = repairDeck(['crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm', 'crystal_wyrm']);
    expect(four.cards).toHaveLength(3);
    expect(four.repeats).toBe(1);
    const big = repairDeck(spread([...low, ...back], 120, 3));
    expect(big.cards.length).toBeLessThanOrEqual(DECK_STORE_MAX);
    expect(DECK_STORE_MAX).toBe(80);
    // a deck saved under the old 80-card limit keeps every card (it is reported as oversized, not trimmed)
    const old80 = spread([...low, ...back], 80, 3);
    expect(repairDeck(old80)).toMatchObject({ cards: old80, trimmed: 0 });
    expect(validateDeck(repairDeck(old80).cards).issues.map((i) => i.text)).toEqual(['Deck can hold at most 60 cards: 20 too many']);
    expect(repairDeck('nonsense').cards).toEqual([]);
    expect(repairDeck(undefined).cards).toEqual([]);
  });
});

describe('autoFillDeck (Rastgele doldur)', () => {
  it('fills an empty deck legally for many seeds', () => {
    for (let seed = 0; seed < 60; seed++) {
      const d = autoFillDeck([], seed);
      const v = validateDeck(d);
      expect(v.ok, `seed ${seed}: ${v.issues.map((i) => i.text).join(' | ')}`).toBe(true);
      expect(d).toHaveLength(DECK_SIZE);
    }
  });

  it('keeps the cards already chosen, is seeded, and fills from a partial or tribute-heavy start', () => {
    const start: CardId[] = [...high, ...high, back[0]];
    const d = autoFillDeck(start, 7);
    for (const id of start) expect(d).toContain(id);
    expect(validateDeck(d).ok).toBe(true);
    expect(autoFillDeck(start, 7)).toEqual(d);
    expect(autoFillDeck(start, 8)).not.toEqual(d);
  });

  it('drops repeats and unknown ids of its input', () => {
    const d = autoFillDeck(['crystal_wyrm', 'crystal_wyrm', 'gone'], 3);
    expect(d.filter((x) => x === 'crystal_wyrm').length).toBeLessThanOrEqual(3);
    expect(d.includes('gone' as never)).toBe(false);
    expect(validateDeck(d).ok).toBe(true);
  });

  it('fills to a bigger target (up to 60) and spreads copies', () => {
    for (const target of [40, 55, 60]) {
      const d = autoFillDeck([], target, COLLECTIBLE_CARDS, target);
      expect(d).toHaveLength(target);
      expect(validateDeck(d).ok, `${target}`).toBe(true);
    }
    expect(autoFillDeck([], 1, COLLECTIBLE_CARDS, 500)).toHaveLength(60); // clamped
    for (let seed = 0; seed < 30; seed++) expect(splitDeck(autoFillDeck(classicDeck(), seed, COLLECTIBLE_CARDS, 80)).main).toHaveLength(60); // never above the limit
    expect(autoFillDeck([], 1, COLLECTIBLE_CARDS, 5)).toHaveLength(40);
    const four = autoFillDeck(['crystal_wyrm', 'crystal_wyrm'], 5);
    expect(four.filter((x) => x === 'crystal_wyrm').length).toBeGreaterThanOrEqual(2);
  });

  it('on a pool too small to fill returns what fits without throwing', () => {
    const d = autoFillDeck([], 1, COLLECTIBLE_CARDS.slice(0, 7));
    expect(d.length).toBeLessThanOrEqual(7 * MAX_COPIES);
  });
});

describe('preset decks', () => {
  it('there are seven, with unique ids and names', () => {
    expect(presetDecks()).toHaveLength(PRESET_DEFS.length);
    expect(PRESET_DEFS.length).toBe(7);
    expect(new Set(presetDecks().map((p) => p.id)).size).toBe(7);
    expect(presetById('muhur')?.name).toBe('Dark Seal');
  });

  it('every pinned card exists in the pool (fails loudly when a card id disappears)', () => {
    for (const def of PRESET_DEFS) expect(missingPins(def), `${def.name} pins a card that no longer exists`).toEqual([]);
  });

  it('every preset is a legal 40-card deck of known cards', () => {
    for (const p of presetDecks()) {
      const v = validateDeck(p.cards);
      expect(v.ok, `${p.name}: ${v.issues.map((i) => i.text).join(' | ')}`).toBe(true);
      expect(splitDeck(p.cards).main).toHaveLength(DECK_SIZE); // + the Fusion Deck (outside the 40)
      for (const id of p.cards) expect(CARDS[id]).toBeTruthy();
    }
  });

  it('rebuilding is deterministic and the pins are in', () => {
    for (const def of PRESET_DEFS) {
      const a = buildPreset(def);
      expect(buildPreset(def).cards).toEqual(a.cards);
      for (const pin of def.pins) expect(a.cards, `${def.name} dropped pin ${pin}`).toContain(pin);
    }
  });

  it('the Mühür deck holds all five seals', () => {
    for (const id of SEAL_IDS) expect(presetById('muhur')!.cards).toContain(id);
  });

  it('survives a pool that lost a card: still 40 legal cards', () => {
    const pool = COLLECTIBLE_CARDS.filter((c) => c.id !== 'magma_titan' && c.id !== 'judgment_bolt');
    for (const def of PRESET_DEFS) {
      const p = buildPreset(def, pool);
      expect(validateDeck(p.cards).ok, def.name).toBe(true);
      expect(p.cards).not.toContain('magma_titan');
    }
  });

  it('the engine accepts every preset as a game deck (both sides, 3 and 5 zones)', () => {
    for (const p of presetDecks()) {
      for (const zones of [3, 5] as const) {
        const r = newGame({ seed: 5, decks: [p.cards, presetDecks()[0].cards], zones });
        expect(r.state.players[0].hand.length + r.state.players[0].deck.length).toBe(DECK_SIZE);
        expect(r.state.players[1].hand.length + r.state.players[1].deck.length).toBe(DECK_SIZE);
        expect(r.state.winner).toBeNull();
      }
    }
  });
});

describe('expanded sampler (CPU, 40 cards)', () => {
  it('24 monsters + 16 spells/traps, valid, seeded, respects copy limits', () => {
    for (let seed = 0; seed < 40; seed++)
      for (const side of [0, 1] as const) {
        const all = expandedDeck(seed, side);
        const d = splitDeck(all).main; // the Fusion Deck (Trinity Crystal Wyrm with crystal_wyrm) comes after the 40
        expect(d).toHaveLength(40);
        expect(d.filter((id) => CARDS[id].kind === 'monster')).toHaveLength(24);
        const v = validateDeck(d);
        expect(v.ok, `${seed}/${side}: ${v.issues.map((i) => i.text).join(' | ')}`).toBe(true);
      }
    expect(expandedDeck(3, 0)).toEqual(expandedDeck(3, 0));
    expect(expandedDeck(3, 0)).not.toEqual(expandedDeck(3, 1));
  });
});

describe('retired cards (dusk_sorcerer, owner decision)', () => {
  const R = 'dusk_sorcerer' as CardId;
  it('the card stays in ALL_CARDS / CARDS (shared contract) but is flagged retired and never offered', () => {
    expect(CARDS[R].retired).toBe(true);
    expect(isRetired(R)).toBe(true);
    expect(isRetired('ashen_drake')).toBe(false);
    expect(ALL_CARDS.some((c) => c.id === R)).toBe(true);
    expect(COLLECTIBLE_CARDS.some((c) => c.id === R)).toBe(false);
    expect(EXPANDED_POOL).not.toContain(R);
    expect(visibleIds({ kind: 'all', attr: null }, 'name')).not.toContain(R);
    expect(visibleIds({ kind: 'monster', attr: 'DARK' }, 'level')).not.toContain(R);
  });
  it('presets, the classic deck, the sampler and Rastgele doldur never hold it (even when handed ALL_CARDS)', () => {
    for (const p of presetDecks()) expect(p.cards, p.id).not.toContain(R);
    for (const d of PRESET_DEFS) expect(buildPreset(d, ALL_CARDS).cards).not.toContain(R);
    expect(classicDeck()).not.toContain(R);
    for (let seed = 0; seed < 40; seed++) {
      expect(expandedDeck(seed, 0)).not.toContain(R);
      expect(expandedDeck(seed, 1)).not.toContain(R);
      expect(autoFillDeck([], seed, ALL_CARDS, 80)).not.toContain(R);
    }
    expect(autoFillDeck([], 3)).not.toContain(R);
  });
  it('the builder refuses it and validateDeck reports it as missing', () => {
    expect(addBlocker([], R)).toMatch(/no longer in the game/);
    const d = autoFillDeck([], 5);
    const withIt = [...d.slice(0, 39), R];
    const v = validateDeck(withIt);
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('unknown');
    expect(v.stats.unknown).toEqual([R]);
  });
  it('repairDeck swaps each copy for a substitute in place: size, monster count and Sv7+ count kept, deck legal', () => {
    expect(RETIRED_SUBSTITUTES[R]?.[0]).toBe('ashen_drake');
    const base = autoFillDeck([], 9).filter((id) => { const c = CARDS[id]; return !(isMonster(c) && c.level >= 7); });
    expect(base.length).toBeGreaterThanOrEqual(36);
    const raw = [R, ...base.slice(0, 36), R, R, R];
    const r = repairDeck(raw);
    expect(r.replaced).toBe(4);
    expect(r.missing).toBe(0);
    expect(r.cards).toHaveLength(40);
    expect(r.cards).not.toContain(R);
    expect(r.cards[0]).toBe('ashen_drake');
    expect(r.cards[39]).toBe('crystal_wyrm'); // ashen_drake is full after three
    expect(deckStats(r.cards).high).toBe(4);
    expect(deckStats(r.cards).monsters).toBe(deckStats(raw).monsters + 4);
    expect(validateDeck(r.cards).ok).toBe(true);
  });
  it('the deck\'s own copies of a substitute win; the stand-ins move on down the list', () => {
    const raw = ['ashen_drake', 'ashen_drake', R, 'ashen_drake', R];
    const r = repairDeck(raw);
    expect(r.cards.filter((x) => x === 'ashen_drake')).toHaveLength(3);
    expect(r.cards[2]).toBe('crystal_wyrm');
    expect(r.cards[4]).toBe('crystal_wyrm');
    expect(r.repeats).toBe(0);
    expect(r.replaced).toBe(2);
  });
});
