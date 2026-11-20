// Sky Temple AMBIENCE — the air high above the clouds, quiet under the music (synthesized, no files). The Neon Tower's
// room tone (ambience.ts) is a stone hall with torches; up here there is no room at all:
//
//   wind      two bands of pink noise (a low airy body and a thin high whistle), their filters wandering on slow LFOs,
//             the whole bed swelling in irregular gusts (two LFOs at unrelated rates) — wide in the stereo field
//   chimes    the temple's wind chimes, far off: every 4–9 s a cluster of one to three bell tones from a pentatonic
//             set (inharmonic partials 1 · 2.76 · 5.4, long ringing decays), each panned somewhere else
//   birds     every 10–18 s a short call far away: two or three quick chirps (sine sweeps in the 2.6–4.4 kHz band)
//   gust()    a big moment on the board (BoardView.crowd: a cheer / a roar) — the wind rises and falls once
//   themes    Volcano: a deep warm rumble under the wind, no birds; Tidal Bay: slow surf far below
//
// The bus: its own gain → the music DUCK node, a little into the reverb send (the chimes ring into it). The level follows
// the sfx volume and the master mute. Every call is a silent no-op without live audio.

import { noiseBuffer, peekLive, safe } from './engine';
import { sfx } from './sfx';

export type SkyAmbienceTheme = 'none' | 'fire' | 'water';

const LEVEL = 0.5;
/** Pentatonic chime pitches (Hz): a high, open set. */
const CHIME = [1046.5, 1174.7, 1396.9, 1568, 1760, 2093, 2349.3];

interface Graph {
  ctx: AudioContext;
  out: GainNode;
  wind: GainNode;
  rumble: GainNode;
  surf: GainNode;
  chimeBus: GainNode;
  sources: AudioScheduledSourceNode[];
}

let g: Graph | null = null;
let wanted = false;
let theme: SkyAmbienceTheme = 'none';
let shownLevel = -1;
let nextChime = 0;
let nextBird = 0;
let seed = 0x7a3d1;

function rnd(): number {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function panner(ctx: AudioContext, pan: number, to: AudioNode): AudioNode {
  const c = ctx as AudioContext & { createStereoPanner?: () => StereoPannerNode };
  if (!c.createStereoPanner) return to;
  const p = c.createStereoPanner();
  p.pan.value = pan;
  p.connect(to);
  return p;
}

function build(): Graph | null {
  const a = peekLive();
  if (!a || a.ctx.state !== 'running') return null;
  const ctx = a.ctx;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(a.chain.duck);
  const send = ctx.createGain();
  send.gain.value = 0.22;
  out.connect(send).connect(a.chain.send);
  const sources: AudioScheduledSourceNode[] = [];
  const lfo = (rate: number, depth: number, param: AudioParam, phase = 0): void => {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const k = ctx.createGain();
    k.gain.value = depth;
    o.connect(k).connect(param);
    o.start(now + phase);
    sources.push(o);
  };
  const loop = (kind: 'white' | 'pink' | 'brown', to: AudioNode, offset: number, rate = 1): void => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx, kind);
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(to);
    s.start(now, offset);
    sources.push(s);
  };

  // ---- wind: the gust envelope (two slow LFOs) over a low airy body and a thin high whistle, left and right apart
  const wind = ctx.createGain();
  wind.gain.value = 0.6;
  wind.connect(out);
  lfo(1 / 9.3, 0.22, wind.gain);
  lfo(1 / 23.7, 0.16, wind.gain, 1.7);
  for (const [pan, off, rate] of [
    [-0.55, 0.2, 1],
    [0.55, 1.9, 0.93],
  ] as const) {
    const body = ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 420;
    body.Q.value = 0.7;
    const bg = ctx.createGain();
    bg.gain.value = 0.09;
    body.connect(bg).connect(panner(ctx, pan, wind));
    lfo(1 / (13 + off * 3), 180, body.frequency, off);
    loop('pink', body, off, rate);
    const whistle = ctx.createBiquadFilter();
    whistle.type = 'bandpass';
    whistle.frequency.value = 1700;
    whistle.Q.value = 7;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    whistle.connect(wg).connect(panner(ctx, pan * 0.6, wind));
    lfo(1 / (7.1 + off), 420, whistle.frequency, off * 0.7);
    lfo(1 / (11.3 + off), 0.03, wg.gain, off);
    loop('white', whistle, off + 0.6, rate * 1.05);
  }

  // ---- theme beds (silent until a Field Spell asks for them)
  const rlp = ctx.createBiquadFilter();
  rlp.type = 'lowpass';
  rlp.frequency.value = 85;
  rlp.Q.value = 1;
  const rumble = ctx.createGain();
  rumble.gain.value = 0;
  rlp.connect(rumble).connect(out);
  loop('brown', rlp, 0.9, 0.7);
  const slp = ctx.createBiquadFilter();
  slp.type = 'lowpass';
  slp.frequency.value = 650;
  const sAmp = ctx.createGain();
  sAmp.gain.value = 0.5;
  lfo(0.09, 0.5, sAmp.gain, 0.3);
  lfo(0.06, 260, slp.frequency, 0.4);
  const surf = ctx.createGain();
  surf.gain.value = 0;
  slp.connect(sAmp).connect(surf).connect(out);
  loop('pink', slp, 2.0);

  const chimeBus = ctx.createGain();
  chimeBus.gain.value = 1;
  chimeBus.connect(out);
  nextChime = now + 1.5;
  nextBird = now + 5;
  return { ctx, out, wind, rumble, surf, chimeBus, sources };
}

