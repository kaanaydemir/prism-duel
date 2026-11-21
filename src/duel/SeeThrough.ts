// See-through (owner-approved with "tap by tile", shots/arena-analysis/layout/board-1.png): while a
// zone that other monsters' bodies cover is hovered, selected or inspected, every monster whose
// opaque pixels lie over that zone's cell fades to GHOST_ALPHA, and comes back when the focus ends.
//
// The fade is the sprite's own alpha, so everything that already follows it fades with it: the
// floor shadow, the cast silhouette, the water reflection and the light layer's pool (its rim
// light hides below alpha 0.99). The stat badge is NOT faded: it lies on the monster's own tile,
// in front of the covered cell, and its numbers must stay readable.
//
// Never stuck transparent: HumanInput clears it on every exit (action, cancel, turn change,
// curtain, pause); a per-frame guard also clears it the moment a cinematic is busy, drops a unit
// whose alpha someone else changed (FieldView.sync's settle, a cinematic), and the scene's
// shutdown clears it.

import Phaser from 'phaser';
import type { MonsterUnit } from './MonsterUnit';
import type { DuelViews } from './types';
import { FUSION_ZONE, fusionDeckXY, zoneXY } from '../view/layout';
import type { BoardPick } from './pickRule';

const GHOST_ALPHA = 0.35;
const FADE_MS = 120;
/** Sample step (px) over a cell when testing which bodies cover it, and the hits that count as covering. */
const STEP = 2;
const MIN_HITS = 3;

/** True when a sprite's FULL-frame pixel under the world point is opaque (the same test HumanInput.pick makes). */
export function bodyOpaqueAt(scene: Phaser.Scene, s: Phaser.GameObjects.Sprite, x: number, y: number): boolean {
  const b = s.getBounds();
  if (!b.contains(x, y)) return false;
  const fx = Math.floor((s.flipX ? b.right - x : x - b.left) / Math.abs(s.scaleX));
  const fy = Math.floor((y - b.top) / Math.abs(s.scaleY));
  return (scene.textures.getPixelAlpha(fx, fy, s.texture.key, s.frame.name) ?? 0) > 0;
}

const running = (t: Phaser.Tweens.Tween | null): boolean => !!t && !t.isDestroyed() && !t.isFinished() && !t.isPendingRemove() && !t.isRemoved();

interface Ghost {
  /** The alpha it had before it faded (restored to it). */
  base: number;
  tween: Phaser.Tweens.Tween | null;
  /** 'out' = fading / faded, 'in' = coming back. */
  dir: 'out' | 'in';
}

