// Sky Temple props (v2), painted in code at K× density: banner pillars, floating islands, the prism and
// its beams, floating crystals. Volumes are drawn as real iso solids (two lit faces), lit from the sunset
// (right), with lavender bounce light from the clouds below.

import { type Color, PixelCanvas, mix } from '../pixel';
import { K } from './board2';
import { SKY, bayer8, clamp01, fbm, noise, tone } from './kit';

// ---------------------------------------------------------------- pillar

/** A square iso pillar (game ~34 px wide, ~210 tall) with a crystal crown and a hanging banner. side 0 cyan / 1 crimson. */
export function paintPillar2(side: 0 | 1): PixelCanvas {
  const W = 66 * K;
  const H = 240 * K;
  const p = new PixelCanvas(W, H);
  const cx = W / 2;
  const half = 18 * K; // half the diagonal width of the shaft
  const crown = 52 * K;
  const base = H - 4 * K;
  const crystal = side === 0 ? SKY.crystalCyan : SKY.crystalPink;
  const ban = side === 0 ? SKY.cyan : SKY.red;
  /**
   * An iso box: top face (a 2:1 diamond centred at (cx, yTop)), then the left face (shaded) and the right
   * face (sunlit) hanging `height` px below the diamond's lower edges. Stone courses every `course` px.
   */
  const box = (yTop: number, height: number, hw: number, tL: number, tR: number, course: number, cap = false) => {
    for (let ax = cx - hw; ax < cx + hw; ax++) {
      const dx = ax + 0.5 - cx;
      const right = dx >= 0;
      const off = (hw - Math.abs(dx)) * 0.5; // the diamond's half-height at this column
      const topY = yTop - off;
      const edgeY = yTop + off;
      // top face
      for (let ay = Math.floor(topY); ay < edgeY; ay++) {
        let c: Color = cap ? (ay < topY + 1.5 ? SKY.gold[6] : tone(SKY.gold, 0.62, ax, ay)) : tone(SKY.wall, 0.86, ax, ay);
        if (ay < topY + 1 || Math.abs(dx) >= hw - 1) c = SKY.ink;
        p.set(ax, ay, c);
      }
      // side face
      for (let ay = Math.floor(edgeY); ay < edgeY + height; ay++) {
        const k = ay - edgeY;
        const crs = Math.floor(k / course);
        let t = (right ? tR : tL) + (noise(crs * 2.1, right ? 1 : 2, 61) - 0.5) * 0.08 + (fbm(ax / 9, ay / 9, 2, 63) - 0.5) * 0.1;
        if (k % course < 1) t -= 0.2; // course joint
        // vertical joints, staggered per course, following the face's slope
        const along = right ? dx : -dx;
        if (Math.abs(((along + (crs % 2) * course * 0.6) % (course * 1.2)) - 0) < 0.8) t -= 0.14;
        if (Math.abs(dx) < 1.2 && right) t += 0.14; // the sunlit corner
        let c: Color = tone(SKY.wall, clamp01(t), ax, ay);
        if (cap && k < 2) c = right ? SKY.gold[5] : SKY.gold[3];
        if (Math.abs(dx) >= hw - 1 || ay >= edgeY + height - 1) c = SKY.ink;
        p.set(ax, ay, c);
      }
    }
  };
  // base plinth, shaft, capital (back to front: the lower parts first)
  box(base - 22 * K, 18 * K, half + 7 * K, 0.42, 0.8, 9 * K, true);
  box(crown + 24 * K, base - 22 * K - (crown + 24 * K), half, 0.36, 0.72, 10 * K);
  box(crown + 12 * K, 12 * K, half + 6 * K, 0.42, 0.82, 12 * K, true);
  // crown crystal: tall faceted gem (left facet bright, right facet mid, a white glint)
  const gTop = 4 * K;
  const gBot = crown + 6 * K;
  const gw = 10 * K;
  for (let ay = gTop; ay < gBot; ay++) {
    const t = (ay - gTop) / (gBot - gTop);
    const w = Math.round((t < 0.55 ? t / 0.55 : (1 - t) / 0.45) * gw);
    for (let dx = -w; dx <= w; dx++) {
      let c: Color;
      if (Math.abs(dx) === w) c = SKY.ink;
      else if (dx < -w * 0.35) c = crystal[t < 0.55 ? 5 : 4];
      else if (dx < w * 0.2) c = crystal[t < 0.55 ? 4 : 3];
      else c = crystal[t < 0.55 ? 3 : 2];
      if (dx === -Math.round(w * 0.55) && t > 0.15 && t < 0.4) c = crystal[6];
      p.set(cx + dx, ay, c);
    }
  }
  // banner: from a gold rod under the capital, waving folds, gold border, a sigil, a swallow tail
  const by = crown + 30 * K;
  const bh = 110 * K;
  const bx0 = cx - 13 * K;
  const bw = 26 * K;
  for (let ax = bx0 - 3 * K; ax < bx0 + bw + 3 * K; ax++) for (let ay = by - K; ay < by + K; ay++) p.set(ax, ay, ax === bx0 - 3 * K || ax === bx0 + bw + 3 * K - 1 ? SKY.gold[2] : SKY.gold[5]);
  for (let ay = by + K; ay < by + bh; ay++) {
    const rel = (ay - by) / bh;
    for (let ax = bx0; ax < bx0 + bw; ax++) {
      const rx = (ax - bx0) / bw;
      if (rel > 0.86 && Math.abs(rx - 0.5) < (rel - 0.86) * 3.6) continue;
      const fold = Math.sin(rx * 9.4 + rel * 2) * 0.5 + 0.5;
      let c: Color = tone(ban, 0.22 + fold * 0.36 + (1 - rel) * 0.08, ax, ay);
      if (rx < 0.09 || rx > 0.91 || (rel > 0.84 && Math.abs(rx - 0.5) < (rel - 0.84) * 3.6 + 0.07)) c = SKY.gold[rx < 0.5 ? 5 : 3];
      if (ax === bx0 || ax === bx0 + bw - 1) c = SKY.ink;
      const sx = (ax - (bx0 + bw / 2)) / K;
      const sy = (ay - (by + bh * 0.38)) / K;
      const dd = Math.abs(sx) + Math.abs(sy) / 1.3;
      if (dd < 8.5 && dd > 7.3) c = SKY.gold[5];
      else if (dd < 5.5 && (Math.abs(sx) < 0.8 || Math.abs(sy) < 0.8)) c = SKY.gold[6];
      else if (dd < 2) c = SKY.gold[7];
      p.set(ax, ay, c);
    }
  }
  return p;
}

