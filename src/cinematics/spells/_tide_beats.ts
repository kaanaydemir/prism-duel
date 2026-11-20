// Gelgit Körfezi — the two monster beats of the flooded arena (spells/tidal_bay.ts, flow/stats.ts):
//
// GELGİT KUTSAMASI (a WATER / WIND monster, +400) ~950 ms
//   0     a splash ring opens at its feet, the water there wells up
//   80    TWO ribbons of water spiral up round the body (a double helix: the half in front of the body bright, the half behind it
//         deep teal; they climb in 260 ms, keep turning, then unwind upward past its head)
//   300   the body takes the water's light: one cyan-white frame, a half-dithered teal one, then a shining outline that drains down
//   520   the ribbons burst into droplets at the top: arcs that fall back and splash in rings on the floor
//   (WIND: the ribbons are air — white and leaf tones — and the drops are motes)
//
// SÖNDÜRME (a FIRE monster, −400) ~850 ms
//   0     a curling wave rises at its left (the light's side), its crest white and tearing
//   140   it breaks over the body left to right; the body flashes deep blue under it
//   300   a burst of steam boils up off it (white → mist → steel, rising and spreading), spray falls, water drips off it
// Flat palette tones, whole pixels; the rasters follow the unit's home and depth. Reduced motion: one flash and the numbers only.

import type Phaser from 'phaser';
import { PAL } from '../../art/palette';
import type { Color } from '../../art/pixel';
import type { MonsterUnit } from '../../duel/MonsterUnit';
import { lightFlash } from '../../view/light';
import { REDUCED_MOTION } from '../../view/v3/motion';
import { Raster, onFrame } from '../../vfx/setpieces';
import { silhouetteOf } from '../_v3/spellfx';
import { panAt, play as playV3 } from '../_v3/sound';

export const TIDE_BLESS_MS = 960;
export const TIDE_DOUSE_MS = 900;

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  floor: number;
  landed: number;
  born: number;
}

/** Shared driver: three rasters (behind the body, in front, on the floor) round the unit, a frame callback, cleanup. */
function beat(scene: Phaser.Scene, u: MonsterUnit, ms: number, w: number, hAbove: number, draw: (r: { back: Raster; front: Raster; floor: Raster }, el: number, dt: number) => void): Promise<void> {
  const s = u.sprite;
  if (!s.active || u.retired) return Promise.resolve();
  const h0 = { x: Math.round(u.home.x), y: Math.round(u.home.y) };
  const H = hAbove + 40;
  const back = new Raster(scene, h0.x - w / 2, h0.y - hAbove, w, H, s.depth - 0.45);
  const front = new Raster(scene, h0.x - w / 2, h0.y - hAbove, w, H, s.depth + 0.45);
  const floor = new Raster(scene, h0.x - 60, h0.y - 20, 120, 42, s.depth - 0.8);
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      stop();
      back.destroy();
      front.destroy();
      floor.destroy();
      resolve();
    };
    const stop = onFrame(scene, (dt, el) => {
      if (!s.active || u.retired || el >= ms) {
        finish();
        return false;
      }
      back.img.setDepth(s.depth - 0.45);
      front.img.setDepth(s.depth + 0.45);
      floor.img.setDepth(s.depth - 0.8);
      back.begin();
      front.begin();
      floor.begin();
      draw({ back, front, floor }, el, Math.min(50, dt) / 1000);
      back.end();
      front.end();
      floor.end();
      return true;
    });
  });
}

function ringPx(r: Raster, cx: number, cy: number, rx: number, tone: Color, gap = 0, rot = 0): void {
  const n = Math.max(10, Math.round(rx * 5));
  for (let a = 0; a < n; a++) {
    if (gap && a % gap === 0) continue;
    const th = (a / n) * Math.PI * 2 + rot;
    r.px(Math.round(cx + Math.cos(th) * rx), Math.round(cy + Math.sin(th) * rx * 0.5), tone);
  }
}

