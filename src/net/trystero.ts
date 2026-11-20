// WebRTC transport over Trystero (https://github.com/dmotz/trystero): signaling through public Nostr relays, then
// a direct peer-to-peer data channel (reliable, ordered). Works in desktop browsers, the iOS WKWebView (14.3+) and
// Chromium-based PC shells (Electron); no native module.
//
// Trystero is imported lazily so the library loads only when someone opens the online lobby.

import { NET_APP_ID, netConfig } from './config';
import type { NetTransport } from './transport';

type TrysteroModule = typeof import('trystero');
type Room = ReturnType<TrysteroModule['joinRoom']>;

export class TrysteroTransport implements NetTransport {
  readonly kind = 'webrtc';
  onMessage: ((text: string, peer: string) => void) | null = null;
  onPeerJoin: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  private room: Room | null = null;
  private sendFn: ((data: string, opts?: { target?: string }) => Promise<void>) | null = null;
  private readonly connected = new Set<string>();
  private closed = false;

  async connect(roomId: string): Promise<void> {
    if (this.closed) throw new Error('transport closed');
    const mod: TrysteroModule = await import('trystero');
    if (this.closed) return;
    const cfg = netConfig();
    this.leaveRoom();
    const room = mod.joinRoom(
      {
        appId: NET_APP_ID,
        rtcConfig: { iceServers: [{ urls: cfg.stun }, ...cfg.turn.map((t) => ({ ...t }))] },
        ...(cfg.relays.length ? { relayConfig: { urls: cfg.relays } } : {}),
      },
      roomId,
      { onJoinError: (d) => console.warn('[net] join error', d.error) },
    );
    this.room = room;
    const action = room.makeAction<string>('duel');
    this.sendFn = (data, opts) => action.send(data, opts?.target ? { target: opts.target } : undefined);
    action.onMessage = (data, ctx) => {
      if (this.closed || typeof data !== 'string') return;
      this.onMessage?.(data, ctx.peerId);
    };
    room.onPeerJoin = (peer) => {
      if (this.closed) return;
      this.connected.add(peer);
      this.onPeerJoin?.(peer);
    };
    room.onPeerLeave = (peer) => {
      if (this.closed || !this.connected.delete(peer)) return;
      this.onPeerLeave?.(peer);
    };
  }

  send(text: string, peer?: string): void {
    if (!this.sendFn || this.closed || !this.connected.size) return;
    this.sendFn(text, peer ? { target: peer } : undefined).catch((e) => console.warn('[net] send failed', e));
  }

  peers(): string[] {
    return [...this.connected];
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onMessage = this.onPeerJoin = this.onPeerLeave = null;
    this.leaveRoom();
  }

  private leaveRoom(): void {
    const r = this.room;
    this.room = null;
    this.sendFn = null;
    this.connected.clear();
    if (r) void r.leave().catch(() => undefined);
  }
}
