// Boot and the one loop: the game moves between the title screen, play, pause and the controls
// panel; the world advances in fixed 1/60 s steps (several in a slow frame, none in a fast one)
// and the renderer paints what is there. ?shot=<name> stages a screenshot scene instead (see
// shots.js): it plays that scene, paints it twice, then sets window.__shotReady for the capture.
//
// ?seed=N fixes the city seed for a normal game. This file knows nothing about the rules: it
// reads input, drives the world's fixed step, and hands state to the renderer and HUD.

import { STEP } from './config.js';
import { isMuted, stepAudio, SFX, toggleMute, unlockAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_DOWN, ACTION_MUTE, ACTION_PAUSE, ACTION_UP, createInput } from './input.js';
import { buildMinimap, createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createHud } from './hud.js';
import { clearSave, hasSave, loadGame, saveGame } from './save.js';
import { createWorld } from './world.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud(canvas, buildMinimap(createWorld(1).city));
const input = createInput(canvas);

let screen = SCREEN_TITLE;
let selectedIndex = 0;
let menuLabels = [];
let controlsOpen = false;
let world = null;
let clock = 0;
let lastTimestamp = null;
let accumulator = 0;
let statusLine = '';
let unlocked = false;

function announce(line) {
  if (line !== statusLine) {
    statusLine = line;
    status.textContent = line;
  }
}

function freshWorld(fromSave) {
  const data = fromSave ? loadGame() : null;
  const next = createWorld(data ? data.seed : seed);
  if (data) {
    next.cash = data.cash;
    next.missions.index = data.missionIndex;
    const spot = next.city.nearestWalkable(data.x, data.y);
    next.player.x = spot.x;
    next.player.y = spot.y;
  }
  return next;
}

function startNewGame() {
  world = freshWorld(false);
  window.__world = world;
  screen = SCREEN_PLAY;
  accumulator = 0;
  announce('Playing. Walk with WASD; press F near a car to drive.');
}

function continueGame() {
  world = freshWorld(true);
  window.__world = world;
  screen = SCREEN_PLAY;
  accumulator = 0;
  announce('Save loaded. Walk with WASD; press F near a car to drive.');
}

function menuSelection(delta) {
  if (menuLabels.length === 0) return;
  selectedIndex = (selectedIndex + delta + menuLabels.length) % menuLabels.length;
}

function activateMenu(label) {
  unlockAudio();
  unlocked = true;
  SFX.ui();
  switch (label) {
    case 'New Game':
      clearSave();
      startNewGame();
      break;
    case 'Continue':
      continueGame();
      break;
    case 'Controls':
      controlsOpen = true;
      selectedIndex = 0;
      break;
    case 'Back':
      controlsOpen = false;
      selectedIndex = 0;
      break;
    case 'Mute':
    case 'Sound: off':
    case 'Sound: on':
      toggleMute();
      break;
    case 'Resume':
      screen = SCREEN_PLAY;
      break;
    case 'Save game':
      if (saveGame(world)) world.notify('Game saved. It resumes from here.', '#9fd8a8');
      else world.notify('Saving is unavailable in this browser session.', '#ff8d7a');
      screen = SCREEN_PLAY;
      break;
    case 'Quit to title':
      screen = SCREEN_TITLE;
      world = null;
      controlsOpen = false;
      selectedIndex = 0;
      break;
    default:
      break;
  }
}

function menuFrame(axis, actions) {
  // Pointer hover and click work on the item boxes the last frame registered.
  const pointer = input.takePointer();
  const hover = hud.hoverAt(pointer.x, pointer.y);
  if (hover >= 0) selectedIndex = hover;
  if (pointer.clicks > 0) {
    const clicked = hud.takeMenuClick(pointer.x, pointer.y);
    if (clicked) {
      activateMenu(clicked);
      return;
    }
  }
  if (actions & ACTION_UP) menuSelection(-1);
  if (actions & ACTION_DOWN) menuSelection(1);
  if (actions & ACTION_CONFIRM) activateMenu(menuLabels[Math.min(selectedIndex, menuLabels.length - 1)]);
}

function drawTitleFrame() {
  hud.beginMenu();
  renderer.draw(null, SCREEN_TITLE, clock, 0);
  menuLabels = controlsOpen ? hud.drawControls(selectedIndex) : hud.drawTitle(selectedIndex, hasSave());
}

function drawPlayFrame() {
  hud.beginMenu();
  renderer.draw(world, SCREEN_PLAY, clock, 0);
  hud.drawWorldHud(world, clock);
}

function drawPauseFrame() {
  drawPlayFrame();
  hud.drawWorldPaused(world);
  hud.beginMenu();
  menuLabels = controlsOpen ? hud.drawControls(selectedIndex) : hud.drawPause(selectedIndex, isMuted());
}

// --- the screenshot mode: play a staged scene, paint it twice, report readiness.
function runShotMode() {
  const staged = stageShot(shot, { createWorld });
  if (!staged) {
    window.__shotReady = true;
    window.__shotError = `unknown shot: ${shot}`;
    return;
  }
  world = staged.world;
  window.__world = world;
  try {
    staged.run(world, input);
  } catch (err) {
    window.__shotError = String(err && err.stack ? err.stack : err);
    window.__shotReady = true;
    return;
  }
  let painted = 0;
  const paint = () => {
    try {
      drawPlayFrame();
    } catch (err) {
      window.__shotError = String(err && err.stack ? err.stack : err);
      window.__shotReady = true;
      return;
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
}

function frame(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp;
  let elapsed = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  elapsed = Math.min(elapsed, MAX_FRAME);
  clock += elapsed;

  const axis = input.axis();
  const actions = input.takeActions();

  if (screen === SCREEN_TITLE) {
    if (actions & ACTION_MUTE) toggleMute();
    menuFrame(axis, actions);
    drawTitleFrame();
    announce('Title. Choose New Game or Continue with the mouse, WASD keys or Enter.');
  } else if (screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      selectedIndex = 0;
      controlsOpen = false;
      SFX.ui();
    } else if (actions & ACTION_MUTE) toggleMute();
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      world.step(STEP, axis, actions);
      accumulator -= STEP;
      steps += 1;
    }
    stepAudio(world, elapsed);
    drawPlayFrame();
    announce(
      `Cash $${world.cash}. Wanted ${world.wanted} of 5. ` +
        (world.missions.index < 6 ? `Story mission ${world.missions.index + 1} of 6.` : 'Story complete; courier gigs pay.'),
    );
  } else if (screen === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PLAY;
      controlsOpen = false;
      SFX.ui();
    }
    menuFrame(axis, actions);
    drawPauseFrame();
    announce('Paused. Resume, save or quit.');
  }

  if (!unlocked && (actions !== 0 || input.takePointer().clicks > 0)) {
    unlocked = true;
    unlockAudio();
  }
  requestAnimationFrame(frame);
}

if (shot) {
  runShotMode();
} else {
  menuLabels = hasSave() ? ['Continue', 'New Game', 'Controls', 'Mute'] : ['New Game', 'Controls', 'Mute'];
  requestAnimationFrame(frame);
}
