// ?dev=skyprops&hires=2 — Sky Temple props one by one on a flat sky colour (for inspection).
import { SKY } from '../../art/arena-sky/kit';
import { K } from '../../art/arena-sky/board2';
import { paintCrystal, paintIsland2, paintPillar2 } from '../../art/arena-sky/props';
import { canvasTexture } from '../../view/v3/hudSkin';
import type { DevPreview } from '../types';

const preview: DevPreview = {
  name: 'skyprops',
  description: 'Sky Temple props sheet (open with &hires=2)',
  create(scene) {
    scene.cameras.main.setBackgroundColor(SKY.sky[8]);
    const S = 1 / K;
    [0, 1, 2, 3].forEach((i) => scene.add.image(20 + i * 120, 10, canvasTexture(scene, `sp:isl:${i}`, () => paintIsland2(i, 0, 0))).setOrigin(0).setScale(S));
    scene.add.image(500, 4, canvasTexture(scene, 'sp:p0', () => paintPillar2(0))).setOrigin(0).setScale(S);
    scene.add.image(570, 4, canvasTexture(scene, 'sp:p1', () => paintPillar2(1))).setOrigin(0).setScale(S);
    scene.add.image(60, 250, canvasTexture(scene, 'sp:c0', () => paintCrystal(8, 30, SKY.crystalCyan))).setOrigin(0).setScale(S);
  },
};
export default preview;
