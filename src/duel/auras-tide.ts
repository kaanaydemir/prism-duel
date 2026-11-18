// Gelgit Körfezi's lasting mark on a blessed WATER / WIND monster (FieldView.sync, the tidal_bay scene and flow/stats.ts set it as
// the unit's 'tide' aura):
//
//   ripples   rings of water spread out from its feet over the flooded floor, two at a time, out of phase (every 1.1 s)
//   bubbles   now and then a bubble rises beside the body, wobbles and pops (WIND: a little white air curl instead)
//   drips     a bright droplet runs off its top edge and falls to the floor, splashing
// The FIRE monster doused by the bay keeps the volcano's steam aura (auras.steamAura), so both fields read the same way.
// Flat palette tones, whole pixels, the sprite's current frame (spellfx.silhouetteOf); destroy() lets the rings finish and fades.

import type Phaser from 'phaser';
import { PAL } from '../art/palette';
import type { Color } from '../art/pixel';
import { silhouetteOf } from '../cinematics/_v3/spellfx';
import type { LightHandle } from '../view/light';
import { REDUCED_MOTION } from '../view/v3/motion';
import { Raster, onFrame } from '../vfx/setpieces';
import type { Disposable } from './types';
import type { MonsterUnit } from './MonsterUnit';

const RING_MS = 1100;
const RING_W = 70;
const RING_H = 34;

/**
 * `still`: only the foam ring round its feet (any monster standing in the flooded arena: the water parts round it, like a rock);
 * `water` / `wind`: the blessed ones — the foam ring, spreading ripples, bubbles / air curls and drips.
 */
