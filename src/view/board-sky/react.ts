// Sky Temple — the reactive light of the board (the Sky Temple's answer to board-nt/react.ts). The neon lines of the
// sandstone board (src/art/arena-sky/board2.ts) are painted into the static board; this layer lays a soft ADD copy of
// each slot's outline over them (a white mask, tinted and stepped at run time) and drives it:
//
//   active side   the active player's zone lines breathe brighter (their camp is "on"); the other side rests
//   turn sweep    the turn passes: a wave of the new player's light runs across every slot from their edge to the far
//                 one (three flat levels with a white crest), with the arena's air sweep in the stereo field
//   shockwaves    battle damage / a destroyed card: from the impact the slot outlines flash by distance — white, the
//                 colour, a dim step, gone — one lane for a small hit, the whole board (+ an echo) for a big one
//   low-LP alarm  a player at ≤ 1000 LP: their outlines pulse red, slowly (2.4 s), with a heartbeat that thins out
//   field seal    the Field Spell's theme lights its owner's seal (fire / sea / void / gold) and the board's lines warm
//                 or cool a notch with it
// Reduced motion: no sweep travel (one flash), the shock only flashes the impact slot, the alarm holds steady.

import Phaser from 'phaser';
import { PAL, PLAYER_RAMP } from '../../art/palette';
import { PixelCanvas } from '../../art/pixel';
import { SEAL_RAMP, type SealTheme, fieldTheme } from '../../art/arena-nt/floor';
import type { FieldView } from '../../duel/FieldView';
import { sfx } from '../../audio/sfx';
import type { GameEvent, PlayerId } from '../../engine/types';
import { DEPTH, FUSION_ZONE, type BoardSpot, duelistXY, fusionDeckXY, zoneXY } from '../layout';
import { REDUCED_MOTION } from '../v3/motion';
import { LOW_LP, fieldThemeWatcher, readLp } from '../board-nt/duel-watch';
import { K } from '../../art/arena-sky/board2';
import { skyTexture } from './scenery';

type Img = Phaser.GameObjects.Image;
type Shape = 'zone' | 'seal' | 'pile';

/** Over the board (PLATFORM 20) and its veils, under the zone pads' highlights / cards (TILE 30). */
export const SKY_REACT_Z = DEPTH.PLATFORM + 1.2;

const ZONE_R = 16;

/** White ADD masks of a slot outline (+ a soft halo) at K× density; (cx, cy) the centre in the texture (game px). */
function paintOutline(shape: Shape): PixelCanvas {
  const W = 76;
  const H = 42;
  const p = new PixelCanvas(W * K, H * K);
  for (let ay = 0; ay < H * K; ay++)
    for (let ax = 0; ax < W * K; ax++) {
      const x = (ax + 0.5) / K - W / 2;
      const y = (ay + 0.5) / K - H / 2;
      let m: number; // distance inside the outline's bright line (game px, y units): 0 on it, < 0 outside
      if (shape === 'zone') {
        const du = (x + 2 * y) / 2;
        const dv = (2 * y - x) / 2;
        m = (ZONE_R - 0.8 - Math.max(Math.abs(du), Math.abs(dv))) / 2;
      } else if (shape === 'seal') {
        const yy = y + 1.5;
        m = Math.min(7.5 - Math.abs(yy), (27 - 2 * Math.abs(yy) - Math.abs(x)) / 2) - 1;
      } else {
        const yy = y + 1.5;
        m = 11.5 - (Math.abs(x) / 2 + Math.abs(yy)) - 1;
      }
      const d = Math.abs(m);
      let v = 0;
      if (d < 0.45) v = 255;
      else if (m < 0 && d < 3) v = Math.round(110 * (1 - d / 3) ** 2);
      else if (m > 0 && d < 4) v = Math.round(70 * (1 - d / 4) ** 2);
      if (v > 0) p.set(ax, ay, (v << 16) | (v << 8) | v);
    }
  return p;
}

/** The theme of the face-up Field Spell on `p`'s seal ('none' outside a duel). */
function sealThemeOf(scene: Phaser.Scene, p: PlayerId): SealTheme {
  try {
    const f = (scene as unknown as { views?: { field?: FieldView } }).views?.field;
    const e = f?.entry(p, 'field', 0);
    return e && e.tile.faceUp ? fieldTheme(e.cardId) : 'none';
  } catch {
    return 'none';
  }
}

interface Slot {
  player: PlayerId;
  spot: BoardSpot | 'fusion';
  index: number;
  x: number;
  y: number;
  img: Img;
  /** distance (game px, along the duel axis) from player 0's edge, 0 … 1 */
  axis: number;
  shown: number;
}

interface Wave {
  x: number;
  y: number;
  t0: number;
  reach: number;
  strength: number;
  color: number;
}

const SHOCK_SPEED = 0.42; // px / ms
const SWEEP_MS = 620;

