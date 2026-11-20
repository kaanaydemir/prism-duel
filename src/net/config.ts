// Online-play configuration. No server of ours: peers find each other through Trystero's public signaling
// relays (Nostr by default) and then talk directly over a WebRTC data channel.
//
// ICE: public Google STUN servers find each phone's public address. Some networks (carrier-grade NAT on mobile
// data, strict corporate firewalls) cannot be punched through with STUN alone: those need a TURN relay. No TURN
// server is configured by default (TURN costs money and needs credentials, which must never be committed). To
// add one, set it before the game boots, e.g. in the page that embeds the game (mobile/App.tsx injected JS, the
// Electron/Tauri preload, or index.html):
//
//   window.__PRISM_NET = { turn: [{ urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' }] };
//
// (short-lived credentials from your own TURN provider's API are best). `relays` overrides the signaling relay
// list (wss URLs) the same way.

/** Trystero app id: peers of other apps / protocol versions never share a room. */
export const NET_APP_ID = 'prism-duel-v1';

/** How long the other side may be gone before the duel is over (ms). */
export const DISCONNECT_TIMEOUT_MS = 60_000;
/** Keep-alive period and how long silence counts as a lost connection (ms). */
export const PING_MS = 2_000;
export const SILENCE_MS = 9_000;

export interface TurnServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface NetConfig {
  stun: string[];
  turn: TurnServer[];
  /** Signaling relay URLs (wss://...); empty = Trystero's defaults. */
  relays: string[];
}

export const DEFAULT_STUN = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'];

/** The effective config: defaults + window.__PRISM_NET overrides. */
export function netConfig(): NetConfig {
  const o = (globalThis as { __PRISM_NET?: Partial<NetConfig> }).__PRISM_NET ?? {};
  return {
    stun: Array.isArray(o.stun) && o.stun.length ? o.stun : DEFAULT_STUN,
    turn: Array.isArray(o.turn) ? o.turn : [],
    relays: Array.isArray(o.relays) ? o.relays : [],
  };
}

/** The transport room id for a room code (namespaced by app id so codes never collide across apps). */
export function roomIdFor(code: string): string {
  return `${NET_APP_ID}:${code}`;
}
