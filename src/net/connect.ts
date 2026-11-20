// Picks the transport for online play. Default: WebRTC over Trystero. QA / same-machine testing:
// ?net=bc (BroadcastChannel between tabs of one browser). A PC build adds its own (Steam Networking...) here.

import { BroadcastChannelTransport } from './broadcast';
import { TrysteroTransport } from './trystero';
import type { NetTransport } from './transport';

export type TransportKind = 'webrtc' | 'bc';

export function transportKind(): TransportKind {
  try {
    const q = new URLSearchParams(location.search).get('net');
    if (q === 'bc' || q === 'broadcast') return 'bc';
  } catch {
    /* no location (tests) */
  }
  return 'webrtc';
}

export function createTransport(kind: TransportKind = transportKind()): NetTransport {
  return kind === 'bc' ? new BroadcastChannelTransport() : new TrysteroTransport();
}
