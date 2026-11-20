// Player mirroring: the same game with players 0 and 1 swapped.
//
// The duel screen always draws engine player 0 at the bottom (the near side). An online guest is engine player
// 1 on the host, so the guest's client mirrors everything it receives (state, events, legal actions) and mirrors
// its own actions back before sending them: each player sees the board from their own side, and the duel code
// runs exactly as in a vs-CPU duel where the local human is player 0.
//
// mirror() is a structural walk: every field that holds a PlayerId (see PLAYER_KEYS) flips 0 <-> 1,
// GameState.players is reversed (and each PlayerState.id flipped), the controlChange event's `from` / `to` flip.
// It is its own inverse: mirror(mirror(x)) deep-equals x. tests/net/mirror.test.ts checks that the engine
// commutes with it (legalActions / apply of a mirrored state are the mirrored results).

import type { Action, ApplyResult, GameEvent, GameState, PlayerId } from '../engine/types';

/** Fields whose value is a PlayerId everywhere they appear (state, internal tasks, events, actions). */
const PLAYER_KEYS = new Set(['player', 'owner', 'controller', 'activePlayer', 'firstPlayer', 'winner', 'hatOwner']);

const flip = (v: unknown): unknown => (v === 0 ? 1 : v === 1 ? 0 : v);

function walk(v: unknown, parentKey: string | null): unknown {
  if (Array.isArray(v)) return v.map((x) => walk(x, parentKey));
  if (!v || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const isControlChange = o.type === 'controlChange';
  for (const k of Object.keys(o)) {
    const x = o[k];
    if (PLAYER_KEYS.has(k) && (x === 0 || x === 1)) out[k] = flip(x);
    else if (isControlChange && (k === 'from' || k === 'to')) out[k] = flip(x);
    else if (k === 'players' && Array.isArray(x) && x.length === 2 && parentKey === null) {
      out[k] = [x[1], x[0]].map((ps) => {
        const p = walk(ps, k) as Record<string, unknown>;
        p.id = flip(p.id);
        return p;
      });
    } else out[k] = walk(x, k);
  }
  return out;
}

export function mirrorState(s: GameState): GameState {
  return walk(s, null) as GameState;
}

export function mirrorEvents(evs: readonly GameEvent[]): GameEvent[] {
  return evs.map((e) => walk(e, 'event') as GameEvent);
}

export function mirrorAction(a: Action): Action {
  return walk(a, 'action') as Action;
}

export function mirrorActions(as: readonly Action[]): Action[] {
  return as.map(mirrorAction);
}

export function mirrorResult(r: ApplyResult): ApplyResult {
  return { state: mirrorState(r.state), events: mirrorEvents(r.events) };
}

export function mirrorPlayer(p: PlayerId): PlayerId {
  return (p === 0 ? 1 : 0) as PlayerId;
}