/** GELGİT KUTSAMASI on a WATER / WIND monster. */
export function tideBlessing(scene: Phaser.Scene, u: MonsterUnit, o: { seed?: number; sound?: boolean } = {}): Promise<void> {
  const s = u.sprite;
  if (!s.active || u.retired) return Promise.resolve();
  const wind = u.attribute === 'WIND';
  const rnd = rng(o.seed ?? u.uid * 613 + 7);
  const cx = Math.round(u.home.x);
  const cy = Math.round(u.home.y);
  const sil0 = silhouetteOf(s);
  const bodyH = sil0 ? cy - sil0.top : 40;
  const halfW = sil0 ? Math.max(8, Math.round((sil0.right - sil0.left) / 2) + 4) : 14;
  const topY = cy - bodyH - 14;
  const HI: readonly Color[] = wind ? [PAL.white, PAL.leaf4, PAL.teal4, PAL.leaf3] : [PAL.white, PAL.cyan4, PAL.teal4, PAL.cyan3];
  const LO: readonly Color[] = wind ? [PAL.leaf2, PAL.teal2, PAL.leaf1] : [PAL.teal2, PAL.cyan2, PAL.teal1];
  if (o.sound !== false) playV3('tideBlessing', { volume: 0.9, pan: panAt(cx) });
  void lightFlash(scene, cx, cy - 20, wind ? PAL.teal4 : PAL.cyan4, 60, 800, { floorY: cy, intensity: 1.3, ring: true });
  const motion = !REDUCED_MOTION;
  const drops: Drop[] = [];
  let burst = false;
  return beat(scene, u, TIDE_BLESS_MS, Math.max(90, halfW * 2 + 50), bodyH + 40, ({ back, front, floor }, el, dt) => {
    const fr = Math.floor(el / 33);
    // ---- the splash ring at the feet + the welling water
    if (el < 700) {
      const k = el / 700;
      ringPx(floor, cx, cy, 6 + k * 26, k < 0.3 ? HI[0] : k < 0.6 ? HI[1] : LO[0], k > 0.5 ? 3 : 0);
      if (el < 380) {
        const rx = Math.min(1, el / 140) * (halfW + 4) * (el > 260 ? 1 - (el - 260) / 120 : 1);
        for (let y = Math.floor(cy - rx / 2); y <= cy + rx / 2; y++)
          for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            const r = Math.hypot((x - cx) / Math.max(1, rx), (y - cy) / Math.max(0.5, rx / 2));
            if (r > 1) continue;
            const glint = ((x * 7 + y * 13 + fr) % 23) === 0;
            floor.px(x, y, r > 0.82 ? HI[1] : glint ? HI[0] : r > 0.55 ? HI[2] : LO[0]);
          }
      }
    }
    // ---- the double helix
    if (motion && el >= 80 && el < 760) {
      const a = el - 80;
      const climb = Math.min(1, a / 260); // how high the ribbons reach
      const unwind = a > 440 ? (a - 440) / 240 : 0; // the bottom lifts off as they leave upward
      const yTop = Math.round(cy - (cy - topY) * climb - unwind * 20);
      const yBot = Math.round(cy - unwind * (cy - topY));
      for (let y = yBot; y >= yTop; y--) {
        const hk = (cy - y) / Math.max(1, cy - topY);
        const R = (halfW + 8) * (1 - hk * 0.18);
        // a thin translucent sheath of water between the ribbons (the spout's body): sparse, drifting up
        for (let x = Math.round(cx - R); x <= cx + R; x++) if (((x * 5 + y * 3 - fr * 2) % 17 + 17) % 17 === 0) back.px(x, y, LO[0]);
        for (let rib = 0; rib < 2; rib++) {
          // about one turn over the body's height, so the ribbon reads as a continuous band (each row joined to the one below)
          const th = y * 0.085 + el * 0.011 + rib * Math.PI;
          const sx = Math.cos(th);
          const z = Math.sin(th); // > 0: in front of the body
          const x = Math.round(cx + sx * R);
          const thB = (y + 1) * 0.085 + el * 0.011 + rib * Math.PI;
          const xB = Math.round(cx + Math.cos(thB) * (R + 0.5));
          const r = z > 0 ? front : back;
          const lo = Math.min(x, xB);
          const hi = Math.max(x, xB);
          // a fat tube of water: 3 px wide round the joined span; bright core, a darker skin, white glints running up it
          for (let xx = lo - 1; xx <= hi + 1; xx++) {
            const edge = xx < lo || xx > hi;
            const tone = z > 0 ? (edge ? HI[3] : (y + fr * 2) % 5 === 0 ? PAL.white : HI[1]) : edge ? LO[2] : LO[0];
            r.px(xx, y, tone);
          }
        }
      }
      // spray at the top of the climbing ribbons
      if (climb < 1 || unwind > 0) for (let j = 0; j < 4; j++) front.px(cx + Math.round((rnd() - 0.5) * halfW * 2), yTop - 1 - Math.floor(rnd() * 4), HI[j % 2]);
    }
    // ---- the body takes the water's light
    const sil = silhouetteOf(s);
    if (sil && el >= 300 && el < 760) {
      const k = el - 300;
      if (k < 45) {
        for (let y = sil.top; y < sil.bottom; y++) for (let x = sil.left; x < sil.right; x++) if (sil.has(x, y)) front.px(x, y, HI[1]);
      } else if (k < 100) {
        for (let y = sil.top; y < sil.bottom; y++) for (let x = sil.left; x < sil.right; x++) if (sil.has(x, y) && (x + y) % 2 === 0) front.px(x, y, HI[2]);
      }
      // the shining outline drains down the body
      const drain = sil.top + Math.max(0, k - 120) * 0.25;
      if (k < 460) for (const p of sil.outside()) if (p.y >= drain && (k < 200 || (p.x + p.y + fr) % 3 !== 0)) front.px(p.x, p.y, (p.y + fr) % 6 === 0 ? PAL.white : HI[1]);
    }
    // ---- the burst into droplets
    if (motion && !burst && el >= 520) {
      burst = true;
      for (let k = 0; k < 14; k++) {
        const side = k % 2 ? 1 : -1;
        drops.push({ x: cx + side * rnd() * halfW, y: topY + rnd() * 8, vx: side * (16 + rnd() * 50), vy: -50 - rnd() * 60, floor: cy + (rnd() - 0.4) * 14, landed: -1, born: el });
      }
    }
    for (const d of drops) {
      if (d.landed < 0) {
        d.vy += 320 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.vy > 0 && d.y >= d.floor) {
          d.y = d.floor;
          d.landed = el;
        }
        front.px(d.x, d.y, HI[0]);
        front.px(d.x, d.y - 1, HI[2]);
      } else {
        const k = (el - d.landed) / 300;
        if (k < 1) ringPx(floor, Math.round(d.x), Math.round(d.y), 1 + k * 4, k < 0.5 ? HI[1] : LO[0], k > 0.5 ? 2 : 0);
      }
    }
  });
}

