// Tap by tile (src/duel/pickRule.ts): an occupied cell wins over a body covering it; body pixels
// outside every occupied cell still select their monster; empty cells keep the earlier rule.

import { describe, expect, it } from 'vitest';
import { resolvePick, type BoardPick } from '../../src/duel/pickRule';

const trinity: BoardPick = { player: 0, spot: 'monster', index: 2 };
const shade: BoardPick = { player: 1, spot: 'monster', index: 3 };
const setCard: BoardPick = { player: 1, spot: 'spellTrap', index: 1 };
const wolf: BoardPick = { player: 1, spot: 'monster', index: 1 };
const emptyCell: BoardPick = { player: 1, spot: 'monster', index: 4 };
const is = (...ok: BoardPick[]) => (h: BoardPick) => ok.some((o) => o.player === h.player && o.spot === h.spot && o.index === h.index);

describe('resolvePick (tap by tile)', () => {
  it('idle: a covered occupied cell wins over the big body in front (was: the body)', () => {
    expect(resolvePick({ tile: shade, tileOccupied: true, hits: [trinity, shade], valid: is(trinity), zonePick: false })).toEqual(shade);
    expect(resolvePick({ tile: shade, tileOccupied: true, hits: [trinity], valid: null, zonePick: false })).toEqual(shade);
  });

  it("a set card behind the player's own monster is picked by its cell", () => {
    expect(resolvePick({ tile: setCard, tileOccupied: true, hits: [wolf], valid: null, zonePick: false })).toEqual(setCard);
  });

  it("a monster's own tile always selects it", () => {
    expect(resolvePick({ tile: trinity, tileOccupied: true, hits: [trinity], valid: null, zonePick: false })).toEqual(trinity);
    expect(resolvePick({ tile: trinity, tileOccupied: true, hits: [], valid: is(shade), zonePick: true })).toEqual(trinity);
  });

  it('body pixels outside every occupied cell still select the body', () => {
    expect(resolvePick({ tile: emptyCell, tileOccupied: false, hits: [trinity], valid: null, zonePick: false })).toEqual(trinity);
    expect(resolvePick({ tile: null, tileOccupied: false, hits: [trinity], valid: null, zonePick: false })).toEqual(trinity);
  });

  it('empty cells keep the earlier rule (valid body first; a valid empty tile in a board pick)', () => {
    expect(resolvePick({ tile: emptyCell, tileOccupied: false, hits: [trinity, wolf], valid: is(wolf), zonePick: false })).toEqual(wolf);
    expect(resolvePick({ tile: emptyCell, tileOccupied: false, hits: [trinity], valid: is(emptyCell), zonePick: true })).toEqual(emptyCell);
    expect(resolvePick({ tile: emptyCell, tileOccupied: false, hits: [trinity], valid: is(emptyCell), zonePick: false })).toEqual(trinity);
    expect(resolvePick({ tile: emptyCell, tileOccupied: false, hits: [], valid: null, zonePick: false })).toEqual(emptyCell);
  });

  it('in an open board pick a candidate body beats a non-candidate occupied cell under it', () => {
    expect(resolvePick({ tile: setCard, tileOccupied: true, hits: [wolf], valid: is(wolf), zonePick: true })).toEqual(wolf);
    // ...but a candidate cell wins over any body
    expect(resolvePick({ tile: shade, tileOccupied: true, hits: [trinity], valid: is(shade, trinity), zonePick: true })).toEqual(shade);
  });
});
