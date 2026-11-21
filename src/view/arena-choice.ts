// The player's arena choice — Neon Tower (the lit graphite hall) or Sky Temple (the floating temple
// above the clouds). No Phaser import: boot code (src/view/hires.ts) and tests read it.
//
//   getArenaChoice(): ArenaId        the remembered choice (local storage, the settings key)
//   setArenaChoice(id)               remember a choice (the next duel uses it)
//   resolveArena(explicit?)          the arena a duel uses: an explicit one (a networked duel forces the
//                                    host's), else ?arena=sky|neon (QA), else the remembered choice
//
// Online play: the host sends getArenaChoice(); the guest starts its duel with
//   scene.start('Duel', { ...launch, arena: hostArena })   (DuelLaunch.arena, src/scenes/launch.ts)
// which wins over the guest's own choice for that duel only (nothing is saved).
//
// The choice lives in the settings record ('neon-duello:settings', field `arena`) that the settings
// panel (src/scenes/title/settings.ts) also edits, so both stay in step.

export type ArenaId = 'neon' | 'sky';

export const ARENA_IDS: readonly ArenaId[] = ['sky', 'neon'];

/** Display names / blurbs (UI text). */
export const ARENA_INFO: Record<ArenaId, { name: string; blurb: string }> = {
  sky: { name: 'SKY TEMPLE', blurb: 'A sunlit temple floating above the clouds.' },
  neon: { name: 'NEON TOWER', blurb: 'The torch-lit graphite hall under the tower.' },
};

/**
 * The arena every player gets. Owner decision 2026-11-21 (docs/v3/ARENA_ANALIZ.md section 1): one arena only,
 * the Neon arena; the Sky Temple is shelved (its code stays, players are not offered it). Developers can still
 * open it with ?arena=sky or an explicit DuelLaunch.arena.
 */
export const DEFAULT_ARENA: ArenaId = 'neon';

/** The arenas players may pick or keep as a remembered choice (a stored 'sky' is ignored: shelved). */
export const PLAYER_ARENAS: readonly ArenaId[] = ['neon'];

/** Whether the arena chooser is offered to players (settings row, the arena-pick step). Off: one arena. */
export const ARENA_CHOOSER = PLAYER_ARENAS.length > 1;

const KEY = 'neon-duello:settings';

export function isArenaId(v: unknown): v is ArenaId {
  return v === 'neon' || v === 'sky';
}

/** Accepts the ids and a few URL spellings (?arena=sky / skytemple / sky-temple, neon / nt / tower). */
export function parseArena(v: string | null | undefined): ArenaId | null {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'sky' || s === 'skytemple' || s === 'sky-temple' || s === 'temple') return 'sky';
  if (s === 'neon' || s === 'nt' || s === 'tower' || s === 'neon-tower') return 'neon';
  return null;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** The remembered arena (DEFAULT_ARENA when nothing valid is saved, or when the saved one is shelved). */
export function getArenaChoice(): ArenaId {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const a = (JSON.parse(raw) as { arena?: unknown }).arena;
      if (isArenaId(a) && PLAYER_ARENAS.includes(a)) return a;
    }
  } catch {
    /* bad JSON / no storage */
  }
  return DEFAULT_ARENA;
}

/** Remember the arena (keeps every other setting in the record). */
export function setArenaChoice(id: ArenaId): void {
  if (!isArenaId(id)) return;
  const st = storage();
  if (!st) return;
  try {
    let rec: Record<string, unknown> = {};
    const raw = st.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as unknown;
      if (o && typeof o === 'object') rec = o as Record<string, unknown>;
    }
    rec.arena = id;
    st.setItem(KEY, JSON.stringify(rec));
  } catch {
    try {
      st.setItem(KEY, JSON.stringify({ arena: id }));
    } catch {
      /* storage full / blocked */
    }
  }
}

/** ?arena=… of the page (QA), or null. `old` / `calm` (the retired calm arena) are not arena choices. */
export function arenaFromUrl(): ArenaId | null {
  try {
    if (typeof location === 'undefined' || typeof URLSearchParams === 'undefined') return null;
    return parseArena(new URLSearchParams(location.search).get('arena'));
  } catch {
    return null;
  }
}

/** The arena a board is built for: explicit (a networked duel) > ?arena= > the remembered choice. */
/** A stored choice of a shelved arena (Sky Temple) falls back to DEFAULT_ARENA, so no player reaches it by accident. */
export function resolveArena(explicit?: ArenaId | null): ArenaId {
  if (isArenaId(explicit)) return explicit;
  return arenaFromUrl() ?? getArenaChoice();
}
