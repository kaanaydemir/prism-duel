// LobbyScene (key 'NetLobby') — "Play with a Friend": create a room (this device hosts the duel and shows a code
// to share) or join one (type the friend's code on an on-screen keypad, or a keyboard). Each player picks their
// own deck here (v1: a cycler over the decks of the deck screens); the host's arena is used for both.
// When both are in, the host starts the game and both devices go into the duel (src/net/remote.ts).
//
//   scene.start('NetLobby', {})                     the home screen
//   ?lobby=create | ?lobby=join&code=ACD347         QA: straight to a screen (?net=bc: BroadcastChannel transport)
//   window.__neon.lobby                             QA: { screen, code, status, create(), join(code) }

import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import { music, sfx } from '../../audio/sfx';
import { OPENING_HAND_V3, type PlayerId } from '../../engine/types';
import { pixelText } from '../../ui/text';
import { Button } from '../../view/Button';
import { GAME_H, GAME_W, LANES } from '../../view/layout';
import { getArenaChoice } from '../../view/arena-choice';
import { tween } from '../../vfx/core';
import { deckStore, type ResolvedDeck } from '../deck/store';
import { backdropTex, fadeFromInk, fadeToInk, latticeTex, panelV3, REDUCED_MOTION } from '../deck/ui';
import { createTransport } from '../../net/connect';
import { roomIdFor } from '../../net/config';
import { NetHost } from '../../net/host';
import { NetGuest, type SnapshotMsg, type StartMsg } from '../../net/guest';
import { gameVersion } from '../../net/protocol';
import { CODE_ALPHABET, CODE_LENGTH, formatRoomCode, newRoomCode, normalizeRoomCode } from '../../net/roomCode';
import { LOCAL, guestOpening, guestRemote, hostRemote, type NetDuel } from '../../net/remote';
import { mirrorState } from '../../net/mirror';
import type { DuelStart } from '../DuelScene';

export interface LobbyData {
  at?: 'home' | 'create' | 'join';
  code?: string;
}

type Screen = 'home' | 'create' | 'join' | 'starting';

const RESUME_KEY = 'prism-duel:net-resume';
/** Both devices show their own side as YOU (the HUD's names, in local coordinates). */
const NAMES: [string, string] = ['YOU', 'FRIEND'];
/** How long the join screen waits for a host before saying the code found nobody (ms). */
const JOIN_PATIENCE_MS = 25_000;

/** The version both sides compare: card data + the board layout (3 or 5 lanes). */
export function lobbyVersion(): string {
  return gameVersion(`lanes${LANES}`);
}

export class LobbyScene extends Phaser.Scene {
  private data0: LobbyData = {};
  private screen: Screen = 'home';
  private layer: Phaser.GameObjects.Container | null = null;
  private decks: ResolvedDeck[] = [];
  private deckIdx = 0;
  private host: NetHost | null = null;
  private guest: NetGuest | null = null;
  private code = '';
  private typed = '';
  private status!: Phaser.GameObjects.BitmapText;
  private statusDots = false;
  private t = 0;
  private lattice!: Phaser.GameObjects.TileSprite;
  private onTick: ((dt: number) => void)[] = [];
  private joinTimer: Phaser.Time.TimerEvent | null = null;
  private launched = false;
  private repaint: () => void = () => undefined;

  constructor() {
    super('NetLobby');
  }

