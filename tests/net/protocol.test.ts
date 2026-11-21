// Online play: the wire protocol (encode / decode / shape checks), room codes and the version fingerprint.
import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, ProtocolError, decode, encode, gameVersion, rulesFingerprint, type NetMessage } from '../../src/net/protocol';
import { CODE_ALPHABET, CODE_LENGTH, formatRoomCode, newRoomCode, normalizeRoomCode } from '../../src/net/roomCode';
import { roomIdFor } from '../../src/net/config';
import { classicDeck, deckRulesKey } from '../../src/data/decks';
import { CARDS } from '../../src/data/cards';

describe('net protocol', () => {
  const g = newGame({ seed: 3 });
  const samples: NetMessage[] = [
    { t: 'hello', protocol: PROTOCOL_VERSION, gameVersion: gameVersion(), name: 'Ada', deck: classicDeck() },
    { t: 'hello', protocol: PROTOCOL_VERSION, gameVersion: 'x', name: 'Ada', deck: [], resume: { session: 'abc', seq: 4 } },
    { t: 'welcome', protocol: PROTOCOL_VERSION, gameVersion: 'x', name: 'Host', session: 's' },
    { t: 'refuse', reason: 'version', detail: 'host 1, guest 2' },
    { t: 'start', session: 's', you: 1, arena: 'neon', names: ['A', 'B'], state: g.state, events: g.events, legal: null },
    { t: 'action', seq: 3, action: { type: 'endTurn', player: 1 } },
    { t: 'update', seq: 4, actor: 0, events: g.events, state: g.state, legal: [{ type: 'endTurn', player: 1 }] },
    { t: 'nack', seq: 3, reason: 'illegal action' },
    { t: 'ack', seq: 4 },
    { t: 'resync', seq: 4 },
    { t: 'snapshot', session: 's', seq: 9, you: 1, arena: 'sky', names: ['A', 'B'], state: g.state, legal: null },
    { t: 'ping', t0: 123 },
    { t: 'pong', t0: 123 },
    { t: 'leave', reason: 'quit' },
  ];

  it('round-trips every message type', () => {
    for (const m of samples) expect(decode(encode(m))).toEqual(m);
    const types = new Set(samples.map((m) => m.t));
    expect(types.size).toBe(13);
  });

  it('refuses malformed messages', () => {
    const bad: unknown[] = [
      42,
      'not json',
      '{"no":"type"}',
      '{"t":"wat"}',
      '{"t":"action","seq":1}',
      '{"t":"action","seq":1.5,"action":{"type":"endTurn","player":1}}',
      '{"t":"action","seq":1,"action":{"type":"endTurn","player":2}}',
      '{"t":"update","seq":1,"actor":0,"events":[],"state":{},"legal":null}',
      '{"t":"refuse","reason":"because"}',
      '{"t":"leave","reason":"bored"}',
      JSON.stringify({ t: 'hello', protocol: 1, gameVersion: 'x', name: 'n'.repeat(40), deck: [] }),
      'x'.repeat(MAX_MESSAGE_BYTES + 1),
    ];
    for (const b of bad) expect(() => decode(b), String(b).slice(0, 60)).toThrow(ProtocolError);
  });

  it('versions: the fingerprint is stable and sensitive to the extra salt', () => {
    expect(rulesFingerprint()).toBe(rulesFingerprint());
    expect(rulesFingerprint('lanes5')).not.toBe(rulesFingerprint('lanes3'));
    expect(gameVersion()).toMatch(/^\d+\.\d+\.\d+\+[0-9a-z]+$/);
  });

  it('versions: the deck-construction rules are part of the fingerprint (builds with other deck rules do not pair)', () => {
    expect(deckRulesKey()).toBe('main40-60|copies3|seal1|single:dial_jester,sweeping_gale,void_eye,well_pail,winnow_sieve|fusion15|ratios:none');
    // the fingerprint of a build that hashes the same cards but not the deck rules (every build before the 40..60 rule)
    let h = 0x811c9dc5;
    const feed = (s: string) => {
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    };
    for (const id of Object.keys(CARDS).sort()) {
      const c = CARDS[id as keyof typeof CARDS] as unknown as Record<string, unknown>;
      feed(id);
      for (const k of ['type', 'atk', 'def', 'level', 'effect', 'spellType', 'trapType', 'attribute', 'fusion']) feed(`|${k}=${JSON.stringify(c[k] ?? null)}`);
    }
    const cardsOnly = h.toString(36);
    feed(`|deckRules=${deckRulesKey()}`);
    expect(rulesFingerprint()).toBe(h.toString(36));
    expect(rulesFingerprint()).not.toBe(cardsOnly);
  });
});

describe('room codes', () => {
  it('makes readable codes without look-alikes', () => {
    for (const bad of '01OILZ2S5B8UV') expect(CODE_ALPHABET.includes(bad)).toBe(false);
    let i = 0;
    const seq = [0, 0.999999, 0.5, 0.25, 0.75, 0.1];
    const c = newRoomCode(() => seq[i++ % seq.length]);
    expect(c).toHaveLength(CODE_LENGTH);
    for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    for (let k = 0; k < 200; k++) expect(normalizeRoomCode(newRoomCode())).not.toBeNull();
  });

  it('normalizes typed codes', () => {
    expect(normalizeRoomCode(' acd-347 ')).toBe('ACD347');
    expect(normalizeRoomCode('ACD34')).toBeNull();
    expect(normalizeRoomCode('ACD340')).toBeNull();
    expect(formatRoomCode('ACD347')).toBe('ACD 347');
    expect(roomIdFor('ACD347')).toBe('prism-duel-v1:ACD347');
  });
});
