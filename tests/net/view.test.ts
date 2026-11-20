// Online play: viewFor / viewEvents never hand the other player's secrets to a guest, and the player mirror
// (the guest sees the board from its own side) commutes with the engine.
import { describe, expect, it } from 'vitest';
import { MASK_MONSTER, MASK_SPELL_TRAP, actingPlayer, apply, chooseAction, legalActions, newGame, viewEvents, viewFor, type GameState } from '../../src/engine';
import { actionKey } from '../../src/engine/query';
import { mirrorAction, mirrorActions, mirrorEvents, mirrorState } from '../../src/net/mirror';
import { classicDeck } from '../../src/data/decks';

/** A bot-vs-bot game, collecting every state and the events that led to it. */
function run(seed: number, steps: number): { states: GameState[]; events: ReturnType<typeof newGame>['events'][] } {
  let r = newGame({ seed, decks: [classicDeck(), classicDeck()], zones: 5, startHand: 5, firstPlayerDraws: true });
  const states = [r.state];
  const events = [r.events];
  for (let i = 0; i < steps && r.state.winner === null; i++) {
    r = apply(r.state, chooseAction(r.state, seed + i));
    states.push(r.state);
    events.push(r.events);
  }
  return { states, events };
}

describe('viewFor', () => {
  const { states, events } = run(11, 400);

  it('hides the other hand, both deck orders, face-down cards and the RNG', () => {
    let sawSet = 0;
    for (const s of states) {
      const v = viewFor(s, 1);
      expect(v.rng).toBe(0);
      const host = s.players[0];
      for (const u of host.hand) expect(v.cards[u].cardId).toBe(MASK_MONSTER);
      for (const p of [0, 1] as const) for (const u of s.players[p].deck) expect(v.cards[u].cardId).toBe(MASK_MONSTER);
      for (const u of host.fusionDeck ?? []) expect(v.cards[u].cardId).toBe(MASK_MONSTER);
      for (const m of host.monsters) if (m && !m.faceUp) {
        sawSet++;
        expect(v.cards[m.uid].cardId).toBe(MASK_MONSTER);
      }
      for (const st of host.spellTraps) if (st && !st.faceUp) expect(v.cards[st.uid].cardId).toBe(MASK_SPELL_TRAP);
      // the guest's own hand and face-down cards stay visible to the guest
      for (const u of s.players[1].hand) expect(v.cards[u].cardId).toBe(s.cards[u].cardId);
      for (const m of s.players[1].monsters) if (m) expect(v.cards[m.uid].cardId).toBe(s.cards[m.uid].cardId);
      // public things are untouched
      for (const p of [0, 1] as const) {
        for (const u of s.players[p].graveyard) expect(v.cards[u].cardId).toBe(s.cards[u].cardId);
        for (const m of s.players[p].monsters) if (m && m.faceUp) expect(v.cards[m.uid].cardId).toBe(s.cards[m.uid].cardId);
        expect(v.players[p].lp).toBe(s.players[p].lp);
        expect(v.players[p].hand.length).toBe(s.players[p].hand.length);
        expect(v.players[p].deck.length).toBe(s.players[p].deck.length);
      }
      // never mutates the real state
      expect(s.rng === 0 || v !== s).toBe(true);
    }
    expect(sawSet).toBeGreaterThan(0);
  });

  it('masks the host draws and the seed in events', () => {
    for (const evs of events) {
      const v = viewEvents(evs, 1);
      v.forEach((e, i) => {
        const o = evs[i];
        if (o.type === 'gameStart') expect((e as typeof o).seed).toBe(0);
        if (o.type === 'draw') expect((e as typeof o).cardId).toBe(o.player === 1 ? o.cardId : MASK_MONSTER);
      });
    }
  });

  it('a guest view never contains a hidden card id of the host in its JSON', () => {
    // the host's hand at some point: none of those (uid, cardId) pairs may appear in the view
    for (const s of states.slice(0, 60)) {
      const v = JSON.stringify(viewFor(s, 1));
      expect(v).not.toMatch(/"rng":[1-9]/);
      for (const u of s.players[0].hand) {
        if (s.cards[u].cardId === MASK_MONSTER) continue;
        expect(v.includes(`"${u}":{"uid":${u},"owner":0,"cardId":"${s.cards[u].cardId}"`)).toBe(false);
      }
    }
  });
});

describe('player mirror', () => {
  const { states } = run(5, 300);

  it('is its own inverse', () => {
    for (const s of states) expect(mirrorState(mirrorState(s))).toEqual(s);
  });

  it('commutes with the engine (legal actions and apply)', () => {
    for (const [i, s] of states.entries()) {
      if (s.winner !== null) continue;
      const m = mirrorState(s);
      expect(actingPlayer(m)).toBe(actingPlayer(s) === 0 ? 1 : 0);
      const a = legalActions(s).map(actionKey).sort();
      const b = mirrorActions(legalActions(m)).map(actionKey).sort();
      expect(b).toEqual(a);
      if (i % 3 === 0) {
        const act = chooseAction(s, i);
        const r1 = apply(s, act);
        const r2 = apply(m, mirrorAction(act));
        expect(mirrorEvents(r2.events)).toEqual(r1.events);
        // rng is not player-specific: the mirrored apply lands on the mirrored state
        expect(mirrorState(r2.state)).toEqual(r1.state);
      }
    }
  });
});
