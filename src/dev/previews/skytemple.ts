// ?dev=skytemple&hires=2 — the Sky Temple arena (src/art/arena-sky), static, at 2× density.
//   &grid=1  overlays the duel's real zone centres (isoToScreen) to check the board lines up.
//   &only=board  just the board (no sky).
import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import { K, SKY_BOARD, paintSkyBoard } from '../../art/arena-sky/board';
import { SKY_LAYOUT, SKY_X0, paintIsland, paintPillar, paintPrism, paintPrismBeams, paintSkyBackdrop } from '../../art/arena-sky/sky';
import { CLOUD_LAYERS, SKY_X0 as BX0, paintClouds, paintSky } from '../../art/arena-sky/backdrop';
import { SKY_BOARD2, paintSkyBoard2 } from '../../art/arena-sky/board2';
import { SKY as SK } from '../../art/arena-sky/kit';
import { paintBeams, paintCrystal, paintGlow, paintIsland2, paintPillar2 } from '../../art/arena-sky/props';
import { skyColorAt } from '../../art/arena-sky/backdrop';
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
    if (params.get('v') !== '1') {
      // v2: sky + volumetric cloud layers (islands, pillars, prism come next)
      scene.add.image(BX0, 0, canvasTexture(scene, 'sky2:sky', paintSky)).setOrigin(0).setScale(S).setDepth(0);
      CLOUD_LAYERS.forEach((_, i) => {
        const front = i === CLOUD_LAYERS.length - 1;
        scene.add.image(BX0, 0, canvasTexture(scene, `sky2:clouds:${i}`, () => paintClouds(i))).setOrigin(0).setScale(S).setDepth(front ? 7 : 1 + i * 0.1);
      });
      // islands: far ones hazed into the sky, drawn between the cloud layers
      const isl: [number, number, number, number, number][] = [
        // x, y (top centre), kind, haze, depth
        [520, 92, 1, 0.55, 0.15],
        [404, 100, 3, 0.6, 0.15],
        [110, 76, 0, 0.42, 0.25],
        [-46, 128, 3, 0.32, 0.25],
        [680, 140, 2, 0.2, 1.5],
        [-40, 236, 0, 0.05, 2.6],
      ];
      isl.forEach(([x, y, k, hz, dp], n) => {
        const tex = canvasTexture(scene, `sky2:isl:${n}`, () => paintIsland2(k, hz, skyColorAt(x, Math.min(y + 40, 150))));
        // far islands smaller (half scale of the art)
        const sc = dp < 1 ? S * 0.5 : dp < 2 ? S * 0.75 : S;
        scene.add.image(x, y - 30 * (sc / S), tex).setOrigin(0.5, 0).setScale(sc).setDepth(dp);
      });
      // the prism, its halo and the two beams
      const PR = { x: 226, y: 14 };
      scene.add.image(-80, 0, canvasTexture(scene, 'sky2:beams', () => paintBeams(PR.x, PR.y + 34, { x: 110, y: 250 }, { x: 560, y: 250 }))).setOrigin(0).setScale(S).setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
      scene.add.image(PR.x, PR.y + 24, canvasTexture(scene, 'sky2:prismglow', () => paintGlow(34, SK.crystalViolet))).setScale(S).setDepth(3.1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
      scene.add.image(PR.x, PR.y, canvasTexture(scene, 'sky2:prism', () => paintCrystal(15, 52, SK.crystalViolet))).setOrigin(0.5, 0).setScale(S).setDepth(3.2);
      // banner pillars
      ([[34, -10, 0], [606, -10, 1]] as const).forEach(([x, y, sd]) => {
        scene.add.image(x, y, canvasTexture(scene, `sky2:pillar:${sd}`, () => paintPillar2(sd))).setOrigin(0.5, 0).setScale(S).setDepth(5);
        scene.add.image(x, y + 16, canvasTexture(scene, `sky2:pglow:${sd}`, () => paintGlow(18, sd ? SK.crystalPink : SK.crystalCyan))).setScale(S).setDepth(5.1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
      });
      // floating crystals round the board
      ([[96, 196, 0], [152, 300, 1], [548, 214, 2], [600, 300, 0], [20, 176, 2], [634, 196, 1]] as const).forEach(([x, y, r], n) => {
        const ramp = [SK.crystalCyan, SK.crystalViolet, SK.crystalPink][r];
        scene.add.image(x, y, canvasTexture(scene, `sky2:fc:${n}`, () => paintCrystal(4 + (n % 3), 16 + (n % 2) * 6, ramp))).setScale(S).setDepth(6.5);
      });
      scene.add.image(SKY_BOARD2.x, SKY_BOARD2.y, canvasTexture(scene, 'sky2:board', paintSkyBoard2)).setOrigin(0).setScale(S).setDepth(6);
    } else if (params.get('only') !== 'board') {
      scene.add.image(SKY_X0, 0, canvasTexture(scene, 'sky:backdrop', paintSkyBackdrop)).setOrigin(0).setScale(S).setDepth(0);
      for (const isl of SKY_LAYOUT.islands)
        scene.add.image(isl.x, isl.y, canvasTexture(scene, `sky:island:${isl.i}`, () => paintIsland(isl.i))).setOrigin(0.5, 0.4).setScale(S).setDepth(2);
      SKY_LAYOUT.pillars.forEach((pl, i) => scene.add.image(pl.x, pl.y, canvasTexture(scene, `sky:pillar:${i}`, () => paintPillar(i as 0 | 1))).setOrigin(0).setScale(S).setDepth(3));
      if (params.get('beams') === '1') scene.add.image(0, 0, canvasTexture(scene, 'sky:beams', paintPrismBeams)).setOrigin(0).setScale(S).setDepth(4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
      scene.add.image(SKY_LAYOUT.prism.x, SKY_LAYOUT.prism.y, canvasTexture(scene, 'sky:prism', paintPrism)).setOrigin(0.5, 0).setScale(S).setDepth(5);
    }
    if (params.get('v') === '1') scene.add.image(SKY_BOARD.x, SKY_BOARD.y, canvasTexture(scene, 'sky:board', paintSkyBoard)).setOrigin(0).setScale(S).setDepth(6);
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
