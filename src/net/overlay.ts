// The online duel's connection overlay (DuelScene): "OPPONENT DISCONNECTED — waiting… 0:58" while the other side
// is gone, then the outcome — host: the guest's surrender is applied (a normal, animated game over); guest: the
// host left, "OPPONENT LEFT — YOU WIN" with a button back to the title (the authority is gone, so nothing more
// can be played).

import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { sfx } from '../audio/sfx';
import { pixelText } from '../ui/text';
import { Button } from '../view/Button';
import { DEPTH, GAME_H, GAME_W } from '../view/layout';
import { panelTex } from '../view/ui-textures';
import { tween } from '../vfx/core';
import { DISCONNECT_TIMEOUT_MS } from './config';
import type { NetDuel } from './remote';

export interface NetOverlayHandle {
  destroy(): void;
}

const W = 260;
const H = 84;

export function attachNetOverlay(scene: Phaser.Scene, net: NetDuel, stopDuel: () => void): NetOverlayHandle {
  const root = scene.add.container(0, 0).setDepth(DEPTH.OVERLAY + 50).setScrollFactor(0).setVisible(false);
  const dim = scene.add.rectangle(0, 0, GAME_W, GAME_H, PAL.ink).setOrigin(0).setAlpha(0.55).setInteractive();
  const x0 = Math.round((GAME_W - W) / 2);
  const y0 = Math.round((GAME_H - H) / 2) - 20;
  const panel = scene.add.image(x0, y0, panelTex(scene, 'p2', W, H, { header: 16 })).setOrigin(0);
  const title = pixelText(scene, GAME_W / 2, y0 + 4, '', { size: 'md', align: 'center', originX: 0.5, color: PAL.white });
  const line = pixelText(scene, GAME_W / 2, y0 + 30, '', { size: 'sm', align: 'center', originX: 0.5, color: PAL.mist, maxWidth: W - 24 });
  const count = pixelText(scene, GAME_W / 2, y0 + 50, '', { size: 'lg', align: 'center', originX: 0.5, color: PAL.gold3 });
  // a little "signal" of three dots that keep pulsing while we wait
  const dots = [0, 1, 2].map((i) => scene.add.rectangle(GAME_W / 2 - 8 + i * 8, y0 + 72, 3, 3, PAL.crim3).setOrigin(0.5));
  root.add([dim, panel, title, line, count, ...dots]);
  let button: Button | null = null;
  let until = 0;
  let waiting = false;
  let t = 0;
  const onUpdate = (_: number, dt: number) => {
    if (!root.visible) return;
    t += dt;
    dots.forEach((d, i) => d.setAlpha(waiting ? (Math.floor(t / 220) % 3 === i ? 1 : 0.3) : 0));
    if (waiting) {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      count.setText(`0:${String(left).padStart(2, '0')}`);
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const show = (head: string, sub: string) => {
    title.setText(head);
    line.setText(sub);
    if (!root.visible) {
      root.setVisible(true).setAlpha(0);
      void tween(scene, { targets: root, alpha: 1, duration: 180 });
    }
  };
  const hide = () => {
    waiting = false;
    if (!root.visible) return;
    void tween(scene, { targets: root, alpha: 0, duration: 160 }).then(() => root.setVisible(false));
  };
  const lost = () => {
    waiting = true;
    until = Date.now() + DISCONNECT_TIMEOUT_MS;
    show('OPPONENT DISCONNECTED', 'Waiting for them to reconnect…');
    sfx.play('netLost');
  };
  const back = () => {
    if (!waiting) return;
    hide();
    sfx.play('netBack');
  };

  if (net.host) {
    const host = net.host;
    host.onStatus = (s) => {
      if (s === 'disconnected') lost();
      else if (s === 'playing') back();
    };
    const surrender = () => {
      hide();
      // the guest is gone for good: their surrender ends the duel (the normal game-over cinematic plays)
      if (host.state && host.state.winner === null) {
        host.queueIntent(host.timeoutSurrender());
        net.remote.onArrive?.(true);
      }
    };
    host.onTimeout = surrender;
    host.onGuestLeft = surrender;
  }
  if (net.guest) {
    const guest = net.guest;
    guest.onStatus = (s) => {
      if (s === 'disconnected') lost();
      else if (s === 'playing') back();
    };
    guest.onHostGone = (why) => {
      waiting = false;
      stopDuel();
      count.setText('YOU WIN');
      show('OPPONENT LEFT', why === 'timeout' ? 'They did not come back in time.' : 'Your opponent left the duel.');
      sfx.play('victory', { volume: 0.6 });
      button?.destroy();
      button = new Button(scene, Math.round(GAME_W / 2 - 60), y0 + H + 10, { w: 120, h: 24, label: 'MAIN MENU', style: 'gold', depth: DEPTH.OVERLAY + 51 });
      button.setScrollFactor(0);
      button.onClick = () => {
        net.close('quit');
        scene.scene.start('Title', { from: 'duel' });
      };
    };
  }

  return {
    destroy() {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      root.destroy();
      button?.destroy();
      if (net.host) net.host.onStatus = net.host.onTimeout = net.host.onGuestLeft = null;
      if (net.guest) {
        net.guest.onStatus = null;
        net.guest.onHostGone = null;
      }
    },
  };
}