export class SkyReact {
  private readonly scene: Phaser.Scene;
  private readonly slots: Slot[] = [];
  private readonly waves: Wave[] = [];
  private readonly field: ReturnType<typeof fieldThemeWatcher>;
  private active: PlayerId | null = null;
  private sweep: { p: PlayerId; t0: number } | null = null;
  private lights = true;
  private now = 0;
  private lastBattle: { at: number; x: number; y: number; defender: PlayerId } | null = null;
  private beats: [number, number] = [0, 0];
  private nextBeat: [number, number] = [0, 0];
  private wasLow: [boolean, boolean] = [false, false];
  private lastLp: [number | null, number | null] = [null, null];
  private scale: number;
  private sealAt = 0;
  private readonly seal: [readonly number[] | null, readonly number[] | null] = [null, null];

  constructor(scene: Phaser.Scene, objs: Phaser.GameObjects.GameObject[]) {
    this.scene = scene;
    this.field = fieldThemeWatcher(scene);
    const tex: Record<Shape, string> = {
      zone: skyTexture(scene, 'sky2:ol:zone', () => paintOutline('zone')),
      seal: skyTexture(scene, 'sky2:ol:seal', () => paintOutline('seal')),
      pile: skyTexture(scene, 'sky2:ol:pile', () => paintOutline('pile')),
    };
    this.scale = scene.textures.get(tex.zone).getSourceImage().width >= 76 * K ? 1 / K : 1;
    const add = (player: PlayerId, spot: BoardSpot | 'fusion', index: number, shape: Shape): void => {
      const c = spot === 'fusion' ? fusionDeckXY(player) : zoneXY(player, spot, index);
      const img = scene.add.image(c.x, c.y, tex[shape]).setScale(this.scale).setDepth(SKY_REACT_Z).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      objs.push(img);
      // the duel axis v (layout.ts arena v4): −106 at P2's edge … +106 at P1's; axis 0 … 1
      const v = (2 * (c.y - 160) - (c.x - 320)) / 2;
      const axis = Math.max(0, Math.min(1, (v + 110) / 220));
      this.slots.push({ player, spot, index, x: c.x, y: c.y, img, axis, shown: -1 });
    };
    for (const p of [0, 1] as PlayerId[]) {
      for (let i = 0; i < 5; i++) {
        add(p, 'monster', i, 'zone');
        add(p, 'spellTrap', i, 'zone');
      }
      add(p, 'field', 0, 'seal');
      add(p, 'graveyard', 0, 'pile');
      add(p, 'deck', 0, 'pile');
      if (FUSION_ZONE) add(p, 'fusion', 0, 'pile');
    }
  }

  setLights(on: boolean): void {
    this.lights = on;
  }

  setActivePlayer(p: PlayerId | null, animate: boolean): void {
    const changed = p !== this.active;
    this.active = p;
    if (changed && animate && p !== null && this.lights) {
      this.sweep = { p, t0: this.now + 90 };
      try {
        sfx.play(p === 0 ? 'arenaSweepP1' : 'arenaSweepP2', { volume: 0.5 });
      } catch {
        /* audio never breaks the arena */
      }
    }
  }

  /** Flash every slot of a side (pulseSide). */
  pulse(p: PlayerId): Promise<void> {
    const t0 = this.now;
    for (const s of this.slots) if (s.player === p) this.waves.push({ x: s.x, y: s.y, t0, reach: 1, strength: 0.7, color: PLAYER_RAMP[p][3] });
    return new Promise((r) => this.scene.time.delayedCall(420, r));
  }

  shock(x: number, y: number, amount: number, color: number): void {
    if (!this.lights) return;
    const big = amount >= 1500;
    const reach = REDUCED_MOTION ? 1 : amount >= 1500 ? 330 : amount >= 600 ? 160 : 80;
    const strength = amount >= 1500 ? 1 : amount >= 600 ? 0.85 : 0.7;
    for (const w of this.waves)
      if (this.now - w.t0 < 300 && Math.abs(w.x - x) + Math.abs(w.y - y) < 12) {
        w.reach = Math.max(w.reach, reach);
        w.strength = Math.max(w.strength, strength);
        return;
      }
    if (this.waves.length >= 24) this.waves.splice(0, this.waves.length - 23);
    this.waves.push({ x, y, t0: this.now, reach, strength, color });
    if (big && !REDUCED_MOTION) this.waves.push({ x, y, t0: this.now + 260, reach: reach * 0.75, strength: 0.55, color });
    try {
      sfx.play(big ? 'arenaShockL' : 'arenaShockS', { volume: big ? 0.6 : 0.45, pan: Math.max(-0.6, Math.min(0.6, (x - 320) / 320)) });
    } catch {
      /* audio never breaks the arena */
    }
  }

