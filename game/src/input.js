// Keyboard and pointer input. Held keys give a steering state; one-shot presses are queued as
// bit flags and taken once by the loop, so a press between two frames is never lost and never
// counted twice. The pointer is used for the menus: its position and clicks are reported raw.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_EXIT = 4;
export const ACTION_SHOVE = 8;
export const ACTION_HORN = 16;
export const ACTION_MUTE = 32;
export const ACTION_UP = 64;
export const ACTION_DOWN = 128;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_EXIT = new Set(['KeyF', 'KeyE']);
const SHOVE = new Set(['Space']);
const HANDBRAKE = new Set(['Space']);
const HORN = new Set(['KeyH']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sprint = false;
  let handbrake = false;
  let actions = 0;
  const pointer = { x: -1, y: -1, clicked: 0 };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') sprint = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_SHOVE;
    } else if (HANDBRAKE.has(event.code)) handbrake = true; else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER_EXIT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER_EXIT;
    } else if (HORN.has(event.code)) {
      if (!event.repeat) actions |= ACTION_HORN;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (UP.has(event.code)) {
      if (!event.repeat) actions |= ACTION_UP;
    } else if (DOWN.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DOWN;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') sprint = false;
    else if (HANDBRAKE.has(event.code)) handbrake = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = down = left = right = sprint = handbrake = false;
  });

  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) * (target.width / rect.width);
    pointer.y = (event.clientY - rect.top) * (target.height / rect.height);
  });
  target.addEventListener('pointerdown', () => {
    pointer.clicked += 1;
  });

  return {
    /** Throttle -1..1 (forward/back), steer -1..1 (left/right), and whether Shift is held. */
    axis() {
      return {
        throttle: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (right ? 1 : 0) - (left ? 1 : 0),
        sprint,
        handbrake,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The pointer in logical view coordinates, and how many clicks happened since the last call. */
    takePointer() {
      const clicks = pointer.clicked;
      pointer.clicked = 0;
      return { x: pointer.x, y: pointer.y, clicks };
    },
    /** What an autopilot (the screenshot scenes) would hold and press this frame. */
    inject(state) {
      up = state.throttle > 0;
      down = state.throttle < 0;
      left = state.steer < 0;
      right = state.steer > 0;
      handbrake = !!state.handbrake;
      actions |= state.actions ?? 0;
    },
  };
}
