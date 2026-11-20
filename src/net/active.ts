// The online duel running right now (if any): lets shared views name the remote player instead of "CPU"
// (an online duel runs in the vs-CPU screen mode with the remote player in the computer's seat).

let names: [string, string] | null = null;

/** DuelScene: an online duel starts (LOCAL names: [you, opponent]) / ends (null). */
export function setNetNames(n: [string, string] | null): void {
  names = n;
}

/** The remote player's display name during an online duel, else null. */
export function netOpponentName(): string | null {
  return names ? names[1] : null;
}

export function isNetDuel(): boolean {
  return names !== null;
}
