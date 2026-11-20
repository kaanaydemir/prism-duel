// The arena choice API (src/view/arena-choice.ts): persistence in the settings record, defaults, parsing, and the
// explicit override a networked duel uses.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

const g = globalThis as { localStorage?: unknown; location?: unknown };
const KEY = 'neon-duello:settings';
let store: MemStorage;

beforeEach(() => {
  store = new MemStorage();
  g.localStorage = store;
});
afterEach(() => {
  delete g.localStorage;
  delete g.location;
});

describe('arena choice', () => {
  it('defaults to DEFAULT_ARENA with nothing saved', async () => {
    const A = await import('../../src/view/arena-choice');
    expect(A.getArenaChoice()).toBe(A.DEFAULT_ARENA);
    expect(A.ARENA_IDS).toContain(A.DEFAULT_ARENA);
  });

  it('remembers a choice and keeps the other settings', async () => {
    const A = await import('../../src/view/arena-choice');
    store.setItem(KEY, JSON.stringify({ speed: 2, sound: false }));
    A.setArenaChoice('neon');
    expect(A.getArenaChoice()).toBe('neon');
    const rec = JSON.parse(store.getItem(KEY) as string);
    expect(rec).toEqual({ speed: 2, sound: false, arena: 'neon' });
    A.setArenaChoice('sky');
    expect(A.getArenaChoice()).toBe('sky');
  });

  it('ignores bad saved values and bad JSON', async () => {
    const A = await import('../../src/view/arena-choice');
    store.setItem(KEY, JSON.stringify({ arena: 'lava' }));
    expect(A.getArenaChoice()).toBe(A.DEFAULT_ARENA);
    store.setItem(KEY, '{not json');
    expect(A.getArenaChoice()).toBe(A.DEFAULT_ARENA);
    A.setArenaChoice('neon'); // repairs the record
    expect(A.getArenaChoice()).toBe('neon');
    A.setArenaChoice('bogus' as never);
    expect(A.getArenaChoice()).toBe('neon');
  });

  it('works without storage', async () => {
    delete g.localStorage;
    const A = await import('../../src/view/arena-choice');
    expect(() => A.setArenaChoice('neon')).not.toThrow();
    expect(A.getArenaChoice()).toBe(A.DEFAULT_ARENA);
  });

  it('parses ids and URL spellings', async () => {
    const A = await import('../../src/view/arena-choice');
    expect(A.parseArena('sky')).toBe('sky');
    expect(A.parseArena('Sky-Temple')).toBe('sky');
    expect(A.parseArena('nt')).toBe('neon');
    expect(A.parseArena('neon')).toBe('neon');
    expect(A.parseArena('old')).toBeNull();
    expect(A.parseArena(null)).toBeNull();
  });

  it('resolveArena: explicit (online host) > ?arena= > saved choice', async () => {
    const A = await import('../../src/view/arena-choice');
    A.setArenaChoice('neon');
    expect(A.resolveArena()).toBe('neon');
    g.location = { search: '?arena=sky' };
    expect(A.resolveArena()).toBe('sky');
    expect(A.resolveArena('neon')).toBe('neon');
    expect(A.getArenaChoice()).toBe('neon'); // an explicit arena is never saved
  });

  it('the settings record defaults to the same arena', async () => {
    const A = await import('../../src/view/arena-choice');
    const L = await import('../../src/scenes/launch');
    expect(L.loadSettings().arena).toBe(A.DEFAULT_ARENA);
    A.setArenaChoice('neon');
    expect(L.loadSettings().arena).toBe('neon');
  });
});