export class SeeThrough {
  private readonly ghosts = new Map<MonsterUnit, Ghost>();
  private focusKey = '';
  /** Keeps it cleared while this returns true (a cinematic plays / input is off). */
  blocked: () => boolean = () => false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly views: Pick<DuelViews, 'board' | 'field'>,
  ) {
    const guard = () => this.guard();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, guard);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, guard);
      this.clear(true);
    });
  }

  /** The zones in focus now (hovered / selected / inspected). Fades exactly their covering monsters. */
  set(focus: BoardPick[]): void {
    if (this.blocked()) return this.clear(true);
    const key = focus.map((z) => `${z.player}:${z.spot}:${z.index}`).join('|');
    if (key === this.focusKey) return;
    this.focusKey = key;
    const want = new Set<MonsterUnit>();
    for (const z of focus) for (const u of this.covering(z)) want.add(u);
    for (const u of [...this.ghosts.keys()]) if (!want.has(u)) this.fadeIn(u);
    for (const u of want) this.fadeOut(u);
  }

  /** Everything back to full: a short tween, or at once (`now`: before a cinematic / on shutdown). */
  clear(now = false): void {
    this.focusKey = '';
    for (const u of [...this.ghosts.keys()]) {
      if (now) this.restoreNow(u);
      else this.fadeIn(u);
    }
  }

  /** QA: the units faded right now. */
  faded(): MonsterUnit[] {
    return [...this.ghosts].filter(([, g]) => g.dir === 'out').map(([u]) => u);
  }

  // ---------------------------------------------------------------- internals

  /** The monsters whose opaque body pixels lie over zone `z`'s cell, in front of what lies there. */
  private covering(z: BoardPick): MonsterUnit[] {
    const field = this.views.field;
    const own = z.spot === 'monster' ? field.unitAt(z.player, z.index) : null;
    const fusion = FUSION_ZONE && z.spot === 'banish';
    const c = fusion ? fusionDeckXY(z.player) : zoneXY(z.player, z.spot, z.index);
    const inCell = fusion
      ? (x: number, y: number) => Math.abs(x - c.x) / 2 + Math.abs(y - (c.y - 2)) <= 13
      : (x: number, y: number) => {
          const h = this.views.board.zoneAt(x, y);
          return !!h && h.player === z.player && h.spot === z.spot && h.index === z.index;
        };
    const pts: [number, number][] = [];
    for (let y = Math.round(c.y) - 24; y <= c.y + 24; y += STEP)
      for (let x = Math.round(c.x) - 34; x <= c.x + 34; x += STEP) if (inCell(x + 0.5, y + 0.5)) pts.push([x + 0.5, y + 0.5]);
    const out: MonsterUnit[] = [];
    for (const u of field.units()) {
      const s = u.sprite;
      if (u === own || u.retired || !s.active || !s.visible) continue;
      if (own && s.depth <= own.sprite.depth) continue;
      const b = s.getBounds();
      let n = 0;
      for (const [x, y] of pts) {
        if (!b.contains(x, y) || !bodyOpaqueAt(this.scene, s, x, y)) continue;
        if (++n >= MIN_HITS) break;
      }
      if (n >= MIN_HITS) out.push(u);
    }
    return out;
  }

  private fadeOut(u: MonsterUnit): void {
    const s = u.sprite;
    let g = this.ghosts.get(u);
    if (g && g.dir === 'out' && (running(g.tween) || Math.abs(s.alpha - GHOST_ALPHA * g.base) <= 0.01)) return;
    if (!g) {
      g = { base: s.alpha, tween: null, dir: 'out' };
      this.ghosts.set(u, g);
    }
    g.tween?.remove();
    g.dir = 'out';
    g.tween = this.scene.tweens.add({ targets: s, alpha: GHOST_ALPHA * g.base, duration: FADE_MS, ease: 'Sine.easeOut', onComplete: () => g && (g.tween = null) });
  }

  private fadeIn(u: MonsterUnit): void {
    const g = this.ghosts.get(u);
    if (!g || g.dir === 'in') return;
    g.tween?.remove();
    g.dir = 'in';
    g.tween = this.scene.tweens.add({
      targets: u.sprite,
      alpha: g.base,
      duration: FADE_MS,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.ghosts.get(u) === g) this.ghosts.delete(u);
      },
    });
  }

  private restoreNow(u: MonsterUnit): void {
    const g = this.ghosts.get(u);
    if (!g) return;
    this.ghosts.delete(u);
    g.tween?.remove();
    if (u.sprite.active) u.sprite.setAlpha(g.base);
  }

  private guard(): void {
    if (!this.ghosts.size) return;
    if (this.blocked()) return this.clear(true);
    for (const [u, g] of [...this.ghosts]) {
      const s = u.sprite;
      // gone, or someone else took the alpha (settle killed our tween, a cinematic set it): let go
      if (u.retired || !s.active) this.ghosts.delete(u);
      else if (!running(g.tween) && Math.abs(s.alpha - (g.dir === 'out' ? GHOST_ALPHA * g.base : g.base)) > 0.01) this.ghosts.delete(u);
      else if (!running(g.tween) && g.dir === 'in') this.ghosts.delete(u);
    }
  }
}
