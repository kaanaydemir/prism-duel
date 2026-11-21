// Pure model of the builder's meters (the bar under the title): the two rules of validateDeck — deck size and
// copy limits — with a fill, a met flag and the detailed reasons for the meter's tooltip, and between them two
// plain counts (monsters, spells / traps) that are information only: no rule limits the mix, so they never fail.
// No Phaser here: tests/deck/builder_model.test.ts.

import { CARDS, type CardId } from '../../data/cards';
import { DECK_MAX, DECK_MIN, FUSION_DECK_MAX, MAX_COPIES, validateDeck } from '../../data/decks';

export type MeterKey = 'cards' | 'monsters' | 'backrow' | 'copies';

export interface Meter {
  key: MeterKey;
  /** The word before the numbers ("Cards"). */
  label: string;
  /** The numbers ("34/40"); '' when the label says it all. */
  value: string;
  /** 0..1 */
  fill: number;
  met: boolean;
  /** A plain count, not a requirement: always `met`, drawn without the check mark. */
  info?: boolean;
  /** Tooltip lines: the rule, then what is wrong (if anything). */
  tip: string[];
}

export interface MeterExtra {
  /** Cards dropped on load (no longer in the game). */
  missing?: number;
  /** Copies of retired cards swapped on load. */
  replaced?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function deckMeters(cards: readonly string[], extra: MeterExtra = {}): Meter[] {
  const v = validateDeck(cards);
  const st = v.stats;
  const n = st.size;
  const issue = (code: string) => v.issues.filter((i) => i.code === code).map((i) => i.text);

  const sizeMet = n >= DECK_MIN && n <= DECK_MAX;
  const cards1: Meter = {
    key: 'cards',
    label: 'Cards',
    value: n <= DECK_MIN ? `${n}/${DECK_MIN}` : `${n}/${DECK_MAX}`,
    fill: n <= DECK_MIN ? clamp01(n / DECK_MIN) : 1,
    met: sizeMet,
    tip: [
      `The Main Deck holds ${DECK_MIN}-${DECK_MAX} cards.`,
      ...issue('size'),
      ...(sizeMet ? [`${n} cards: OK.`] : []),
      `The Fusion Deck holds 0-${FUSION_DECK_MAX} Fusion Monsters (now ${st.fusion}).`,
      ...issue('fusion'),
    ],
  };

  // information only: the bar is the share of the main deck
  const monsters: Meter = {
    key: 'monsters',
    label: 'Monsters',
    value: String(st.monsters),
    fill: n ? clamp01(st.monsters / n) : 0,
    met: true,
    info: true,
    tip: [`Monsters in the Main Deck: ${st.monsters}.`, 'No minimum and no maximum: any mix of monsters, spells and traps is legal.'],
  };

  const back = st.spells + st.traps;
  const backrow: Meter = {
    key: 'backrow',
    label: 'Spells / Traps',
    value: `${st.spells} / ${st.traps}`,
    fill: n ? clamp01(back / n) : 0,
    met: true,
    info: true,
    tip: [`Spells: ${st.spells}. Traps: ${st.traps}.`, 'No minimum and no maximum: any mix of monsters, spells and traps is legal.'],
  };

  const distinct = Object.keys(st.counts).length;
  const bad = st.over.length + st.unknown.length;
  const lost: string[] = [];
  if (extra.missing) lost.push(`Missing cards: ${extra.missing} (removed from the game, dropped).`);
  if (extra.replaced) lost.push(`Retired cards: ${extra.replaced} cop${extra.replaced === 1 ? 'y' : 'ies'} swapped for a similar card. Save to clear.`);
  const overNames = st.over.map((id) => CARDS[id as CardId]?.name ?? id);
  const copies: Meter = {
    key: 'copies',
    label: `Max ${MAX_COPIES} copies`,
    value: '',
    fill: bad ? clamp01((distinct - st.over.length) / Math.max(1, distinct + st.unknown.length)) : 1,
    met: bad === 0,
    tip: [
      `Max ${MAX_COPIES} copies of a card, Fusion Monsters too. Seals and single-copy cards: 1.`,
      ...issue('copies'),
      ...(overNames.length > 2 ? [`All of them: ${overNames.join(', ')}`] : []),
      ...issue('unknown'),
      ...lost,
    ],
  };
  return [cards1, monsters, backrow, copies];
}
