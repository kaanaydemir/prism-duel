// ARENA PICK — the last step before a local match (scene 'ArenaPick', after the deck picks in DeckPickScene): choose where
// the duel is fought, the Sky Temple or the Neon Tower. Each arena is shown as a live-rendered thumbnail of its real duel
// board (a BoardView built for a moment and drawn into a render texture at exactly half scale, so the Sky Temple's 2×
// art lands 1:1 on the hi-res canvas). The remembered choice (src/view/arena-choice.ts) is preselected; the pick is saved.
//
//   mouse / touch   tap an arena to select it, tap it again (or START DUEL) to play
//   keys            ← → select · Enter start · Esc back
//
// The canvas resolution depends on the arena (src/view/hires.ts: the Sky Temple renders at 2×). Choosing the Sky Temple on a
// page booted at 1× saves the choice and reloads straight into the duel (registry.ts pendingDuel), so it is drawn crisp.

import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import { music, sfx } from '../../audio/sfx';
import { pixelText } from '../../ui/text';
import { Button } from '../../view/Button';
import { BoardView } from '../../view/BoardView';
import { GAME_H, GAME_W } from '../../view/layout';
import { ICON, playerStyle } from '../../view/ui-textures';
import { ARENA_IDS, ARENA_INFO, type ArenaId, getArenaChoice, setArenaChoice } from '../../view/arena-choice';
import { HIRES } from '../../view/hires';
import { MOBILE } from '../../view/mobile';
import { tween } from '../../vfx/core';
import type { DuelLaunch } from '../launch';
import { REDUCED_MOTION, backdropTex, fadeFromInk, fadeToInk, latticeTex, panelV3 } from './ui';
import { savePendingDuel } from './pending';

export interface ArenaPickData {
  /** The match to start (decks + mode from the deck picks); `arena` is filled in here. */
  launch: DuelLaunch;
  /** Where BACK goes (the deck picker's last step). */
  back?: { key: string; data?: object };
  /** QA: never leave the scene. */
  dev?: boolean;
}

/** Thumbnail size (game px) and the arena region it shows (world px, half scale). */
const TW = 272;
const TH = 153;
const VIEW = { x: 320, y: 172 } as const;
const TY = 54;
/** The arena not chosen shows dimmed (over the ink panel). */
const DIM = 0.55;
const TX: Record<ArenaId, number> = { sky: 34, neon: 334 };

interface Card {
  id: ArenaId;
  x: number;
  frame: Phaser.GameObjects.Graphics;
  rt: Phaser.GameObjects.RenderTexture | null;
  wait: Phaser.GameObjects.BitmapText;
  name: Phaser.GameObjects.BitmapText;
  blurb: Phaser.GameObjects.BitmapText;
  badge: Phaser.GameObjects.BitmapText;
  zone: Phaser.GameObjects.Zone;
}

export class ArenaPickScene extends Phaser.Scene {
  private d!: ArenaPickData;
  private sel: ArenaId = 'sky';
  private cards: Card[] = [];
  private busy = false;
  private ready = false;
  private t = 0;
  private lastTap = { id: '' as string, at: -1e9 };
  private okBtn!: Button;
  private lattice!: Phaser.GameObjects.TileSprite;

  constructor() {
    super('ArenaPick');
  }

  init(data: ArenaPickData | undefined): void {
    this.d = { launch: { mode: 'vsBot' }, ...(data ?? {}) } as ArenaPickData;
    this.cards = [];
    this.busy = false;
    this.ready = false;
    this.t = 0;
    this.sel = getArenaChoice();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PAL.night0);
    this.add.image(0, 0, backdropTex(this)).setOrigin(0);
    this.lattice = this.add.tileSprite(0, 0, GAME_W, GAME_H, latticeTex(this)).setOrigin(0);
    this.add.image(20, 12, panelV3(this, 'p1', 600, 336, 20)).setOrigin(0).setDepth(3);
    const head = pixelText(this, 32, 22, 'CHOOSE THE ARENA', { size: 'md', color: PAL.white }).setDepth(10);
    head.setTint(PAL.gold4, PAL.gold4, PAL.white, PAL.white);
    const steps = this.d.launch.mode === 'hotseat' || this.d.launch.mode === 'vsBot' ? 'STEP 3/3' : '';
    pixelText(this, 608, 24, steps, { size: 'sm', color: PAL.steel, originX: 1 }).setDepth(10);

    for (const id of ARENA_IDS) this.cards.push(this.buildCard(id));
    pixelText(this, 320, 268, 'Your pick is remembered for the next duels.', { size: 'sm', color: PAL.steel, originX: 0.5 }).setDepth(10);

