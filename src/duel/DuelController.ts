// DuelController — the turn loop: asks the acting player (human UI or CPU) for an Action, applies
// it to the engine, plays the resulting events through the Director, repeats until game over.
//
//   const c = new DuelController(scene, views, director, state, { cpu: [1] });
//   void c.run();
//   await c.dispatch(action);   // QA: inject an action for whoever acts (validated)
//   c.auto = true;              // QA: the CPU plays every player
//
// Input is locked while cinematics play. Hot-seat privacy is handled by views.info (curtain
// before a different human sees their hand).
// v3, lane A6-B (V3_A6_B; docs/v3/A6_PLAN.md K11, open question S3): while a graveyard panel is open the
// computer still thinks, then holds its move until the panel closes; HumanInput learns when a cinematic
// plays (input.busy) so the panel only opens between them.

import Phaser from 'phaser';
import { actingPlayer, apply, chooseAction, isLegal } from '../engine';
import type { Action, ApplyResult, GameEvent, GameState, PlayerId } from '../engine/types';
import { sfx } from '../audio/sfx';
import { loadSettings } from '../scenes/launch';
import { wait } from '../vfx/core';
import type { Director } from '../cinematics/_core/Director';
import type { DuelViews } from './types';
import { HumanInput } from './HumanInput';
import { V3_A6_B } from '../view/v3flags';
import { gravePanelOpen, whenGravePanelClosed } from '../view/v3/GravePanel';

interface Mail {
  action: Action;
  resolve: () => void;
  reject: (e: unknown) => void;
}

/** A move of a player who plays over the network (online duel, src/net/remote.ts). */
export interface RemoteMove {
  action: Action;
  /** Guest side: the authority already applied it (its events / state); nothing is applied locally. */
  result?: ApplyResult;
  /** Made by the authority itself (a disconnect timeout's surrender): no legality check. */
  trusted?: boolean;
  /** Guest side: the authority's snapshot replaced the state (reconnect): the views jump to it, no cinematic. */
  jump?: GameState;
}

/**
 * Online play (additive): the other side of the duel is a person on another device. The host's controller
 * applies the guest's intents (checked) and reports every applied action; the guest's controller applies
 * nothing itself (submit() returns the authority's result) and plays the host's moves as they come.
 */
export interface RemoteSide {
  /** Players whose actions arrive over the network. */
  readonly players: readonly PlayerId[];
  /** The next move that arrived (oldest first), or null. */
  poll(): RemoteMove | null;
  /** Set by the controller: call when a move arrived. `urgent` interrupts a local player's input too. */
  onArrive: ((urgent: boolean) => void) | null;
  /** Host: why a remote move must be refused (null = apply it). Default: the engine's isLegal. */
  check?(move: RemoteMove): string | null;
  /** Host: a remote move was refused. */
  rejected?(move: RemoteMove, why: string): void;
  /** Host: an action was applied (before its cinematics play): send it to the other side. */
  applied?(action: Action, result: ApplyResult): void;
  /** Guest: a local action goes to the authority; resolves with its result (rejects when refused). */
  submit?(action: Action): Promise<ApplyResult>;
  /** Guest: the local player's legal actions on the current state (from the authority). */
  legal?(state: GameState): Action[] | null;
  /** The hint line while the remote player acts. */
  waitHint?(state: GameState): string;
}

export interface ControllerOpts {
  /** Players the CPU controls. */
  cpu: PlayerId[];
  /** Online play: the remote player (see RemoteSide). */
  remote?: RemoteSide;
  /** Online play: the state jumped (a resync snapshot): re-sync every view to it. */
  onJump?: (state: GameState) => void;
  /** Seed for the CPU's tie-breaking. */
  seed: number;
  /** Called when the game is over and the result screen was dismissed. */
  onGameOver?: (winner: PlayerId) => void | Promise<void>;
}

export class DuelController {
  readonly scene: Phaser.Scene;
  readonly views: DuelViews;
  readonly director: Director;
  readonly input: HumanInput;
  state: GameState;
  /** QA: the CPU plays for everyone. */
  auto = false;
  private readonly cpu: Set<PlayerId>;
  private seed: number;
  private mail: Mail[] = [];
  private wakeMail: (() => void) | null = null;
  private running = false;
  private playing = false;
  private stopped = false;
  private readonly opts: ControllerOpts;
  /** Resolves every time the controller starts waiting for an action (interactive). */
  private idleWaiters: (() => void)[] = [];
  lastEvents: GameEvent[] = [];

