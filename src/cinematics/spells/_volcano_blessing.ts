// Volkan Arenası — ATEŞ KUTSAMASI (the fire blessing): the beat a FIRE monster gets as the volcano's lava reaches it (the field's
// eruption front, src/cinematics/spells/volcano_arena.ts) or as it steps onto an arena that is already burning (flow/stats.ts).
//
//   0      a molten ring tears open round its feet: gold-white melt, fire tones out to a deep red lip, six short fissures
//          spoke out of it; a low heave (1-px shake), the light of the lava floods its pad
//   120    a LAVA GEYSER bursts up behind it — a wavering column (white core, gold, fire, a deep red skin) that overshoots the
//          monster's head, holds roaring with its crown spitting, then collapses back into the ring; a splash fan stands in
//          front of the feet
//   260    the body takes the heat: one gold-white frame, one half-dithered fire frame, then a burning outline that cools
//   200    globs of lava are flung out on arcs, splat on the floor and cool; a shock ring rolls out over the floor
//   ~900   gone (the lasting aura — the flame tongues, the floor sigil — is flameAuraV3's, set by the caller)
// Flat palette tones, whole pixels; the rasters follow the unit's home and depth. Reduced motion: the ring and one flash only.

import type Phaser from 'phaser';
import { PAL } from '../../art/palette';
import type { MonsterUnit } from '../../duel/MonsterUnit';
import { lightFlash } from '../../view/light';
import { REDUCED_MOTION } from '../../view/v3/motion';
import { shake } from '../../vfx/core';
import { Raster, onFrame } from '../../vfx/setpieces';
import { silhouetteOf } from '../_v3/spellfx';
import { panAt, play as playV3 } from '../_v3/sound';

const COL = [PAL.white, PAL.gold4, PAL.fire4, PAL.fire3, PAL.fire2, PAL.fire1] as const;
const MELT = [PAL.gold4, PAL.fire4, PAL.fire3, PAL.fire2, PAL.fire1] as const;
const GLOB = [PAL.gold4, PAL.fire4, PAL.fire3, PAL.fire2, PAL.fire1, PAL.fire0] as const;

/** The whole beat (ms). */
export const BLESSING_MS = 940;

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

interface Glob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  floor: number;
  landed: number;
  born: number;
}

