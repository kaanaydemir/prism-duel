// Duelist avatars behind each back row (layout.duelistXY). Optional: the art module
// src/art/duelists.ts (textures `duelistTextureKey(p)`, anims `duelistAnimKey(p, anim)`, built by
// a boot step) may be missing — createDuelists() then returns null and cinematics skip them.
//
//   const d = views.duelists?.get(0);
//   await d?.play('command');   // thrust the duel-disk arm (summons / attacks)
//   await d?.play('hurt');      // recoil on damage
//   d?.play('defeat') / d?.play('victory')
//
// Both are drawn facing right; player 2 is mirrored (flipX) so they face each other.

import Phaser from 'phaser';
import type { PlayerId } from '../engine/types';
import { DEPTH, duelistXY, type XY } from '../view/layout';
import { TEX, tween, wait } from '../vfx/core';
import { CAST, castShadowTex } from './cast-shadow';
import { syncReflection } from '../view/board-nt/tide-state';
import { PAL } from '../art/palette';

export type DuelistAnim = 'idle' | 'command' | 'hurt' | 'defeat' | 'victory';

interface DuelistModule {
  duelistTextureKey?: (p: PlayerId) => string;
  duelistAnimKey?: (p: PlayerId, anim: DuelistAnim) => string;
  DUELIST_W?: number;
  DUELIST_H?: number;
  DUELIST_ANCHOR_X?: number;
  DUELIST_ANCHOR_Y?: number;
  DUELIST_ANCHOR?: { x: number; y: number };
  [k: string]: unknown;
}

const mods = import.meta.glob<DuelistModule>('../art/duelists.ts', { eager: true });
const MOD: DuelistModule | null = Object.values(mods)[0] ?? null;

export class DuelistView {
  readonly scene: Phaser.Scene;
  readonly player: PlayerId;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly animKey: (a: DuelistAnim) => string;
  private token = 0;
  /** The duelist's silhouette cast shadow (same key light as the monsters: duel/cast-shadow.ts). */
  private readonly cast: Phaser.GameObjects.Image;
  private castId = '';
  private refl: Phaser.GameObjects.Image | null = null;
  private readonly onPost = (): void => this.syncCast();

  constructor(scene: Phaser.Scene, player: PlayerId, texture: string, animKey: (a: DuelistAnim) => string, origin: { x: number; y: number }) {
    this.scene = scene;
    this.player = player;
    this.animKey = animKey;
    const p = duelistXY(player);
    this.sprite = scene.add.sprite(Math.round(p.x), Math.round(p.y), texture);
    this.sprite.setOrigin(player === 1 ? 1 - origin.x : origin.x, origin.y).setFlipX(player === 1);
    this.sprite.setDepth(DEPTH.UNIT + p.y);
    this.cast = scene.add.image(Math.round(p.x), Math.round(p.y), TEX.px1).setDepth(DEPTH.SHADOW - 0.05).setVisible(false);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.onPost);
    this.rest();
  }

  private syncCast(): void {
    const s = this.sprite;
    if (!s.active || !this.cast.active) return;
    const vis = s.visible && s.alpha > 0.05;
    const fr = s.frame;
    const id = vis && fr ? `${fr.texture.key}|${fr.name}|${s.flipX ? 1 : 0}` : '';
    if (id !== this.castId) {
      this.castId = id;
      const ct = id ? castShadowTex(this.scene, fr, s.flipX, s.originX, s.originY, 0) : null;
      if (ct) this.cast.setTexture(ct.key).setOrigin(ct.ox, ct.oy);
      this.cast.setData('ok', !!ct);
    }
    this.refl = syncReflection(this.scene, this.refl, s, Math.round(s.y), 0, PAL.cyan3, this.player * 7 + 3);
    const ok = vis && this.cast.getData('ok') === true;
    this.cast.setVisible(ok);
    if (ok) this.cast.setPosition(Math.round(s.x), Math.round(s.y)).setAlpha(CAST.ALPHA * Math.min(1, s.alpha));
  }

  get home(): XY {
    return duelistXY(this.player);
  }

  /** Point at chest height (where direct hits / panel effects can aim). */
  chest(): XY {
    const p = this.home;
    return { x: p.x, y: p.y - Math.round(this.sprite.displayHeight * 0.55) };
  }

  rest(): void {
    const k = this.animKey('idle');
    if (this.scene.anims.exists(k)) this.sprite.play({ key: k, repeat: -1 });
  }

  /** One-shots resolve on completion (defeat/victory hold their last frame). */
  play(anim: DuelistAnim): Promise<void> {
    const k = this.animKey(anim);
    if (!this.scene.anims.exists(k) || !this.sprite.active) return Promise.resolve();
    const token = ++this.token;
    if (anim === 'idle') {
      this.rest();
      return Promise.resolve();
    }
    this.sprite.play({ key: k, repeat: 0 });
    const a = this.scene.anims.get(k);
    const ms = a ? (a.frames.length / Math.max(1, a.frameRate)) * 1000 : 600;
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (token === this.token && anim !== 'defeat' && anim !== 'victory') this.rest();
        resolve();
      };
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + k, finish);
      void wait(this.scene, ms * 1.6 + 200).then(finish);
    });
  }

  /** Little hop + flash used when this duelist takes a direct hit. */
  async jolt(): Promise<void> {
    const x = this.sprite.x;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.x = x + (this.player === 0 ? -3 : 3);
    await tween(this.scene, { targets: this.sprite, x, duration: 200, ease: 'Back.Out' });
  }

  setVisible(b: boolean): void {
    this.sprite.setVisible(b);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onPost);
    this.sprite.destroy();
    this.cast.destroy();
    this.refl?.destroy();
  }
}

export class DuelistViews {
  private readonly views: [DuelistView, DuelistView];
  constructor(views: [DuelistView, DuelistView]) {
    this.views = views;
  }
  get(p: PlayerId): DuelistView {
    return this.views[p];
  }
  setVisible(b: boolean): void {
    for (const v of this.views) v.setVisible(b);
  }
}

/** Build both avatars, or null when the art module / textures are not available. */
export function createDuelists(scene: Phaser.Scene): DuelistViews | null {
  try {
    if (!MOD || typeof MOD.duelistTextureKey !== 'function' || typeof MOD.duelistAnimKey !== 'function') return null;
    const texKey = MOD.duelistTextureKey;
    const animKey = MOD.duelistAnimKey;
    const views: DuelistView[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      const tex = texKey(p);
      if (!scene.textures.exists(tex)) return null;
      const W = Number(MOD.DUELIST_W ?? scene.textures.get(tex).getSourceImage().width) || 24;
      const H = Number(MOD.DUELIST_H ?? 40) || 40;
      const ax = MOD.DUELIST_ANCHOR?.x ?? MOD.DUELIST_ANCHOR_X ?? W / 2;
      const ay = MOD.DUELIST_ANCHOR?.y ?? MOD.DUELIST_ANCHOR_Y ?? H - 1;
      views.push(new DuelistView(scene, p, tex, (a) => animKey(p, a), { x: ax / W, y: ay / H }));
    }
    return new DuelistViews(views as [DuelistView, DuelistView]);
  } catch (e) {
    console.warn('[duel] duelists unavailable', e);
    return null;
  }
}
