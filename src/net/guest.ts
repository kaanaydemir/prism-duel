// NetGuest — the joining side of an online duel. It never runs the rules: it says hello, receives the opening
// and every update (filtered views, ENGINE player ids), and submits intents the host validates.
// The duel screen drives it through src/net/remote.ts (which mirrors it so the guest plays from the bottom).
//
//   const g = new NetGuest(transport, { name, deck });
//   g.onStart = (start) => ...;  g.onSnapshot = (snap) => ...;  g.onRefuse = (reason, detail) => ...;
//   await g.join(roomIdFor(code));
//   const r = await g.submit(action);        // resolves with the host's update for it (rejects on nack)
//   const u = g.takeUpdate();                // the host's own moves, in order

import type { CardId } from '../data/cards';
import type { Action, GameEvent, GameState, PlayerId } from '../engine/types';
import { DISCONNECT_TIMEOUT_MS, PING_MS, SILENCE_MS } from './config';
import { PROTOCOL_VERSION, decode, encode, gameVersion, type NetMessage, type RefuseReason } from './protocol';
import type { NetTransport } from './transport';

export type GuestStatus = 'idle' | 'connecting' | 'joined' | 'playing' | 'disconnected' | 'over' | 'refused' | 'closed';

export type StartMsg = Extract<NetMessage, { t: 'start' }>;
export type SnapshotMsg = Extract<NetMessage, { t: 'snapshot' }>;
export type UpdateMsg = Extract<NetMessage, { t: 'update' }>;

export interface GuestOpts {
  name?: string;
  deck: CardId[];
  /** Resume a game this client was in (stored by the lobby). */
  resume?: { session: string; seq: number };
  version?: string;
  disconnectTimeoutMs?: number;
  pingMs?: number;
}

interface Pending {
  seq: number;
  resolve: (u: UpdateMsg) => void;
  reject: (e: Error) => void;
}

export class NetGuest {
  readonly opts: GuestOpts;
  readonly transport: NetTransport;
  status: GuestStatus = 'idle';
  session = '';
  you: PlayerId = 1;
  hostName = 'HOST';
  names: [string, string] = ['HOST', 'YOU'];
  /** The last state received (engine ids, filtered for this guest). */
  state: GameState | null = null;
  seq = 0;
  /** The guest's legal actions on `state` (null while the host acts). */
  legal: Action[] | null = null;
  rtt = 0;
  onStatus: ((s: GuestStatus, why?: string) => void) | null = null;
  onStart: ((m: StartMsg) => void) | null = null;
  /** A snapshot replaced the state (reconnect / resync): views jump to it without cinematics. */
  onSnapshot: ((m: SnapshotMsg) => void) | null = null;
  onRefuse: ((reason: RefuseReason, detail?: string) => void) | null = null;
  /** A host move arrived (the duel loop wakes up and takes it). */
  onUpdate: (() => void) | null = null;
  /** The host was gone longer than the timeout, or left for good. */
  onHostGone: ((why: 'timeout' | 'left') => void) | null = null;
  private hostPeer: string | null = null;
  private updates: UpdateMsg[] = [];
  private pending: Pending | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private readonly version: string;

  constructor(transport: NetTransport, opts: GuestOpts) {
    this.transport = transport;
    this.opts = opts;
    this.version = opts.version ?? gameVersion();
    if (opts.resume) {
      this.session = opts.resume.session;
      this.seq = opts.resume.seq;
    }
    transport.onMessage = (text, peer) => this.receive(text, peer);
    transport.onPeerJoin = (peer) => this.peerJoined(peer);
    transport.onPeerLeave = (peer) => {
      if (peer === this.hostPeer) this.lost('peer left');
    };
  }

  async join(roomId: string): Promise<void> {
    this.setStatus('connecting');
    await this.transport.connect(roomId);
    const pingMs = this.opts.pingMs ?? PING_MS;
    if (pingMs > 0) this.ping = setInterval(() => this.tick(), pingMs);
  }

  close(reason: 'quit' | 'gameOver' = 'quit'): void {
    if (this.status === 'closed') return;
    if (this.hostPeer) this.send({ t: 'leave', reason });
    this.clearTimeout();
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    this.pending?.reject(new Error('closed'));
    this.pending = null;
    this.transport.close();
    this.setStatus('closed');
  }

  /** Send an intent made on the current state; resolves with the host's update for it. */
  submit(action: Action): Promise<UpdateMsg> {
    if (this.pending) return Promise.reject(new Error('an action is already waiting for the host'));
    return new Promise<UpdateMsg>((resolve, reject) => {
      this.pending = { seq: this.seq, resolve, reject };
      this.send({ t: 'action', seq: this.seq, action });
    });
  }

  takeUpdate(): UpdateMsg | null {
    return this.updates.shift() ?? null;
  }

  hasUpdate(): boolean {
    return this.updates.length > 0;
  }

  /** Ask the host for the current state (a gap in the sequence, or after silence). */
  resync(): void {
    this.send({ t: 'resync', seq: this.seq });
  }

