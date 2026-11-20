// A duel waiting across a page reload (sessionStorage): the arena picker (ArenaPickScene) reloads the page when the chosen arena
// needs another canvas resolution (src/view/hires.ts reads it at boot), and BootScene (registry.ts firstScene) starts the saved
// duel instead of the title. One-shot: read once, then gone.

import type { DuelLaunch } from '../launch';

const KEY = 'prism-duel:pending-duel';

/** Save the duel to start after the reload; false when there is no session storage (the caller then just starts it). */
export function savePendingDuel(launch: DuelLaunch): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), launch }));
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** The saved duel (and forget it), or null. Stale entries (over two minutes old) are dropped. */
export function takePendingDuel(): DuelLaunch | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const o = JSON.parse(raw) as { at?: number; launch?: DuelLaunch };
    if (!o.launch || typeof o.launch.mode !== 'string' || !o.at || Date.now() - o.at > 120000) return null;
    return o.launch;
  } catch {
    return null;
  }
}
