// Online play end to end, without a screen: a NetHost and a NetGuest over the in-memory loopback transport.
// The host plays with the bot on the real state; the guest picks from the legal list the host sent (on its
// mirrored view, like the guest's screen does) and submits intents. Covers: hello / version / deck refusals,
// legality of guest intents, a full game to a winner with both sides agreeing on every public fact, and a
// dropped guest that reconnects and resyncs from the host's snapshot.
import { describe, expect, it } from 'vitest';
import { actingPlayer, apply, chooseAction, isLegal, newGame, type Action, type GameState } from '../../src/engine';
import { classicDeck } from '../../src/data/decks';
import { LoopbackHub, type LoopbackTransport } from '../../src/net/loopback';
import { NetHost, GUEST_PLAYER, HOST_PLAYER } from '../../src/net/host';
import { NetGuest } from '../../src/net/guest';
import { mirrorAction, mirrorActions, mirrorState } from '../../src/net/mirror';
import { PROTOCOL_VERSION, decode, encode, gameVersion, type NetMessage } from '../../src/net/protocol';
import { makeRng } from '../../src/engine/rng';

const GAME = { zones: 5 as const, startHand: 5, firstPlayerDraws: true };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
async function until(cond: () => boolean, what: string, max = 2000): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function pair(o: { seed?: number; guestDeck?: string[]; guestVersion?: string; hub?: LoopbackHub } = {}) {
  const hub = o.hub ?? new LoopbackHub();
  const ht = hub.transport();
  const gt = hub.transport();
  const host = new NetHost(ht, { name: 'HOST', deck: classicDeck(), game: GAME, seed: o.seed ?? 7, rand: makeRng(99), pingMs: 0, disconnectTimeoutMs: 200 });
  const guest = new NetGuest(gt, { name: 'GUEST', deck: (o.guestDeck ?? classicDeck()) as never, version: o.guestVersion, pingMs: 0, disconnectTimeoutMs: 200 });
  await host.open('room');
  await guest.join('room');
  return { hub, ht, gt, host, guest };
}

/** The public facts both screens must agree on. */
function publicFacts(s: GameState) {
  return {
    turn: s.turn,
    phase: s.phase,
    active: s.activePlayer,
    winner: s.winner,
    pending: s.pending?.kind ?? null,
    players: s.players.map((p) => ({
      lp: p.lp,
      hand: p.hand.length,
      deck: p.deck.length,
      grave: p.graveyard.map((u) => s.cards[u].cardId),
      monsters: p.monsters.map((m) => (m ? { uid: m.uid, faceUp: m.faceUp, pos: m.position, id: m.faceUp ? s.cards[m.uid].cardId : '?' } : null)),
      st: p.spellTraps.map((x) => (x ? { uid: x.uid, faceUp: x.faceUp, id: x.faceUp ? s.cards[x.uid].cardId : '?' } : null)),
    })),
  };
}

/**
 * One host turn of the loop the duel controller runs on the host: the acting player's action (host: the bot;
 * guest: the next intent) is checked, applied and committed.
 */
async function hostStep(host: NetHost, seed: number): Promise<void> {
  const s = host.state!;
  if (actingPlayer(s) === HOST_PLAYER) {
    const a = chooseAction(s, seed);
    host.commit(apply(s, a), HOST_PLAYER);
    return;
  }
  await until(() => host.hasIntent(), 'a guest intent');
  const it = host.takeIntent()!;
  const why = host.check(it);
  if (why) return host.refuse(it, why);
  host.commit(apply(host.state!, it.action), GUEST_PLAYER);
}