  onGameEvent(ev: GameEvent): void {
    if (ev.type === 'battle') {
      const defender = (1 - ev.player) as PlayerId;
      const c = ev.targetZone === null ? duelistXY(defender) : zoneXY(defender, 'monster', ev.targetZone);
      this.lastBattle = { at: this.now, x: c.x, y: c.y, defender };
    } else if (ev.type === 'damage') {
      const b = ev.source === 'battle' && this.lastBattle && this.now - this.lastBattle.at < 6000 && this.lastBattle.defender === ev.player ? this.lastBattle : null;
      const c = b ?? duelistXY(ev.player);
      this.shock(c.x, c.y, ev.amount, PLAYER_RAMP[ev.player][3]);
    } else if (ev.type === 'destroy') {
      const c = zoneXY(ev.player, ev.location, ev.zone);
      this.shock(c.x, c.y, ev.location === 'monster' ? 900 : 400, PLAYER_RAMP[ev.player][3]);
    }
  }

  tick(t: number): void {
    this.now = t;
    if (this.lights) this.field.current(t);
    if (t >= this.sealAt) {
      this.sealAt = t + 150;
      for (const p of [0, 1] as PlayerId[]) {
        const th = sealThemeOf(this.scene, p);
        this.seal[p] = th === 'none' ? null : SEAL_RAMP[th];
      }
    }
    // low LP (polled from the HUD)
    const low: [boolean, boolean] = [false, false];
    for (const p of [0, 1] as PlayerId[]) {
      const lp = readLp(this.scene, p);
      low[p] = lp !== null && lp > 0 && lp <= LOW_LP;
      if (low[p] && (!this.wasLow[p] || (this.lastLp[p] !== null && lp !== null && lp < (this.lastLp[p] as number)))) {
        this.beats[p] = 0;
        this.nextBeat[p] = t;
      }
      this.wasLow[p] = low[p];
      this.lastLp[p] = lp;
      if (low[p] && this.lights && t >= this.nextBeat[p]) {
        const n = this.beats[p]++;
        this.nextBeat[p] = t + 2400;
        const every = n < 4 ? 1 : n < 10 ? 2 : 4;
        if (n % every === 0 && !REDUCED_MOTION)
          try {
            sfx.play('arenaHeart', { volume: Math.max(0.16, 0.5 * Math.pow(0.93, n)), pan: p === 0 ? -0.25 : 0.25 });
          } catch {
            /* ignore */
          }
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) if (t - this.waves[i].t0 > this.waves[i].reach / SHOCK_SPEED + 500) this.waves.splice(i, 1);
    if (this.sweep && t - this.sweep.t0 > SWEEP_MS + 500) this.sweep = null;
    const breath = REDUCED_MOTION ? 0 : Math.sin(t / 700);
    const alarm = REDUCED_MOTION ? 0.5 : 0.5 + 0.5 * Math.sin((t / 2400) * Math.PI * 2);
    for (const s of this.slots) {
      let a = 0;
      let col: number = PLAYER_RAMP[s.player][3];
      if (this.lights) {
        // the active camp breathes
        if (this.active === s.player) a = 0.3 + 0.08 * breath;
        // the field spell's seal
        const sealRamp = s.spot === 'field' ? this.seal[s.player] : null;
        if (sealRamp) {
          a = Math.max(a, 0.75 + 0.2 * breath);
          col = sealRamp[Math.floor(t / 520) % 3 === 0 ? 4 : 3];
        }
        // low LP: the camp pulses red
        if (low[s.player]) {
          const v = 0.25 + 0.45 * alarm;
          if (v > a) {
            a = v;
            col = PAL.crim3;
          }
        }
        // the turn sweep: a crest of the new player's light from their edge
        if (this.sweep) {
          const from = this.sweep.p === 0 ? 1 - s.axis : s.axis; // 0 at the new player's edge
          const k = REDUCED_MOTION ? (t - this.sweep.t0) / 300 : (t - this.sweep.t0 - from * SWEEP_MS) / 260;
          if (k >= 0 && k < 1) {
            const lv = k < 0.2 ? 1 : k < 0.5 ? 0.7 : 0.35;
            if (lv > a) {
              a = lv;
              col = k < 0.2 ? PAL.white : PLAYER_RAMP[this.sweep.p][k < 0.5 ? 4 : 3];
            }
          }
        }
        // shockwaves
        for (const w of this.waves) {
          const d = Math.hypot(s.x - w.x, (s.y - w.y) * 2);
          if (d > w.reach + 16) continue;
          const peak = Math.max(1, Math.ceil(w.strength * (1 - Math.max(0, d - 16) / Math.max(1, w.reach)) * 3));
          const e = t - w.t0 - d / SHOCK_SPEED;
          const st = e < 0 ? 0 : e < 70 ? 3 : e < 160 ? 2 : e < 280 ? 1 : 0;
          const lv = Math.min(peak, st);
          const v = [0, 0.4, 0.75, 1][lv];
          if (v > a) {
            a = v;
            col = lv >= 3 ? PAL.white : w.color;
          }
        }
      }
      // stepped alpha (flat notches, not a smooth fade)
      const q = Math.round(a * 12) / 12;
      const key = Math.round(q * 100) * 0x1000000 + col;
      if (key === s.shown) continue;
      s.shown = key;
      if (q <= 0) s.img.setVisible(false);
      else s.img.setTint(col).setAlpha(q).setVisible(true);
    }
  }
}
