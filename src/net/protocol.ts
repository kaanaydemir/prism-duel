// The online-duel wire protocol (versioned). Transport-agnostic: messages are encoded to one JSON string each
// (src/net/transport.ts carries strings), so a WebRTC, WebSocket or Steam Networking transport moves the same bytes.
//
// Roles: the HOST runs the engine and is the authority; the GUEST sends intents. All PlayerIds in messages are
// ENGINE ids (the host is player 0, the guest player 1); the guest mirrors locally for its screen (mirror.ts).
//
//   guest → host   hello      { protocol, gameVersion, name, deck, resume? }     first message after connecting
//   host  → guest  welcome    { protocol, gameVersion, name, session }           hello accepted
//   host  → guest  refuse     { reason, detail? }                                 hello refused (version, deck, full)
//   host  → guest  start      { session, you, arena, names, state, events, legal } the game begins (opening events)
//   guest → host   action     { seq, action }                                     an intent made on state `seq`
//   host  → guest  update     { seq, actor, events, state, legal }                one applied action (seq = new state no.)
//   host  → guest  nack       { seq, reason }                                     the intent was refused (not legal)
//   guest → host   ack        { seq }                                             update `seq` arrived and was played
//   guest → host   resync     { seq }                                             "I have seq, send me the current state"
//   host  → guest  snapshot   { seq, state, legal, names, you, arena, session }   the full (filtered) current state
//   both           ping/pong  { t }                                               keep-alive + round-trip time
//   both           leave      { reason }                                          leaving the duel for good
//
// `state` is always viewFor(state, guest) and `events` viewEvents(events, guest): the host's secrets never leave
// the host. `legal` is the guest's legal actions on that state (null when the host acts): the guest's menus are
// built from it, so a hidden card can never make the guest's client offer a different set of moves.

import { CARDS, type CardId } from '../data/cards';
import type { Action, GameEvent, GameState, PlayerId } from '../engine/types';

/** Bumped on any incompatible change of the messages below. */
export const PROTOCOL_VERSION = 1;
/** The app version shown to players on a mismatch (bump with releases). */
export const APP_VERSION = '0.1.0';

export type ArenaId = 'neon' | 'sky';

export type RefuseReason = 'protocol' | 'version' | 'deck' | 'full' | 'session';

export type NetMessage =
  | { t: 'hello'; protocol: number; gameVersion: string; name: string; deck: CardId[]; resume?: { session: string; seq: number } }
  | { t: 'welcome'; protocol: number; gameVersion: string; name: string; session: string }
  | { t: 'refuse'; reason: RefuseReason; detail?: string }
  | {
      t: 'start';
      session: string;
      /** The guest's engine player id. */
      you: PlayerId;
      arena: ArenaId;
      /** Display names by engine player id. */
      names: [string, string];
      state: GameState;
      events: GameEvent[];
      legal: Action[] | null;
    }
  | { t: 'action'; seq: number; action: Action }
  | { t: 'update'; seq: number; actor: PlayerId; events: GameEvent[]; state: GameState; legal: Action[] | null }
  | { t: 'nack'; seq: number; reason: string }
  | { t: 'ack'; seq: number }
  | { t: 'resync'; seq: number }
  | {
      t: 'snapshot';
      session: string;
      seq: number;
      you: PlayerId;
      arena: ArenaId;
      names: [string, string];
      state: GameState;
      legal: Action[] | null;
    }
  | { t: 'ping'; t0: number }
  | { t: 'pong'; t0: number }
  | { t: 'leave'; reason: 'quit' | 'gameOver' | 'timeout' };

export type NetMessageType = NetMessage['t'];

/** Hard cap of one encoded message (a full snapshot is ~10-30 KB). */
export const MAX_MESSAGE_BYTES = 512 * 1024;

export class ProtocolError extends Error {}

