#!/usr/bin/env node
// Arena acceptance check (docs/v3/ARENA_ANALIZ.md §4, docs/v3/ARENA_OLCUM.md): ONE fixed measurement of the busy board against
// the frozen target picture, the same masks and the same maths every round. Node only (no Python, no new npm packages).
//
//   node tools/arena-check.mjs [--label NAME] [--arena neon] [--scenario stBoard] [--compare LABEL] [--settle MS] [--retarget]
//
//   --label NAME     output folder shots/arena-check/<NAME>/ (default "now")
//   --arena A        arena query value (default neon); the page is ?dev=steam&s=<scenario>&look=v3&arena=<A>
//   --scenario KEY   staged board (default stBoard, src/dev/previews/steam.ts)
//   --compare LABEL  also print the change of every number against shots/arena-check/<LABEL>/report.json
//   --settle MS      frozen game time before the capture (default 8000; the hologram statues are baked one job per tick and
//                    then drawn in from the head down; if they are not both on screen yet the tool steps on 1/60 s at a
//                    time, then 1 s more, then until both are lit; the time used is printed in report.md)
//   --retarget       recompute the target picture's numbers (otherwise cached in tools/arena-check.target.json)
//
// Capture: headless Chromium at 640×360 (scale 1), the duel restarted on the scenario under the frozen clock
// (tools/lib/pagekit.mjs freshScenarioInPage), stepped to the fixed game time. Then the Duel scene is re-rendered with groups of
// display objects hidden, each group over black AND over white, so every layer has its true alpha (a = 1 − (white − black)/255):
//   full      the frame as the player sees it (every metric of the picture is read from this)
//   arena     Duel-scene objects with depth < DEPTH.CARD_ON_TILE (50) that are not units: hall, stage, floor, lines, fog
//   zone      the zone tiles (textures calm:atlas, nt:floor) → zone-line mask
//   cover     Duel objects with 50 ≤ depth < 2000 that are not floor light (cards, piles, labels, badges, duelists, rims...);
//             floor light (light:v4pool, light:v4shd, duel:shadow4, duel:cast) stays part of the ground
//   u<i>      every monster alone (display objects with a truthy .unit; the card id comes from the texture key mon:<id>)
//   hud       objects with depth ≥ DEPTH.HUD (2000) and every object of the other scenes
//
// Regions (game pixels, recomputed from the game's own geometry every run, so they follow a re-layout):
//   stage top     PLATE_POLY of src/view/board-nt/layout-nt.ts (grid coords → screen with ntIso), imported in the page
//   play surface  stage top − zone lines − cover − monsters (alpha > 0.5, dilated 1 px) − HUD
//   zone lines    zone layer pixels that are opaque and differ by > 15 luma from the zone layer's median, or that touch a
//                 transparent pixel (the tile outline); minus cover and monsters
//   ground ring   per monster: the pixels within 5 px (disk) of its silhouette that lie on the play surface
//   darkest ground  the darkest mean of an 8×8 block (on a 4-px grid) that is ≥ 80 % play surface
//   stage walls   below every down-facing edge of the stage top, the band 6..FACE_H−6 px under the edge (the side armour is
//                 FACE_H tall, layout-nt.ts), minus stage top, cover, HUD
//   hall floor    two rectangles beside the end caps: x [X0−60, X0−8] and [X1+8, X1+60] (X0/X1 = PLATE_X0/X1),
//                 y [c + FACE_H + 6, c + FACE_H + 34], c = y of the left cap's lower vertex (PLATE_OUTLINE[0])
//   back wall     x [F.x + 20, F.x + 120], y [26, F.y + 22] − stage top − HUD, F = right end of the far flat edge
//                 (PLATE_OUTLINE[3]): the brick wall right of the far tip, between the two portrait screens (info only)
//   HUD           UI rects of src/view/layout.ts (phaseBar, p1Panel, p2Panel, hand, buttons, the hint line from HINT_Y)
//                 grown by 2 px, ∪ the HUD layer's alpha > 0.05
//   scene         everything outside the HUD
// The target picture (docs/v3/ref/hedef-neon-son.png, 1672×941, box-resampled to 640×360) uses the hand-set regions of
// tools/arena-check.target.json (their meaning is written there).
//
// Output: stdout table; shots/arena-check/<label>/report.md, report.json (raw numbers + per monster), sheet.png (target |
// build, colour and greyscale, ×2 nearest), layers/*.png (the masks, for checking). Luminance = Rec. 601 (0.299 R + 0.587 G +
// 0.114 B), 0..255.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer, launchBrowser, gotoReady, freshScenarioInPage } from './lib/pagekit.mjs';

const W = 640, H = 360, NPX = W * H;

