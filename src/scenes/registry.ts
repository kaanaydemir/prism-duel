// Game scenes after boot.
import type Phaser from 'phaser';
import { TitleScene } from './TitleScene';
import { DuelScene } from './DuelScene';
import { DeckScene } from './deck/DeckScene';
import { DeckPickScene } from './deck/PickScene';
import { ArenaPickScene } from './deck/ArenaPickScene';
import { takePendingDuel } from './deck/pending';
import { launchFromUrl } from './launch';
import { LobbyScene } from './net/LobbyScene';

export function sceneList(): (typeof Phaser.Scene)[] {
  return [TitleScene, DuelScene, DeckScene, DeckPickScene, LobbyScene, ArenaPickScene];
}

/** Scene key BootScene starts when no ?dev= preview is requested (and no ?mode=). */
export const FIRST_SCENE = 'Title';

/**
 * The scene BootScene starts: ?mode=hotseat|vsBot|demo (&seed, &first, &skipIntro) goes straight
 * into a duel (QA / tools/shot.mjs); otherwise the title screen.
 */
export function firstScene(params: URLSearchParams): { key: string; data?: object } {
  const launch = launchFromUrl(params);
  if (launch) return { key: 'Duel', data: launch };
  // a duel the arena picker started across a reload (the Sky Temple needs the 2× canvas)
  const pending = takePendingDuel();
  if (pending) return { key: 'Duel', data: pending };
  // ?lobby=home|create|join[&code=] (QA): straight into the online lobby
  const lobby = params.get('lobby');
  if (lobby === 'home' || lobby === 'create' || lobby === 'join') return { key: 'NetLobby', data: { at: lobby, code: params.get('code') ?? undefined } };
  return { key: FIRST_SCENE };
}