  constructor(scene: Phaser.Scene, views: DuelViews, director: Director, state: GameState, opts: ControllerOpts) {
    this.scene = scene;
    this.views = views;
    this.director = director;
    this.state = state;
    this.cpu = new Set(opts.cpu);
    this.seed = opts.seed >>> 0;
    this.opts = opts;
    this.input = new HumanInput(scene, views);
    this.input.setState(state);
    if (V3_A6_B) this.input.busy = () => this.busy;
    // the v3 presentation tempo (docs/v3/TEMPO.md): only the show slows down, not the player's input
    views.speed.tempoWhen = () => this.busy;
    this.input.onQuit = () => this.quit();
    const remote = opts.remote;
    if (remote) {
      if (remote.legal) this.input.legalFor = (st) => remote.legal!(st);
      remote.onArrive = (urgent) => {
        if (!urgent && !this.waitingRemote) return;
        if (urgent) this.input.cancel();
        this.wakeMail?.();
      };
    }
    views.info.onCurtain = (on) => this.input.setCurtain(on);
    // the toolbar's sound switch starts from what is actually audible
    views.hud.setSoundOn(!sfx.isMuted() && loadSettings().sound);
    // vs CPU: say who the computer is
    if (views.info.mode === 'vsBot') for (const p of opts.cpu) views.hud.setPlayerName(p, 'CPU');
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());
  }

  /** True while a cinematic plays (input locked). */
  get busy(): boolean {
    return this.playing || this.director.busy;
  }

  isCpu(p: PlayerId): boolean {
    return this.auto || this.cpu.has(p);
  }

  /** Leave the duel for the title menu (düello menüsü → Ana Menüye Dön). */
  quit(): void {
    if (this.stopped || !this.scene.sys.isActive()) return;
    sfx.play('uiBack');
    this.stop();
    this.director.dropKept();
    this.views.hud.setHint(null);
    this.scene.scene.start('Title', { from: 'duel' });
  }

  stop(): void {
    this.stopped = true;
    this.input.cancel();
    for (const m of this.mail.splice(0)) m.reject(new Error('duel stopped'));
    this.wakeMail?.();
  }

  /** Resolves when the controller next waits for an action (or immediately if it does). */
  whenIdle(): Promise<void> {
    if (this.running && !this.busy && this.waitingAction) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  private waitingAction = false;

  /** Queue an action for the acting player. Resolves after its cinematics played. */
  dispatch(action: Action): Promise<void> {
    if (this.state.winner !== null) return Promise.reject(new Error('the game is over'));
    return new Promise<void>((resolve, reject) => {
      this.mail.push({ action, resolve, reject });
      // interrupt a human / CPU wait
      this.input.cancel();
      this.wakeMail?.();
    });
  }

  /** The main loop. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (!this.stopped && this.scene.sys.isActive()) {
      if (this.state.winner !== null) {
        this.flushIdle();
        await this.finish();
        return;
      }
      // online: a move that arrived out of turn (a host update, a resync, a timeout surrender) goes first
      const early = this.opts.remote?.poll();
      if (early) {
        await this.executeRemote(early);
        continue;
      }
      const p = actingPlayer(this.state);
      const next = await this.nextAction(p);
      if (this.stopped) return;
      if (!next) continue;
      if (next.remote) await this.executeRemote(next.remote);
      else await this.execute(next.action, next.mail);
    }
  }

  private waitingRemote = false;

  private async nextAction(p: PlayerId): Promise<{ action: Action; mail: Mail | null; remote?: RemoteMove } | null> {
    const m = this.mail.shift();
    if (m) return { action: m.action, mail: m };
    this.waitingAction = true;
    this.flushIdle();
    try {
      const mailArrived = new Promise<null>((r) => (this.wakeMail = () => r(null)));
      const remote = this.opts.remote;
      if (remote && remote.players.includes(p)) {
        // online: the other device acts — wait for its move (or for QA mail / a stop)
        this.views.hud.setButtons({ battle: false, endTurn: false, attention: null });
        this.views.hud.setHint(remote.waitHint?.(this.state) ?? 'Opponent is playing…', { player: p });
        const got = remote.poll();
        if (got) return { action: got.action, mail: null, remote: got };
        this.waitingRemote = true;
        try {
          await mailArrived;
        } finally {
          this.waitingRemote = false;
        }
        return null; // the loop polls again
      }
      if (this.isCpu(p)) {
        this.views.hud.setButtons({ battle: false, endTurn: false, attention: null });
        this.cpuHint(p);
        const think = wait(this.scene, this.state.pending ? 380 : 520).then(() => 'go' as const);
        const r = await Promise.race([think, mailArrived]);
        if (r === null || this.stopped) return null;
        // v3 (K11 / S3): the graveyard panel is open — the computer has thought; it moves once it closes
        if (V3_A6_B && gravePanelOpen(this.scene)) {
          const g = await Promise.race([whenGravePanelClosed(this.scene).then(() => 'go' as const), mailArrived]);
          if (g === null || this.stopped) return null;
        }
        try {
          return { action: chooseAction(this.state, this.seed++), mail: null };
        } catch (e) {
          console.error('[duel] CPU failed to choose', e);
          return null;
        }
      }
      // a human acts: make sure their hand is the one on screen (hot-seat curtain)
      const pd = this.state.pending;
      // (v3 A6-B, F7: a trap question's curtain says so)
      if (!pd || pd.kind !== 'chooseTarget') await this.director.userWait(this.views.info.ensureViewer(p, { trap: pd?.kind === 'trapResponse' }));
      if (this.mail.length || this.stopped) return null;
      this.input.setState(this.state);
      const a = await Promise.race([this.director.userWait(this.input.waitAction(this.state, p)), mailArrived]);
      if (!a) return null;
      // v3 (A6-B, F7 / KO-11): a trap question answered in hot-seat — the defender's hand turns face down
      // before the attacker's battle goes on (nothing outside v3 lane B with the curtain)
      if (V3_A6_B && pd && pd.kind === 'trapResponse' && a.type === 'respond' && pd.player !== this.state.activePlayer) {
        await this.views.info.coverAfterAnswer(p);
        if (this.stopped) return null;
      }
      return { action: a, mail: null };
    } finally {
      this.waitingAction = false;
      this.wakeMail = null;
    }
  }

  /** Online: play a move from the other device (host: check + apply it; guest: take the authority's result). */
  private async executeRemote(m: RemoteMove): Promise<void> {
    const remote = this.opts.remote!;
    if (m.jump) {
      this.state = m.jump;
      this.input.setState(m.jump);
      this.opts.onJump?.(m.jump);
      return;
    }
    if (m.result) {
      await this.play(m.action, m.result, null);
      return;
    }
    const why = m.trusted ? null : remote.check ? remote.check(m) : isLegal(this.state, m.action) ? null : 'illegal action';
    if (why) {
      console.warn('[duel] refused a remote move', m.action, why);
      remote.rejected?.(m, why);
      return;
    }
    let res: ApplyResult;
    try {
      res = apply(this.state, m.action);
    } catch (e) {
      remote.rejected?.(m, String(e));
      return;
    }
    remote.applied?.(m.action, res);
    await this.play(m.action, res, null);
  }

  private async execute(action: Action, mail: Mail | null): Promise<void> {
    const before = this.state;
    const remote = this.opts.remote;
    let res: ApplyResult;
    if (remote?.submit && !remote.players.includes(action.player)) {
      // online guest: the authority applies it
      this.lock(true, action.player);
      try {
        res = await remote.submit(action);
      } catch (e) {
        console.warn('[duel] the host refused', action, e);
        this.lock(false);
        mail?.reject(e);
        return;
      }
      if (this.stopped) return;
      await this.play(action, res, mail);
      return;
    }
    try {
      if (!isLegal(before, action)) throw new Error(`illegal action ${JSON.stringify(action)}`);
      res = apply(before, action);
    } catch (e) {
      console.warn('[duel] rejected action', action, e);
      mail?.reject(e);
      return;
    }
    remote?.applied?.(action, res);
    await this.play(action, res, mail);
  }

  /** Adopt an applied action's result and play its cinematics. */
  private async play(action: Action, res: ApplyResult, mail: Mail | null): Promise<void> {
    const before = this.state;
    this.state = res.state;
    this.input.setState(res.state);
    this.lastEvents = res.events;
    this.playing = true;
    this.lock(true, action.player);
    try {
      await this.director.play(res.events, before, res.state);
    } finally {
      this.playing = false;
      this.lock(false);
    }
    mail?.resolve();
  }

  /** The guidance line while the CPU decides (vs CPU) or while the demo plays. */
  private cpuHint(p: PlayerId): void {
    const v = this.views;
    if (v.info.mode === 'demo' || this.auto) v.hud.setHint('Spectator mode · Esc: menu', { style: 'gold' });
    else v.hud.setHint(this.state.pending ? 'CPU is thinking…' : 'CPU turn…', { player: p });
  }

  private lock(b: boolean, actor?: PlayerId): void {
    const v = this.views;
    v.hand.setEnabled(!b);
    v.hud.setLocked(b);
    if (b) v.hud.setButtons({ battle: false, endTurn: false, attention: null });
    // cinematics speak for themselves; the demo keeps its "how to leave" line and the CPU's
    // turn keeps "Sıra bilgisayarda…" (no flicker between its moves)
    const cpuTurnGoesOn = actor !== undefined && this.isCpu(actor) && this.state.winner === null && this.isCpu(actingPlayer(this.state));
    if (b && (this.state.winner !== null || (v.info.mode !== 'demo' && !this.auto && !cpuTurnGoesOn))) v.hud.setHint(null);
    v.speed.canHold = () => this.busy;
  }

  private flushIdle(): void {
    for (const r of this.idleWaiters.splice(0)) r();
  }

  private async finish(): Promise<void> {
    const w = this.state.winner;
    if (w === null) return;
    this.views.hud.setButtons({ battle: false, endTurn: false, attention: null });
    this.views.hud.setHint(null);
    await this.opts.onGameOver?.(w);
  }
}