// ---------------------------------------------------------------- args
const args = { label: 'now', arena: 'neon', scenario: 'stBoard', settle: '8000' };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  args[k] = v;
}
if (args.help) {
  for (const l of fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1)) {
    if (!l.startsWith('//')) break;
    console.log(l.replace(/^\/\/ ?/, ''));
  }
  process.exit(0);
}
const OUT = path.join(ROOT, 'shots/arena-check', args.label);
const TARGET_PNG = path.join(ROOT, 'docs/v3/ref/hedef-neon-son.png');
const TARGET_JSON = path.join(ROOT, 'tools/arena-check.target.json');

// ---------------------------------------------------------------- pixel maths (plain JS)
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
function lumaOf(rgba) {
  const L = new Float32Array(NPX);
  for (let i = 0; i < NPX; i++) L[i] = luma(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2]);
  return L;
}
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}
const mask = () => new Uint8Array(NPX);
const and = (a, b) => a.map((v, i) => v & b[i]);
const or = (a, b) => a.map((v, i) => v | b[i]);
const not = (a) => a.map((v) => 1 - v);
const count = (m) => m.reduce((s, v) => s + v, 0);
function dilate(m, r) {
  const offs = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 0.01) offs.push([dx, dy]);
  const o = mask();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      for (const [dx, dy] of offs) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && X < W && Y >= 0 && Y < H) o[Y * W + X] = 1;
      }
    }
  return o;
}
function polyMask(pts) {
  const m = mask();
  for (let y = 0; y < H; y++) {
    const py = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= py && y1 > py) || (y1 <= py && y0 > py)) xs.push(x0 + ((py - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < Math.min(W, Math.ceil(xs[k + 1] - 0.5)); x++) m[y * W + x] = 1;
  }
  return m;
}
function rectMask(rects) {
  const m = mask();
  for (const [x0, y0, x1, y1] of rects)
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x++) m[y * W + x] = 1;
  return m;
}
function stats(L, m) {
  let n = 0, s = 0, s2 = 0;
  const vals = [];
  for (let i = 0; i < NPX; i++) if (m[i]) { n++; s += L[i]; s2 += L[i] * L[i]; vals.push(L[i]); }
  if (!n) return { n: 0, mean: NaN, std: NaN, median: NaN, p1: NaN, min: NaN };
  vals.sort((a, b) => a - b);
  const mean = s / n;
  return { n, mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), median: vals[n >> 1], p1: vals[Math.floor(n * 0.01)], min: vals[0] };
}
function colourOf(rgba, m) {
  const ch = [[], [], []];
  for (let i = 0; i < NPX; i++) if (m[i]) for (let c = 0; c < 3; c++) ch[c].push(rgba[4 * i + c]);
  if (!ch[0].length) return { hex: '-', hue: NaN, sat: NaN };
  const med = ch.map((a) => (a.sort((p, q) => p - q), a[a.length >> 1]));
  const [h, s] = hsv(...med);
  return { hex: '#' + med.map((v) => v.toString(16).padStart(2, '0')).join(''), hue: h, sat: s };
}
function shares(rgba, m) {
  let n = 0, cy = 0, rd = 0, warm = 0;
  for (let i = 0; i < NPX; i++) {
    if (!m[i]) continue;
    n++;
    const [h, s, v] = hsv(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2]);
    const vivid = s > 0.4 && v > 0.4;
    if (vivid && h >= 160 && h < 215) cy++;
    if (vivid && (h < 20 || h >= 330)) rd++;
    if ((h <= 50 || h >= 345) && s > 0.35 && v > 0.35) warm++;
  }
  return { cyanRed: (100 * (cy + rd)) / n, cyan: (100 * cy) / n, red: (100 * rd) / n, warm: (100 * warm) / n };
}
/** Hasler & Süsstrunk colourfulness (shots/arena-analysis/historian/data/metrics.py). */
function colourfulness(rgba, m) {
  const rg = [], yb = [];
  for (let i = 0; i < NPX; i++) {
    if (!m[i]) continue;
    const r = rgba[4 * i], g = rgba[4 * i + 1], b = rgba[4 * i + 2];
    rg.push(r - g); yb.push(0.5 * (r + g) - b);
  }
  const ms = (a) => { const mu = a.reduce((s, v) => s + v, 0) / a.length; return [mu, Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / a.length)]; };
  const [mr, sr] = ms(rg), [my, sy] = ms(yb);
  return Math.hypot(sr, sy) + 0.3 * Math.hypot(mr, my);
}
const fromAlpha = (a, thr) => a.map((v) => (v > thr * 255 ? 1 : 0));

/**
 * The numbers. Inputs: rgba (640×360 frame), and masks: stageTop, hud, zoneLines, cover (non-ground objects on the board),
 * mons [{id, sil}], wall, hall, back.
 */