/** SÖNDÜRME on a FIRE monster. */
export function tideDouse(scene: Phaser.Scene, u: MonsterUnit, o: { seed?: number; sound?: boolean } = {}): Promise<void> {
  const s = u.sprite;
  if (!s.active || u.retired) return Promise.resolve();
  const rnd = rng(o.seed ?? u.uid * 389 + 3);
  const cx = Math.round(u.home.x);
  const cy = Math.round(u.home.y);
  const sil0 = silhouetteOf(s);
  const bodyH = sil0 ? cy - sil0.top : 40;
  const halfW = sil0 ? Math.max(8, Math.round((sil0.right - sil0.left) / 2)) : 14;
  if (o.sound !== false) playV3('tideDouse', { volume: 0.9, pan: panAt(cx) });
  const motion = !REDUCED_MOTION;
  const steam: { x: number; y: number; vx: number; vy: number; born: number; life: number }[] = [];
  const drops: Drop[] = [];
  let hit = false;
  const waveH = Math.min(60, bodyH * 0.9 + 6);
  return beat(scene, u, TIDE_DOUSE_MS, halfW * 2 + 110, bodyH + 50, ({ back, front, floor }, el, dt) => {
    const fr = Math.floor(el / 33);
    // ---- the curling wave: rises at the left, breaks over the body to the right
    if (motion && el < 460) {
      const k = el / 460;
      const lead = Math.round(cx - halfW - 26 + k * (halfW * 2 + 44)); // the crest's x
      const hgt = waveH * (k < 0.35 ? k / 0.35 : 1 - (k - 0.35) * 0.9);
      const LEN = 36;
      for (let x = lead - LEN; x <= lead; x++) {
        const t = (x - (lead - LEN)) / LEN; // 0 at the back of the wave, 1 at its face
        // the profile: a long smooth back rising to a round crest, the face steep
        const prof = t < 0.78 ? Math.sin((t / 0.78) * (Math.PI / 2)) : 1 - ((t - 0.78) / 0.22) ** 2 * 0.35;
        const h = Math.max(1, Math.round(hgt * prof));
        for (let j = 0; j < h; j++) {
          const y = cy + 2 - j;
          const q = j / h;
          let tone: Color = q > 0.9 ? PAL.white : q > 0.72 ? PAL.cyan4 : q > 0.4 ? PAL.cyan3 : PAL.cyan2;
          // light streaks running up the back of the wave
          if (q <= 0.72 && q > 0.2 && (x + Math.floor(j * 0.5) + fr) % 7 === 0) tone = PAL.cyan4;
          (j < bodyH * 0.35 ? front : back).px(x, y, tone);
        }
      }
      // the lip curls forward and down off the crest (a quarter circle of foam), spray tearing off it
      if (hgt > 8) {
        const crestY = cy + 2 - Math.round(hgt);
        for (let a = 0; a <= 8; a++) {
          const th = (a / 8) * (Math.PI / 2);
          const x = Math.round(lead + Math.sin(th) * 7);
          const y = Math.round(crestY + (1 - Math.cos(th)) * 7);
          front.px(x, y, a < 4 ? PAL.white : PAL.cyan4);
          front.px(x, y + 1, PAL.cyan3);
        }
        for (let q = 0; q < 4; q++) front.px(lead + 3 + Math.floor(rnd() * 8), crestY - 1 - Math.floor(rnd() * 5), PAL.white);
      }
      if (!hit && lead >= cx - halfW) {
        hit = true;
        void lightFlash(scene, cx, cy - 18, PAL.cyan3, 50, 500, { floorY: cy, intensity: 1.1 });
      }
    }
    // ---- the body under the water: a deep blue frame, then steam
    const sil = silhouetteOf(s);
    if (sil && el >= 170 && el < 240) {
      for (let y = sil.top; y < sil.bottom; y++) for (let x = sil.left; x < sil.right; x++) if (sil.has(x, y) && (x + y) % 2 === 0) front.px(x, y, PAL.cyan3);
    }
    // the outline runs with water after the wave (a wet sheen draining down)
    if (sil && el >= 240 && el < 700) {
      const drain = sil.top + (el - 240) * 0.12;
      for (const p of sil.outside()) if (p.y >= drain && (p.x + p.y + fr) % 3 !== 0) front.px(p.x, p.y, (p.y + fr) % 5 === 0 ? PAL.white : PAL.teal3);
    }
    if (motion && el >= 260 && el < 640 && sil) {
      // the steam boils up off the body (a few plumes per frame)
      for (let j = 0; j < 3; j++) {
        const x = sil.left + rnd() * (sil.right - sil.left);
        const top = sil.topAt(Math.round(x)) ?? sil.top;
        steam.push({ x, y: top + rnd() * 6, vx: (rnd() - 0.5) * 18, vy: -24 - rnd() * 30, born: el, life: 500 + rnd() * 400 });
      }
      if (el < 300) for (let k = 0; k < 10; k++) drops.push({ x: cx + (rnd() - 0.5) * halfW * 2, y: sil.top + rnd() * bodyH * 0.6, vx: (rnd() - 0.3) * 50, vy: -20 - rnd() * 40, floor: cy + (rnd() - 0.4) * 12, landed: -1, born: el });
    }
    for (const p of steam) {
      const k = (el - p.born) / p.life;
      if (k >= 1) continue;
      const x = Math.round(p.x + p.vx * k * p.life * 0.001);
      const y = Math.round(p.y + p.vy * k * p.life * 0.001);
      const tone = k < 0.25 ? PAL.white : k < 0.55 ? PAL.stone4 : PAL.stone3;
      const r = k < 0.3 ? 0 : 1;
      front.px(x, y, tone);
      if (r) {
        front.px(x + 1, y, tone);
        front.px(x, y - 1, tone);
      }
    }
    for (const d of drops) {
      if (d.landed < 0) {
        d.vy += 300 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.vy > 0 && d.y >= d.floor) {
          d.y = d.floor;
          d.landed = el;
        }
        front.px(d.x, d.y, PAL.cyan4);
      } else if (el - d.landed < 260) ringPx(floor, Math.round(d.x), Math.round(d.y), 1 + ((el - d.landed) / 260) * 4, PAL.teal3, 2);
    }
  });
}
