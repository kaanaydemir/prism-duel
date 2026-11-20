// LoopbackTransport — an in-memory NetTransport (tests, the in-browser QA path, a future "local" PC mode).
// Every transport made by one LoopbackHub that connects to the same room id sees the others as peers.
// Delivery is asynchronous (a macrotask, plus optional latency) and ordered, like a real data channel.
//
//   const hub = new LoopbackHub({ latencyMs: 20 });
//   const a = hub.transport(), b = hub.transport();
//   await a.connect('room'); await b.connect('room');   // a.onPeerJoin(b.id), b.onPeerJoin(a.id)
//   hub.cut(b);                                          // simulate a dropped connection (peerLeave on both sides)

import type { NetTransport } from './transport';

export interface LoopbackOpts {
  /** Extra delay per message (ms). Default 0 (next macrotask). */
  latencyMs?: number;
}

let nextId = 1;

export class LoopbackHub {
  private readonly rooms = new Map<string, Set<LoopbackTransport>>();
  readonly latencyMs: number;

  constructor(o: LoopbackOpts = {}) {
    this.latencyMs = o.latencyMs ?? 0;
  }

  transport(): LoopbackTransport {
    return new LoopbackTransport(this);
  }

  /** @internal */
  join(t: LoopbackTransport, room: string): void {
    let set = this.rooms.get(room);
    if (!set) this.rooms.set(room, (set = new Set()));
    const others = [...set];
    set.add(t);
    for (const o of others) {
      this.later(() => o.peerJoined(t.id));
      this.later(() => t.peerJoined(o.id));
    }
  }

  /** @internal */
  leave(t: LoopbackTransport, room: string, notifySelf: boolean): void {
    const set = this.rooms.get(room);
    if (!set || !set.delete(t)) return;
    for (const o of set) {
      this.later(() => o.peerLeft(t.id));
      if (notifySelf) this.later(() => t.peerLeft(o.id));
    }
  }

  /** @internal */
  deliver(from: LoopbackTransport, room: string, text: string, peer?: string): void {
    const set = this.rooms.get(room);
    if (!set) return;
    for (const o of set) if (o !== from && (!peer || peer === o.id)) this.later(() => o.received(text, from.id));
  }

  /** Simulate a dropped connection: `t` leaves its room (both sides see onPeerLeave); it may connect() again. */
  cut(t: LoopbackTransport): void {
    if (t.room) this.leave(t, t.room, true);
    t.room = null;
  }

  private queue: (() => void)[] = [];
  private flushing = false;

  /** Ordered asynchronous delivery. */
  private later(f: () => void): void {
    this.queue.push(f);
    if (this.flushing) return;
    this.flushing = true;
    const run = () => {
      const batch = this.queue.splice(0);
      for (const g of batch) {
        try {
          g();
        } catch (e) {
          console.error('[loopback] handler failed', e);
        }
      }
      if (this.queue.length) setTimeout(run, this.latencyMs);
      else this.flushing = false;
    };
    setTimeout(run, this.latencyMs);
  }
}

export class LoopbackTransport implements NetTransport {
  readonly kind = 'loopback';
  readonly id = `lb${nextId++}`;
  room: string | null = null;
  onMessage: ((text: string, peer: string) => void) | null = null;
  onPeerJoin: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  private readonly connected = new Set<string>();
  private closed = false;

  constructor(private readonly hub: LoopbackHub) {}

  async connect(roomId: string): Promise<void> {
    if (this.closed) throw new Error('transport closed');
    if (this.room) this.hub.leave(this, this.room, false);
    this.connected.clear();
    this.room = roomId;
    this.hub.join(this, roomId);
  }

  send(text: string, peer?: string): void {
    if (this.room && !this.closed) this.hub.deliver(this, this.room, text, peer);
  }

  peers(): string[] {
    return [...this.connected];
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.room) this.hub.leave(this, this.room, false);
    this.room = null;
    this.onMessage = this.onPeerJoin = this.onPeerLeave = null;
  }

  /** @internal */
  peerJoined(id: string): void {
    if (this.closed || this.connected.has(id)) return;
    this.connected.add(id);
    this.onPeerJoin?.(id);
  }

  /** @internal */
  peerLeft(id: string): void {
    if (this.closed || !this.connected.delete(id)) return;
    this.onPeerLeave?.(id);
  }

  /** @internal */
  received(text: string, from: string): void {
    if (!this.closed && this.connected.has(from)) this.onMessage?.(text, from);
  }
}