function measure(rgba, R) {
  const L = lumaOf(rgba);
  const scene = not(R.hud);
  let allMon = mask();
  for (const m of R.mons) allMon = or(allMon, m.sil);
  const monGrow = dilate(allMon, 1);
  const stage = and(R.stageTop, scene);
  const play = and(and(stage, not(R.zoneLines)), and(not(R.cover), not(monGrow)));
  const per = [];
  let rings = mask();
  for (const m of R.mons) {
    const ring = and(dilate(m.sil, 5), play);
    rings = or(rings, ring);
    const ms = stats(L, m.sil), gs = stats(L, ring);
    per.push({ id: m.id, monL: ms.mean, groundL: gs.mean, groundStd: gs.std, diff: ms.mean - gs.mean, ringPx: gs.n, silPx: ms.n });
  }
  const g = stats(L, rings);
  // the same rings with the cards under / beside the monsters counted as ground (what the feet stand on), lines still out
  let ringsAll = mask();
  const onStage = and(and(stage, not(R.zoneLines)), not(monGrow));
  for (const m of R.mons) ringsAll = or(ringsAll, and(dilate(m.sil, 5), onStage));
  const gAll = stats(L, ringsAll);
  // darkest ground TONE: the darkest mean of an 8×8 block (4-px grid) that is ≥ 80 % play surface (single outline / gap
  // pixels are not ground)
  let darkBlock = Infinity;
  for (let y0 = 0; y0 + 8 <= H; y0 += 4)
    for (let x0 = 0; x0 + 8 <= W; x0 += 4) {
      let n = 0, s = 0;
      for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) if (play[y * W + x]) { n++; s += L[y * W + x]; }
      if (n >= 52 && s / n < darkBlock) darkBlock = s / n;
    }
  const surf = colourOf(rgba, play);
  const monMed = stats(L, allMon).median;
  const zl = stats(L, and(R.zoneLines, and(scene, not(monGrow))));
  const stageNoObj = and(stage, not(monGrow)); // stage top incl. its lines, without the monsters
  const sh = shares(rgba, and(stageNoObj, not(R.cover)));
  const scSh = shares(rgba, scene);
  const hall = stats(L, and(R.hall, scene)), wall = stats(L, and(R.wall, scene)), back = stats(L, and(R.back, scene));
  const stageS = stats(L, stage), surround = stats(L, and(not(R.stageTop), scene));
  const ps = stats(L, play);
  const worst = per.reduce((a, b) => (b.diff < a.diff ? b : a), per[0]);
  return {
    groundL: g.mean, groundSpread: g.std, groundPx: g.n, groundInclCardsL: gAll.mean, groundInclCardsSpread: gAll.std,
    surfaceHex: surf.hex, surfaceHue: surf.hue, surfaceSat: surf.sat, surfaceL: ps.mean,
    monMinusGroundAvg: per.reduce((s, p) => s + p.diff, 0) / per.length, monMinusGroundWorst: worst.diff, worstMonster: worst.id,
    monsterMedianL: monMed, zoneLineL: zl.median, zoneLineMinusMonsters: zl.median - monMed, zoneLinePx: zl.n,
    vividCyanRedPct: sh.cyanRed, vividCyanPct: sh.cyan, vividRedPct: sh.red,
    hallL: hall.mean, hallPx: hall.n, wallL: wall.mean, wallPx: wall.n, backWallL: back.mean,
    warmPct: scSh.warm, colourfulness: colourfulness(rgba, scene),
    stageL: stageS.mean, surroundL: surround.mean, surroundMinusStage: surround.mean - stageS.mean,
    darkestGround: darkBlock, darkestGroundP1: ps.p1, darkestGroundMin: ps.min, playSurfacePx: ps.n,
    perMonster: per,
  };
}

