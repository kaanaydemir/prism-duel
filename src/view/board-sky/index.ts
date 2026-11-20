// BoardViewSky — the SKY TEMPLE arena on the real duel board: a sunlit sandstone temple floating above a sea of clouds
// at sunset (src/art/arena-sky; concept: mobile/store/arena-concept-v1.png). Same public surface as BoardViewNt
// (board-nt/api.ts), so src/view/BoardView.ts holds either behind ArenaViewApi.
//
//   floor engine   BoardViewCalm (zoneAt, tile images, hover / selection highlights, flashes) with all of its own art
//                  skipped — exactly how the Neon Tower uses it, so hit-testing and highlights match the v4 grid
//   shaped hl      the Field seal / deck / graveyard pads highlight in their own outline (board-nt/zone-hl.ts); the Sky
//                  Temple's pads are painted in those exact outlines
//   scenery        sky, cloud banks, islands, pillars, prism, crystals, the board (scenery.ts) — all living
//   react          the board's lines answer the duel: active camp, turn sweep, shockwaves, low LP, field seal (react.ts)
//   field spells   Volcano: the lava network tears open across the temple floor (the Neon Tower's volcano layer, kept to
//                  the board top) under an ember-red sky; Tidal Bay: the sea floods the board (the tide layer, kept to
//                  the top) under cool sea light. Their timings are the same as on the Neon Tower, so the cinematics that
//                  wait for the lava / water to reach a zone (volcano_arena, tidal_bay) line up on both arenas.
//   intro          lights off = dusk (a violet veil); setLights(true) — the evening sun comes back out
//   ambience       the wind high above the clouds, far chimes, birds (src/audio/sky-ambience.ts)

import Phaser from 'phaser';
import type { ArenaTheme, ZoneHit } from '../../art/arena';
import type { GameEvent, PlayerId } from '../../engine/types';
import type { BoardSpot } from '../layout';
import { BoardViewCalm, type BoardViewCalmOptions } from '../board-calm/BoardViewCalm';
import type { ArenaViewApi, CrowdReaction } from '../board-nt/api';
import { NT_SKIP } from '../board-nt';
import { makeCtx } from '../board-nt/layer';
import { createVolcanoLayer, type VolcanoLayer } from '../board-nt/volcano';
import { createTideLayer, type TideLayer } from '../board-nt/tide';
import { ShapedHighlights, shapedZone } from '../board-nt/zone-hl';
import { SkyScenery } from './scenery';
import { SkyReact } from './react';
import { skyAmbience } from '../../audio/sky-ambience';

type Img = Phaser.GameObjects.Image;

/** Multiply tints of the field spells over sky + board (palette-free light colours: they only darken toward a hue). */
const THEME_TINT: Record<'volcano' | 'tide', number> = { volcano: 0xffb08a, tide: 0xb8d8ff };

export class BoardViewSky implements ArenaViewApi {
  readonly scene: Phaser.Scene;
  private readonly calm: BoardViewCalm;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly scenery: SkyScenery;
  private readonly react: SkyReact;
  private readonly shaped: ShapedHighlights;
  private readonly volcano: VolcanoLayer;
  private readonly tideLayer: TideLayer;
  private destroyed = false;
  private unobserve: (() => void) | null = null;
  private t = 0;