  init(data: LobbyData | undefined): void {
    this.data0 = { ...(data ?? {}) };
    this.screen = 'home';
    this.layer = null;
    this.host = null;
    this.guest = null;
    this.code = '';
    this.typed = '';
    this.onTick = [];
    this.launched = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PAL.night0);
    this.add.image(0, 0, backdropTex(this)).setOrigin(0);
    this.lattice = this.add.tileSprite(0, 0, GAME_W, GAME_H, latticeTex(this)).setOrigin(0);
    this.add.image(20, 12, panelV3(this, 'p1', 600, 336, 20)).setOrigin(0).setDepth(3);
    const head = pixelText(this, 32, 22, 'PLAY WITH A FRIEND', { size: 'md', color: PAL.white }).setDepth(10);
    head.setTint(PAL.cyan3, PAL.cyan3, PAL.white, PAL.white);
    pixelText(this, 608, 24, 'ONLINE · NO ACCOUNT NEEDED', { size: 'sm', color: PAL.steel, originX: 1 }).setDepth(10);
    this.status = pixelText(this, GAME_W / 2, 300, '', { size: 'sm', align: 'center', originX: 0.5, color: PAL.mist, maxWidth: 520 }).setDepth(20);

    this.decks = deckStore()
      .options()
      .filter((d) => d.check.ok);
    const last = deckStore().last('p1');
    this.deckIdx = Math.max(0, this.decks.findIndex((d) => d.ref === last));

    const onKey = (e: KeyboardEvent) => {
      if (!this.sys.isActive()) return;
      if (this.onKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const onUpdate = (_t: number, dt: number) => {
      this.t += dt;
      if (!REDUCED_MOTION) {
        this.lattice.tilePositionX = Math.floor(this.t / 140);
        this.lattice.tilePositionY = Math.floor(this.t / 280);
      }
      if (this.statusDots) this.status.setAlpha(0.75 + 0.25 * Math.sin(this.t / 260));
      for (const f of this.onTick) f(dt);
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKey);
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      // leaving the lobby without a duel: close the room
      if (!this.launched) this.closeSession();
    });
    this.installQa();