// ---------------------------------------------------------------- goals (ARENA_ANALIZ.md §4)
const f1 = (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(1) : String(v));
const f2 = (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(2) : String(v));
const ROWS = [
  { k: 'groundL', name: 'Ground L under monsters (5-px ring)', goal: '30–40 (34–37)', ok: (v) => v >= 30 && v <= 40, f: f1 },
  { k: 'groundSpread', name: 'Ground spread round monsters (std L)', goal: '≤ 10', ok: (v) => v <= 10, f: f1 },
  { k: 'surfaceHue', name: 'Play-surface hue (median colour, °)', goal: '230–240', ok: (v) => v >= 230 && v <= 240, f: (v) => f1(v) },
  { k: 'surfaceSat', name: 'Play-surface saturation (HSV)', goal: '0.35–0.45', ok: (v) => v >= 0.35 && v <= 0.45, f: f2 },
  { k: 'monMinusGroundAvg', name: 'Monster − ground, average', goal: '≥ +40', ok: (v) => v >= 40, f: f1 },
  { k: 'monMinusGroundWorst', name: 'Monster − ground, worst', goal: '≥ +20', ok: (v) => v >= 20, f: f1, extra: 'worstMonster' },
  { k: 'zoneLineMinusMonsters', name: 'Zone lines − monsters median L', goal: '< 0', ok: (v) => v < 0, f: f1 },
  { k: 'vividCyanRedPct', name: 'Vivid cyan + red on the stage top %', goal: '≤ 11', ok: (v) => v <= 11, f: f1 },
  { k: 'hallL', name: 'Hall floor L', goal: '52–68', ok: (v) => v >= 52 && v <= 68, f: f1 },
  { k: 'wallL', name: 'Stage walls L', goal: '45–55', ok: (v) => v >= 45 && v <= 55, f: f1 },
  { k: 'warmPct', name: 'Warm-light share of the scene %', goal: '≥ 15', ok: (v) => v >= 15, f: f1 },
  { k: 'colourfulness', name: 'Colourfulness of the scene', goal: '≥ 85', ok: (v) => v >= 85, f: f1 },
  { k: 'surroundMinusStage', name: 'Surround L − stage L', goal: '≥ 0', ok: (v) => v >= 0, f: f1 },
  { k: 'darkestGround', name: 'Darkest ground (darkest 8×8 block of play surface)', goal: '≥ 28', ok: (v) => v >= 28, f: f1 },
];
const INFO = [
  ['surfaceHex', 'Play-surface median colour'], ['surfaceL', 'Play-surface mean L'], ['monsterMedianL', 'Monsters median L'],
  ['zoneLineL', 'Zone lines median L'], ['backWallL', 'Back wall L'], ['stageL', 'Stage top mean L'], ['surroundL', 'Surround mean L'],
  ['darkestGroundP1', 'Darkest ground pixel (1st percentile)'], ['groundInclCardsL', 'Ground L in the ring, cards counted as ground'],
  ['groundInclCardsSpread', 'Ground spread, cards counted as ground'], ['zoneLinePx', 'Zone-line pixels measured'], ['groundPx', 'Ring pixels measured'],
];

// ---------------------------------------------------------------- page side
async function captureInPage({ settle }) {
  const N = window.__neon;
  const g = N.game, r = g.renderer;
  const scenes = g.scene.getScenes(true);
  const duel = scenes.find((s) => s.sys.settings.key === 'Duel') ?? scenes[0];
  const all = [];
  scenes.forEach((sc) => sc.children.list.forEach((o) => o.setVisible && all.push({ o, sc })));
  const key = (o) => (o.texture && o.texture.key) || '';
  // the two hologram creatures: Duel-scene Images showing a baked frame "f<n>" in the hologram depth band (12..19)
  const holos = () => duel.children.list.filter((o) => o.visible && o.type === 'Image' && /^f\d+$/.test(String(o.frame && o.frame.name)) && o.depth >= 12 && o.depth < 19);
  // fixed game time, then 1/60 s steps until both hologram statues are on screen (they bake, materialise, and flicker)
  const t0 = performance.now();
  await N.step(settle);
  let extra = 0;
  // (they bake one job per tick, then draw in from the head down in ~520 ms; give them 1 s more after the first sight, then
  // step on until both are lit again: they flicker)
  while (holos().length < 2 && extra < 6000) { await N.step(1000 / 60); extra += 1000 / 60; }
  if (extra > 0) { await N.step(1000); extra += 1000; }
  while (holos().length < 2 && extra < 9000) { await N.step(1000 / 60); extra += 1000 / 60; }
  // re-collect (objects may have been created while stepping)
  all.length = 0;
  scenes.forEach((sc) => sc.children.list.forEach((o) => o.setVisible && all.push({ o, sc, vis: o.visible })));
  const live = all.filter((e) => e.vis);
  const units = live.filter((e) => e.o.unit).map((e) => e.o);
  const cam = duel.cameras.main;
  const bg0 = cam.backgroundColor ? cam.backgroundColor.rgba : 'rgba(0,0,0,1)';
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 360;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const render = (pred, bg) => {
    for (const e of live) e.o.setVisible(!!pred(e.o, e.sc));
    cam.setBackgroundColor(bg);
    r.preRender(); g.events.emit('prerender', r, g.loop.now, g.loop.delta); g.scene.render(r); r.postRender();
    ctx.clearRect(0, 0, 640, 360);
    ctx.drawImage(g.canvas, 0, 0, 640, 360);
    return ctx.getImageData(0, 0, 640, 360).data;
  };
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const alpha = (pred) => {
    const k = render(pred, '#000000').slice(), w = render(pred, '#ffffff');
    const a = new Uint8Array(640 * 360);
    for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(255, 255 - Math.round((w[4 * i] - k[4 * i] + w[4 * i + 1] - k[4 * i + 1] + w[4 * i + 2] - k[4 * i + 2]) / 3)));
    return b64(a);
  };
  const isDuel = (sc) => sc === duel;
  const FLOORLIGHT = /^(light:v4pool|light:v4shd|duel:shadow4|duel:cast)/;
  const out = { canvas: [g.canvas.width, g.canvas.height], settleMs: settle + extra, holos: holos().length, units: [] };
  out.full = b64(new Uint8Array(render(() => true, bg0).buffer.slice(0)));
  out.arena = b64(new Uint8Array(render((o, sc) => isDuel(sc) && !o.unit && o.depth < 50, bg0).buffer.slice(0)));
  out.zone = alpha((o, sc) => isDuel(sc) && /^(nt:floor|calm:atlas)/.test(key(o)));
  out.zoneRgb = b64(new Uint8Array(render((o, sc) => isDuel(sc) && /^(nt:floor|calm:atlas)/.test(key(o)), '#000000').buffer.slice(0)));
  out.cover = alpha((o, sc) => isDuel(sc) && !o.unit && o.depth >= 50 && o.depth < 2000 && !FLOORLIGHT.test(key(o)));
  out.hud = alpha((o, sc) => !isDuel(sc) || o.depth >= 2000);
  for (const u of units) {
    const m = /^mon:([a-z0-9_]+)/.exec(key(u));
    out.units.push({ id: m ? m[1] : key(u), key: key(u), x: u.x, y: u.y, a: alpha((o) => o === u) });
  }
  for (const e of all) e.o.setVisible(e.vis);
  cam.setBackgroundColor(bg0);
  // geometry of the game itself
  const lay = await import('/src/view/layout.ts');
  const nt = await import('/src/view/board-nt/layout-nt.ts');
  const scr = (p) => { const s = nt.ntIso(p[0], p[1]); return [s.x, s.y]; };
  out.geo = {
    poly: nt.PLATE_POLY.map(scr), outline: nt.PLATE_OUTLINE.map(scr), faceH: nt.FACE_H, x0: nt.PLATE_X0, x1: nt.PLATE_X1,
    ui: lay.UI, hintY: lay.HINT_Y, boardV4: lay.BOARD_V4,
  };
  out.realMs = performance.now() - t0;
  return out;
}

