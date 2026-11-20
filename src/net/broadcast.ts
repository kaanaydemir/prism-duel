// BroadcastChannelTransport — a NetTransport between pages of the same browser (same origin): two tabs, or two
// pages of one Playwright browser context. Used by the two-page QA check (tools/net-e2e.mjs, ?net=bc) and handy
// for trying online play on one computer. Not for real play (both players must be on one machine).

import type { NetTransport } from './transport';

type Wire =
  | { k: 'hi'; from: string }
  | { k: 'hiAck'; from: string; to: string }
  | { k: 'bye'; from: string }
  | { k: 'msg'; from: string; to?: string; text: string };

export class BroadcastChannelTransport implements NetTransport {
  readonly kind = 'broadcast';
  readonly id = `bc${Math.random().toString(36).slice(2, 10)}`;
  onMessage: ((text: string, peer: string) => void) | null = null;
  onPeerJoin: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  private ch: BroadcastChannel | null = null;
  private readonly connected = new Set<string>();
  private closed = false;
  private readonly onHide = () => this.close();

  async connect(roomId: string): Promise<void> {
    if (this.closed) throw new Error('transport closed');
    this.ch?.close();
    this.connected.clear();
    const ch = new BroadcastChannel(`prism-net:${roomId}`);
    this.ch = ch;
    ch.onmessage = (e: MessageEvent<Wire>) => this.wire(e.data);
    ch.postMessage({ k: 'hi', from: this.id } satisfies Wire);
    addEventListener('pagehide', this.onHide);
  }

  send(text: string, peer?: string): void {
    if (this.closed || !this.ch) return;
    this.ch.postMessage({ k: 'msg', from: this.id, to: peer, text } satisfies Wire);
  }

  peers(): string[] {
    return [...this.connected];
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ch?.postMessage({ k: 'bye', from: this.id } satisfies Wire);
    } catch {
      /* already closed */
    }
    this.ch?.close();
    this.ch = null;
    removeEventListener('pagehide', this.onHide);
    this.onMessage = this.onPeerJoin = this.onPeerLeave = null;
  }

  private wire(w: Wire): void {
    if (this.closed || !w || w.from === this.id) return;
    switch (w.k) {
      case 'hi':
        this.ch?.postMessage({ k: 'hiAck', from: this.id, to: w.from } satisfies Wire);
        this.join(w.from);
        return;
      case 'hiAck':
        if (w.to === this.id) this.join(w.from);
        return;
      case 'bye':
        if (this.connected.delete(w.from)) this.onPeerLeave?.(w.from);
        return;
      case 'msg':
        if ((!w.to || w.to === this.id) && this.connected.has(w.from)) this.onMessage?.(w.text, w.from);
        return;
    }
  }

  private join(peer: string): void {
    if (this.connected.has(peer)) return;
    this.connected.add(peer);
    this.onPeerJoin?.(peer);
  }
}