  constructor(scene: Phaser.Scene, opts: BoardViewCalmOptions = {}) {
    this.scene = scene;
    this.scenery = new SkyScenery(scene);
    this.calm = new BoardViewCalm(scene, { ...opts, theme: 'normal', skip: { ...NT_SKIP, lava: true, ...opts.skip } });
    this.shaped = new ShapedHighlights(scene);
    const ctx = makeCtx(scene, this.objs);
    this.volcano = createVolcanoLayer(ctx);
    this.tideLayer = createTideLayer(ctx);
    this.react = new SkyReact(scene, this.objs);
    if (opts.theme === 'volcano') {
      void this.calm.setTheme('volcano', false, opts.volcanoFrom ?? null);
      void this.volcano.setTheme('volcano', false, opts.volcanoFrom ?? null);
      this.tint('volcano', true, 0);
    }
    if (opts.lights === false) void this.setLights(false, false);
    void import('../../cinematics/_core/registry')
      .then((r) => {
        if (this.destroyed) return;
        this.unobserve = r.registerObserver((ev) => this.onGameEvent(ev));
      })
      .catch((e) => console.error('[arena-sky] observer failed', e));
    skyAmbience.start();
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  // ================================================================ ArenaViewApi

  get theme(): ArenaTheme {
    return this.calm.theme;
  }

  get activePlayer(): PlayerId | null {
    return this.calm.activePlayer;
  }

  zoneAt(x: number, y: number): ZoneHit | null {
    return this.calm.zoneAt(x, y);
  }

  tileImage(player: PlayerId, spot: BoardSpot, index = 0): Img | null {
    return this.calm.tileImage(player, spot, index);
  }

  highlightZone(player: PlayerId, spot: BoardSpot, index: number, color: number | null): void {
    if (shapedZone(spot)) return this.shaped.set(player, spot, index, color);
    this.calm.highlightZone(player, spot, index, color);
  }

  clearHighlights(): void {
    this.shaped.clear();
    this.calm.clearHighlights();
  }

  flashTile(player: PlayerId, spot: BoardSpot, index: number, color: number, ms?: number): Promise<void> {
    return this.calm.flashTile(player, spot, index, color, ms);
  }

  pulseSide(player: PlayerId): Promise<void> {
    return Promise.all([this.calm.pulseSide(player), this.react.pulse(player)]).then(() => undefined);
  }

  setActivePlayer(player: PlayerId | null, animate = true): void {
    this.calm.setActivePlayer(player, animate);
    this.react.setActivePlayer(player, animate);
  }

  async setTheme(theme: ArenaTheme, animate = true, from: PlayerId | null = null): Promise<void> {
    this.tint('volcano', theme === 'volcano', animate ? 900 : 0);
    await Promise.all([this.calm.setTheme(theme, animate, from), this.volcano.setTheme(theme, animate, from)]);
  }

  get tide(): boolean {
    return this.tideLayer.on;
  }

  setTide(on: boolean, animate = true, from: PlayerId | null = null): Promise<void> {
    this.tint('tide', on, animate ? 1000 : 0);
    return this.tideLayer.setTide(on, animate, from);
  }

  async setLights(on: boolean, animate = true): Promise<void> {
    this.react.setLights(on);
    await Promise.all([this.calm.setLights(on, animate), this.scenery.setDusk(!on, animate ? 1100 : 0), this.volcano.setLights?.(on, animate), this.tideLayer.setLights?.(on, animate)]);
  }

  setTurn(turn: number | null): void {
    this.calm.setTurn(turn);
  }

  /** No crowd above the clouds: a big reaction stirs the birds and the wind instead (the ambience swells). */
  crowd(kind: CrowdReaction, _side: PlayerId | null = null, power = 1): void {
    if (kind === 'cheer' || kind === 'roar') skyAmbience.gust(Math.min(1, 0.4 + power * 0.3));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unobserve?.();
    this.unobserve = null;
    skyAmbience.stop(500);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.shaped.destroy();
    this.volcano.destroy();
    this.tideLayer.destroy();
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.scenery.destroy();
    this.calm.destroy();
  }

  // ================================================================ internals

  /** The field spells' light over the whole arena: a multiply tint that rolls in / out. */
  private tinted: 'volcano' | 'tide' | null = null;
  private tint(kind: 'volcano' | 'tide', on: boolean, ms: number): void {
    const r = this.scenery.tint;
    if (!on && this.tinted !== kind) return;
    this.tinted = on ? kind : null;
    this.scene.tweens.killTweensOf(r);
    if (on) r.setFillStyle(THEME_TINT[kind]);
    const to = on ? 1 : 0;
    if (ms <= 0) {
      r.setVisible(on).setAlpha(to);
      return;
    }
    r.setVisible(true);
    this.scene.tweens.add({ targets: r, alpha: to, duration: ms, ease: 'Sine.InOut', onComplete: () => r.setVisible(on) });
  }

  private onGameEvent(ev: GameEvent): void {
    if (this.destroyed) return;
    this.react.onGameEvent(ev);
    this.volcano.onGameEvent?.(ev);
    this.tideLayer.onGameEvent?.(ev);
  }

  private tick(_time: number, delta: number): void {
    if (this.destroyed) return;
    const dt = Math.min(50, delta) * this.scene.time.timeScale;
    this.t += dt;
    this.shaped.tick(dt);
    this.scenery.tick(this.t);
    this.react.tick(this.t);
    this.volcano.tick?.(dt, this.t);
    this.tideLayer.tick?.(dt, this.t);
    if (this.t >= this.nextAudio) {
      this.nextAudio = this.t + 500;
      skyAmbience.setTheme(this.calm.theme === 'volcano' ? 'fire' : this.tideLayer.on ? 'water' : 'none');
      skyAmbience.update();
    }
  }
  private nextAudio = 0;
}
