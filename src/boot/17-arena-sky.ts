import { skyTexture, skyTextureList } from '../view/board-sky/scenery';
import { resolveArena } from '../view/arena-choice';
import { BOARD_V4 } from '../view/layout';
import { ARENA_NT } from '../view/board-nt/flag';
import type { BootStep } from './types';

/**
 * The Sky Temple's art (src/art/arena-sky, painted in code at 2× density, ~3 s): painted at boot when the Sky Temple is the
 * player's arena, so neither the title (which shows the arena) nor the first duel stalls on it. With the Neon Tower chosen
 * nothing is painted here; the arena picker / a networked duel paint it on demand (cached per game).
 */
const step: BootStep = {
  name: 'arena-sky',
  order: 17,
  build: (scene) => {
    if (!ARENA_NT || !BOARD_V4 || resolveArena() !== 'sky') return;
    for (const [key, paint] of skyTextureList()) skyTexture(scene, key, paint);
  },
};
export default step;
