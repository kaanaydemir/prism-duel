// Per-player views of a game (additive; used by online play, src/net/).
//
//   viewFor(state, p)        → a copy of `state` holding only what player `p` may know
//   viewEvents(events, p)    → the same events with what `p` may not know masked
//
// The host of an online duel runs the real engine and sends its opponent only these filtered views, so the
// guest never receives the host's hand, either deck's order, face-down card identities, the host's Fusion Deck or
// the RNG state (with the seed and the deck lists the guest could recompute every shuffle).
//
// A hidden card keeps its uid and owner, only its `cardId` is replaced by a placeholder (MASK_MONSTER for cards in
// hands, decks, Fusion Decks and monster zones, MASK_SPELL_TRAP for set Spell / Trap / Field cards), so every view
// lookup (CARDS[cardId]) keeps working. Cards that become public later arrive with their real id in the event
// (`summon`, `flip`, `activate`, ...) and the next state. A view is not meant to be fed back to apply(): only
// the authority's real state is.

import type { CardId } from '../data/cards';
import type { GameEvent, GameState, PlayerId, Uid } from './types';

/** The placeholder id of a hidden card in a hand, a deck, a Fusion Deck or a monster zone. */
export const MASK_MONSTER: CardId = 'crystal_wyrm';
/** The placeholder id of a hidden (set) Spell / Trap / Field Spell card. */
export const MASK_SPELL_TRAP: CardId = 'mirror_barrier';

/** A copy of `state` as player `viewer` may see it (see the file comment). Never mutates `state`. */
export function viewFor(state: GameState, viewer: PlayerId): GameState {
  const s = structuredClone(state);
  s.rng = 0;
  const hide = (uid: Uid, mask: CardId) => {
    const c = s.cards[uid];
    if (c) s.cards[uid] = { uid: c.uid, owner: c.owner, cardId: mask };
  };
  for (const ps of s.players) {
    const mine = ps.id === viewer;
    // deck order is secret to everyone (your own included)
    for (const uid of ps.deck) hide(uid, MASK_MONSTER);
    if (mine) continue;
    for (const uid of ps.hand) hide(uid, MASK_MONSTER);
    for (const uid of ps.fusionDeck ?? []) hide(uid, MASK_MONSTER);
    for (const m of ps.monsters) {
      if (!m) continue;
      if (m.hat) {
        // magic_hat: every hat of the other player looks alike (decoys and the real monster)
        hide(m.uid, MASK_MONSTER);
        m.hat = 'decoy';
        delete m.hatOrigin;
      } else if (!m.faceUp) hide(m.uid, MASK_MONSTER);
    }
    for (const st of ps.spellTraps) if (st && !st.faceUp) hide(st.uid, MASK_SPELL_TRAP);
    if (ps.fieldSpell && !ps.fieldSpell.faceUp) hide(ps.fieldSpell.uid, MASK_SPELL_TRAP);
  }
  return s;
}

/** `events` as player `viewer` may see them: the other player's draws are masked, the seed is dropped. */
export function viewEvents(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    switch (e.type) {
      case 'gameStart':
        return { ...e, seed: 0 };
      case 'draw':
        return e.player === viewer ? { ...e } : { ...e, cardId: MASK_MONSTER };
      default:
        return structuredClone(e);
    }
  });
}

/** Every card id `view` shows for a uid that `real` holds differently (debug / tests: what was hidden). */
export function hiddenUids(real: GameState, view: GameState): Uid[] {
  return Object.keys(real.cards)
    .map(Number)
    .filter((u) => view.cards[u]?.cardId !== real.cards[u].cardId);
}
