// Sky Temple — the sky ABOVE the frame (game y −320 … 0): the duel's opening camera starts high above the arena
// (CameraRig.descend from −300) and glides down. The sunset's violet zenith deepens into a starry dusk, so the
// descent reads as coming down out of the night sky into the evening light. Painted at K× density.
//
//   paintUpperSky() → PixelCanvas (SKY_W × UPPER_H at K×), placed at game (SKY_X0, −UPPER_H)

import { type Color, PixelCanvas } from '../pixel';
import { K } from './board2';
import { SKY_W, SKY_X0, skyColorAt } from './backdrop';
import { SKY, bayer8 } from './kit';

export const UPPER_H = 330;

const hx = (s: string): Color => parseInt(s, 16);
/** Night → the sky ramp's zenith (dark → light). */
const NIGHT = ['0a0618', '0e0a22', '130d2c', '191236', '1f1642', '251a4c'].map(hx);

export function paintUpperSky(): PixelCanvas {
  const W = SKY_W * K;
  const H = UPPER_H * K;
  const p = new PixelCanvas(W, H);
  const ramp = [...NIGHT, ...SKY.sky.slice(0, 3)];
  const top = ramp.length - 1;
  // where the sunset sky starts at y 0 (its ramp index), smoothed along x so the steps never show as vertical bands
  const raw = Array.from({ length: W }, (_, ax) => Math.max(0, Math.min(2, SKY.sky.indexOf(skyColorAt(SKY_X0 + ax / K, 0)))));
  const R = 80 * K;
  const seams = raw.map((_, ax) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, ax - R); k <= Math.min(W - 1, ax + R); k += 4) {
      s += raw[k];
      n++;
    }
    return s / n;
  });
  for (let ax = 0; ax < W; ax++) {
    const base = NIGHT.length + seams[ax];
    for (let ay = 0; ay < H; ay++) {
      const up = (H - ay) / H; // 0 at the seam … 1 at the top
      const f = base - Math.pow(up, 0.8) * (top + 0.6);
      const i = Math.max(0, Math.floor(f));
      const fr = f - Math.floor(f);
      let c = f <= 0 ? ramp[0] : bayer8(ax, ay) < fr * 0.9 ? ramp[Math.min(top, i + 1)] : ramp[i];
      // stars: denser and brighter higher up
      const h = Math.sin(ax * 12.9898 + ay * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      if (r > 1 - 0.0011 * up) c = up > 0.5 && r > 1 - 0.00025 ? SKY.cloud[15] : SKY.cloud[up > 0.4 ? 12 : 9];
      p.set(ax, ay, c);
    }
  }
  // a few bright four-point stars
  let a = 0x2b91;
  const rnd = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let n = 0; n < 22; n++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * H * 0.8);
    const r = (rnd() < 0.3 ? 3 : 2) * K;
    const pal = [SKY.crystalCyan, SKY.crystalViolet, SKY.gold][n % 3];
    for (let k = -r; k <= r; k++) {
      const c = Math.abs(k) < r / 2 ? pal[5] : pal[3];
      p.set(x + k, y, c);
      p.set(x, y + k, c);
    }
    p.set(x, y, SKY.cloud[15]);
  }
  return p;
}
