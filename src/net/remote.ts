// The duel screen's side of online play: RemoteSide adapters (src/duel/DuelController.ts) for the host and the
// guest, plus the data the lobby hands to DuelScene.
//
// Host:  the guest's intents → RemoteMoves (checked by NetHost.check, applied by the controller like any move);
//        every applied action (both players') → NetHost.commit (the filtered update goes out before the
//        cinematic plays, so both screens animate together).
// Guest: everything is MIRRORED (src/net/mirror.ts) so the local player is player 0 at the bottom of the screen:
//        host updates → RemoteMoves with the authority's result; local actions → NetGuest.submit (mirrored back);
//        the host's legal list → HumanInput's menus; a snapshot (reconnect) → a jump.

import type { Action, ApplyResult, GameState, PlayerId } from '../engine/types';
import type { RemoteMove, RemoteSide } from '../duel/DuelController';
import { GUEST_PLAYER, type NetHost } from './host';
import type { NetGuest } from './guest';
import { mirrorAction, mirrorActions, mirrorEvents, mirrorResult, mirrorState } from './mirror';
import type { ArenaId } from './protocol';

/** What DuelScene needs to run an online duel (DuelStart.net). */
export interface NetDuel {
  role: 'host' | 'guest';
  remote: RemoteSide;
  /** The opening in LOCAL coordinates (the local player is 0): newGame's result (host) / the start message (guest). */
  opening?: ApplyResult;
  /** Resume from a snapshot (guest reconnecting after a reload): LOCAL coordinates, no opening. */
  resume?: GameState;
  /** Display names in LOCAL coordinates. */
  names: [string, string];
  arena: ArenaId;
  /** The session object (status callbacks for the disconnect overlay). */
  host?: NetHost;
  guest?: NetGuest;
  /** Leave for good (sends leave, closes the transport). Idempotent. */
  close(reason?: 'quit' | 'gameOver'): void;
}

/** The local player of an online duel is always player 0 on screen; the remote one 1. */
export const LOCAL: PlayerId = 0;
export const REMOTE: PlayerId = 1;

export function hostRemote(host: NetHost): RemoteSide {
  const side: RemoteSide = {
    players: [GUEST_PLAYER],
    onArrive: null,
    poll(): RemoteMove | null {
      const it = host.takeIntent();
      if (!it) return null;
      return { action: it.action, trusted: it.trusted, ...{ intent: it } } as RemoteMove;
    },
    check(m: RemoteMove): string | null {
      const it = (m as RemoteMove & { intent?: Parameters<NetHost['check']>[0] }).intent ?? { seq: host.seq, action: m.action, trusted: m.trusted };
      return host.check(it);
    },
    rejected(m: RemoteMove, why: string): void {
      const it = (m as RemoteMove & { intent?: Parameters<NetHost['refuse']>[0] }).intent ?? { seq: host.seq, action: m.action };
      host.refuse(it, why);
    },
    applied(action: Action, result: ApplyResult): void {
      host.commit(result, action.player);
    },
    waitHint: () => 'Your friend is playing…',
  };
  host.onIntent = () => side.onArrive?.(false);
  return side;
}

/** Guest adapter. `mirror` is true when the guest is engine player 1 (always, today). */
export function guestRemote(guest: NetGuest): RemoteSide {
  const mirror = guest.you !== LOCAL;
  const st = (s: GameState) => (mirror ? mirrorState(s) : s);
  const res = (r: ApplyResult) => (mirror ? mirrorResult(r) : r);
  const jumps: GameState[] = [];
  const side: RemoteSide = {
    players: [REMOTE],
    onArrive: null,
    poll(): RemoteMove | null {
      const j = jumps.shift();
      if (j) return { action: { type: 'endTurn', player: REMOTE }, jump: j };
      const u = guest.takeUpdate();
      if (!u) return null;
      const r = res({ state: u.state, events: u.events });
      // the action itself is not sent (only its events): the controller only needs the actor
      return { action: { type: 'endTurn', player: mirror ? ((1 - u.actor) as PlayerId) : u.actor }, result: r };
    },
    async submit(action: Action): Promise<ApplyResult> {
      const u = await guest.submit(mirror ? mirrorAction(action) : action);
      return res({ state: u.state, events: u.events });
    },
    legal(): Action[] | null {
      const l = guest.legal;
      if (!l) return null;
      return mirror ? mirrorActions(l) : l;
    },
    waitHint: () => 'Your friend is playing…',
  };
  guest.onUpdate = () => side.onArrive?.(true);
  const prevSnap = guest.onSnapshot;
  guest.onSnapshot = (m) => {
    prevSnap?.(m);
    jumps.push(st(m.state));
    side.onArrive?.(true);
  };
  return side;
}

/** The guest's opening in local coordinates. */
export function guestOpening(guest: NetGuest, start: { state: GameState; events: ApplyResult['events'] }): ApplyResult {
  const mirror = guest.you !== LOCAL;
  return mirror ? { state: mirrorState(start.state), events: mirrorEvents(start.events) } : { state: start.state, events: start.events };
}

/** Engine-id names → local names. */
export function localNames(names: [string, string], you: PlayerId): [string, string] {
  return you === LOCAL ? [names[0], names[1]] : [names[1], names[0]];
}
