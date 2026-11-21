// The board pick rule (HumanInput.pick), as a pure function over what lies under the pointer.
//
// "Tap by tile" (owner-approved, shots/arena-analysis/layout/board-1.png): a big monster's body
// must not make the cards behind it untappable. So the cell of an OCCUPIED zone (a monster or a
// card lies there, either player's, or a non-empty pile) wins over any body covering the point; a
// monster's own tile therefore always selects it. Body pixels outside every occupied cell still
// select the body's monster (a big monster stays easy to tap). Empty cells keep the earlier rule.

import type { PlayerId } from '../engine/types';
import type { BoardSpot } from '../view/layout';

export interface BoardPick {
  player: PlayerId;
  spot: BoardSpot;
  index: number;
}

export interface PickInputs {
  /** The zone whose cell holds the point (nearest cell / Fusion Deck pad), or null off the board. */
  tile: BoardPick | null;
  /** A card / monster / non-empty pile lies on `tile`. */
  tileOccupied: boolean;
  /** Opaque body pixels under the point, front-most first (each as its monster's zone). */
  hits: BoardPick[];
  /** "Is this a meaningful click right now" (a board pick's candidates, idle's actionable zones), or null. */
  valid: ((h: BoardPick) => boolean) | null;
  /** A board pick (target / zone choice) is open. */
  zonePick: boolean;
}

export function resolvePick(i: PickInputs): BoardPick | null {
  const { tile, hits, valid } = i;
  if (tile && i.tileOccupied) {
    // in an open board pick a non-candidate tile does nothing on a click, so a candidate body
    // covering it is taken instead (idle keeps the tile: hover / tap inspect what lies there)
    if (i.zonePick && valid && !valid(tile)) {
      const v = hits.find(valid);
      if (v) return v;
    }
    return tile;
  }
  if (valid) {
    // a valid body (front-most, even one partly covered by a non-valid body) first; then in a
    // board pick the valid tile, in idle whatever body is in front (what the player sees)
    const v = hits.find(valid);
    if (v) return v;
    if (tile && valid(tile) && (i.zonePick || !hits.length)) return tile;
  }
  return hits[0] ?? tile;
}
