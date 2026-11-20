// ?dev=arenapick — the arena picker (the last step before a local match: src/scenes/deck/ArenaPickScene.ts), in QA mode
// (it never leaves the scene). &sel=sky|neon preselects (saved as the choice first); &mobile=1 for the phone controls.
import { ArenaPickScene } from '../../scenes/deck/ArenaPickScene';
import { parseArena, setArenaChoice } from '../../view/arena-choice';
import type { DevPreview } from '../types';

const preview: DevPreview = {
  name: 'arenapick',
  description: 'arena picker (Sky Temple / Neon Tower thumbnails): &sel=sky|neon',
  async create(scene, params) {
    const mgr = scene.game.scene;
    if (!mgr.keys['ArenaPick']) mgr.add('ArenaPick', ArenaPickScene, false);
    const sel = parseArena(params.get('sel'));
    if (sel) setArenaChoice(sel);
    const ready = new Promise<void>((resolve) => scene.game.events.once('arena:ready', () => resolve()));
    scene.scene.start('ArenaPick', { launch: { mode: 'vsBot' }, dev: true });
    await ready;
  },
};

export default preview;