// ---------------------------------------------------------------- floating island

/** A floating island (iso): a grassy top, a rock body with strata and a lavender-lit underside, a white temple, a waterfall. */
export function paintIsland2(i: number, haze: number, hazeTo: Color): PixelCanvas {
  const R = [46, 36, 54, 40][i % 4];
  const W = (R * 2 + 16) * K;
  const H = (R * 2.4 + 30) * K;
  const p = new PixelCanvas(W, H);
  const cx = W / 2;
  const ty = 30 * K; // top surface centre
  const rx = R * K;
  const ry = R * 0.42 * K;
  const put = (x: number, y: number, c: Color) => p.set(x, y, haze > 0 ? mix(c, hazeTo, haze) : c);
  // rock body: per column, from the top rim down to a jagged point
  for (let ax = cx - rx; ax <= cx + rx; ax++) {
    const f = (ax - cx) / rx;
    const rim = ty + ry * Math.sqrt(Math.max(0, 1 - f * f));
    const depth = (R * 1.5 * (1 - Math.abs(f)) ** 0.8 + 6 + (fbm(ax / 14, i, 3, 71) - 0.5) * 16) * K;
    for (let ay = Math.floor(rim - 2 * K); ay < rim + depth; ay++) {
      const k = (ay - rim) / depth;
      const strata = fbm(ax / 30, ay / 8, 3, 73 + i);
      let t = 0.5 + f * 0.22 - k * 0.22 + (strata - 0.5) * 0.32;
      t += Math.max(0, k - 0.6) * 0.8; // cloud bounce
      let c = tone(SKY.rock, clamp01(t), ax, ay);
      if (ay >= rim + depth - 1.5) c = SKY.ink;
      put(ax, ay, c);
    }
  }
  // grass top (an ellipse) with a lit front lip
  for (let ay = Math.floor(ty - ry); ay <= ty + ry; ay++)
    for (let ax = cx - rx; ax <= cx + rx; ax++) {
      const e = ((ax - cx) / rx) ** 2 + ((ay - ty) / ry) ** 2;
      if (e > 1) continue;
      let t = 0.5 + ((ax - cx) / rx) * 0.2 + (fbm(ax / 6, ay / 6, 2, 79) - 0.5) * 0.3;
      if (e > 0.82 && ay > ty) t -= 0.2;
      put(ax, ay, tone(SKY.grass, clamp01(t), ax, ay));
    }
  // a temple: a stepped base, 4–6 columns, an entablature and a pediment (white marble, sun from the right)
  const tw = Math.round(rx * 0.85);
  const tx0 = cx - tw / 2;
  const tBase = ty + 2 * K;
  const colH = R * 0.5 * K;
  const marble = (x: number, y: number, t: number) => put(x, y, tone(SKY.marble, clamp01(t + ((x - cx) / tw) * 0.25), x, y));
  for (let ax = tx0 - 3 * K; ax < tx0 + tw + 3 * K; ax++) for (let ay = tBase - 4 * K; ay < tBase; ay++) marble(ax, ay, ay < tBase - 2 * K ? 0.75 : 0.55);
  const cols = Math.max(4, Math.round(tw / (7 * K)));
  for (let c = 0; c < cols; c++) {
    const x0 = Math.round(tx0 + (c + 0.5) * (tw / cols) - 1.5 * K);
    for (let ay = tBase - 4 * K - colH; ay < tBase - 4 * K; ay++) for (let dx = 0; dx < 3 * K; dx++) marble(x0 + dx, ay, dx < K ? 0.85 : dx < 2 * K ? 0.62 : 0.4);
  }
  const eTop = tBase - 4 * K - colH;
  for (let ax = tx0 - 2 * K; ax < tx0 + tw + 2 * K; ax++) {
    for (let ay = eTop - 4 * K; ay < eTop; ay++) marble(ax, ay, ay < eTop - 3 * K ? 0.9 : 0.5);
    const rel = Math.abs((ax - cx) / (tw / 2 + 2 * K));
    const ph = Math.round((1 - rel) * 9 * K);
    for (let k = 0; k < ph; k++) marble(ax, eTop - 4 * K - k, k === ph - 1 ? 0.95 : 0.6);
  }
  // a waterfall off the front-right lip, falling past the rock into the clouds
  if (i % 2 === 0) {
    const fx = Math.round(cx + rx * 0.55);
    for (let ay = Math.round(ty + ry * 0.6); ay < H; ay++)
      for (let dx = 0; dx < 4 * K; dx++) {
        const t = 0.55 + (((ay * 0.7 + dx * 3) % 10) < 4 ? 0.35 : 0) - (dx === 0 || dx === 4 * K - 1 ? 0.3 : 0);
        put(fx + dx, ay, tone(SKY.water, clamp01(t), fx + dx, ay));
      }
  }
  return p;
}