export function encode(m: NetMessage): string {
  return JSON.stringify(m);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length <= max;
const isPlayer = (v: unknown): v is PlayerId => v === 0 || v === 1;
const isState = (v: unknown): boolean => isObj(v) && Array.isArray(v.players) && v.players.length === 2 && isObj(v.cards) && isInt(v.turn);
const isEvents = (v: unknown): boolean => Array.isArray(v) && v.every((e) => isObj(e) && typeof e.type === 'string');
const isAction = (v: unknown): boolean => isObj(v) && typeof v.type === 'string' && isPlayer(v.player);
const isLegal = (v: unknown): boolean => v === null || (Array.isArray(v) && v.every(isAction));
const isNames = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every((n) => isStr(n, 32));
const isArena = (v: unknown): boolean => v === 'neon' || v === 'sky';

/**
 * Parse and shape-check one message. Throws ProtocolError on anything malformed (wrong JSON, unknown type,
 * missing / mistyped fields, oversize). Deep game content (an Action's fields) is validated by the engine.
 */
export function decode(raw: unknown): NetMessage {
  if (typeof raw !== 'string') throw new ProtocolError('message is not a string');
  if (raw.length > MAX_MESSAGE_BYTES) throw new ProtocolError('message too large');
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    throw new ProtocolError('message is not JSON');
  }
  if (!isObj(m) || typeof m.t !== 'string') throw new ProtocolError('message has no type');
  const ok = (b: boolean) => {
    if (!b) throw new ProtocolError(`malformed ${String(m.t)} message`);
  };
  switch (m.t) {
    case 'hello':
      ok(isInt(m.protocol) && isStr(m.gameVersion) && isStr(m.name, 32) && Array.isArray(m.deck) && m.deck.length <= 200 && m.deck.every((c) => isStr(c)));
      if (m.resume !== undefined) ok(isObj(m.resume) && isStr(m.resume.session) && isInt(m.resume.seq));
      break;
    case 'welcome':
      ok(isInt(m.protocol) && isStr(m.gameVersion) && isStr(m.name, 32) && isStr(m.session));
      break;
    case 'refuse':
      ok(['protocol', 'version', 'deck', 'full', 'session'].includes(m.reason as string) && (m.detail === undefined || isStr(m.detail, 200)));
      break;
    case 'start':
      ok(isStr(m.session) && isPlayer(m.you) && isArena(m.arena) && isNames(m.names) && isState(m.state) && isEvents(m.events) && isLegal(m.legal));
      break;
    case 'action':
      ok(isInt(m.seq) && isAction(m.action));
      break;
    case 'update':
      ok(isInt(m.seq) && isPlayer(m.actor) && isEvents(m.events) && isState(m.state) && isLegal(m.legal));
      break;
    case 'nack':
      ok(isInt(m.seq) && isStr(m.reason, 200));
      break;
    case 'ack':
    case 'resync':
      ok(isInt(m.seq));
      break;
    case 'snapshot':
      ok(isStr(m.session) && isInt(m.seq) && isPlayer(m.you) && isArena(m.arena) && isNames(m.names) && isState(m.state) && isLegal(m.legal));
      break;
    case 'ping':
    case 'pong':
      ok(typeof m.t0 === 'number');
      break;
    case 'leave':
      ok(['quit', 'gameOver', 'timeout'].includes(m.reason as string));
      break;
    default:
      throw new ProtocolError(`unknown message type ${String(m.t).slice(0, 20)}`);
  }
  return m as NetMessage;
}

/**
 * A short fingerprint of the card data both sides play with (ids, stats, effects): two builds whose cards differ
 * refuse each other even when APP_VERSION was not bumped. FNV-1a over the canonical JSON.
 */
export function rulesFingerprint(extra = ''): string {
  const ids = Object.keys(CARDS).sort();
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const id of ids) {
    const c = CARDS[id as CardId] as unknown as Record<string, unknown>;
    feed(id);
    for (const k of ['type', 'atk', 'def', 'level', 'effect', 'spellType', 'trapType', 'attribute', 'fusion']) feed(`|${k}=${JSON.stringify(c[k] ?? null)}`);
  }
  feed(extra);
  return h.toString(36);
}

/** The version string compared in hello / welcome: app version + card-data fingerprint (+ board layout). */
export function gameVersion(extra = ''): string {
  return `${APP_VERSION}+${rulesFingerprint(extra)}`;
}