  // ------------------------------------------------------------------ internals

  private send(m: NetMessage): void {
    if (this.hostPeer) this.transport.send(encode(m), this.hostPeer);
  }

  private peerJoined(peer: string): void {
    if (this.status === 'refused' || this.status === 'closed' || this.status === 'over') return;
    // a duel room holds the host and us: the first peer who answers our hello with welcome is the host
    const hello: NetMessage = {
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      gameVersion: this.version,
      name: (this.opts.name ?? 'GUEST').slice(0, 14),
      deck: this.opts.deck,
      ...(this.session ? { resume: { session: this.session, seq: this.seq } } : {}),
    };
    this.transport.send(encode(hello), peer);
  }

  private receive(text: string, peer: string): void {
    let m: NetMessage;
    try {
      m = decode(text);
    } catch (e) {
      console.warn('[net/guest] dropped a malformed message', e);
      return;
    }
    if (m.t === 'welcome') {
      if (this.hostPeer && this.hostPeer !== peer && this.status !== 'disconnected') return;
      this.hostPeer = peer;
      this.lastHeard = Date.now();
      this.hostName = m.name;
      if (this.status === 'disconnected') this.back();
      else if (this.status === 'connecting') this.setStatus('joined');
      return;
    }
    if (m.t === 'refuse') {
      if (this.hostPeer && peer !== this.hostPeer) return;
      this.setStatus('refused', m.reason);
      this.onRefuse?.(m.reason, m.detail);
      return;
    }
    if (peer !== this.hostPeer) return;
    this.lastHeard = Date.now();
    if (this.status === 'disconnected') this.back();
    switch (m.t) {
      case 'start':
        this.session = m.session;
        this.you = m.you;
        this.names = m.names;
        this.state = m.state;
        this.seq = 0;
        this.legal = m.legal;
        this.updates = [];
        this.setStatus('playing');
        this.onStart?.(m);
        return;
      case 'update': {
        if (m.seq <= this.seq) return; // already have it (a duplicate after a resync)
        if (m.seq !== this.seq + 1) {
          this.resync();
          return;
        }
        this.seq = m.seq;
        this.state = m.state;
        this.legal = m.legal;
        this.send({ t: 'ack', seq: m.seq });
        if (m.state.winner !== null) this.status = 'over';
        const p = this.pending;
        if (p && m.actor === this.you) {
          this.pending = null;
          p.resolve(m);
          return;
        }
        this.updates.push(m);
        this.onUpdate?.();
        return;
      }
      case 'nack': {
        const p = this.pending;
        this.pending = null;
        p?.reject(new Error(`refused by the host: ${m.reason}`));
        return;
      }
      case 'snapshot': {
        this.session = m.session;
        this.you = m.you;
        this.names = m.names;
        this.seq = m.seq;
        this.state = m.state;
        this.legal = m.legal;
        this.updates = [];
        if (this.pending) {
          // our intent was lost with the connection (or applied: then the snapshot already holds it)
          this.pending.reject(new Error('resynced'));
          this.pending = null;
        }
        if (this.status !== 'over') this.setStatus(m.state.winner !== null ? 'over' : 'playing');
        this.onSnapshot?.(m);
        return;
      }
      case 'ping':
        this.send({ t: 'pong', t0: m.t0 });
        return;
      case 'pong':
        this.rtt = Date.now() - m.t0;
        return;
      case 'leave':
        this.hostPeer = null;
        this.clearTimeout();
        if (this.status !== 'over') this.setStatus('over', 'host left');
        this.pending?.reject(new Error('host left'));
        this.pending = null;
        if (this.state?.winner === null) this.onHostGone?.('left');
        return;
      default:
        return;
    }
  }

  private lost(why: string): void {
    if (this.status === 'joined') {
      // the host vanished before the game began: wait for it again
      this.hostPeer = null;
      this.setStatus('connecting', why);
      return;
    }
    if (this.status !== 'playing') return;
    this.setStatus('disconnected', why);
    this.clearTimeout();
    this.timeout = setTimeout(() => {
      this.timeout = null;
      if (this.status !== 'disconnected') return;
      this.status = 'over';
      this.pending?.reject(new Error('host gone'));
      this.pending = null;
      this.onHostGone?.('timeout');
    }, this.opts.disconnectTimeoutMs ?? DISCONNECT_TIMEOUT_MS);
  }

  private back(): void {
    this.clearTimeout();
    this.setStatus('playing', 'host back');
    // whatever happened while we were away: ask for the current state
    this.resync();
  }

  private tick(): void {
    if (!this.hostPeer) return;
    this.send({ t: 'ping', t0: Date.now() });
    if (this.status === 'playing' && this.lastHeard && Date.now() - this.lastHeard > SILENCE_MS) this.lost('silence');
  }

  private clearTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private setStatus(s: GuestStatus, why?: string): void {
    this.status = s;
    this.onStatus?.(s, why);
  }
}

export type { GameEvent };