    const params = (this.registry.get('params') as URLSearchParams | undefined) ?? new URLSearchParams(location.search);
    const at = this.data0.at ?? (params.get('lobby') as LobbyData['at'] | null) ?? 'home';
    const code = this.data0.code ?? params.get('code') ?? undefined;
    void fadeFromInk(this);
    if (at === 'create') void this.showCreate();
    else if (at === 'join') this.showJoin(code);
    else this.showHome();
  }

  // ================================================================ screens

  private fresh(): Phaser.GameObjects.Container {
    this.layer?.destroy();
    this.onTick = [];
    this.joinTimer?.remove();
    this.joinTimer = null;
    this.setStatus('');
    const c = this.add.container(0, 0).setDepth(10);
    this.layer = c;
    c.setAlpha(0);
    void tween(this, { targets: c, alpha: 1, duration: REDUCED_MOTION ? 0 : 160 });
    return c;
  }

  private showHome(): void {
    this.screen = 'home';
    this.closeSession();
    const c = this.fresh();
    c.add(pixelText(this, GAME_W / 2, 52, 'Duel a friend on another phone or computer.', { size: 'sm', align: 'center', originX: 0.5, color: PAL.mist }));
    c.add(this.linkArt(GAME_W / 2, 92));

    // deck cycler
    c.add(pixelText(this, GAME_W / 2, 128, 'YOUR DECK', { size: 'sm', align: 'center', originX: 0.5, color: PAL.steel }));
    const name = pixelText(this, GAME_W / 2, 146, '', { size: 'md', align: 'center', originX: 0.5, color: PAL.gold3 });
    c.add(name);
    const paint = () => name.setText(this.deck ? this.deck.name.toUpperCase() : 'CLASSIC DECK');
    paint();
    const prev = new Button(this, GAME_W / 2 - 150, 140, { w: 34, h: 24, label: '<', style: 'neutral', onClick: () => this.cycleDeck(-1, paint) });
    const next = new Button(this, GAME_W / 2 + 116, 140, { w: 34, h: 24, label: '>', style: 'neutral', onClick: () => this.cycleDeck(1, paint) });
    c.add([prev, next]);

    const create = new Button(this, GAME_W / 2 - 214, 190, { w: 200, h: 44, label: 'CREATE ROOM', style: 'gold', size: 'lg', onClick: () => void this.showCreate() });
    const join = new Button(this, GAME_W / 2 + 14, 190, { w: 200, h: 44, label: 'JOIN ROOM', style: 'p1', size: 'lg', onClick: () => this.showJoin() });
    create.setAttention(true);
    c.add([create, join]);
    c.add(pixelText(this, GAME_W / 2 - 114, 240, 'You host the duel and get\na code for your friend.', { size: 'sm', align: 'center', originX: 0.5, color: PAL.steel }));
    c.add(pixelText(this, GAME_W / 2 + 114, 240, 'Type the code your\nfriend shows you.', { size: 'sm', align: 'center', originX: 0.5, color: PAL.steel }));
    c.add(this.backButton(() => this.leave()));
  }

  private async showCreate(): Promise<void> {
    this.screen = 'create';
    this.closeSession();
    const c = this.fresh();
    this.code = newRoomCode();
    c.add(pixelText(this, GAME_W / 2, 50, 'ROOM CODE', { size: 'sm', align: 'center', originX: 0.5, color: PAL.steel }));
    c.add(this.codeTiles(this.code, 66, true));
    c.add(pixelText(this, GAME_W / 2, 134, 'Tell your friend this code. They pick JOIN ROOM and type it in.', { size: 'sm', align: 'center', originX: 0.5, color: PAL.mist }));
    const share = new Button(this, GAME_W / 2 - 80, 156, { w: 160, h: 30, label: canShare() ? 'SHARE CODE' : 'COPY CODE', style: 'gold', onClick: () => void this.share() });
    c.add(share);
    c.add(this.linkArt(GAME_W / 2, 230));
    c.add(pixelText(this, GAME_W / 2, 262, `Your deck: ${(this.deck?.name ?? 'Classic').toUpperCase()}`, { size: 'sm', align: 'center', originX: 0.5, color: PAL.steel }));
    c.add(this.backButton(() => this.showHome(), 'CANCEL'));
    this.setStatus('Opening the room…', true);
    sfx.play('netCode');
    this.pinger(() => this.host?.status === 'waiting');

    const host = new NetHost(createTransport(), {
      name: 'FRIEND',
      deck: this.myDeck(),
      arena: getArenaChoice(),
      version: lobbyVersion(),
      game: { zones: LANES === 5 ? 5 : 3, startHand: OPENING_HAND_V3, firstPlayerDraws: true },
    });
    this.host = host;
    host.onStatus = (s) => {
      if (this.host !== host) return;
      if (s === 'waiting') this.setStatus('Waiting for your friend to join…', true);
      if (s === 'ready') {
        this.setStatus('Your friend joined! Starting the duel…', false, PAL.leaf3);
        sfx.play('netLink');
        this.time.delayedCall(900, () => this.hostStart(host));
      }
    };
    try {
      await host.open(roomIdFor(this.code));
    } catch (e) {
      console.error('[lobby] could not open the room', e);
      this.setStatus('Could not go online. Check the internet connection and try again.', false, PAL.crim3);
      return;
    }
    // a hint if nobody comes for a while (most often: the friend typed a different code)
    this.joinTimer = this.time.delayedCall(JOIN_PATIENCE_MS, () => {
      if (this.host === host && host.status === 'waiting') this.setStatus('Still waiting… Both devices need internet. Check the code your friend typed.', true);
    });
  }

  private showJoin(prefill?: string): void {
    this.screen = 'join';
    this.closeSession();
    const c = this.fresh();
    this.typed = (prefill ?? '').toUpperCase().split('').filter((ch) => CODE_ALPHABET.includes(ch)).slice(0, CODE_LENGTH).join('');
    c.add(pixelText(this, GAME_W / 2, 46, "TYPE YOUR FRIEND'S ROOM CODE", { size: 'sm', align: 'center', originX: 0.5, color: PAL.steel }));
    const slots = this.add.container(0, 0);
    c.add(slots);
    const paintSlots = () => {
      slots.removeAll(true);
      slots.add(this.codeTiles(this.typed.padEnd(CODE_LENGTH, ' '), 60, false));
    };
    paintSlots();
    this.repaint = paintSlots;
    // the keypad: 23 symbols + DEL in an 8 × 3 grid, touch-sized (34 × 28 game px ≈ 42 × 35 pt on a phone)
    const KW = 34;
    const KH = 28;
    const GAP = 4;
    const cols = 8;
    const x0 = Math.round(GAME_W / 2 - (cols * KW + (cols - 1) * GAP) / 2);
    const y0 = 124;
    const keys = [...CODE_ALPHABET.split(''), 'DEL'];
    keys.forEach((k, i) => {
      const x = x0 + (i % cols) * (KW + GAP);
      const y = y0 + Math.floor(i / cols) * (KH + GAP);
      const b = new Button(this, x, y, { w: KW, h: KH, label: k === 'DEL' ? '⌫' : k, style: k === 'DEL' ? 'p2' : 'neutral', size: k === 'DEL' ? 'sm' : 'md', sound: false, onClick: () => this.typeKey(k, paintSlots) });
      if (k === 'DEL') b.setLabel('DEL');
      c.add(b);
    });
    const go = new Button(this, GAME_W / 2 - 70, y0 + 3 * (KH + GAP) + 6, { w: 140, h: 30, label: 'JOIN', style: 'p1', onClick: () => void this.tryJoin() });
    c.add(go);
    this.onTick.push(() => go.setAttention(this.typed.length === CODE_LENGTH && !this.guest));
    c.add(this.backButton(() => this.showHome()));
    if (this.typed.length === CODE_LENGTH && prefill) void this.tryJoin();
  }

  // ================================================================ host / guest

  private hostStart(host: NetHost): void {
    if (this.host !== host || host.status !== 'ready' || this.launched) return;
    let opening;
    try {
      opening = host.startGame();
    } catch (e) {
      console.error('[lobby] start failed', e);
      this.setStatus('Could not start the duel. Try again.', false, PAL.crim3);
      return;
    }
    const remote = hostRemote(host);
    const net: NetDuel = {
      role: 'host',
      remote,
      opening,
      names: NAMES,
      arena: host.opts.arena ?? 'neon',
      host,
      close: (reason) => host.close(reason),
    };
    void this.launchDuel(net);
  }

  private async tryJoin(): Promise<void> {
    const code = normalizeRoomCode(this.typed);
    if (!code) {
      sfx.play('uiError', { volume: 0.5 });
      this.setStatus(`A room code has ${CODE_LENGTH} characters.`, false, PAL.crim3);
      return;
    }
    if (this.guest) return;
    this.code = code;
    const resume = readResume(code);
    const guest = new NetGuest(createTransport(), { name: 'FRIEND', deck: this.myDeck(), version: lobbyVersion(), resume: resume ?? undefined });
    this.guest = guest;
    this.setStatus(`Looking for room ${formatRoomCode(code)}…`, true);
    this.pinger(() => this.guest === guest && guest.status === 'connecting');
    guest.onStatus = (s) => {
      if (this.guest !== guest) return;
      if (s === 'joined') {
        this.setStatus('Connected! Waiting for the host to start…', true, PAL.leaf3);
        sfx.play('netLink');
      }
    };
    guest.onRefuse = (reason, detail) => {
      if (this.guest !== guest) return;
      sfx.play('uiError', { volume: 0.6 });
      const msg: Record<string, string> = {
        protocol: 'Your game and your friend’s game are different versions. Both need the latest update.',
        version: 'Version mismatch: you and your friend need the same version of the game. Update both and try again.',
        deck: 'The host could not accept your deck. Pick another deck.',
        full: 'That room is already full.',
        session: 'That duel has already started without you.',
      };
      this.setStatus(msg[reason] ?? 'The host refused to join.', false, PAL.crim3);
      if (detail) console.warn('[lobby] refused:', reason, detail);
      this.dropGuest();
    };
    guest.onStart = (m: StartMsg) => this.guestStart(guest, m, null);
    guest.onSnapshot = (m: SnapshotMsg) => {
      // a duel we were in (the app was reloaded): back into it from the host's snapshot
      if (!this.launched) this.guestStart(guest, null, m);
    };
    try {
      await guest.join(roomIdFor(code));
    } catch (e) {
      console.error('[lobby] could not join', e);
      this.setStatus('Could not go online. Check the internet connection and try again.', false, PAL.crim3);
      this.dropGuest();
      return;
    }
    this.joinTimer = this.time.delayedCall(JOIN_PATIENCE_MS, () => {
      if (this.guest === guest && guest.status === 'connecting') {
        this.setStatus(`No room ${formatRoomCode(code)} found yet. Check the code; the host must keep the room screen open.`, true);
      }
    });
  }

  private guestStart(guest: NetGuest, start: StartMsg | null, snap: SnapshotMsg | null): void {
    if (this.guest !== guest || this.launched) return;
    writeResume(this.code, guest.session);
    const remote = guestRemote(guest);
    const you: PlayerId = guest.you;
    const net: NetDuel = {
      role: 'guest',
      remote,
      opening: start ? guestOpening(guest, start) : undefined,
      resume: snap ? (you === LOCAL ? snap.state : mirrorState(snap.state)) : undefined,
      names: NAMES,
      arena: (start ?? snap)!.arena,
      guest,
      close: (reason) => {
        if (reason === 'quit' || reason === 'gameOver') clearResume();
        guest.close(reason);
      },
    };
    void this.launchDuel(net);
  }

  private async launchDuel(net: NetDuel): Promise<void> {
    if (this.launched) return;
    this.launched = true;
    this.screen = 'starting';
    this.joinTimer?.remove();
    sfx.play('uiConfirm', { volume: 0.7 });
    music.stop(400);
    await fadeToInk(this, 240);
    const params = (this.registry.get('params') as URLSearchParams | undefined) ?? new URLSearchParams(location.search);
    const launch: DuelStart = { mode: 'vsBot', net, arena: net.arena, skipIntro: params.get('skipIntro') === '1' };
    this.scene.start('Duel', launch);
  }

  private closeSession(): void {
    this.host?.close();
    this.host = null;
    this.dropGuest();
  }

  private dropGuest(): void {
    const g = this.guest;
    this.guest = null;
    g?.close();
  }

  // ================================================================ parts

  private get deck(): ResolvedDeck | null {
    return this.decks[this.deckIdx] ?? null;
  }

  private myDeck() {
    const d = this.deck;
    return d ? [...d.cards] : deckStore().resolve('klasik')!.cards;
  }

  private cycleDeck(k: number, paint: () => void): void {
    if (!this.decks.length) return;
    this.deckIdx = (this.deckIdx + k + this.decks.length) % this.decks.length;
    deckStore().setLast('p1', this.decks[this.deckIdx].ref);
    sfx.play('uiClick', { volume: 0.6 });
    paint();
  }

  private typeKey(k: string, paint: () => void): void {
    if (this.guest) return; // already trying a code
    if (k === 'DEL') {
      if (!this.typed) return;
      this.typed = this.typed.slice(0, -1);
      sfx.play('uiBack', { volume: 0.45 });
    } else {
      if (this.typed.length >= CODE_LENGTH) {
        sfx.play('uiError', { volume: 0.4 });
        return;
      }
      this.typed += k;
      sfx.play('netKey', { pitch: 0.92 + this.typed.length * 0.04 });
    }
    this.setStatus('');
    paint();
    if (this.typed.length === CODE_LENGTH) void this.tryJoin();
  }

  /** Big letter tiles for a code (blank = an empty slot with a blinking caret). */
  private codeTiles(code: string, y: number, big: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const TW = big ? 44 : 38;
    const TH = big ? 54 : 46;
    const GAP = 6;
    const split = 14;
    const total = CODE_LENGTH * TW + (CODE_LENGTH - 1) * GAP + split;
    const x0 = Math.round(GAME_W / 2 - total / 2);
    const caretAt = code.indexOf(' ');
    for (let i = 0; i < CODE_LENGTH; i++) {
      const x = x0 + i * (TW + GAP) + (i >= 3 ? split : 0);
      const ch = code[i] ?? ' ';
      const filled = ch !== ' ';
      c.add(this.add.image(x, y, panelV3(this, filled ? (big ? 'trap' : 'p1') : 'neutral', TW, TH)).setOrigin(0));
      if (filled) {
        const t = pixelText(this, x + TW / 2, y + TH / 2 + 1, ch, { size: 'xl', align: 'center', originX: 0.5, originY: 0.5, color: big ? PAL.gold4 : PAL.white });
        c.add(t);
        if (big && !REDUCED_MOTION) {
          // a light sweep runs over the letters, one after another
          const phase = i * 140;
          this.onTick.push(() => {
            const k = ((this.t + 3000 - phase) % 2600) / 2600;
            t.setTint(k < 0.08 ? PAL.white : PAL.gold3, k < 0.08 ? PAL.white : PAL.gold3, PAL.gold4, PAL.gold4);
          });
        }
      } else if (i === caretAt) {
        const caret = this.add.rectangle(x + TW / 2, y + TH - 10, 14, 2, PAL.cyan3).setOrigin(0.5);
        c.add(caret);
        this.onTick.push(() => caret.setVisible(Math.floor(this.t / 420) % 2 === 0));
      }
    }
    return c;
  }

  /** Two devices with a pulse of light running between them (the "connection" motif; it keeps moving). */
  private linkArt(cx: number, cy: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const dev = (x: number, tone: number) => {
      c.add(this.add.rectangle(x, cy, 18, 26, PAL.ink).setOrigin(0.5));
      c.add(this.add.rectangle(x, cy, 16, 24, PAL.night3).setOrigin(0.5));
      c.add(this.add.rectangle(x, cy - 1, 12, 18, tone).setOrigin(0.5));
      c.add(this.add.rectangle(x, cy + 10, 4, 1, PAL.steel).setOrigin(0.5));
    };
    const L = cx - 70;
    const R = cx + 70;
    dev(L, PAL.cyan1);
    dev(R, PAL.crim1);
    const dots: Phaser.GameObjects.Rectangle[] = [];
    for (let x = L + 14; x <= R - 14; x += 6) {
      const d = this.add.rectangle(x, cy, 2, 2, PAL.night4).setOrigin(0.5);
      dots.push(d);
      c.add(d);
    }
    const pulseA = this.add.rectangle(L, cy, 3, 3, PAL.cyan4).setOrigin(0.5);
    const pulseB = this.add.rectangle(R, cy, 3, 3, PAL.crim4).setOrigin(0.5);
    c.add([pulseA, pulseB]);
    this.onTick.push(() => {
      const k = (this.t % 1800) / 1800;
      const ax = Math.round(L + 14 + k * (R - L - 28));
      const bx = Math.round(R - 14 - k * (R - L - 28));
      pulseA.setPosition(ax, cy - 2);
      pulseB.setPosition(bx, cy + 2);
      for (const d of dots) {
        const near = Math.min(Math.abs(d.x - ax), Math.abs(d.x - bx));
        d.setFillStyle(near < 4 ? PAL.mist : near < 10 ? PAL.steel : PAL.night4);
      }
    });
    return c;
  }

  /** The waiting sonar: a ping every 2.8 s while `on()` holds (cleared with the screen). */
  private pinger(on: () => boolean): void {
    let acc = 1800;
    this.onTick.push((dt) => {
      acc += dt;
      if (acc < 2800) return;
      acc = 0;
      if (on()) sfx.play('netPing', { volume: 0.7 });
    });
  }

  private backButton(onClick: () => void, label = 'BACK'): Button {
    return new Button(this, 32, 316, { w: 96, h: 24, label, style: 'neutral', onClick });
  }

  private setStatus(text: string, pulsing = false, color: number = PAL.mist): void {
    if (!this.status) return;
    this.status.setText(text).setTint(color).setAlpha(1);
    this.statusDots = pulsing;
  }

  private async share(): Promise<void> {
    const text = `Join my Prism Duel room! Open the game, pick PLAY WITH A FRIEND → JOIN ROOM and type: ${formatRoomCode(this.code)}`;
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ title: 'Prism Duel', text });
        return;
      }
    } catch {
      /* the share sheet was cancelled: fall back to copying */
    }
    try {
      await navigator.clipboard.writeText(this.code);
      sfx.play('uiConfirm', { volume: 0.5 });
      this.setStatus(`Code ${formatRoomCode(this.code)} copied. Waiting for your friend…`, true);
    } catch {
      this.setStatus(`Tell your friend the code: ${formatRoomCode(this.code)}`, true);
    }
  }

  private leave(): void {
    sfx.play('uiBack', { volume: 0.6 });
    this.closeSession();
    void fadeToInk(this, 200).then(() => this.scene.start('Title', { from: 'duel', select: 'online' }));
  }

  private onKey(e: KeyboardEvent): boolean {
    if (this.screen === 'join') {
      if (e.code === 'Backspace') {
        this.typeKey('DEL', () => this.showJoinPaint());
        return true;
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        void this.tryJoin();
        return true;
      }
      const ch = e.key?.length === 1 ? e.key.toUpperCase() : '';
      if (ch && CODE_ALPHABET.includes(ch)) {
        this.typeKey(ch, () => this.showJoinPaint());
        return true;
      }
    }
    if (e.code === 'Escape') {
      if (this.screen === 'home') this.leave();
      else if (this.screen === 'create' || this.screen === 'join') this.showHome();
      return true;
    }
    if (this.screen === 'home') {
      if (e.code === 'KeyC') void this.showCreate();
      else if (e.code === 'KeyJ') this.showJoin();
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        // repaint through the screen (the name label lives in the layer)
        this.cycleDeck(e.code === 'ArrowLeft' ? -1 : 1, () => this.showHome());
      } else return false;
      return true;
    }
    return false;
  }

  /** Keyboard typing on the join screen: repaint the slots. */
  private showJoinPaint(): void {
    this.repaint();
  }

  private installQa(): void {
    const scene = this;
    (window.__neon as Record<string, unknown>).lobby = {
      get screen() {
        return scene.screen;
      },
      get code() {
        return scene.code;
      },
      get status() {
        return scene.status?.text ?? '';
      },
      get hostStatus() {
        return scene.host?.status ?? null;
      },
      get guestStatus() {
        return scene.guest?.status ?? null;
      },
      create: () => scene.showCreate(),
      join: (code: string) => scene.showJoin(code),
    };
    if (window.__neon) window.__neon.ready = true;
  }
}

function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function';
}

function readResume(code: string): { session: string; seq: number } | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as { code?: string; session?: string; at?: number };
    // a duel from the last few hours with the same code
    if (r.code === code && typeof r.session === 'string' && r.session && Date.now() - (r.at ?? 0) < 6 * 3600_000) return { session: r.session, seq: 0 };
  } catch {
    /* storage unavailable */
  }
  return null;
}

function writeResume(code: string, session: string): void {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ code, session, at: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}

function clearResume(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    /* storage unavailable */
  }
}