async function loadTargetInPage(url) {
  const bm = await createImageBitmap(await (await fetch(url)).blob());
  const cv = document.createElement('canvas');
  cv.width = bm.width; cv.height = bm.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(bm, 0, 0);
  const d = ctx.getImageData(0, 0, bm.width, bm.height).data;
  let s = '';
  for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
  return { w: bm.width, h: bm.height, data: btoa(s) };
}

async function sheetInPage({ a, b, title }) {
  const dec = (s) => Uint8ClampedArray.from(atob(s), (c) => c.charCodeAt(0));
  const S = 2, HEAD = 28;
  const cv = document.createElement('canvas');
  cv.width = 2 * 640 * S; cv.height = HEAD + 2 * 360 * S;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#101018'; ctx.fillRect(0, 0, cv.width, cv.height);
  const tmp = document.createElement('canvas'); tmp.width = 640; tmp.height = 360;
  const tc = tmp.getContext('2d');
  [a, b].forEach((src, col) => {
    const px = dec(src);
    for (const grey of [false, true]) {
      const img = new ImageData(640, 360);
      for (let i = 0; i < 640 * 360; i++) {
        const r = px[4 * i], g = px[4 * i + 1], bb = px[4 * i + 2];
        const L = Math.round(0.299 * r + 0.587 * g + 0.114 * bb);
        img.data[4 * i] = grey ? L : r; img.data[4 * i + 1] = grey ? L : g; img.data[4 * i + 2] = grey ? L : bb; img.data[4 * i + 3] = 255;
      }
      tc.putImageData(img, 0, 0);
      ctx.drawImage(tmp, col * 640 * S, HEAD + (grey ? 360 * S : 0), 640 * S, 360 * S);
    }
  });
  ctx.fillStyle = '#e8e8f0'; ctx.font = 'bold 18px monospace'; ctx.textBaseline = 'middle';
  ctx.fillText(title[0], 10, HEAD / 2); ctx.fillText(title[1], 640 * S + 10, HEAD / 2);
  return cv.toDataURL('image/png');
}

async function pngInPage({ rgba }) {
  const px = Uint8ClampedArray.from(atob(rgba), (c) => c.charCodeAt(0));
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
  cv.getContext('2d').putImageData(new ImageData(px, 640, 360), 0, 0);
  return cv.toDataURL('image/png');
}

// ---------------------------------------------------------------- node helpers
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');

