// ?dev=skytemple&hires=2 — the Sky Temple arena (src/art/arena-sky), static, at 2× density.
//   &grid=1  overlays the duel's real zone centres (isoToScreen) to check the board lines up.
//   &only=board  just the board (no sky).
import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import { K, SKY_BOARD, paintSkyBoard } from '../../art/arena-sky/board';
import { SKY_LAYOUT, SKY_X0, paintIsland, paintPillar, paintPrism, paintPrismBeams, paintSkyBackdrop } from '../../art/arena-sky/sky';
import { isoToScreen } from '../../view/layout';
import { wideSides } from '../../view/wide';
import { canvasTexture } from '../../view/v3/hudSkin';
import type { DevPreview } from '../types';

const preview: DevPreview = {
  name: 'skytemple',
  description: 'Sky Temple arena (open with &hires=2): &grid=1 marks the duel zone centres, &only=board',
  create(scene, params) {
    scene.cameras.main.setBackgroundColor(PAL.void1);
    wideSides(scene); // the arena runs on into the side bars on wide phones
    const t0 = performance.now();
    const S = 1 / K;
    if (params.get('only') !== 'board') {
      scene.add.image(SKY_X0, 0, canvasTexture(scene, 'sky:backdrop', paintSkyBackdrop)).setOrigin(0).setScale(S).setDepth(0);
      for (const isl of SKY_LAYOUT.islands)
        scene.add.image(isl.x, isl.y, canvasTexture(scene, `sky:island:${isl.i}`, () => paintIsland(isl.i))).setOrigin(0.5, 0.4).setScale(S).setDepth(2);
      SKY_LAYOUT.pillars.forEach((pl, i) => scene.add.image(pl.x, pl.y, canvasTexture(scene, `sky:pillar:${i}`, () => paintPillar(i as 0 | 1))).setOrigin(0).setScale(S).setDepth(3));
      if (params.get('beams') === '1') scene.add.image(0, 0, canvasTexture(scene, 'sky:beams', paintPrismBeams)).setOrigin(0).setScale(S).setDepth(4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
      scene.add.image(SKY_LAYOUT.prism.x, SKY_LAYOUT.prism.y, canvasTexture(scene, 'sky:prism', paintPrism)).setOrigin(0.5, 0).setScale(S).setDepth(5);
    }
    scene.add.image(SKY_BOARD.x, SKY_BOARD.y, canvasTexture(scene, 'sky:board', paintSkyBoard)).setOrigin(0).setScale(S).setDepth(6);
    console.log('[skytemple] painted in', Math.round(performance.now() - t0), 'ms');
    if (params.get('grid') === '1') {
      for (let c = 0; c < 7; c++)
        for (let r = 0; r < 5; r++) {
          const p = isoToScreen(c, r);
          scene.add.rectangle(p.x, p.y, 2, 2, PAL.white).setDepth(10);
        }
    }
  },
};

export default preview;
