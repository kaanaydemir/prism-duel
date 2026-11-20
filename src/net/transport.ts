// NetTransport — how two duel clients reach each other. Game code (src/net/host.ts, guest.ts) only talks to this
// interface, so another transport (a WebSocket relay, Steam Networking on the PC build, an in-memory loopback for
// tests) plugs in without touching the duel.
//
//   const t = createTrysteroTransport();          // or new LoopbackHub().transport()
//   t.onMessage = (text, peer) => ...;
//   t.onPeerJoin = (peer) => ...; t.onPeerLeave = (peer) => ...;
//   await t.connect(roomId);                       // joins the room; peers come and go through the callbacks
//   t.send(text);                                  // to every peer in the room (a duel room has one)
//   t.close();
//
// Contract: messages are strings, delivered reliably and in order per peer while connected (WebRTC data
// channels in reliable mode, TCP, Steam reliable sends). A peer that drops and comes back is a new
// onPeerJoin (possibly with a new peer id). close() is idempotent and fires no callbacks.

export interface NetTransport {
  /** A short name for logs / the lobby ("webrtc", "loopback"...). */
  readonly kind: string;
  /** Join the room (resolves once joined: peers may arrive later through onPeerJoin). */
  connect(roomId: string): Promise<void>;
  /** Send to every connected peer, or only to `peer`. Silently dropped when nobody is connected. */
  send(text: string, peer?: string): void;
  onMessage: ((text: string, peer: string) => void) | null;
  onPeerJoin: ((peer: string) => void) | null;
  onPeerLeave: ((peer: string) => void) | null;
  /** Connected peer ids. */
  peers(): string[];
  close(): void;
}