/** Area-weighted box resample of an RGBA image to 640×360 (the size the owner sees: one sample = one game pixel). */
function boxResample(src, sw, sh) {
  const out = new Uint8ClampedArray(NPX * 4);
  const fx = sw / W, fy = sh / H;
  for (let y = 0; y < H; y++) {
    const y0 = y * fy, y1 = (y + 1) * fy;
    for (let x = 0; x < W; x++) {
      const x0 = x * fx, x1 = (x + 1) * fx;
      const acc = [0, 0, 0];
      let wsum = 0;
      for (let sy = Math.floor(y0); sy < Math.min(sh, Math.ceil(y1)); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.min(sw, Math.ceil(x1)); sx++) {
          const w = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const j = 4 * (sy * sw + sx);
          acc[0] += w * src[j]; acc[1] += w * src[j + 1]; acc[2] += w * src[j + 2];
          wsum += w;
        }
      }
      const i = 4 * (y * W + x);
      out[i] = Math.round(acc[0] / wsum); out[i + 1] = Math.round(acc[1] / wsum); out[i + 2] = Math.round(acc[2] / wsum); out[i + 3] = 255;
    }
  }
  return out;
}

/** Regions of the build from the captured layers and the game's geometry (see the header). */
function buildRegions(cap) {
  const G = cap.geo;
  const ui = G.ui;
  const hudRects = ['phaseBar', 'p1Panel', 'p2Panel', 'hand', 'buttons'].map((k) => ui[k]).filter(Boolean)
    .map((r) => [r.x - 2, r.y - 2, r.x + r.w + 2, r.y + r.h + 2]);
  hudRects.push([ui.hand.x, G.hintY - 2, ui.hand.x + ui.hand.w, ui.hand.y]); // the hint line plate above the hand
  const hud = or(rectMask(hudRects), fromAlpha(unb64(cap.hud), 0.05));
  const stageTop = polyMask(G.poly);
  const cover = fromAlpha(unb64(cap.cover), 0.5);
  const mons = cap.units.map((u) => ({ id: u.id, sil: fromAlpha(unb64(u.a), 0.5) }));
  let allMon = mask();
  for (const m of mons) allMon = or(allMon, m.sil);
  // zone lines: the tile outline (opaque next to transparent) and pixels far from the zone layer's median tone
  const za = unb64(cap.zone), zr = unb64(cap.zoneRgb);
  const zop = fromAlpha(za, 0.5);
  const zl = [];
  for (let i = 0; i < NPX; i++) if (zop[i]) zl.push(luma(zr[4 * i], zr[4 * i + 1], zr[4 * i + 2]) / (za[i] / 255));
  zl.sort((a, b) => a - b);
  const zmed = zl.length ? zl[zl.length >> 1] : 0;
  const zoneLines = mask();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!zop[i]) continue;
      const Lz = luma(zr[4 * i], zr[4 * i + 1], zr[4 * i + 2]) / (za[i] / 255);
      const edge = (x > 0 && !zop[i - 1]) || (x < W - 1 && !zop[i + 1]) || (y > 0 && !zop[i - W]) || (y < H - 1 && !zop[i + W]);
      if (edge || Math.abs(Lz - zmed) > 15) zoneLines[i] = 1;
    }
  const zoneVis = and(zoneLines, and(not(cover), not(dilate(allMon, 1))));
  // stage walls: under every down-facing edge of the stage top
  const P = G.poly, fh = G.faceH;
  const wallPolys = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    if (Math.abs(q[0] - p[0]) < 1) continue; // vertical end caps have no face below
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 3];
    if (polyMask([[mid[0] - 0.5, mid[1] - 0.5], [mid[0] + 0.5, mid[1] - 0.5], [mid[0] + 0.5, mid[1] + 0.5], [mid[0] - 0.5, mid[1] + 0.5]]).some((v, j) => v && stageTop[j])) continue;
    wallPolys.push([[p[0], p[1] + 6], [q[0], q[1] + 6], [q[0], q[1] + fh - 6], [p[0], p[1] + fh - 6]]);
  }
  let wall = mask();
  for (const wp of wallPolys) wall = or(wall, polyMask(wp));
  wall = and(wall, and(not(stageTop), not(cover)));
  const O = G.outline;
  const capL = O[0][1];
  const hallRects = [
    [G.x0 - 60, capL + fh + 6, G.x0 - 8, capL + fh + 34],
    [G.x1 + 8, capL + fh + 6, G.x1 + 60, capL + fh + 34], // same height as the left one (beside the right wall, clear of the brazier)
  ];
  const hall = and(rectMask(hallRects), not(stageTop));
  const backRects = [[O[3][0] + 20, 26, O[3][0] + 120, O[3][1] + 22]]; // the brick wall right of the far tip, between the screens
  const back = and(rectMask(backRects), not(stageTop));
  return { hud, stageTop, cover, mons, zoneLines: zoneVis, wall, hall, back, doc: { hudRects, hallRects, backRects, wallPolys, zoneMedianL: zmed, poly: P } };
}

