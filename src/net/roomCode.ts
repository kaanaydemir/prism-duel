// Room codes: 6 characters a person can read aloud and type on a phone. The alphabet leaves out every
// look-alike pair (0/O/Q-less D, 1/I/L, 2/Z, 5/S, 8/B, U/V): 23 symbols, ~1.5e8 codes. The code is hashed with
// the app id into the transport's room id (src/net/config.ts roomIdFor), so two apps / versions never meet.

export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTWXY34679';
export const CODE_LENGTH = 6;

/** A fresh random code (crypto random when available). */
export function newRoomCode(rand: () => number = cryptoRandom): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.min(CODE_ALPHABET.length - 1, Math.floor(rand() * CODE_ALPHABET.length))];
  return s;
}

/** What the player typed → a code, or null if it cannot be one (case, spaces and dashes are ignored). */
export function normalizeRoomCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s\-_.]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return s;
}

/** "ACD347" → "ACD 347" (shown big in the lobby). */
export function formatRoomCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function cryptoRandom(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}