    const bh = MOBILE ? 26 : 18;
    const by = 322 - (bh - 18);
    const back = new Button(this, 32, by, { w: 78, h: bh, label: 'BACK', size: 'sm', icon: ICON.close, style: 'neutral', depth: 20 });
    back.onClick = () => void this.back();
    this.okBtn = new Button(this, 470, by, { w: 138, h: bh, label: 'START DUEL', size: 'sm', style: playerStyle(0), depth: 20 });
    this.okBtn.onClick = () => void this.confirm();
    this.okBtn.setAttention(true);
    if (!MOBILE) pixelText(this, 222, 328, '←→ ARENA · ENTER START · ESC BACK', { size: 'sm', color: PAL.steel }).setDepth(10);
    this.render(false);

    const onKey = (e: KeyboardEvent) => {
      if (!this.sys.isActive() || this.busy || !this.ready) return;
      if (this.onKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const onUpdate = (_t: number, dt: number) => {
      this.t += dt;
      this.animate();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKey);
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    });
    (window.__neon as Record<string, unknown>).arenaPick = this;
    // the thumbnails: one per frame after the scene shows (the Sky Temple may have to paint its art first)
    let i = 0;
    const next = (): void => {
      const c = this.cards[i++];
      if (!c) {
        this.game.events.emit('arena:ready');
        if (window.__neon) window.__neon.ready = true;
        return;
      }
      this.time.delayedCall(40, () => {
        this.drawThumb(c);
        next();
      });
    };
    void fadeFromInk(this).then(() => (this.ready = true));
    if (this.d.dev) this.ready = true;
    next();
  }

  // ---------------------------------------------------------------- build

  private buildCard(id: ArenaId): Card {
    const x = TX[id];
    const frame = this.add.graphics().setDepth(6);
    const wait = pixelText(this, x + TW / 2, TY + TH / 2 - 4, 'PAINTING THE ARENA…', { size: 'sm', color: PAL.steel, originX: 0.5 }).setDepth(9);
    const name = pixelText(this, x, TY + TH + 10, ARENA_INFO[id].name, { size: 'md', color: PAL.white }).setDepth(10);
    const blurb = pixelText(this, x, TY + TH + 26, ARENA_INFO[id].blurb, { size: 'sm', color: PAL.mist, maxWidth: TW }).setDepth(10);
    const badge = pixelText(this, x + TW, TY + TH + 12, 'SELECTED', { size: 'sm', color: PAL.gold4, originX: 1 }).setDepth(10);
    const zone = this.add.zone(x - 4, TY - 4, TW + 8, TH + 50).setOrigin(0).setDepth(12).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.busy || p.rightButtonReleased()) return;
      const now = this.time.now;
      const again = this.sel === id && this.lastTap.id === id && now - this.lastTap.at < 450;
      this.lastTap = { id, at: now };
      if (again) {
        void this.confirm();
        return;
      }
      this.select(id);
    });
    zone.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (!this.busy && this.sel !== id) frame.setAlpha(1);
    });
    return { id, x, frame, rt: null, wait, name, blurb, badge, zone };
  }

  /**
   * The arena's real duel board, built for a moment and drawn at half scale into the card's render texture (the scene's own
   * camera never shows it: it is drawn and destroyed in the same frame).
   */
  private drawThumb(c: Card): void {
    if (!this.sys.isActive()) return;
    const before = new Set(this.children.list);
    let board: BoardView | null = null;
    try {
      board = new BoardView(this, { active: null, lights: true, arena: c.id });
      // what the duel camera would show: visible objects only, in depth order (the display list's own sort)
      type Vis = Phaser.GameObjects.GameObject & { visible?: boolean; alpha?: number; depth?: number };
      const objs = (this.children.list.filter((o) => !before.has(o)) as Vis[])
        .filter((o) => o.visible !== false && (o.alpha ?? 1) > 0)
        .map((o, i) => ({ o, i }))
        .sort((a, b) => (a.o.depth ?? 0) - (b.o.depth ?? 0) || a.i - b.i)
        .map((e) => e.o);
      const rt = this.add.renderTexture(c.x, TY, TW * HIRES, TH * HIRES).setOrigin(0).setScale(1 / HIRES).setDepth(7);
      rt.camera.setZoom(0.5 * HIRES);
      rt.camera.centerOn(VIEW.x, VIEW.y);
      rt.draw(objs);
      c.rt = rt;
      c.wait.setVisible(false);
      const to = c.id === this.sel ? 1 : DIM;
      rt.setAlpha(REDUCED_MOTION ? to : 0);
      if (!REDUCED_MOTION) void tween(this, { targets: rt, alpha: to, duration: 260, ease: 'Quad.Out' });
    } catch (e) {
      console.error('[arena-pick] thumbnail failed', e);
      c.wait.setText(ARENA_INFO[c.id].name);
    } finally {
      board?.destroy();
    }
  }

  // ---------------------------------------------------------------- state

  private select(id: ArenaId): void {
    if (this.sel === id) return;
    this.sel = id;
    sfx.play('uiHover', { volume: 0.55 });
    this.render(true);
  }

  private render(animate: boolean): void {
    for (const c of this.cards) {
      const on = c.id === this.sel;
      c.name.setTint(on ? PAL.gold4 : PAL.mist);
      c.blurb.setTint(on ? PAL.mist : PAL.steel);
      c.badge.setVisible(on);
      if (c.rt) {
        this.tweens.killTweensOf(c.rt);
        c.rt.setAlpha(on ? 1 : DIM);
      }
      if (animate && on && !REDUCED_MOTION) {
        c.name.y = TY + TH + 12;
        void tween(this, { targets: c.name, y: TY + TH + 10, duration: 140, ease: 'Quad.Out' });
      }
    }
    this.drawFrames();
  }

  /** The cards' frames: the chosen one in stepped gold with a light running round it, the other a quiet night line. */
  private drawFrames(): void {
    for (const c of this.cards) {
      const g = c.frame;
      g.clear();
      const on = c.id === this.sel;
      const x0 = c.x - 3;
      const y0 = TY - 3;
      const w = TW + 6;
      const h = TH + 6;
      if (!on) {
        g.fillStyle(PAL.night3, 1).fillRect(x0, y0, w, 1).fillRect(x0, y0 + h - 1, w, 1).fillRect(x0, y0, 1, h).fillRect(x0 + w - 1, y0, 1, h);
        g.fillStyle(PAL.ink, 1).fillRect(x0 + 1, y0 + 1, w - 2, 1).fillRect(x0 + 1, y0 + h - 2, w - 2, 1).fillRect(x0 + 1, y0 + 1, 1, h - 2).fillRect(x0 + w - 2, y0 + 1, 1, h - 2);
        continue;
      }
      g.fillStyle(PAL.gold2, 1).fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
      g.fillStyle(PAL.gold4, 1).fillRect(x0, y0, w, h);
      g.fillStyle(PAL.ink, 1).fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
      // the running light: a 12-px bright segment travelling round the frame
      const per = 2 * (w + h);
      const k = REDUCED_MOTION ? 0 : Math.floor((this.t / 6) % per);
      for (let i = 0; i < 12; i++) {
        const q = (k + i) % per;
        const pt = q < w ? { x: x0 + q, y: y0 } : q < w + h ? { x: x0 + w - 1, y: y0 + q - w } : q < 2 * w + h ? { x: x0 + w - 1 - (q - w - h), y: y0 + h - 1 } : { x: x0, y: y0 + h - 1 - (q - 2 * w - h) };
        g.fillStyle(i > 3 ? PAL.white : PAL.mist, 1).fillRect(pt.x, pt.y, 2, 2);
      }
    }
  }

  private animate(): void {
    if (!REDUCED_MOTION) {
      this.lattice.tilePositionX = Math.floor(this.t / 140);
      this.lattice.tilePositionY = Math.floor(this.t / 280);
    }
    this.drawFrames();
  }

  // ---------------------------------------------------------------- input / flow

  private onKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Tab': {
        const i = ARENA_IDS.indexOf(this.sel);
        this.select(ARENA_IDS[(i + (e.code === 'ArrowLeft' ? -1 : 1) + ARENA_IDS.length) % ARENA_IDS.length]);
        return true;
      }
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (!e.repeat) void this.confirm();
        return true;
      case 'Escape':
      case 'Backspace':
        void this.back();
        return true;
    }
    return false;
  }

  private async confirm(): Promise<void> {
    if (this.busy || !this.ready) return;
    this.busy = true;
    sfx.play('uiConfirm', { volume: 0.75 });
    setArenaChoice(this.sel);
    const launch: DuelLaunch = { ...this.d.launch, arena: this.sel };
    (window.__neon as Record<string, unknown>).arenaLaunch = launch;
    if (this.d.dev) {
      this.busy = false;
      return;
    }
    music.stop(500);
    await fadeToInk(this, 200);
    // the Sky Temple wants the 2× canvas: a page booted at 1× reloads straight into this duel
    if (this.sel === 'sky' && HIRES === 1 && savePendingDuel(launch)) {
      location.reload();
      return;
    }
    this.scene.start('Duel', launch);
  }

  private async back(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    sfx.play('uiBack', { volume: 0.6 });
    if (this.d.dev) {
      this.busy = false;
      return;
    }
    await fadeToInk(this, 160);
    const b = this.d.back ?? { key: 'Title' };
    this.scene.start(b.key, b.data);
  }

  /** QA: state for tools / tests. */
  get qaState(): { sel: ArenaId; thumbs: boolean[] } {
    return { sel: this.sel, thumbs: this.cards.map((c) => !!c.rt) };
  }

  qaKey(code: string): void {
    this.onKey({ code, repeat: false, preventDefault() {} } as unknown as KeyboardEvent);
  }

  qaLayout(): { cards: Record<ArenaId, { x: number; y: number }>; ok: { x: number; y: number } } {
    return { cards: { sky: { x: TX.sky + TW / 2, y: TY + TH / 2 }, neon: { x: TX.neon + TW / 2, y: TY + TH / 2 } }, ok: { x: 470 + 69, y: 331 } };
  }
}