// ---------------------------------------------------------------- prism + crystals

/** A faceted crystal (an elongated octahedron) of half-width w and height h, with a white glint. */
export function paintCrystal(w: number, h: number, ramp: readonly Color[]): PixelCanvas {
  const W = (w * 2 + 2) * K;
  const H = (h + 2) * K;
  const p = new PixelCanvas(W, H);
  const cx = W / 2;
  const mid = H * 0.42;
  for (let ay = K; ay < H - K; ay++) {
    const t = ay < mid ? (ay - K) / (mid - K) : 1 - (ay - mid) / (H - K - mid);
    const hw = Math.round(t * w * K);
    for (let dx = -hw; dx <= hw; dx++) {
      let c: Color;
      if (Math.abs(dx) === hw) c = SKY.ink;
      else if (dx < -hw * 0.4) c = ramp[ay < mid ? 5 : 4];
      else if (dx < hw * 0.15) c = ramp[ay < mid ? 4 : 3];
      else c = ramp[ay < mid ? 3 : 2];
      if (dx === Math.round(-hw * 0.6) && ay < mid && ay > mid * 0.4) c = ramp[6];
      p.set(cx + dx, ay, c);
    }
  }
  return p;
}

/** A soft stepped glow disc (ADD-blended halo) of radius r in a colour ramp. */
export function paintGlow(r: number, ramp: readonly Color[]): PixelCanvas {
  const W = r * 2 * K;
  const p = new PixelCanvas(W, W);
  for (let ay = 0; ay < W; ay++)
    for (let ax = 0; ax < W; ax++) {
      const d = Math.hypot(ax - W / 2, ay - W / 2) / (W / 2);
      if (d > 1) continue;
      const t = (1 - d) ** 1.6;
      if (bayer8(ax, ay) > t * 1.3) continue;
      p.set(ax, ay, ramp[Math.min(ramp.length - 1, Math.floor(t * 4))]);
    }
  return p;
}

/** The prism's two light beams (ADD-blended) fanning from (ox, oy) to the cyan side and the crimson side. */
export function paintBeams(ox: number, oy: number, toL: { x: number; y: number }, toR: { x: number; y: number }): PixelCanvas {
  const W = 800 * K;
  const H = 260 * K;
  const p = new PixelCanvas(W, H);
  const X0 = -80;
  const beams = [
    { to: toL, r: SKY.cyan },
    { to: toR, r: SKY.red },
  ];
  for (const b of beams) {
    const len = Math.hypot(b.to.x - ox, b.to.y - oy) * K;
    const ux = ((b.to.x - ox) * K) / len;
    const uy = ((b.to.y - oy) * K) / len;
    for (let t = 0; t < len; t += 0.5) {
      const wide = 2 + (t / len) * 26 * K;
      for (let s = -wide; s <= wide; s += 0.5) {
        const x = Math.round((ox - X0) * K + ux * t - uy * s);
        const y = Math.round(oy * K + uy * t + ux * s);
        const f = Math.abs(s) / wide;
        const fade = (1 - t / len) * (1 - f * f);
        if (bayer8(x, y) > fade * 0.9) continue;
        p.set(x, y, b.r[f < 0.2 ? 5 : f < 0.5 ? 4 : 3]);
      }
    }
  }
  return p;
}
