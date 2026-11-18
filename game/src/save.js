// Saving and loading through localStorage: cash, mission progress, the player's position and the
// seed, so Continue drops you back into the same city. Storage can be unavailable (private
// windows, disabled storage); every call fails soft and the game stays playable either way.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(world) {
  const data = {
    version: 1,
    seed: world.seed,
    cash: world.cash,
    missionIndex: world.missions.index,
    x: Math.round(world.player.x),
    y: Math.round(world.player.y),
    savedAt: Date.now(),
    vehiclesEntered: world.vehiclesEntered,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.seed !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear, or storage is off.
  }
}