/** Regions of the target from tools/arena-check.target.json (640×360 pixel coords). */
function targetRegions(rgba, T) {
  const hud = rectMask(T.hud);
  const stageTop = polyMask(T.stageTop);
  const surface = rectMask(T.surface);
  // ground colours: medians of the hand-set bare-surface rectangles
  const sv = [[], [], []];
  for (let i = 0; i < NPX; i++) if (surface[i]) for (let c = 0; c < 3; c++) sv[c].push(rgba[4 * i + c]);
  const ref = sv.map((a) => (a.sort((p, q) => p - q), a[a.length >> 1]));
  const coverT = rectMask(T.cover);
  const mons = T.monsters.map((mm) => {
    const box = rectMask([mm.box]);
    const sil = mask();
    for (let i = 0; i < NPX; i++) {
      if (!box[i]) continue;
      const d = Math.hypot(rgba[4 * i] - ref[0], rgba[4 * i + 1] - ref[1], rgba[4 * i + 2] - ref[2]);
      if (d > T.bodyDistance && !coverT[i]) sil[i] = 1;
    }
    return { id: mm.id, sil };
  });
  // zone lines of the target: vivid cyan / red neon on the stage top (the target's zones are neon outlines)
  const zoneLines = mask();
  for (let i = 0; i < NPX; i++) {
    if (!stageTop[i]) continue;
    const [h, s, v] = hsv(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2]);
    if (s > 0.4 && v > 0.3 && ((h >= 160 && h < 215) || h < 20 || h >= 330)) zoneLines[i] = 1;
  }
  let allMon = mask();
  for (const m of mons) allMon = or(allMon, m.sil);
  const cover = and(rectMask(T.cover), not(allMon));
  return { hud, stageTop, cover, mons, zoneLines: and(zoneLines, not(dilate(allMon, 1))), wall: rectMask(T.wall), hall: rectMask(T.hall), back: rectMask(T.back) };
}

function maskPng(page, rgba, R) {
  // false-colour check image: play surface green, rings yellow, zone lines cyan, cover grey, walls magenta, hall orange,
  // back wall red, HUD dark blue, monsters white; over the dimmed frame
  const o = new Uint8Array(NPX * 4);
  let allMon = mask();
  for (const m of R.mons) allMon = or(allMon, m.sil);
  const play = and(and(and(R.stageTop, not(R.hud)), not(R.zoneLines)), and(not(R.cover), not(dilate(allMon, 1))));
  let rings = mask();
  for (const m of R.mons) rings = or(rings, and(dilate(m.sil, 5), play));
  for (let i = 0; i < NPX; i++) {
    let c = [rgba[4 * i] * 0.35, rgba[4 * i + 1] * 0.35, rgba[4 * i + 2] * 0.35];
    if (R.hud[i]) c = [20, 30, 90];
    else if (allMon[i]) c = [255, 255, 255];
    else if (rings[i]) c = [255, 230, 0];
    else if (R.zoneLines[i]) c = [0, 220, 255];
    else if (play[i]) c = [c[0] * 0.5, 90 + c[1], c[2] * 0.5];
    else if (R.cover[i] && R.stageTop[i]) c = [110, 110, 110];
    else if (R.wall[i]) c = [230, 0, 230];
    else if (R.hall[i]) c = [255, 140, 0];
    else if (R.back[i]) c = [230, 40, 40];
    o[4 * i] = c[0]; o[4 * i + 1] = c[1]; o[4 * i + 2] = c[2]; o[4 * i + 3] = 255;
  }
  return page.evaluate(pngInPage, { rgba: b64(o) });
}
const writeDataUrl = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));

