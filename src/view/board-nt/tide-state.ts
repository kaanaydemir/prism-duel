// Gelgit Körfezi: how flooded the stage is right now (0 dry … 1 full), written by the tide layer (board-nt/tide.ts) every frame and
// read by the units that mirror themselves in the water (duel/MonsterUnit.ts, duel/DuelistView.ts). A leaf module (only layout's
// DEPTH), so the units can read it without pulling the arena in.
import { DEPTH } from '../layout';

export const TIDE_STATE = { level: 0, t: 0 };

/** The reflections lie on the water: over its body (board-nt/tide.ts TIDE_Z.body), under its surface highlights. */
export const TIDE_REFLECT_Z = DEPTH.PLATFORM + 1.47;
/** The reflection: a squashed mirror image, its alpha at full flood, the tint the water gives it. */
/** Owner 2026-11-18: the stylised (opaque, flat) water has no mirror images — alpha 0 turns them off; the code stays for a later look. */
export const TIDE_REFLECT = { squash: 0.62, alpha: 0 } as const;

/**
 * Sync a unit's reflection image with its sprite: mirrored about the floor under it (`floorY`; `lift` px above the floor while it
 * leaps), squashed, swaying a pixel with the water; hidden when the stage is dry. Returns the image (created on first use).
 */
export function syncReflection(
  scene: Phaser.Scene,
  refl: Phaser.GameObjects.Image | null,
  s: Phaser.GameObjects.Sprite,
  floorY: number,
  lift: number,
  tint: number,
  seed: number,
): Phaser.GameObjects.Image | null {
  const lvl = TIDE_STATE.level;
  const vis = TIDE_REFLECT.alpha > 0 && lvl > 0 && s.active && s.visible && s.alpha > 0.05 && !!s.frame;
  if (!vis) {
    refl?.setVisible(false);
    return refl;
  }
  const fr = s.frame;
  const r = refl ?? scene.add.image(0, 0, fr.texture.key, fr.name).setDepth(TIDE_REFLECT_Z).setTint(tint);
  r.setTexture(fr.texture.key, fr.name).setFlipX(s.flipX);
  // the pivot: the sprite's feet row (its origin point sits `floorY - lift - s.y` px above the floor)
  const H = fr.realHeight;
  const feetBelowOrigin = floorY - lift - s.y;
  r.setOrigin(s.originX, Math.max(0, Math.min(1, (s.originY * H + feetBelowOrigin) / H)));
  const sway = Math.round(Math.sin(TIDE_STATE.t / 280 + seed) * 0.8);
  r.setPosition(Math.round(s.x) + sway, Math.round(floorY + lift));
  r.setScale(Math.abs(s.scaleX), -TIDE_REFLECT.squash * Math.abs(s.scaleY));
  r.setAlpha(TIDE_REFLECT.alpha * lvl * Math.min(1, s.alpha) * (lift > 0 ? Math.max(0.3, 1 - lift / 60) : 1));
  r.setVisible(true);
  return r;
}