/** The guest's screen: decide on the mirrored view from the mirrored legal list, submit the un-mirrored intent. */
function guestDecide(guest: NetGuest, rng: () => number): Action {
  const view = mirrorState(guest.state!);
  const legal = mirrorActions(guest.legal!);
  expect(actingPlayer(view)).toBe(0); // the guest is "player 0" on its own screen
  // prefer progress: attack > summon > end turn > anything
  const pick = (t: string) => legal.filter((a) => a.type === t);
  const pool = [pick('attack'), pick('normalSummon'), pick('respond'), legal.filter((a) => a.type !== 'surrender' && a.type !== 'changePosition')].find((x) => x.length) ?? legal;
  return mirrorAction(pool[Math.floor(rng() * pool.length)]);
}

describe('online session (loopback)', () => {
  it('refuses a guest with another game version or an illegal deck', async () => {
    const a = await pair({ guestVersion: 'old+zzz' });
    let reason = '';
    a.guest.onRefuse = (r) => (reason = r);
    await until(() => a.guest.status === 'refused', 'refusal');
    expect(reason || a.guest.status).toBeTruthy();
    expect(a.host.status).toBe('waiting');

    const b = await pair({ guestDeck: ['magma_titan'] });
    await until(() => b.guest.status === 'refused', 'deck refusal');
    expect(b.host.status).toBe('waiting');
  });

  it('plays a whole game to a winner; both sides agree on every public fact', async () => {
    const { host, guest } = await pair({ seed: 21 });
    await until(() => host.status === 'ready' && guest.status === 'joined', 'hello');
    const opening = host.startGame();
    await until(() => guest.status === 'playing', 'start');
    expect(publicFacts(guest.state!)).toEqual(publicFacts(opening.state));
    const rng = makeRng(5);
    let steps = 0;
    let guestMoves = 0;
    while (host.state!.winner === null && steps < 3000) {
      steps++;
      if (actingPlayer(host.state!) === GUEST_PLAYER) {
        await until(() => guest.seq === host.seq && guest.legal !== null, 'guest legal list');
        const a = guestDecide(guest, rng);
        const done = guest.submit(a);
        await hostStep(host, steps);
        await done;
        guestMoves++;
      } else await hostStep(host, steps);
      await until(() => guest.seq === host.seq, 'update');
      expect(publicFacts(guest.state!)).toEqual(publicFacts(host.state!));
    }
    expect(host.state!.winner).not.toBeNull();
    expect(guest.state!.winner).toBe(host.state!.winner);
    expect(guestMoves).toBeGreaterThan(5);
    expect(guest.status).toBe('over');
  }, 60_000);

  it('applies only legal guest intents (wrong player, stale, illegal → nack; state unchanged)', async () => {
    const hub = new LoopbackHub();
    const ht = hub.transport();
    const host = new NetHost(ht, { deck: classicDeck(), game: GAME, seed: 3, firstPlayer: undefined, rand: makeRng(1), pingMs: 0 } as never);
    await host.open('r');
    // a hand-written guest client
    const raw = hub.transport();
    const got: NetMessage[] = [];
    raw.onMessage = (t) => got.push(decode(t));
    raw.onPeerJoin = (p) => raw.send(encode({ t: 'hello', protocol: PROTOCOL_VERSION, gameVersion: gameVersion(), name: 'x', deck: classicDeck() }), p);
    await raw.connect('r');
    await until(() => host.status === 'ready', 'ready');
    host.startGame();
    await until(() => got.some((m) => m.t === 'start'), 'start');
    const s0 = host.state!;
    const send = (seq: number, action: Action) => raw.send(encode({ t: 'action', seq, action }));
    const anyHostAction = { type: 'endTurn', player: 0 } as Action;
    send(0, anyHostAction); // the host's player
    send(5, { type: 'endTurn', player: 1 }); // stale seq
    send(0, { type: 'attack', player: 1, attackerZone: 2, targetZone: null }); // not legal now
    await until(() => host.hasIntent() && (host as unknown as { intents: unknown[] }).intents.length === 3, 'three intents');
    for (let i = 0; i < 3; i++) {
      const it = host.takeIntent()!;
      const why = host.check(it);
      expect(why).not.toBeNull();
      host.refuse(it, why!);
    }
    await until(() => got.filter((m) => m.t === 'nack').length === 3, 'three nacks');
    expect(host.state).toBe(s0);
    expect(host.seq).toBe(0);
    // a legal guest intent passes the check
    const st = host.state!;
    if (actingPlayer(st) === GUEST_PLAYER) {
      const legal = (got.find((m) => m.t === 'start') as Extract<NetMessage, { t: 'start' }>).legal!;
      expect(legal.length).toBeGreaterThan(0);
      expect(host.check({ seq: 0, action: legal[0] })).toBeNull();
      expect(isLegal(st, legal[0])).toBe(true);
    } else {
      expect((got.find((m) => m.t === 'start') as Extract<NetMessage, { t: 'start' }>).legal).toBeNull();
    }
  });

  it('a dropped guest reconnects with the same session and resyncs from the snapshot', async () => {
    const { hub, gt, host, guest } = await pair({ seed: 8 });
    await until(() => host.status === 'ready', 'ready');
    host.startGame();
    await until(() => guest.status === 'playing', 'start');
    // a few host moves while connected
    for (let i = 0; i < 4 && actingPlayer(host.state!) === HOST_PLAYER; i++) await hostStep(host, i);
    await until(() => guest.seq === host.seq, 'caught up');
    // the connection drops
    hub.cut(gt as LoopbackTransport);
    await until(() => host.status === 'disconnected' && guest.status === 'disconnected', 'both see the drop');
    // the host keeps playing its own moves meanwhile (its turn), the guest misses them
    let missed = 0;
    while (actingPlayer(host.state!) === HOST_PLAYER && host.state!.winner === null && missed < 6) {
      await hostStep(host, 100 + missed);
      missed++;
    }
    let snaps = 0;
    guest.onSnapshot = () => snaps++;
    await gt.connect('room'); // same code again
    await until(() => host.status === 'playing' && guest.status === 'playing' && guest.seq === host.seq && snaps > 0, 'resync');
    expect(publicFacts(guest.state!)).toEqual(publicFacts(host.state!));
    expect(missed === 0 || guest.seq > 0).toBe(true);
  });

  it('a guest that never comes back: the host times out (and only the session guest may return)', async () => {
    const { hub, gt, host, guest } = await pair({ seed: 9 });
    await until(() => host.status === 'ready', 'ready');
    host.startGame();
    await until(() => guest.status === 'playing', 'start');
    let timedOut = false;
    host.onTimeout = () => (timedOut = true);
    hub.cut(gt as LoopbackTransport);
    // a stranger with the code but no session is refused
    const stranger = new NetGuest(hub.transport(), { deck: classicDeck(), pingMs: 0 });
    await stranger.join('room');
    await until(() => stranger.status === 'refused', 'stranger refused');
    await until(() => timedOut, 'timeout', 5000);
    expect(host.status).toBe('over');
    const it = host.timeoutSurrender();
    expect(host.check(it)).toBeNull();
    const r = apply(host.state!, it.action);
    expect(r.state.winner).toBe(HOST_PLAYER);
    void guest;
  });

  it('the opening reaches the guest without the seed (newGame sanity)', async () => {
    const { host, guest } = await pair({ seed: 1234 });
    let start: Extract<NetMessage, { t: 'start' }> | null = null;
    guest.onStart = (m) => (start = m);
    await until(() => host.status === 'ready', 'ready');
    const r = host.startGame();
    await until(() => start !== null, 'start');
    const gs = r.events.find((e) => e.type === 'gameStart');
    expect(gs && gs.type === 'gameStart' && gs.seed).toBe(1234);
    const ev = start!.events.find((e) => e.type === 'gameStart');
    expect(ev && ev.type === 'gameStart' && ev.seed).toBe(0);
    expect(start!.state.rng).toBe(0);
    void newGame;
  });
});