// ---------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(path.join(OUT, 'layers'), { recursive: true });
  const { server, base } = await startServer();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let code = 0;
  try {
    const query = `?dev=steam&s=${encodeURIComponent(args.scenario)}&look=v3&arena=${encodeURIComponent(args.arena)}`;
    await gotoReady(page, base + query);
    await page.evaluate(freshScenarioInPage, args.scenario);
    const cap = await page.evaluate(captureInPage, { settle: Number(args.settle) });
    if (cap.canvas[0] !== 640 || cap.canvas[1] !== 360) console.warn(`[arena-check] canvas is ${cap.canvas.join('×')}, resampled to 640×360`);
    if (cap.holos < 2) console.warn(`[arena-check] only ${cap.holos} hologram statue(s) visible at ${cap.settleMs} ms`);
    const full = unb64(cap.full);
    const R = buildRegions(cap);
    const build = measure(full, R);

    // target: hand-set regions, numbers cached in the JSON
    const T = JSON.parse(fs.readFileSync(TARGET_JSON, 'utf8'));
    const tImg = await page.evaluate(loadTargetInPage, '/docs/v3/ref/hedef-neon-son.png');
    const t640 = boxResample(unb64(tImg.data), tImg.w, tImg.h);
    const TR = targetRegions(t640, T);
    if (args.retarget || !T.cache) {
      const m = measure(t640, TR);
      T.cache = { computed: new Date().toISOString().slice(0, 10), source: `${path.basename(TARGET_PNG)} ${tImg.w}×${tImg.h} box→640×360`, metrics: m };
      fs.writeFileSync(TARGET_JSON, JSON.stringify(T, null, 1) + '\n');
    }
    const target = T.cache.metrics;

    // images
    writeDataUrl(path.join(OUT, 'layers/full.png'), await page.evaluate(pngInPage, { rgba: cap.full }));
    writeDataUrl(path.join(OUT, 'layers/arena.png'), await page.evaluate(pngInPage, { rgba: cap.arena }));
    writeDataUrl(path.join(OUT, 'layers/masks.png'), await maskPng(page, full, R));
    writeDataUrl(path.join(OUT, 'layers/target-masks.png'), await maskPng(page, t640, TR));
    const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
    writeDataUrl(path.join(OUT, 'sheet.png'), await page.evaluate(sheetInPage, {
      a: b64(new Uint8Array(t640.buffer)), b: cap.full,
      title: ['TARGET  docs/v3/ref/hedef-neon-son.png', `BUILD  ${args.label}  ${date}  ${args.scenario} arena=${args.arena}`],
    }));

    // report
    let prev = null;
    if (args.compare) {
      try { prev = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots/arena-check', args.compare, 'report.json'), 'utf8')).build; }
      catch { console.warn(`[arena-check] no report for --compare ${args.compare}`); }
    }
    const head = ['metric', 'goal', 'target picture', 'this build', 'pass/fail'];
    if (prev) head.push(`Δ vs ${args.compare}`);
    const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
    let passN = 0;
    for (const row of ROWS) {
      const v = build[row.k], tv = target[row.k];
      const ok = row.ok(v);
      passN += ok ? 1 : 0;
      const cells = [row.name, row.goal, row.f(tv) + (row.extra ? ` (${target[row.extra]})` : ''), row.f(v) + (row.extra ? ` (${build[row.extra]})` : ''), ok ? 'PASS' : 'FAIL'];
      if (prev) cells.push(typeof prev[row.k] === 'number' ? (v - prev[row.k] >= 0 ? '+' : '') + (v - prev[row.k]).toFixed(2) : '-');
      lines.push(`| ${cells.join(' | ')} |`);
    }
    const info = ['', '| info | target picture | this build |' + (prev ? ` Δ vs ${args.compare} |` : ''), '|---|---|---|' + (prev ? '---|' : '')];
    for (const [k, name] of INFO) {
      const v = build[k];
      info.push(`| ${name} | ${f1(target[k])} | ${f1(v)} |` + (prev ? ` ${typeof v === 'number' ? (v - prev[k] >= 0 ? '+' : '') + (v - prev[k]).toFixed(2) : '-'} |` : ''));
    }
    const permon = ['', '| monster | monster L | ground L | ground std | monster − ground |', '|---|---|---|---|---|',
      ...build.perMonster.map((p) => `| ${p.id} | ${f1(p.monL)} | ${f1(p.groundL)} | ${f1(p.groundStd)} | ${f1(p.diff)} |`)];
    const summary = `${passN} / ${ROWS.length} pass`;
    const md = [
      `# arena-check: ${args.label}`, '',
      `${date} · \`?dev=steam&s=${args.scenario}&look=v3&arena=${args.arena}\` · frozen game time ${cap.settleMs.toFixed(0)} ms · holograms visible ${cap.holos} · ${summary}`, '',
      ...lines, ...info, ...permon, '',
      'Method and regions: tools/arena-check.mjs header, docs/v3/ARENA_OLCUM.md. Masks: layers/masks.png (build), layers/target-masks.png.',
    ].join('\n');
    fs.writeFileSync(path.join(OUT, 'report.md'), md + '\n');
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
      label: args.label, date, query: `?dev=steam&s=${args.scenario}&look=v3&arena=${args.arena}`, settleMs: cap.settleMs, holos: cap.holos,
      pass: passN, of: ROWS.length, build, target, regions: R.doc, pageErrors: errors,
    }, null, 1) + '\n');
    console.log(lines.join('\n'));
    console.log(info.join('\n'));
    console.log(permon.join('\n'));
    console.log(`\n${summary} · wrote ${path.relative(ROOT, OUT)}/report.md, report.json, sheet.png, layers/`);
    if (errors.length) { console.error('[arena-check] page errors:\n' + errors.join('\n')); }
  } catch (e) {
    console.error(e);
    code = 1;
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(code);
}
main();