/** Play the blessing on `u` (resolves when it is over). */
export function fireBlessing(scene: Phaser.Scene, u: MonsterUnit, o: { seed?: number; sound?: boolean } = {}): Promise<void> {
  const s = u.sprite;
  if (!s.active || u.retired) return Promise.resolve();
  const rnd = rng(o.seed ?? u.uid * 977 + 31);
  const h0 = { x: Math.round(u.home.x), y: Math.round(u.home.y) };
  const sil0 = silhouetteOf(s);
  const bodyH = sil0 ? h0.y - sil0.top : 40;
  const peakH = Math.min(110, bodyH + 36);
  // the column frames the body: wider than it at the base, so the fire shows on both sides of the silhouette
  const baseHalf = Math.max(9, Math.min(18, sil0 ? Math.round((sil0.right - sil0.left) * 0.42) : 11));
  const W = 150;
  const H = peakH + 56;
  const ox = h0.x - W / 2;
  const oy = h0.y - peakH - 30;
  const back = new Raster(scene, ox, oy, W, H, s.depth - 0.45);
  const front = new Raster(scene, ox, oy, W, H, s.depth + 0.45);
  const floor = new Raster(scene, h0.x - 50, h0.y - 16, 100, 34, s.depth - 0.8);
  if (o.sound !== false) playV3('fireBlessing', { volume: 0.9, pan: panAt(h0.x) });
  void lightFlash(scene, h0.x, h0.y - 18, PAL.fire4, 64, 760, { floorY: h0.y, intensity: 1.5, ring: true });
  void shake(scene, 260, 1);
  const motion = !REDUCED_MOTION;
  const globs: Glob[] = [];
  const spokes = Array.from({ length: 6 }, (_, k) => ({ a: (k / 6) * Math.PI * 2 + rnd() * 0.6, len: 5 + rnd() * 6 }));
  let flung = false;
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
    const stop = onFrame(scene, (frameDt, el) => {
      if (!s.active || u.retired || el >= BLESSING_MS) {
        finish();
        return false;
      }
      const fr = Math.floor(el / 33); // the column wavers on 33-ms frames
      back.img.setDepth(s.depth - 0.45);
      front.img.setDepth(s.depth + 0.45);
      floor.img.setDepth(s.depth - 0.8);
      back.begin();
      front.begin();
      floor.begin();
      const cx = h0.x;
      const cy = h0.y;

      // ---- the molten ring at the feet (opens, holds, closes as the geyser falls back into it)
      const open = el < 200 ? el / 200 : el < 640 ? 1 : Math.max(0, 1 - (el - 640) / 300);
      if (open > 0) {
        const rx = 4 + 11 * Math.sqrt(open);
        const ry = rx / 2;
        for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
          for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
            const r = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
            if (r > 1) continue;
            const crust = ((x * 7 + y * 13 + (fr >> 2)) % 9 === 0 && r > 0.4) || (el > 700 && (x + y) % 3 === 0);
            const tone = crust ? PAL.fire1 : r < 0.35 ? MELT[0] : r < 0.6 ? MELT[1] : r < 0.82 ? MELT[2] : MELT[3];
            floor.px(x, y, tone);
          }
        // the deep red lip and the spoke fissures
        floor.ring(cx, cy, rx + 1, ry + 0.6, PAL.fire1, 1);
        for (const sp of spokes) {
          const l = sp.len * open;
          for (let k = 0; k < l; k++) {
            const x = Math.round(cx + Math.cos(sp.a) * (rx + 1 + k));
            const y = Math.round(cy + Math.sin(sp.a) * (ry + 0.5 + k / 2));
            floor.px(x, y, k < l * 0.4 ? PAL.fire3 : k < l * 0.75 ? PAL.fire2 : PAL.fire1);
          }
        }
      }

      // ---- the shock ring over the floor
      if (motion && el > 180 && el < 640) {
        const k = (el - 180) / 460;
        const rx = 14 + k * 34;
        const tone = k < 0.25 ? PAL.fire4 : k < 0.5 ? PAL.fire3 : k < 0.75 ? PAL.fire2 : PAL.fire1;
        for (let a = 0; a < 64; a++) {
          if ((a + fr) % 4 === 0 && k > 0.5) continue;
          const th = (a / 64) * Math.PI * 2;
          floor.px(Math.round(cx + Math.cos(th) * rx), Math.round(cy + Math.sin(th) * rx * 0.5), tone);
        }
      }

      // ---- the geyser (behind the body) + its splash fan (in front of the feet)
      if (motion && el >= 120 && el < 760) {
        const a = el - 120;
        // height: shoots up (overshoot), roars, collapses into the ring
        const hgt = a < 150 ? peakH * (1 - (1 - a / 150) ** 3) * 1.08 : a < 360 ? peakH * (1.02 + Math.sin(a / 25) * 0.04) : peakH * Math.max(0, 1 - ((a - 360) / 280) ** 1.6);
        const thin = a < 360 ? 1 : Math.max(0.35, 1 - (a - 360) / 400);
        const top = Math.round(cy - hgt);
        for (let y = cy; y >= top; y--) {
          const k = (cy - y) / Math.max(1, hgt);
          const half = Math.max(1, Math.round((baseHalf - k * baseHalf * 0.55) * thin + (k > 0.85 ? -1 : 0)));
          const wob = Math.round(Math.sin(y * 0.45 + fr * 0.9) * (0.6 + k * 1.6));
          for (let dx = -half - 1; dx <= half + 1; dx++) {
            const e = Math.abs(dx) / (half + 1);
            const hot = a < 260 ? 0 : 1; // the core is white only while it climbs
            let tone: number;
            if (e > 0.95) tone = (y + fr) % 2 ? PAL.fire1 : PAL.fire2;
            else if (e > 0.75) tone = COL[4];
            else if (e > 0.5) tone = COL[3];
            else if (e > 0.28) tone = COL[2];
            else tone = COL[1 + hot];
            // streaks running up the column
            if (e <= 0.75 && ((cy - y) + fr * 3 + dx * 5) % 11 === 0) tone = COL[Math.max(0, COL.indexOf(tone as (typeof COL)[number]) - 1)];
            back.px(cx + dx + wob, y, tone);
          }
        }
        // the crown: spitting tongues
        if (hgt > 8)
          for (let j = 0; j < 5; j++) {
            const tx = cx + Math.round((j - 2) * 2.6) + (fr % 2);
            const th = 2 + ((fr * 7 + j * 5) % 6);
            for (let k = 0; k < th; k++) back.px(tx, top - k, k < th * 0.4 ? PAL.fire4 : k < th * 0.75 ? PAL.fire3 : PAL.fire2);
          }
        // the splash fan in front of the feet
        if (a < 420) {
          const fan = a < 80 ? a / 80 : 1 - (a - 80) / 340;
          const rx = 9 + fan * 6;
          for (let x = -Math.round(rx); x <= rx; x++) {
            const hh = Math.round((1 - (x / rx) ** 2) * (5 + fan * 5) * (0.7 + 0.3 * Math.sin(x * 1.7 + fr)));
            for (let k = 0; k < hh; k++) front.px(cx + x, cy + 2 - k, k < hh * 0.35 ? PAL.fire2 : k < hh * 0.7 ? PAL.fire3 : PAL.fire4);
          }
        }
      }

      // ---- the body takes the heat
      const sil = silhouetteOf(s);
      if (sil && el >= 250 && el < 640) {
        const k = el - 250;
        if (k < 50) {
          for (let y = sil.top; y < sil.bottom; y++) for (let x = sil.left; x < sil.right; x++) if (sil.has(x, y)) front.px(x, y, PAL.gold4);
        } else if (k < 110) {
          for (let y = sil.top; y < sil.bottom; y++) for (let x = sil.left; x < sil.right; x++) if (sil.has(x, y) && (x + y) % 2 === 0) front.px(x, y, PAL.fire4);
        }
        const tone = k < 180 ? PAL.fire4 : k < 280 ? PAL.fire3 : PAL.fire2;
        if (k < 390) for (const p of sil.outside()) if (k < 200 || (p.x + p.y + (fr >> 1)) % 3 !== 0) front.px(p.x, p.y, tone);
      }

      // ---- globs flung out of the crown, splatting on the floor
      if (motion && !flung && el >= 230) {
        flung = true;
        const n = 9;
        for (let k = 0; k < n; k++) {
          const side = k % 2 ? 1 : -1;
          globs.push({ x: cx + side * rnd() * 3, y: cy - peakH * (0.7 + rnd() * 0.3), vx: side * (14 + rnd() * 46), vy: -40 - rnd() * 60, floor: cy + (rnd() - 0.35) * 12, landed: -1, born: el });
        }
      }
      for (const g of globs) {
        if (g.landed < 0) {
          const dt = Math.min(50, frameDt) / 1000;
          g.vy += 300 * dt;
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          if (g.vy > 0 && g.y >= g.floor) {
            g.y = g.floor;
            g.landed = el;
          }
          const age = (el - g.born) / 500;
          const c = GLOB[Math.min(3, Math.floor(age * 4))];
          front.px(g.x, g.y, c);
          front.px(g.x + 1, g.y, c);
          front.px(g.x, g.y - 1, PAL.fire2);
        } else {
          const k = (el - g.landed) / 360;
          if (k >= 1) continue;
          const c = GLOB[Math.min(GLOB.length - 1, 2 + Math.floor(k * 4))];
          floor.px(g.x - 1, g.y, c);
          floor.px(g.x, g.y, c);
          floor.px(g.x + 1, g.y, c);
          if (k < 0.3) floor.px(g.x, g.y - 1, PAL.fire4);
        }
      }
      back.end();
      front.end();
      floor.end();
      return true;
    });
  });
}