export function tideAura(scene: Phaser.Scene, unit: MonsterUnit, kind: 'water' | 'wind' | 'still'): Disposable {
  const s = unit.sprite;
  const floor = new Raster(scene, 0, 0, RING_W, RING_H, s.depth - 0.7);
  const W = Math.max(40, Math.round(s.width) + 30);
  const H = Math.max(60, Math.round(s.height) + 30);
  const air = new Raster(scene, 0, 0, W, H, s.depth + 0.5);
  const tones: readonly Color[] = kind !== 'wind' ? [PAL.cyan4, PAL.teal4, PAL.teal3, PAL.teal2] : [PAL.white, PAL.teal4, PAL.leaf3, PAL.leaf2];
  let light: LightHandle | null = null;
  const bubbles: { x: number; y: number; born: number; life: number; sway: number }[] = [];
  const drips: { x: number; y: number; vy: number; floor: number; born: number; landed: number }[] = [];
  let nextBubble = 400;
  let nextDrip = 900;
  let dying = -1;
  let coolAsked = false;
  let killed = false;
  let rnd = (unit.uid * 2654435761) >>> 0;
  const rand = (): number => {
    rnd = (rnd + 0x6d2b79f5) | 0;
    let t = Math.imul(rnd ^ (rnd >>> 15), 1 | rnd);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let stop: () => void = () => undefined;
  const kill = (): void => {
    if (killed) return;
    killed = true;
    stop();
    floor.destroy();
    air.destroy();
    const l = light;
    light = null;
    if (l && l.alive) void l.fadeOut(260);
  };
  stop = onFrame(scene, (dt, el) => {
    if (!s.active || unit.retired) {
      kill();
      return false;
    }
    if (coolAsked && dying < 0) dying = el;
    const fade = dying < 0 ? 1 : Math.max(0, 1 - (el - dying) / 600);
    if (fade <= 0) {
      kill();
      return false;
    }
    const shown = s.visible && s.alpha > 0.3;
    const h = unit.home;
    const cx = Math.round(h.x);
    const cy = Math.round(h.y);
    floor.img.setDepth(s.depth - 0.7);
    air.img.setDepth(s.depth + 0.5);
    floor.moveTo(cx - RING_W / 2, cy - RING_H / 2);
    floor.begin();
    air.begin();
    // (no light pool: the stepped light layer would dither a checker into the empty zones round it; the tide layer lights the floor)
    if (shown) {
      // ---- the foam ring: the water parting round its feet (a broken white ellipse over a light one, its gaps turning slowly)
      const silF = silhouetteOf(s);
      const frx = Math.max(9, Math.min(26, silF ? Math.round((silF.right - silF.left) / 2) + 3 : 12));
      const fry = Math.max(4, Math.round(frx * 0.42));
      const pulse = Math.round(Math.sin(el / 420) * 0.6);
      const nF = Math.round(frx * 6);
      for (let a = 0; a < nF; a++) {
        const th = (a / nF) * Math.PI * 2;
        const gap = Math.sin(th * 3 + el / 900) > 0.72;
        const x = Math.round(cx + Math.cos(th) * (frx + pulse));
        const y = Math.round(cy + Math.sin(th) * (fry + pulse * 0.5));
        floor.px(x, y + 1, PAL.cyan4);
        if (!gap) floor.px(x, y, PAL.white);
      }
      // ---- ripples (the blessed only): two rings out of phase, each a dotted iso ellipse that thins as it spreads
      for (let k = 0; k < (kind === 'still' ? 0 : 2); k++) {
        const ph = ((el + k * (RING_MS / 2)) % RING_MS) / RING_MS;
        if (dying >= 0 && el - dying > ph * RING_MS) continue;
        const rx = frx + 2 + ph * 20;
        const ry = rx / 2;
        const tone = tones[Math.min(tones.length - 1, Math.floor(ph * tones.length))];
        const n = Math.round(rx * 4.5);
        for (let a = 0; a < n; a++) {
          if (ph > 0.55 && a % 2) continue;
          if (ph > 0.8 && a % 3) continue;
          const th = (a / n) * Math.PI * 2;
          floor.px(Math.round(cx + Math.cos(th) * rx), Math.round(cy + Math.sin(th) * ry), tone);
        }
      }
      const sil = kind === 'still' ? null : silF;
      if (sil) {
        air.moveTo(cx - W / 2, sil.top - 16);
        // ---- bubbles (WIND: air curls) rising beside the body
        if (!REDUCED_MOTION && dying < 0 && el >= nextBubble) {
          nextBubble = el + 360 + rand() * 520;
          const left = rand() < 0.5;
          const y0 = sil.bottom - 2 - rand() * (sil.bottom - sil.top) * 0.5;
          const x0 = left ? sil.left - 1 - rand() * 3 : sil.right + rand() * 3;
          bubbles.push({ x: x0, y: y0, born: el, life: 700 + rand() * 500, sway: rand() * 6 });
        }
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          const k = (el - b.born) / b.life;
          if (k >= 1) {
            bubbles.splice(i, 1);
            continue;
          }
          const x = Math.round(b.x + Math.sin(k * 7 + b.sway) * 1.5);
          const y = Math.round(b.y - k * 22);
          if (kind === 'water') {
            if (k < 0.85) {
              const r = k < 0.3 ? 0 : 1;
              if (r === 0) air.px(x, y, PAL.cyan4);
              else {
                air.px(x - 1, y, tones[1]);
                air.px(x + 1, y, tones[1]);
                air.px(x, y - 1, tones[1]);
                air.px(x, y + 1, tones[2]);
                air.px(x - 1, y - 1, PAL.white);
              }
            } else for (const [dx, dy] of [[-2, 0], [2, 0], [0, -1]] as const) air.px(x + dx, y + dy, PAL.teal4);
          } else {
            // an air curl: a short arc that turns as it rises
            const th0 = k * 6 + b.sway;
            for (let j = 0; j < 4; j++) air.px(Math.round(x + Math.cos(th0 + j * 0.6) * 2), Math.round(y + Math.sin(th0 + j * 0.6)), j === 0 ? PAL.white : tones[1]);
          }
        }
        // ---- drips running off the top and falling to the floor
        if (!REDUCED_MOTION && dying < 0 && kind === 'water' && el >= nextDrip) {
          nextDrip = el + 700 + rand() * 900;
          const x = Math.round(sil.left + 3 + rand() * Math.max(1, sil.right - sil.left - 6));
          const top = sil.topAt(x);
          if (top !== null) drips.push({ x, y: top + 3, vy: 0, floor: cy + Math.round((rand() - 0.5) * 6), born: el, landed: -1 });
        }
        for (let i = drips.length - 1; i >= 0; i--) {
          const d = drips[i];
          if (d.landed < 0) {
            d.vy += 240 * (Math.min(50, dt) / 1000);
            d.y += d.vy * (Math.min(50, dt) / 1000);
            if (d.y >= d.floor) {
              d.y = d.floor;
              d.landed = el;
            }
            // hidden while it runs down over the body
            if (!sil.has(d.x, Math.round(d.y))) {
              air.px(d.x, Math.round(d.y), PAL.white);
              air.px(d.x, Math.round(d.y) - 1, PAL.cyan4);
            }
          } else {
            const k = (el - d.landed) / 260;
            if (k >= 1) {
              drips.splice(i, 1);
              continue;
            }
            const r = 1 + Math.round(k * 3);
            floor.px(d.x - r, d.y, tones[1]);
            floor.px(d.x + r, d.y, tones[1]);
            if (k < 0.4) floor.px(d.x, d.y - 1, PAL.white);
          }
        }
      }
    }
    floor.img.setAlpha(fade);
    air.img.setAlpha(fade);
    floor.end();
    air.end();
    return true;
  });
  return {
    destroy() {
      coolAsked = true;
    },
  };
}
