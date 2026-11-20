#!/usr/bin/env node
// Online play, end to end in two headless Chromium pages (one browser context):
//   page A creates a room, page B joins with the code, both play the duel, B reloads mid-duel and comes back
//   (resync from the host's snapshot), then A's player surrenders and both screens reach the result.
//
//   node tools/net-e2e.mjs [--net bc|webrtc] [--moves 14] [--out shots/net]
//
// --net bc (default): the BroadcastChannel transport (src/net/broadcast.ts) — the pages talk inside the browser,
// so the whole game flow (lobby → duel → updates → reconnect → result) runs without network access.
// --net webrtc: the real Trystero / WebRTC path (needs outbound access to the Nostr relays and UDP / STUN).
// Screenshots: <out>/e2e-*.png. Exit code 1 on a failure.

import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const NET = arg('net', 'bc');
const MOVES = Number(arg('moves', '14'));
const OUT = arg('out', 'shots/net');
fs.mkdirSync(path.join(root, OUT), { recursive: true });

function chromePath() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).sort().reverse()) {
      if (/^chromium-\d+$/.test(d)) {
        for (const sub of ['chrome-linux', 'chrome-linux64']) {
          const p = path.join(base, d, sub, 'chrome');
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch {}
  return undefined;
}

const server = await createServer({ root, logLevel: 'error', server: { port: 5900 + Math.floor(Math.random() * 90), host: '127.0.0.1', hmr: false }, clearScreen: false });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: chromePath(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
function watch(page, name) {
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(`[${name}] console.error ${t}`);
    if (/\[net|\[lobby|\[duel\] (refused|the host)/.test(t)) console.log(`[${name}] ${t}`);
  });
}
const A = await ctx.newPage();
const B = await ctx.newPage();
watch(A, 'A');
watch(B, 'B');
const q = `net=${NET}&skipIntro=1&speed=3`;
const shot = (p, name) => p.screenshot({ path: path.join(root, OUT, `e2e-${name}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const fail = (m) => {
  ok = false;
  console.error('FAIL:', m);
};

try {
  await A.goto(`${base}?lobby=create&${q}`);
  await A.waitForFunction(() => window.__neon?.lobby?.hostStatus === 'waiting', null, { timeout: 60000 });
  const code = await A.evaluate(() => window.__neon.lobby.code);
  console.log('room code', code);
  await shot(A, 'A-create');
  await B.goto(`${base}?lobby=join&code=${code}&${q}`);
  // both reach the duel
  for (const [p, n] of [[A, 'A'], [B, 'B']]) {
    await p.waitForFunction(() => window.__neon?.duel && window.__neon.ready === true && window.__neon.duel.launch?.net, null, { timeout: 120000 });
    console.log(n, 'in the duel as', await p.evaluate(() => window.__neon.duel.launch.net.role));
  }
  await Promise.all([A.evaluate(() => window.__neon.duel.idle()), B.evaluate(() => window.__neon.duel.idle())]);
  await shot(A, 'A-duel-start');
  await shot(B, 'B-duel-start');

  /** One move by whichever page's local player (0 on every screen) acts; returns false if nobody could. */
  const policy = () => {
    const D = window.__neon.duel;
    const s = D.state();
    if (s.winner !== null) return 'over';
    const pd = s.pending;
    const acting = pd ? pd.player : s.activePlayer;
    if (acting !== 0 || D.busy()) return 'wait';
    const net = D.launch.net;
    const legal = (net.role === 'guest' ? net.remote.legal(s) : D.legal()) ?? [];
    const mine = legal.filter((a) => a.player === 0);
    const pick = (t) => mine.find((a) => a.type === t);
    const a =
      pick('respond') && mine.find((a) => a.type === 'respond' && a.uid === null) ||
      pick('attack') ||
      pick('normalSummon') ||
      (s.phase === 'main' && s.turn > 1 && pick('enterBattle')) ||
      pick('endBattle') ||
      pick('endTurn') ||
      mine.find((a) => a.type !== 'surrender');
    if (!a) return 'none';
    void D.dispatch(a).catch((e) => console.warn('[e2e] dispatch failed', String(e)));
    return a.type;
  };
  const step = async () => {
    for (let i = 0; i < 400; i++) {
      for (const [p, n] of [[A, 'A'], [B, 'B']]) {
        const r = await p.evaluate(policy);
        if (r !== 'wait' && r !== 'none') return `${n}:${r}`;
      }
      await sleep(100);
    }
    return 'stuck';
  };
  const facts = (p) =>
    p.evaluate(() => {
      const s = window.__neon.duel.state();
      const P = (i) => ({ lp: s.players[i].lp, hand: s.players[i].hand.length, deck: s.players[i].deck.length, mon: s.players[i].monsters.filter(Boolean).length });
      return { turn: s.turn, phase: s.phase, active: s.activePlayer, me: P(0), them: P(1), winner: s.winner };
    });
  const agree = async (label) => {
    // wait until both screens are idle on the same turn, then compare (B's view is A's mirrored)
    await Promise.all([A.evaluate(() => window.__neon.duel.idle()), B.evaluate(() => window.__neon.duel.idle())]);
    const fa = await facts(A);
    const fb = await facts(B);
    const same = fa.turn === fb.turn && fa.phase === fb.phase && fa.active === 1 - fb.active && JSON.stringify(fa.me) === JSON.stringify(fb.them) && JSON.stringify(fa.them) === JSON.stringify(fb.me);
    if (!same) fail(`${label}: screens disagree ${JSON.stringify(fa)} vs ${JSON.stringify(fb)}`);
    return fa;
  };

  let moves = 0;
  let sawGuestMove = false;
  while (moves < MOVES) {
    const r = await step();
    if (r === 'stuck') {
      fail('nobody could move');
      break;
    }
    moves++;
    if (r.startsWith('B:')) sawGuestMove = true;
    console.log('move', moves, r);
    await sleep(300);
    if (moves === Math.floor(MOVES / 2)) {
      await agree('mid-duel');
      await shot(A, 'A-duel-mid');
      await shot(B, 'B-duel-mid');
    }
  }
  if (!sawGuestMove) fail('the guest never moved');
  const before = await agree('before reload');
  console.log('facts before reload', JSON.stringify(before));

  // ---- the guest's app goes away (reload) and comes back with the same code
  await B.goto(`${base}?lobby=join&code=${code}&${q}`);
  await A.waitForFunction(() => document.body && window.__neon.duel.launch.net.host.status !== 'playing', null, { timeout: 20000 }).catch(() => fail('host never saw the guest leave'));
  await shot(A, 'A-opponent-disconnected');
  await B.waitForFunction(() => window.__neon?.duel?.launch?.net && window.__neon.ready === true, null, { timeout: 120000 });
  await A.waitForFunction(() => window.__neon.duel.launch.net.host.status === 'playing', null, { timeout: 30000 }).catch(() => fail('host never saw the guest come back'));
  await sleep(1500);
  const after = await agree('after reconnect');
  if (after.turn !== before.turn || JSON.stringify(after.me) !== JSON.stringify(before.me)) fail('the resumed duel is not where it was');
  await shot(A, 'A-after-reconnect');
  await shot(B, 'B-after-reconnect');
  // a few more moves after the resync
  for (let i = 0; i < 4; i++) console.log('move after resync', await step());
  await agree('after more moves');

  // ---- the host's player surrenders: both reach the result
  const acting = async (p) => p.evaluate(() => {
    const s = window.__neon.duel.state();
    return (s.pending ? s.pending.player : s.activePlayer) === 0;
  });
  for (let i = 0; i < 40 && !(await acting(A)); i++) await step();
  await A.evaluate(() => window.__neon.duel.dispatch({ type: 'surrender', player: 0 }));
  await B.waitForFunction(() => window.__neon.duel.state().winner === 0, null, { timeout: 30000 }).catch(() => fail('the guest never saw the result'));
  await sleep(2500);
  await shot(A, 'A-result');
  await shot(B, 'B-result');
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  if (errors.length) console.log('page errors:\n' + errors.slice(0, 20).join('\n'));
  await browser.close();
  await server.close();
}
console.log(ok ? 'NET E2E OK' : 'NET E2E FAILED');
process.exit(ok ? 0 : 1);