function applyTheme(gr: Graph, ramp: number): void {
  const t = gr.ctx.currentTime;
  const set = (p: AudioParam, v: number): void => {
    p.cancelScheduledValues(t);
    p.setTargetAtTime(v, t, ramp);
  };
  set(gr.rumble.gain, theme === 'fire' ? 0.2 : 0);
  set(gr.surf.gain, theme === 'water' ? 0.03 : 0);
  set(gr.chimeBus.gain, theme === 'fire' ? 0.45 : 1);
}

/** One far bell: three inharmonic partials, a soft strike, a long ring. */
function bell(gr: Graph, at: number, f: number, amp: number, pan: number): void {
  const ctx = gr.ctx;
  const dest = panner(ctx, pan, gr.chimeBus);
  for (const [mul, k, dec] of [
    [1, 1, 2.6],
    [2.76, 0.32, 1.2],
    [5.4, 0.12, 0.5],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * mul * (1 + (rnd() - 0.5) * 0.002);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, at);
    e.gain.linearRampToValueAtTime(amp * k, at + 0.004);
    e.gain.exponentialRampToValueAtTime(0.0001, at + dec);
    o.connect(e).connect(dest);
    o.start(at);
    o.stop(at + dec + 0.05);
  }
}

/** A far bird call: two or three quick chirps. */
function bird(gr: Graph, at: number): void {
  const ctx = gr.ctx;
  const pan = (rnd() - 0.5) * 1.4;
  const dest = panner(ctx, pan, gr.out);
  const n = 2 + Math.floor(rnd() * 2);
  const base = 2600 + rnd() * 900;
  for (let i = 0; i < n; i++) {
    const t = at + i * (0.09 + rnd() * 0.05);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const up = rnd() < 0.6;
    o.frequency.setValueAtTime(base * (up ? 1 : 1.35), t);
    o.frequency.exponentialRampToValueAtTime(base * (up ? 1.4 : 0.95), t + 0.06);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.012, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    o.connect(e).connect(dest);
    o.start(t);
    o.stop(t + 0.09);
  }
}

function schedule(gr: Graph): void {
  const now = gr.ctx.currentTime;
  if (now >= nextChime) {
    const n = 1 + Math.floor(rnd() * rnd() * 3.2);
    let t = now + 0.05;
    for (let i = 0; i < n; i++) {
      bell(gr, t, CHIME[Math.floor(rnd() * CHIME.length)], 0.018 + rnd() * 0.012, (rnd() - 0.5) * 1.2);
      t += 0.12 + rnd() * 0.35;
    }
    nextChime = now + 4 + rnd() * 5;
  }
  if (now >= nextBird) {
    if (theme !== 'fire') bird(gr, now + 0.05);
    nextBird = now + 10 + rnd() * 8;
  }
}

export const skyAmbience = {
  /** Keep the ambience running (it starts as soon as the live audio runs; call update() regularly). */
  start(): void {
    wanted = true;
    skyAmbience.update();
  },
  /** Fade out and release. */
  stop(fadeMs = 600): void {
    wanted = false;
    safe(() => {
      const gr = g;
      if (!gr) return;
      g = null;
      shownLevel = -1;
      const t = gr.ctx.currentTime;
      const k = Math.max(0.02, fadeMs / 1000);
      gr.out.gain.cancelScheduledValues(t);
      gr.out.gain.setValueAtTime(gr.out.gain.value, t);
      gr.out.gain.linearRampToValueAtTime(0, t + k);
      for (const s of gr.sources) safe(() => s.stop(t + k + 0.05));
      setTimeout(() => safe(() => gr.out.disconnect()), fadeMs + 400);
    });
  },
  setTheme(th: SkyAmbienceTheme): void {
    if (th === theme) return;
    theme = th;
    safe(() => g && applyTheme(g, 0.8));
  },
  /** A gust: the wind rises and falls once (0 … 1). */
  gust(amount = 0.6): void {
    safe(() => {
      const gr = g;
      if (!gr) return;
      const t = gr.ctx.currentTime;
      const p = gr.wind.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(0.6, t);
      p.linearRampToValueAtTime(0.6 + amount * 0.9, t + 0.5);
      p.setTargetAtTime(0.6, t + 0.7, 0.9);
    });
  },
  /** Poll (every ~0.5 s): build the graph once audio runs, follow the sfx volume, schedule chimes and birds. */
  update(): void {
    if (!wanted) return;
    safe(() => {
      if (!g) {
        g = build();
        if (!g) return;
        applyTheme(g, 0.01);
      }
      const lv = LEVEL * sfx.volume() * (sfx.isMuted() ? 0 : 1);
      if (lv !== shownLevel) {
        const t = g.ctx.currentTime;
        g.out.gain.cancelScheduledValues(t);
        g.out.gain.setTargetAtTime(lv, t, shownLevel < 0 ? 1 : 0.2);
        shownLevel = lv;
      }
      if (lv > 0) schedule(g);
    });
  },
};
