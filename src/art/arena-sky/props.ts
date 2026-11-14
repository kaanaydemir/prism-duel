// Sky Temple props (v2), painted in code at K× density: banner pillars, floating islands, the prism and
// its beams, floating crystals. Volumes are drawn as real iso solids (two lit faces), lit from the sunset
// (right), with lavender bounce light from the clouds below.

import { type Color, PixelCanvas, mix } from '../pixel';
import { K } from './board2';
import { SKY, bayer8, clamp01, fbm, noise, tone } from './kit';

const hx = (v: string): Color => parseInt(v, 16);
/** Pillar stone: cool grey-violet blocks, warm-lit on the sunset side. */
const PSTONE = ['1c1826', '28232f', '36303d', '453e4c', '554d5c', '665e6c', '78707d', '8b838e', 'a0969d', 'b6aba9', 'cdbfb3'].map(hx);

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
  const ban = (side === 0 ? ['0a1622', '0f2232', '15324a', '1c4562', '255a7a', '307090', '3f86a4'] : ['220410', '3c0819', '5a0a26', '7a0c30', '9a143a', 'b52246', 'c93a54']).map(hx);
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
        let c: Color = cap ? (ay < topY + 1.5 ? SKY.gold[6] : tone(SKY.gold, 0.62, ax, ay)) : tone(PSTONE, 0.86, ax, ay);
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
        let c: Color = tone(PSTONE, clamp01(t), ax, ay);
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
  const bx0 = side === 0 ? cx - 6 * K : cx - 20 * K;
  const bw = 26 * K;
  for (let ax = bx0 - 3 * K; ax < bx0 + bw + 3 * K; ax++) for (let ay = by - K; ay < by + K; ay++) p.set(ax, ay, ax === bx0 - 3 * K || ax === bx0 + bw + 3 * K - 1 ? SKY.gold[2] : SKY.gold[5]);
  for (let ay = by + K; ay < by + bh; ay++) {
    const rel = (ay - by) / bh;
    for (let ax = bx0; ax < bx0 + bw; ax++) {
      const rx = (ax - bx0) / bw;
      if (rel > 0.86 && Math.abs(rx - 0.5) < (rel - 0.86) * 3.6) continue;
      const fold = Math.sin(rx * 9.4 + rel * 2) * 0.5 + 0.5;
      let c: Color = tone(ban, 0.2 + fold * 0.55 + (1 - rel) * 0.1, ax, ay);
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

const IROCK = ['1e1428', '2c1e36', '3c2a46', '4e3756', '614568', '75557a', '8a668b', '9f789a', 'b58ca8', 'c8a0b0'].map(hx);
const GRASS = ['1c2a1e', '26392a', '314a33', '3e5c3b', '4d7044', '5f844d', '769958', '90ad65'].map(hx);
const TREE = ['142218', '1d3122', '28422c', '345536', '426a41', '527d4a', '659056'].map(hx);
const TEMPLE = ['4a3f4c', '6b5d68', '8f7e84', 'b19e9e', 'cdb9b2', 'e3d1c3', 'f3e6d8', 'fff7ec'].map(hx);
const FALL = ['6d7aa6', '93a3c8', 'b7c6e0', 'd6e2f0', 'eef4fa', 'ffffff'].map(hx);

/**
 * A floating island: a craggy rock cone (strata, warm sunlit right side, lilac bounce below), a grassy
 * top with round trees, a classical temple (steps, columns, entablature, pediment) and, for even i, a
 * wide waterfall pouring off the front lip into the clouds. `haze` melts it toward `hazeTo` (distance).
 */
export function paintIsland2(i: number, haze: number, hazeTo: Color): PixelCanvas {
  const R = [52, 40, 60, 44][i % 4];
  const W = (R * 2 + 24) * K;
  const H = (R * 2.6 + 70) * K;
  const p = new PixelCanvas(W, H);
  const cx = W / 2;
  const ty = 56 * K;
  const rx = R * K;
  const ry = R * 0.4 * K;
  const put = (x: number, y: number, c: Color) => p.set(x, y, haze > 0 ? mix(c, hazeTo, haze) : c);
  // rock cone
  for (let ax = cx - rx; ax <= cx + rx; ax++) {
    const f = (ax - cx) / rx;
    const rim = ty + ry * Math.sqrt(Math.max(0, 1 - f * f));
    const spike = Math.abs(noise(ax / (7 * K), i, 81) - 0.5) * 2;
    const depth = (R * 1.55 * (1 - Math.abs(f)) ** 0.75 * (0.6 + spike * 0.5) + 8) * K;
    for (let ay = Math.floor(rim - 2 * K); ay < rim + depth; ay++) {
      const k = (ay - rim) / depth;
      const strata = fbm(ax / (26 * K), ay / (6 * K), 3, 73 + i);
      let t = 0.5 + f * 0.26 - k * 0.3 + (strata - 0.5) * 0.36;
      if (Math.abs(strata - 0.5) < 0.02) t += 0.2;
      if (k < 0.08) t += 0.12; // the lit lip under the grass
      let c = tone(IROCK, clamp01(t), ax, ay);
      if (ay >= rim + depth - 1.5) c = SKY.ink;
      put(ax, ay, c);
    }
  }
  // grass top + a darker front lip
  for (let ay = Math.floor(ty - ry); ay <= ty + ry; ay++)
    for (let ax = cx - rx; ax <= cx + rx; ax++) {
      const e = ((ax - cx) / rx) ** 2 + ((ay - ty) / ry) ** 2;
      if (e > 1) continue;
      let t = 0.5 + ((ax - cx) / rx) * 0.25 + (fbm(ax / 7, ay / 7, 2, 79) - 0.5) * 0.3;
      if (e > 0.8 && ay > ty) t -= 0.25;
      put(ax, ay, tone(GRASS, clamp01(t), ax, ay));
    }
  // round trees round the rim
  const tree = (x: number, y: number, r: number) => {
    for (let ay = y - r; ay <= y + r; ay++)
      for (let ax = x - r; ax <= x + r; ax++) {
        const d = Math.hypot(ax - x, (ay - y) * 1.1) / r;
        if (d > 1) continue;
        const l = ((ax - x) / r) * 0.5 - ((ay - y) / r) * 0.4;
        let t = 0.45 + l * 0.5 + (noise(ax / 3, ay / 3, 91) - 0.5) * 0.25;
        if (d > 0.88) t -= 0.3;
        put(ax, ay, tone(TREE, clamp01(t), ax, ay));
      }
  };
  // a classical temple centred on the top
  const tw = Math.round(rx * 0.9);
  const tx0 = Math.round(cx - tw / 2);
  const tBase = ty + Math.round(ry * 0.2);
  const colH = Math.round(R * 0.46 * K);
  const marble = (x: number, y: number, t: number) => put(x, y, tone(TEMPLE, clamp01(t + ((x - cx) / tw) * 0.25), x, y));
  // trees behind the temple
  tree(tx0 - 2 * K, tBase - 6 * K, 7 * K);
  tree(tx0 + tw + 3 * K, tBase - 4 * K, 8 * K);
  // steps (3)
  for (let st = 0; st < 3; st++) {
    const ext = (3 - st) * 2 * K;
    const y0 = tBase - (st + 1) * 2 * K;
    for (let ax = tx0 - ext; ax < tx0 + tw + ext; ax++) for (let ay = y0; ay < y0 + 2 * K; ay++) marble(ax, ay, ay < y0 + K ? 0.8 : 0.45);
  }
  const floorY = tBase - 6 * K;
  // inner shadow (the cella) behind the columns
  for (let ax = tx0 + 2 * K; ax < tx0 + tw - 2 * K; ax++) for (let ay = floorY - colH; ay < floorY; ay++) put(ax, ay, TEMPLE[1]);
  const cols = Math.max(4, Math.round(tw / (8 * K)));
  for (let c = 0; c < cols; c++) {
    const x0 = Math.round(tx0 + (c + 0.5) * (tw / cols) - 2 * K);
    for (let ay = floorY - colH; ay < floorY; ay++)
      for (let dx = 0; dx < 4 * K; dx++) marble(x0 + dx, ay, dx < K ? 0.9 : dx < 2 * K ? 0.72 : dx < 3 * K ? 0.55 : 0.36);
    for (let dx = -K; dx < 5 * K; dx++) for (let ay = floorY - colH - K; ay < floorY - colH; ay++) marble(x0 + dx, ay, 0.8);
  }
  const eTop = floorY - colH - K;
  for (let ax = tx0 - 3 * K; ax < tx0 + tw + 3 * K; ax++) {
    for (let ay = eTop - 5 * K; ay < eTop; ay++) marble(ax, ay, ay < eTop - 4 * K ? 0.95 : ay < eTop - 2 * K ? 0.62 : 0.4);
    const rel = Math.abs((ax - cx) / (tw / 2 + 3 * K));
    const ph = Math.round((1 - rel) * 11 * K);
    for (let k = 0; k < ph; k++) {
      const edge = k >= ph - K;
      marble(ax, eTop - 5 * K - k, edge ? 0.98 : k < K ? 0.5 : 0.66);
    }
  }
  // trees in front
  tree(tx0 - 6 * K, tBase + 2 * K, 6 * K);
  tree(cx + rx * 0.62, ty + ry * 0.2, 7 * K);
  // waterfall: a wide white sheet off the front lip, mist at the foot
  if (i % 2 === 0) {
    const fx = Math.round(cx + rx * 0.25);
    const fw = 10 * K;
    const top0 = Math.round(ty + ry * 0.9);
    for (let ay = top0; ay < H; ay++)
      for (let dx = 0; dx < fw; dx++) {
        const streak = noise(dx / 2.2, ay / 14 - dx * 0.05, 97);
        let t = 0.55 + (streak - 0.5) * 0.8 - (dx < K || dx >= fw - K ? 0.35 : 0);
        t -= Math.max(0, (ay - top0) / (H - top0) - 0.7) * 0.5;
        put(fx + dx, ay, tone(FALL, clamp01(t), fx + dx, ay));
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
        if (bayer8(x, y) > fade * 1.5) continue;
        p.set(x, y, b.r[f < 0.2 ? 5 : f < 0.5 ? 4 : 3]);
      }
    }
  }
  return p;
}

/** Sparkles (4-point stars) scattered over the sky, and a few birds near the sun. */
export function paintSparkles(): PixelCanvas {
  const W = 800 * K;
  const H = 300 * K;
  const p = new PixelCanvas(W, H);
  let a = 0x51a7;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const star = (x: number, y: number, r: number, c: Color, core: Color) => {
    for (let k = -r; k <= r; k++) {
      p.set(x + k, y, Math.abs(k) < r / 2 ? core : c);
      p.set(x, y + k, Math.abs(k) < r / 2 ? core : c);
    }
    p.set(x, y, SKY.cloud[15]);
  };
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * H);
    const big = rnd() < 0.3;
    const pal = [SKY.crystalCyan, SKY.crystalPink, SKY.gold][i % 3];
    star(x, y, big ? 3 * K : 2 * K, pal[4], pal[6]);
  }
  // birds: small dark Vs drifting near the sun (game x ~ 500–640, y ~ 40–90)
  for (let i = 0; i < 5; i++) {
    const bx = (580 + i * 22 + rnd() * 10) * K;
    const by = (40 + (i % 3) * 9 + rnd() * 6) * K;
    for (let k = 0; k < 4 * K; k++) {
      const y = by - Math.round(Math.sin((k / (4 * K)) * Math.PI) * 1.6 * K);
      p.set(bx - k, y, hx('3a2648'));
      p.set(bx + k, y, hx('3a2648'));
    }
  }
  return p;
}
