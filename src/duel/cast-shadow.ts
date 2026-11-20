// Cast shadows (owner 2026-11-17, the lit stage: "soldan ışık vuruyor, gölgeler çok net"): every monster throws its OWN silhouette
// onto the floor, away from the key light at the left — a crisp, flat shape that lies down toward the right, follows every frame
// of its animation (the roar, the lunge, the guard) and stays on the floor while the monster leaps.
//
// Projection (inverse mapped, so the shape has no holes): a body pixel `h` px above the feet and `w` px to the side of the feet
// column lands at feet + (h·LX, h·LY + w·WD) — the height becomes the shadow's length to the right, the width its depth on the
// iso floor (halved), LY tilts it (negative: toward the back, the light being at the front left, so the shadow falls into the
// gap between the rows instead of under the next monster in the row). Two flat tones: ink where it touches the feet (occlusion), night0
// for the rest, the far tip dithered (the penumbra of a big soft key). One texture per (sheet frame, facing, hover), built once
// from the frame's own pixels (atlas.frameRGBA), so the P2 relit sheets and the v3 variants all work.

import type Phaser from 'phaser';
import { PAL } from '../art/palette';
import { PixelCanvas } from '../art/pixel';
import { frameRGBA } from '../art/atlas';

/** Light model: length per px of height (to the right), the tilt toward the viewer, the depth squash of the body's width. */
export const CAST: { LX: number; LY: number; WD: number; ALPHA: number; CONTACT: number; TIP: number } = { LX: 0.9, LY: -0.4, WD: 0.42, ALPHA: 0.82, CONTACT: 5, TIP: 0.84 };

/**
 * The arena's key light (additive). 'stage': the Neon Tower's key light at the front left (shadows lie down to the right, toward
 * the back). 'sun': the Sky Temple's low sunset behind the far right (shadows lie down to the LEFT, a little toward the viewer,
 * shorter and in a cooler, lighter shade — daylight with sky fill). Set by the board view when it is built.
 */
export type CastLight = 'stage' | 'sun';
let light: CastLight = 'stage';
const LIGHTS: Record<CastLight, typeof CAST & { mirror: boolean; tone: number; contact: number }> = {
  stage: { LX: 0.9, LY: -0.4, WD: 0.42, ALPHA: 0.82, CONTACT: 5, TIP: 0.84, mirror: false, tone: PAL.night0, contact: PAL.ink },
  sun: { LX: 0.62, LY: 0.18, WD: 0.42, ALPHA: 0.62, CONTACT: 4, TIP: 0.8, mirror: true, tone: PAL.night1, contact: PAL.night0 },
};
export function setCastLight(l: CastLight): void {
  light = l;
  const L = LIGHTS[l];
  CAST.LX = L.LX;
  CAST.LY = L.LY;
  CAST.WD = L.WD;
  CAST.ALPHA = L.ALPHA;
  CAST.CONTACT = L.CONTACT;
  CAST.TIP = L.TIP;
}

export interface CastTex {
  key: string;
  /** origin (0..1) that puts the feet on the image position */
  ox: number;
  oy: number;
}

const cache = new Map<string, CastTex | null>();

/**
 * The cast-shadow texture of a sprite's frame. `originX/Y`: the sprite's origin; `hover`: px between the sprite's origin and the
 * floor (a hovering monster's shadow starts at its feet on the floor). null when the frame has no readable pixels.
 */
export function castShadowTex(scene: Phaser.Scene, frame: Phaser.Textures.Frame, flip: boolean, originX: number, originY: number, hover: number): CastTex | null {
  const id = `duel:cast:${light === 'stage' ? '' : `${light}:`}${frame.texture.key}|${frame.name}|${flip ? 1 : 0}|${originX}|${originY}|${hover}`;
  const hit = cache.get(id);
  if (hit !== undefined && (hit === null || scene.textures.exists(hit.key))) return hit;
  const data = frameRGBA(frame);
  if (!data) {
    cache.set(id, null);
    return null;
  }
  const L = LIGHTS[light];
  // a mirrored light (the sun at the back right): build the shadow of the mirrored sprite, then mirror the canvas
  if (L.mirror) flip = !flip;
  const W = frame.realWidth;
  const H = frame.realHeight;
  const Fx = originX * W;
  const Fy = originY * H + hover;
  // the body's extent above the feet and to either side
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] > 0) {
        if (y < top) top = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
  if (!Number.isFinite(top)) {
    cache.set(id, null);
    return null;
  }
  const hMax = Math.max(1, Fy - top);
  const wL = Math.max(1, flip ? right + 1 - Fx : Fx - left);
  const wR = Math.max(1, flip ? Fx - left : right + 1 - Fx);
  const { LX, LY, WD, CONTACT, TIP } = CAST;

  const ox = 3;
  // the shadow's vertical extent for any tilt (LY < 0: it leans back, away from a light at the front left)
  const above = wL * WD + Math.max(2 * LY, -hMax * LY, 0);
  const below = wR * WD + Math.max(hMax * LY, -2 * LY, 0);
  const oy = Math.ceil(above) + 3;
  const CW = Math.ceil(hMax * LX) + ox + 3;
  const CH = oy + Math.ceil(below) + 4;
  const pc = new PixelCanvas(CW, CH);
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      const dx = cx + 0.5 - ox;
      const dy = cy + 0.5 - oy;
      const h = dx / LX;
      if (h < -2 || h > hMax + 1) continue;
      const w = (dy - h * LY) / WD;
      const lx = Math.floor(flip ? Fx - w : Fx + w);
      const ly = Math.floor(Fy - h);
      if (lx < 0 || ly < 0 || lx >= W || ly >= H) continue;
      if (data[(ly * W + lx) * 4 + 3] === 0) continue;
      const k = h / hMax;
      // the penumbra at the far tip: a checker, then nothing
      if (k > TIP && (cx + cy) % 2 === 0) continue;
      pc.set(L.mirror ? CW - 1 - cx : cx, cy, h < CONTACT ? L.contact : L.tone);
    }
  const key = id;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, pc.toCanvas());
  const out = { key, ox: L.mirror ? (CW - ox - 0.5) / CW : (ox + 0.5) / CW, oy: (oy + 0.5) / CH };
  cache.set(id, out);
  return out;
}
